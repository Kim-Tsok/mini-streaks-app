//! Background loop: every tick, find the focused app, add the elapsed time to
//! every auto streak it matches, and tell the UI what's happening.

use crate::activity::{self, Focus};
use crate::db::{self, Streak, StreakKind};
use crate::{apps, notify, AppState};
use chrono::{NaiveDate, Timelike};
use serde::Serialize;
use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

const TICK: Duration = Duration::from_secs(2);
/// A gap longer than this means the machine slept; don't count it.
const MAX_GAP: Duration = Duration::from_secs(30);
const RECENT_APPS: usize = 12;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TrackingState {
    Starting,
    /// A tracked app is focused and time is being counted.
    Tracking,
    /// Something is focused, but no streak tracks it.
    Watching,
    Idle,
    Paused,
    /// Focus can't be read on this setup (e.g. GNOME extension missing).
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TrackingStatus {
    pub state: TrackingState,
    pub app_name: Option<String>,
    /// Ids of the streaks currently counting time.
    pub matched: Vec<String>,
}

impl Default for TrackingStatus {
    fn default() -> Self {
        Self { state: TrackingState::Starting, app_name: None, matched: Vec::new() }
    }
}

#[derive(Clone, Serialize)]
struct Activity<'a> {
    id: &'a str,
    today_seconds: u32,
}

#[derive(Clone, Serialize)]
pub struct GoalCompleted {
    pub id: String,
    pub name: String,
    pub current: u32,
    pub milestone: Option<u32>,
}

pub const MILESTONES: [u32; 6] = [7, 30, 50, 100, 200, 365];

pub fn milestone_for(current: u32) -> Option<u32> {
    MILESTONES.contains(&current).then_some(current)
}

fn remember_recent(state: &AppState, focus: &Focus) {
    if focus.app_id.is_empty() || apps::is_own_window(focus) {
        return;
    }
    let mut recent = state.recent_apps.lock().unwrap();
    recent.retain(|f| f.app_id != focus.app_id);
    recent.insert(0, Focus { title: String::new(), ..focus.clone() });
    recent.truncate(RECENT_APPS);
}

/// Tells everyone that goal was reached: the UI, the tray and a notification.
pub fn announce_goal(app: &tauri::AppHandle, streak: &Streak, notify_user: bool) {
    let Ok(Some(fresh)) = app.state::<AppState>().db.lock().unwrap().get_streak(&streak.id) else {
        return;
    };
    let current = fresh.stats.current;
    let milestone = milestone_for(current);
    let _ = app.emit(
        "goal-completed",
        GoalCompleted { id: fresh.id.clone(), name: fresh.name.clone(), current, milestone },
    );
    if notify_user {
        let title = match milestone {
            Some(m) => format!("{m} days of {}!", fresh.name),
            None => format!("{} is done for today", fresh.name),
        };
        let body = if current == 1 {
            "Day one. The first step is the hardest.".to_string()
        } else {
            format!("Your streak is now {current} days.")
        };
        notify::send(app, &title, &body);
    }
    crate::streaks_changed(app);
}

fn check_reminder(app: &tauri::AppHandle, reminded: &mut Option<NaiveDate>) {
    let state = app.state::<AppState>();
    let settings = state.settings.read().unwrap().clone();
    let today = db::today();
    if *reminded == Some(today) || !settings.reminders_enabled || !settings.notifications_enabled {
        return;
    }
    let Some(at) = settings.reminder_minutes() else { return };
    let now = chrono::Local::now();
    if now.hour() * 60 + now.minute() < at {
        return;
    }
    *reminded = Some(today);
    let Ok(streaks) = state.db.lock().unwrap().get_streaks() else { return };
    let mut risky: Vec<&Streak> = streaks.iter().filter(|s| !s.archived && s.stats.at_risk).collect();
    risky.sort_by_key(|s| std::cmp::Reverse(s.stats.current));
    match risky.as_slice() {
        [] => {}
        [one] => notify::send(
            app,
            &format!("Your {}-day streak ends tonight", one.stats.current),
            &format!("{} still needs today. There's time.", one.name),
        ),
        many => notify::send(
            app,
            &format!("{} streaks end tonight", many.len()),
            &many.iter().map(|s| s.name.as_str()).collect::<Vec<_>>().join(", "),
        ),
    }
}

pub fn start(app: tauri::AppHandle) {
    thread::spawn(move || {
        let state = app.state::<AppState>();
        let mut source = activity::new_source();
        let mut status = TrackingStatus::default();
        let mut streaks: Vec<Streak> = Vec::new();
        let mut last_tick = Instant::now();
        let mut carry = Duration::ZERO;
        let mut last_date = db::today();
        let mut last_refresh = Instant::now() - Duration::from_secs(3600);
        let mut reminded: Option<NaiveDate> = None;
        let mut last_tray = Instant::now();

        loop {
            thread::sleep(TICK);
            let now = Instant::now();
            let gap = now - last_tick;
            last_tick = now;
            if gap > MAX_GAP {
                carry = Duration::ZERO;
            } else {
                carry += gap;
            }
            let whole = carry.as_secs() as u32;
            carry -= Duration::from_secs(whole as u64);

            let today = db::today();
            if today != last_date {
                last_date = today;
                crate::streaks_changed(&app);
            }
            if state.streaks_dirty.swap(false, Ordering::SeqCst) || last_refresh.elapsed() > Duration::from_secs(60) {
                last_refresh = Instant::now();
                if let Ok(all) = state.db.lock().unwrap().get_streaks() {
                    streaks = all.into_iter().filter(|s| !s.archived && s.kind == StreakKind::Auto).collect();
                }
            }
            check_reminder(&app, &mut reminded);

            let settings = state.settings.read().unwrap().clone();
            let mut next = TrackingStatus { state: TrackingState::Watching, app_name: None, matched: Vec::new() };
            let mut counting: Vec<&Streak> = Vec::new();

            if settings.is_paused() {
                next.state = TrackingState::Paused;
            } else {
                match source.focused() {
                    Err(activity::Unavailable) => next.state = TrackingState::Unavailable,
                    Ok(None) => {}
                    Ok(Some(focus)) => {
                        remember_recent(&state, &focus);
                        let own = apps::is_own_window(&focus);
                        next.app_name = (!own).then(|| focus.app_name.clone()).filter(|n| !n.is_empty());
                        let idle = settings.pause_when_idle
                            && source
                                .idle_seconds()
                                .is_some_and(|s| s >= settings.idle_timeout_minutes.max(1) as u64 * 60);
                        if idle {
                            next.state = TrackingState::Idle;
                        } else if !own {
                            counting = streaks
                                .iter()
                                .filter(|s| s.patterns.iter().any(|p| apps::matches(p, &focus)))
                                .collect();
                            if !counting.is_empty() {
                                next.state = TrackingState::Tracking;
                                next.matched = counting.iter().map(|s| s.id.clone()).collect();
                            }
                        }
                    }
                }
            }

            if whole > 0 {
                for streak in &counting {
                    let result = state.db.lock().unwrap().add_seconds(streak, whole);
                    let Ok(result) = result else { continue };
                    let _ = app.emit("activity-logged", Activity { id: &streak.id, today_seconds: result.today_seconds });
                    if result.newly_met {
                        announce_goal(&app, streak, settings.notifications_enabled);
                    }
                }
            }
            // Keep the tray's minute counts roughly live without rebuilding it every tick.
            if !counting.is_empty() && last_tray.elapsed() > Duration::from_secs(60) {
                last_tray = Instant::now();
                crate::tray::refresh(&app);
            }

            if next != status {
                status = next;
                *state.status.lock().unwrap() = status.clone();
                let _ = app.emit("tracking-status", &status);
            }
        }
    });
}

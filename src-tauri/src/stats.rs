//! Pure streak math. Everything here is derived from the day logs, so the
//! numbers can never drift out of sync with history (no stored counters).

use chrono::{Datelike, Duration, NaiveDate};
use serde::Serialize;
use std::collections::HashMap;

/// Freezes are earned once per 7 consecutive completed days.
pub const FREEZE_EVERY: u32 = 7;
pub const MAX_FREEZES: u32 = 2;

#[derive(Debug, Clone, Copy)]
pub struct DayLog {
    pub date: NaiveDate,
    pub seconds: u32,
    pub met: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DayState {
    /// Goal met.
    Done,
    /// Scheduled day missed, but a freeze kept the streak alive.
    Frozen,
    /// Scheduled day missed.
    Missed,
    /// Not a scheduled day.
    Rest,
    /// Today, not done yet.
    Pending,
    /// Before the streak existed.
    Before,
}

#[derive(Debug, Clone, Serialize)]
pub struct Day {
    pub date: String,
    pub state: DayState,
    pub seconds: u32,
}

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct StreakStats {
    pub current: u32,
    pub best: u32,
    pub total_days: u32,
    /// 0..=1 share of scheduled days (so far) that were completed.
    pub completion_rate: f32,
    pub total_seconds: u64,
    pub today_seconds: u32,
    pub done_today: bool,
    pub scheduled_today: bool,
    /// A live streak that will break tonight unless today gets done.
    pub at_risk: bool,
    pub freezes: u32,
}

/// Bit 0 = Monday … bit 6 = Sunday.
pub fn is_scheduled(schedule: u8, date: NaiveDate) -> bool {
    let schedule = if schedule & 0x7f == 0 { 0x7f } else { schedule };
    schedule & (1 << date.weekday().num_days_from_monday()) != 0
}

struct Walk {
    stats: StreakStats,
    days: Vec<Day>,
}

fn walk(created: NaiveDate, schedule: u8, logs: &[DayLog], today: NaiveDate, keep_days: bool) -> Walk {
    let by_date: HashMap<NaiveDate, DayLog> = logs.iter().map(|l| (l.date, *l)).collect();
    // A log older than the creation date (e.g. from an import) still counts.
    let start = logs.iter().map(|l| l.date).min().map_or(created, |d| d.min(created));

    let mut s = StreakStats::default();
    let mut run: u32 = 0;
    let mut earned_in_run: u32 = 0;
    let mut scheduled_elapsed: u32 = 0;
    let mut days = Vec::new();

    let mut d = start;
    while d <= today {
        let log = by_date.get(&d);
        let seconds = log.map_or(0, |l| l.seconds);
        let met = log.is_some_and(|l| l.met);
        let scheduled = is_scheduled(schedule, d);
        s.total_seconds += seconds as u64;

        let state = if met {
            s.total_days += 1;
            if scheduled {
                scheduled_elapsed += 1;
            }
            run += 1;
            // Earn a freeze for every full FREEZE_EVERY-day stretch of this run.
            if run / FREEZE_EVERY > earned_in_run {
                earned_in_run = run / FREEZE_EVERY;
                s.freezes = (s.freezes + 1).min(MAX_FREEZES);
            }
            DayState::Done
        } else if d == today {
            if scheduled {
                DayState::Pending
            } else {
                DayState::Rest
            }
        } else if !scheduled {
            DayState::Rest
        } else {
            scheduled_elapsed += 1;
            if run > 0 && s.freezes > 0 {
                s.freezes -= 1;
                DayState::Frozen
            } else {
                run = 0;
                earned_in_run = 0;
                DayState::Missed
            }
        };
        s.best = s.best.max(run);

        if d == today {
            s.today_seconds = seconds;
            s.done_today = met;
            s.scheduled_today = scheduled;
        }
        if keep_days {
            days.push(Day { date: d.format("%Y-%m-%d").to_string(), state, seconds });
        }
        d += Duration::days(1);
    }

    s.current = run;
    s.at_risk = s.scheduled_today && !s.done_today && run > 0;
    s.completion_rate = if scheduled_elapsed == 0 {
        0.0
    } else {
        s.total_days.min(scheduled_elapsed) as f32 / scheduled_elapsed as f32
    };
    Walk { stats: s, days }
}

pub fn compute(created: NaiveDate, schedule: u8, logs: &[DayLog], today: NaiveDate) -> StreakStats {
    walk(created, schedule, logs, today, false).stats
}

/// Per-day states for the last `days` days (oldest first), for the heatmap.
pub fn history(created: NaiveDate, schedule: u8, logs: &[DayLog], today: NaiveDate, days: u32) -> Vec<Day> {
    let all = walk(created, schedule, logs, today, true).days;
    let first = today - Duration::days(days.saturating_sub(1) as i64);
    let mut out = Vec::with_capacity(days as usize);
    let mut d = first;
    let mut iter = all.into_iter().peekable();
    while d <= today {
        let key = d.format("%Y-%m-%d").to_string();
        while iter.peek().is_some_and(|x| x.date < key) {
            iter.next();
        }
        match iter.peek() {
            Some(x) if x.date == key => out.push(iter.next().unwrap()),
            _ => out.push(Day { date: key, state: DayState::Before, seconds: 0 }),
        }
        d += Duration::days(1);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }
    fn met(s: &str) -> DayLog {
        DayLog { date: d(s), seconds: 1800, met: true }
    }

    // 2026-09-28 is a Monday.
    const EVERY: u8 = 0x7f;
    const WEEKDAYS: u8 = 0b0011111;

    #[test]
    fn empty_streak_is_zero() {
        let s = compute(d("2026-09-20"), EVERY, &[], d("2026-09-28"));
        assert_eq!(s.current, 0);
        assert_eq!(s.best, 0);
        assert!(!s.at_risk);
    }

    #[test]
    fn today_pending_keeps_yesterdays_run() {
        let logs = [met("2026-09-25"), met("2026-09-26"), met("2026-09-27")];
        let s = compute(d("2026-09-25"), EVERY, &logs, d("2026-09-28"));
        assert_eq!(s.current, 3);
        assert!(s.at_risk);
        assert!(!s.done_today);
    }

    #[test]
    fn done_today_counts_and_survives_restart() {
        // The old counter-based rollover reset this case to 0 on restart.
        let logs = [met("2026-09-26"), met("2026-09-28")];
        let s = compute(d("2026-09-26"), EVERY, &logs, d("2026-09-28"));
        assert_eq!(s.current, 1);
        assert_eq!(s.best, 1);
        assert!(s.done_today);
        assert!(!s.at_risk);
    }

    #[test]
    fn missed_day_breaks_run() {
        let logs = [met("2026-09-20"), met("2026-09-21"), met("2026-09-23")];
        let s = compute(d("2026-09-20"), EVERY, &logs, d("2026-09-24"));
        // 22 was missed, so only 23 carries into today.
        assert_eq!(s.current, 1);
        assert_eq!(s.best, 2);
        assert_eq!(s.total_days, 3);
    }

    #[test]
    fn rest_days_do_not_break_weekday_streak() {
        // Fri 25, (Sat 26, Sun 27 rest), Mon 28.
        let logs = [met("2026-09-24"), met("2026-09-25"), met("2026-09-28")];
        let s = compute(d("2026-09-24"), WEEKDAYS, &logs, d("2026-09-28"));
        assert_eq!(s.current, 3);
    }

    #[test]
    fn weekend_log_on_weekday_schedule_still_counts() {
        let logs = [met("2026-09-25"), met("2026-09-26"), met("2026-09-28")];
        let s = compute(d("2026-09-25"), WEEKDAYS, &logs, d("2026-09-28"));
        assert_eq!(s.current, 3);
    }

    #[test]
    fn freeze_earned_after_seven_and_spent_on_miss() {
        let mut logs: Vec<DayLog> = (1..=7).map(|i| met(&format!("2026-09-{:02}", i))).collect();
        // Miss the 8th, then continue on the 9th.
        logs.push(met("2026-09-09"));
        let s = compute(d("2026-09-01"), EVERY, &logs, d("2026-09-09"));
        assert_eq!(s.current, 8);
        assert_eq!(s.freezes, 0);
        let h = history(d("2026-09-01"), EVERY, &logs, d("2026-09-09"), 9);
        assert_eq!(h[7].state, DayState::Frozen);
    }

    #[test]
    fn freezes_cap_at_two() {
        let logs: Vec<DayLog> = (1..=28).map(|i| met(&format!("2026-09-{:02}", i))).collect();
        let s = compute(d("2026-09-01"), EVERY, &logs, d("2026-09-28"));
        assert_eq!(s.freezes, MAX_FREEZES);
        assert_eq!(s.current, 28);
    }

    #[test]
    fn two_misses_with_one_freeze_break() {
        let mut logs: Vec<DayLog> = (1..=7).map(|i| met(&format!("2026-09-{:02}", i))).collect();
        logs.push(met("2026-09-10"));
        let s = compute(d("2026-09-01"), EVERY, &logs, d("2026-09-10"));
        assert_eq!(s.current, 1);
        assert_eq!(s.best, 7);
    }

    #[test]
    fn completion_rate_ignores_pending_today() {
        let logs = [met("2026-09-26"), met("2026-09-27")];
        let s = compute(d("2026-09-25"), EVERY, &logs, d("2026-09-28"));
        // 25 missed, 26 + 27 done, 28 pending → 2/3.
        assert!((s.completion_rate - 2.0 / 3.0).abs() < 1e-5);
    }

    #[test]
    fn history_pads_before_creation() {
        let logs = [met("2026-09-28")];
        let h = history(d("2026-09-28"), EVERY, &logs, d("2026-09-28"), 3);
        assert_eq!(h.len(), 3);
        assert_eq!(h[0].state, DayState::Before);
        assert_eq!(h[2].state, DayState::Done);
    }
}

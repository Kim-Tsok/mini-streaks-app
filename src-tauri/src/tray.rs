use crate::db::StreakKind;
use crate::AppState;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Wry,
};

const TRAY_ID: &str = "main";

fn build_menu(app: &AppHandle) -> tauri::Result<(Menu<Wry>, String)> {
    let state = app.state::<AppState>();
    let streaks = state.db.lock().unwrap().get_streaks().unwrap_or_default();
    let streaks: Vec<_> = streaks.into_iter().filter(|s| !s.archived).collect();
    let paused = state.settings.read().unwrap().is_paused();

    let menu = Menu::new(app)?;
    let mut done = 0;
    for s in &streaks {
        let st = &s.stats;
        if st.done_today {
            done += 1;
        }
        let days = if st.current == 1 { "1 day".to_string() } else { format!("{} days", st.current) };
        let label = if st.done_today {
            format!("✓  {} · {days}", s.name)
        } else if s.kind == StreakKind::Auto {
            format!("{} · {} of {} min", s.name, st.today_seconds / 60, s.daily_goal_minutes)
        } else {
            format!("{} · {days}", s.name)
        };
        menu.append(&MenuItem::with_id(app, format!("info:{}", s.id), label, false, None::<&str>)?)?;
        if !st.done_today && s.kind == StreakKind::Manual {
            let item = MenuItem::with_id(app, format!("checkin:{}", s.id), format!("    Check in: {}", s.name), true, None::<&str>)?;
            menu.append(&item)?;
        }
    }
    if !streaks.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    let pause = if paused {
        MenuItem::with_id(app, "resume", "Resume tracking", true, None::<&str>)?
    } else {
        MenuItem::with_id(app, "pause", "Pause tracking for 1 hour", true, None::<&str>)?
    };
    menu.append(&pause)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "open", "Open Mini Streaks", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?)?;

    let tooltip = if streaks.is_empty() {
        "Mini Streaks".to_string()
    } else {
        format!("Mini Streaks · {done} of {} done today", streaks.len())
    };
    Ok((menu, tooltip))
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let (menu, tooltip) = build_menu(app)?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip(tooltip)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            match id {
                "open" => crate::show_main(app),
                "quit" => app.exit(0),
                "pause" => crate::set_pause(app, Some(60)),
                "resume" => crate::set_pause(app, None),
                _ => {
                    if let Some(streak_id) = id.strip_prefix("checkin:") {
                        let _ = crate::do_check_in(app, streak_id);
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        crate::show_main(app);
                    }
                }
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

/// Rebuilds the menu so it shows today's progress. Safe to call from any thread.
pub fn refresh(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(tray) = handle.tray_by_id(TRAY_ID) else { return };
        if let Ok((menu, tooltip)) = build_menu(&handle) {
            let _ = tray.set_menu(Some(menu));
            let _ = tray.set_tooltip(Some(tooltip));
        }
    });
}

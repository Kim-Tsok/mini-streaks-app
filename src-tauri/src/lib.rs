pub mod activity;
pub mod apps;
pub mod db;
pub mod notify;
pub mod settings;
pub mod stats;
pub mod tracker;
pub mod tray;

use activity::{Capabilities, Focus};
use db::{Database, ExportStreak, Streak, StreakInput};
use serde::{Deserialize, Serialize};
use settings::AppSettings;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, RwLock};
use tauri::{Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;
use tracker::TrackingStatus;

pub struct AppState {
    pub db: Mutex<Database>,
    pub settings: RwLock<AppSettings>,
    pub status: Mutex<TrackingStatus>,
    pub recent_apps: Mutex<Vec<Focus>>,
    /// Set when streaks change so the tracker reloads them.
    pub streaks_dirty: AtomicBool,
    pub tray_available: bool,
}

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// Call after any change to streaks or logs.
pub fn streaks_changed(app: &tauri::AppHandle) {
    app.state::<AppState>().streaks_dirty.store(true, Ordering::SeqCst);
    let _ = app.emit("streaks-updated", ());
    tray::refresh(app);
}

pub fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Without a tray icon there'd be no way back to a hidden window, so minimize instead.
fn hide_main(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else { return };
    if app.state::<AppState>().tray_available {
        let _ = window.hide();
    } else {
        let _ = window.minimize();
    }
}

fn update_settings(app: &tauri::AppHandle, f: impl FnOnce(&mut AppSettings)) -> CmdResult<AppSettings> {
    let state = app.state::<AppState>();
    let next = {
        let mut guard = state.settings.write().unwrap();
        f(&mut guard);
        guard.clone()
    };
    settings::store(app, &next)?;
    let _ = app.emit("settings-updated", &next);
    Ok(next)
}

pub fn set_pause(app: &tauri::AppHandle, minutes: Option<u32>) {
    let until = minutes.map(|m| (chrono::Local::now() + chrono::Duration::minutes(m as i64)).to_rfc3339());
    let _ = update_settings(app, |s| s.tracking_paused_until = until);
    tray::refresh(app);
}

pub fn do_check_in(app: &tauri::AppHandle, id: &str) -> CmdResult<()> {
    let state = app.state::<AppState>();
    let (newly, streak) = {
        let db = state.db.lock().unwrap();
        (db.check_in(id).map_err(err)?, db.get_streak(id).map_err(err)?)
    };
    match (newly, streak) {
        (true, Some(streak)) => tracker::announce_goal(app, &streak, false),
        _ => streaks_changed(app),
    }
    Ok(())
}

fn sync_autostart(app: &tauri::AppHandle, enabled: bool) {
    let autostart = app.autolaunch();
    if autostart.is_enabled().unwrap_or(false) != enabled {
        let _ = if enabled { autostart.enable() } else { autostart.disable() };
    }
}

// ── Settings ────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.read().unwrap().clone()
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: AppSettings) -> CmdResult<AppSettings> {
    let saved = update_settings(&app, |s| *s = settings)?;
    if saved.onboarded {
        sync_autostart(&app, saved.launch_on_startup);
    }
    tray::refresh(&app);
    Ok(saved)
}

#[tauri::command]
fn pause_tracking(app: tauri::AppHandle, minutes: Option<u32>) {
    set_pause(&app, minutes);
}

// ── Tracking ────────────────────────────────────────────────────────────────

#[tauri::command(async)]
fn get_capabilities(state: State<'_, AppState>) -> Capabilities {
    let mut caps = activity::capabilities(&mut *activity::new_source());
    caps.tray_available = state.tray_available;
    caps
}

#[tauri::command]
fn get_tracking_status(state: State<'_, AppState>) -> TrackingStatus {
    state.status.lock().unwrap().clone()
}

#[tauri::command(async)]
fn install_gnome_extension() -> CmdResult<()> {
    #[cfg(target_os = "linux")]
    return activity::install_gnome_extension();
    #[cfg(not(target_os = "linux"))]
    Err("Only needed on GNOME".into())
}

#[tauri::command(async)]
fn list_apps(state: State<'_, AppState>) -> apps::AppList {
    let recent = state.recent_apps.lock().unwrap().clone();
    apps::list(&recent)
}

// ── Streaks ─────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_streaks(state: State<'_, AppState>) -> CmdResult<Vec<Streak>> {
    state.db.lock().unwrap().get_streaks().map_err(err)
}

#[tauri::command]
fn create_streak(app: tauri::AppHandle, input: StreakInput) -> CmdResult<Streak> {
    if input.name.trim().is_empty() {
        return Err("Give the streak a name".into());
    }
    let created = app.state::<AppState>().db.lock().unwrap().create_streak(&input).map_err(err)?;
    streaks_changed(&app);
    Ok(created)
}

#[tauri::command]
fn update_streak(app: tauri::AppHandle, id: String, input: StreakInput) -> CmdResult<()> {
    if input.name.trim().is_empty() {
        return Err("Give the streak a name".into());
    }
    app.state::<AppState>().db.lock().unwrap().update_streak(&id, &input).map_err(err)?;
    streaks_changed(&app);
    Ok(())
}

#[tauri::command]
fn delete_streak(app: tauri::AppHandle, id: String) -> CmdResult<()> {
    app.state::<AppState>().db.lock().unwrap().delete_streak(&id).map_err(err)?;
    streaks_changed(&app);
    Ok(())
}

#[tauri::command]
fn set_archived(app: tauri::AppHandle, id: String, archived: bool) -> CmdResult<()> {
    app.state::<AppState>().db.lock().unwrap().set_archived(&id, archived).map_err(err)?;
    streaks_changed(&app);
    Ok(())
}

#[tauri::command]
fn reorder_streaks(app: tauri::AppHandle, ids: Vec<String>) -> CmdResult<()> {
    app.state::<AppState>().db.lock().unwrap().reorder(&ids).map_err(err)?;
    streaks_changed(&app);
    Ok(())
}

#[tauri::command]
fn check_in(app: tauri::AppHandle, id: String) -> CmdResult<()> {
    do_check_in(&app, &id)
}

#[tauri::command]
fn undo_check_in(app: tauri::AppHandle, id: String) -> CmdResult<()> {
    app.state::<AppState>().db.lock().unwrap().undo_check_in(&id).map_err(err)?;
    streaks_changed(&app);
    Ok(())
}

#[tauri::command]
fn get_history(state: State<'_, AppState>, id: String, days: Option<u32>) -> CmdResult<Vec<stats::Day>> {
    state.db.lock().unwrap().history(&id, days.unwrap_or(182)).map_err(err)
}

// ── Backup ──────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
struct Backup {
    app: String,
    version: u32,
    exported_at: String,
    streaks: Vec<ExportStreak>,
}

#[tauri::command(async)]
fn export_data(state: State<'_, AppState>, path: String) -> CmdResult<usize> {
    let streaks = state.db.lock().unwrap().export().map_err(err)?;
    let count = streaks.len();
    let backup = Backup {
        app: "mini-streaks".into(),
        version: 1,
        exported_at: chrono::Local::now().to_rfc3339(),
        streaks,
    };
    let json = serde_json::to_string_pretty(&backup).map_err(err)?;
    std::fs::write(&path, json).map_err(|e| format!("Couldn't write {path}: {e}"))?;
    Ok(count)
}

#[tauri::command(async)]
fn import_data(app: tauri::AppHandle, path: String) -> CmdResult<usize> {
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("Couldn't read {path}: {e}"))?;
    let backup: Backup =
        serde_json::from_str(&raw).map_err(|_| "That file isn't a Mini Streaks backup".to_string())?;
    if backup.app != "mini-streaks" {
        return Err("That file isn't a Mini Streaks backup".into());
    }
    let n = app.state::<AppState>().db.lock().unwrap().import(&backup.streaks).map_err(err)?;
    streaks_changed(&app);
    Ok(n)
}

// ── Window ──────────────────────────────────────────────────────────────────

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    hide_main(&app);
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch just brings the running window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::POSITION)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db = Database::new(data_dir.join("mini_streaks.db"))?;
            let settings = settings::load(app.handle());

            #[cfg(target_os = "linux")]
            let tray_available = activity::tray_host_available();
            #[cfg(not(target_os = "linux"))]
            let tray_available = true;

            if settings.onboarded {
                sync_autostart(app.handle(), settings.launch_on_startup);
            }
            app.manage(AppState {
                db: Mutex::new(db),
                settings: RwLock::new(settings),
                status: Mutex::new(TrackingStatus::default()),
                recent_apps: Mutex::new(Vec::new()),
                streaks_dirty: AtomicBool::new(true),
                tray_available,
            });

            if let Err(e) = tray::setup(app.handle()) {
                eprintln!("tray unavailable: {e}");
            }

            if let Some(window) = app.get_webview_window("main") {
                // With no tray, the taskbar is the only way back to the window.
                let _ = window.set_skip_taskbar(tray_available);
                let started_hidden = std::env::args().any(|a| a == "--hidden");
                if !started_hidden {
                    let _ = window.show();
                    let _ = window.set_focus();
                } else if !tray_available {
                    // Launched at login: stay out of the way, but reachable.
                    let _ = window.show();
                    let _ = window.minimize();
                }
            }

            tracker::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Closing keeps tracking in the background; Quit lives in the tray and Settings.
                api.prevent_close();
                hide_main(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            save_settings,
            pause_tracking,
            get_capabilities,
            get_tracking_status,
            install_gnome_extension,
            list_apps,
            get_streaks,
            create_streak,
            update_streak,
            delete_streak,
            set_archived,
            reorder_streaks,
            check_in,
            undo_check_in,
            get_history,
            export_data,
            import_data,
            hide_window,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

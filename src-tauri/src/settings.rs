use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub theme: Theme,
    pub launch_on_startup: bool,
    pub idle_timeout_minutes: u32,
    /// Stop counting time while the keyboard and mouse are untouched.
    pub pause_when_idle: bool,
    pub notifications_enabled: bool,
    pub reminders_enabled: bool,
    /// Local time "HH:MM" for the "streak ends tonight" reminder.
    pub reminder_time: String,
    pub onboarded: bool,
    /// RFC 3339 timestamp; tracking is paused until then.
    pub tracking_paused_until: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            launch_on_startup: true,
            idle_timeout_minutes: 5,
            pause_when_idle: true,
            notifications_enabled: true,
            reminders_enabled: true,
            reminder_time: "20:00".into(),
            onboarded: false,
            tracking_paused_until: None,
        }
    }
}

impl AppSettings {
    pub fn is_paused(&self) -> bool {
        self.tracking_paused_until
            .as_deref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .is_some_and(|until| until > chrono::Local::now())
    }

    pub fn reminder_minutes(&self) -> Option<u32> {
        let (h, m) = self.reminder_time.split_once(':')?;
        let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
        (h < 24 && m < 60).then_some(h * 60 + m)
    }

    /// Reads settings written by any earlier version.
    fn from_json(raw: &str) -> Self {
        let Ok(mut value) = serde_json::from_str::<serde_json::Value>(raw) else {
            return Self::default();
        };
        if let Some(obj) = value.as_object_mut() {
            // v0.1 had `dark_mode` and `system_activity_tracking`.
            if !obj.contains_key("theme") {
                if let Some(dark) = obj.get("dark_mode").and_then(|v| v.as_bool()) {
                    obj.insert("theme".into(), (if dark { "dark" } else { "light" }).into());
                }
            }
            if let Some(v) = obj.remove("system_activity_tracking") {
                obj.entry("pause_when_idle").or_insert(v);
            }
        }
        serde_json::from_value(value).unwrap_or_default()
    }
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("No app data folder: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Couldn't create {}: {e}", dir.display()))?;
    Ok(dir.join("settings.json"))
}

pub fn load(app: &tauri::AppHandle) -> AppSettings {
    settings_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .map(|raw| AppSettings::from_json(&raw))
        .unwrap_or_default()
}

pub fn store(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    // Write-then-rename so a crash never leaves a half-written file.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| format!("Couldn't save settings: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Couldn't save settings: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_v01_file() {
        let s = AppSettings::from_json(
            r#"{"dark_mode":false,"launch_on_startup":true,"idle_timeout_minutes":60,
                "notifications_enabled":true,"system_activity_tracking":false}"#,
        );
        assert_eq!(s.theme, Theme::Light);
        assert_eq!(s.idle_timeout_minutes, 60);
        assert!(!s.pause_when_idle);
        assert_eq!(s.reminder_time, "20:00");
    }

    #[test]
    fn garbage_falls_back_to_defaults() {
        let s = AppSettings::from_json("not json");
        assert_eq!(s.theme, Theme::System);
        assert!(!s.onboarded);
    }

    #[test]
    fn reminder_time_parses() {
        let mut s = AppSettings::default();
        assert_eq!(s.reminder_minutes(), Some(20 * 60));
        s.reminder_time = "25:00".into();
        assert_eq!(s.reminder_minutes(), None);
    }
}

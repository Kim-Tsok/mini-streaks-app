//! The app picker: installed apps plus the ones the tracker has seen recently,
//! and the rule that decides whether a focused window counts for a streak.

use crate::activity::Focus;
use crate::db::{Pattern, PatternKind};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AppEntry {
    /// Stored as the pattern value.
    pub id: String,
    pub name: String,
    /// `data:` URL, when an icon could be found.
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppList {
    pub recent: Vec<AppEntry>,
    pub installed: Vec<AppEntry>,
}

fn norm(s: &str) -> String {
    s.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect()
}

/// Last segment of a reverse-DNS id: `org.mozilla.firefox` → `firefox`.
fn short_id(s: &str) -> &str {
    s.rsplit('.').next().unwrap_or(s)
}

pub fn is_own_window(focus: &Focus) -> bool {
    let id = norm(&focus.app_id);
    id.contains("ministreaks") || norm(&focus.app_name).contains("ministreaks")
}

pub fn matches(pattern: &Pattern, focus: &Focus) -> bool {
    let value = pattern.value.trim();
    if value.is_empty() {
        return false;
    }
    match pattern.kind {
        PatternKind::Title => focus.title.to_lowercase().contains(&value.to_lowercase()),
        PatternKind::App => {
            let v = norm(value);
            let v_short = norm(short_id(value));
            let label = pattern.label.as_deref().map(norm).unwrap_or_default();
            [&focus.app_id, &focus.app_name].iter().any(|candidate| {
                let c = norm(candidate);
                let c_short = norm(short_id(candidate));
                !c.is_empty()
                    && (c == v
                        || c_short == v_short
                        || (!label.is_empty() && c == label)
                        // Lenient fallback for hand-typed names like "code" → "code-oss".
                        || (v.len() >= 4 && c.contains(&v)))
            })
        }
    }
}

fn data_url(path: &std::path::Path) -> Option<String> {
    use base64::Engine;
    let mime = match path.extension()?.to_str()? {
        "svg" => "image/svg+xml",
        "png" => "image/png",
        _ => return None,
    };
    let meta = std::fs::metadata(path).ok()?;
    if meta.len() > 160 * 1024 {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[cfg(target_os = "linux")]
mod platform {
    use super::*;
    use std::collections::HashSet;
    use std::path::{Path, PathBuf};

    fn data_dirs() -> Vec<PathBuf> {
        let mut dirs = Vec::new();
        if let Some(home) = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
        {
            dirs.push(home);
        }
        let system = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
        dirs.extend(system.split(':').filter(|s| !s.is_empty()).map(PathBuf::from));
        for extra in ["/var/lib/flatpak/exports/share", "/var/lib/snapd/desktop"] {
            let p = PathBuf::from(extra);
            if !dirs.contains(&p) {
                dirs.push(p);
            }
        }
        dirs
    }

    fn find_icon(name: &str, dirs: &[PathBuf]) -> Option<String> {
        if name.is_empty() {
            return None;
        }
        let as_path = Path::new(name);
        if as_path.is_absolute() {
            return data_url(as_path);
        }
        const SIZES: [&str; 6] = ["scalable", "128x128", "256x256", "96x96", "64x64", "48x48"];
        for dir in dirs {
            for theme in ["hicolor", "Adwaita"] {
                for size in SIZES {
                    for ext in ["svg", "png"] {
                        let p = dir.join("icons").join(theme).join(size).join("apps").join(format!("{name}.{ext}"));
                        if p.exists() {
                            if let Some(url) = data_url(&p) {
                                return Some(url);
                            }
                        }
                    }
                }
            }
            for ext in ["svg", "png"] {
                let p = dir.join("pixmaps").join(format!("{name}.{ext}"));
                if p.exists() {
                    return data_url(&p);
                }
            }
        }
        None
    }

    struct Desktop {
        name: String,
        icon: String,
    }

    fn parse_desktop(text: &str) -> Option<Desktop> {
        let mut in_entry = false;
        let (mut name, mut icon) = (None, String::new());
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with('[') {
                in_entry = line == "[Desktop Entry]";
                continue;
            }
            if !in_entry {
                continue;
            }
            let Some((key, value)) = line.split_once('=') else { continue };
            match key.trim() {
                "Name" => name = Some(value.trim().to_string()),
                "Icon" => icon = value.trim().to_string(),
                "Type" if value.trim() != "Application" => return None,
                "NoDisplay" | "Hidden" if value.trim() == "true" => return None,
                _ => {}
            }
        }
        Some(Desktop { name: name?, icon })
    }

    pub fn installed() -> Vec<AppEntry> {
        let dirs = data_dirs();
        let mut seen = HashSet::new();
        let mut out = Vec::new();
        for dir in &dirs {
            let Ok(entries) = std::fs::read_dir(dir.join("applications")) else { continue };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                    continue;
                }
                let Some(id) = path.file_stem().map(|s| s.to_string_lossy().to_string()) else { continue };
                if id.contains("mini-streaks") || !seen.insert(id.clone()) {
                    continue;
                }
                let Some(desktop) = std::fs::read_to_string(&path).ok().as_deref().and_then(parse_desktop) else {
                    continue;
                };
                let icon = find_icon(&desktop.icon, &dirs);
                out.push(AppEntry { id, name: desktop.name, icon });
            }
        }
        out
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;

    pub fn installed() -> Vec<AppEntry> {
        let mut out = Vec::new();
        let home = std::env::var_os("HOME").map(std::path::PathBuf::from);
        let dirs = [Some("/Applications".into()), Some("/System/Applications".into()), home.map(|h| h.join("Applications"))];
        for dir in dirs.into_iter().flatten() {
            let Ok(entries) = std::fs::read_dir(dir) else { continue };
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("app") {
                    let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                    out.push(AppEntry { id: name.clone(), name, icon: None });
                }
            }
        }
        out
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::*;
    use std::path::PathBuf;

    fn walk(dir: PathBuf, out: &mut Vec<AppEntry>, depth: u8) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && depth < 3 {
                walk(path, out, depth + 1);
            } else if path.extension().and_then(|e| e.to_str()) == Some("lnk") {
                let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
                let lower = name.to_lowercase();
                if !lower.contains("uninstall") && !lower.contains("readme") {
                    out.push(AppEntry { id: name.clone(), name, icon: None });
                }
            }
        }
    }

    pub fn installed() -> Vec<AppEntry> {
        let mut out = Vec::new();
        for var in ["ProgramData", "APPDATA"] {
            if let Some(base) = std::env::var_os(var) {
                walk(PathBuf::from(base).join("Microsoft\\Windows\\Start Menu\\Programs"), &mut out, 0);
            }
        }
        out
    }
}

pub fn list(recent: &[Focus]) -> AppList {
    let mut installed = platform::installed();
    installed.sort_by_key(|a| a.name.to_lowercase());
    installed.dedup_by(|a, b| a.name.eq_ignore_ascii_case(&b.name));

    let recent = recent
        .iter()
        .map(|f| {
            // Borrow the installed entry's name and icon when we can match it.
            let probe = Pattern { kind: PatternKind::App, value: String::new(), label: None };
            let known = installed.iter().find(|a| {
                matches(&Pattern { value: a.id.clone(), label: Some(a.name.clone()), ..probe.clone() }, f)
            });
            match known {
                Some(a) => a.clone(),
                None => AppEntry {
                    id: f.app_id.clone(),
                    name: if f.app_name.is_empty() { f.app_id.clone() } else { f.app_name.clone() },
                    icon: None,
                },
            }
        })
        .collect();

    AppList { recent, installed }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn focus(app_id: &str, app_name: &str, title: &str) -> Focus {
        Focus { app_id: app_id.into(), app_name: app_name.into(), title: title.into() }
    }
    fn app(value: &str, label: Option<&str>) -> Pattern {
        Pattern { kind: PatternKind::App, value: value.into(), label: label.map(Into::into) }
    }

    #[test]
    fn app_rules() {
        assert!(matches(&app("code", None), &focus("code", "Visual Studio Code", "main.rs")));
        assert!(matches(&app("org.mozilla.firefox", None), &focus("firefox", "Firefox", "")));
        assert!(matches(&app("x", Some("Visual Studio Code")), &focus("electron", "Visual Studio Code", "")));
        assert!(matches(&app("Obsidian", None), &focus("md.obsidian.Obsidian", "Obsidian", "")));
        assert!(!matches(&app("code", None), &focus("gnome-terminal", "Terminal", "code review")));
    }

    #[test]
    fn title_rules() {
        let p = Pattern { kind: PatternKind::Title, value: "GitHub".into(), label: None };
        assert!(matches(&p, &focus("firefox", "Firefox", "Pull requests · GitHub — Firefox")));
        assert!(!matches(&p, &focus("github-desktop", "GitHub Desktop", "repo")));
    }
}

use super::{ActivitySource, Backend, Focus, Unavailable};
use std::path::PathBuf;
use std::process::Command;
use zbus::blocking::Connection;

pub const EXTENSION_UUID: &str = "mini-streaks-focus@komma.dev";
const EXTENSION_JS: &str = include_str!("../../gnome-extension/mini-streaks-focus@komma.dev/extension.js");
const EXTENSION_META: &str = include_str!("../../gnome-extension/mini-streaks-focus@komma.dev/metadata.json");

fn session_bus() -> Option<Connection> {
    Connection::session().ok()
}

/// Idle time from Mutter (GNOME, any session type), falling back to the X11
/// screensaver extension. Other Wayland desktops don't expose idle time.
pub struct LinuxIdle {
    bus: Option<Connection>,
    x11: Option<(x11rb::rust_connection::RustConnection, u32)>,
    mutter_ok: bool,
}

impl LinuxIdle {
    pub fn new() -> Self {
        let x11 = if super::session_type() == "x11" {
            x11rb::connect(None).ok().map(|(conn, screen)| {
                use x11rb::connection::Connection as _;
                let root = conn.setup().roots[screen].root;
                (conn, root)
            })
        } else {
            None
        };
        Self { bus: session_bus(), x11, mutter_ok: true }
    }

    pub fn idle_seconds(&mut self) -> Option<u64> {
        if self.mutter_ok {
            if let Some(bus) = &self.bus {
                let reply = bus.call_method(
                    Some("org.gnome.Mutter.IdleMonitor"),
                    "/org/gnome/Mutter/IdleMonitor/Core",
                    Some("org.gnome.Mutter.IdleMonitor"),
                    "GetIdletime",
                    &(),
                );
                match reply.and_then(|m| m.body().deserialize::<u64>()) {
                    Ok(ms) => return Some(ms / 1000),
                    Err(_) => self.mutter_ok = false,
                }
            }
        }
        let (conn, root) = self.x11.as_ref()?;
        use x11rb::protocol::screensaver::ConnectionExt as _;
        let info = conn.screensaver_query_info(*root).ok()?.reply().ok()?;
        Some(info.ms_since_user_input as u64 / 1000)
    }
}

/// GNOME on Wayland: the shell doesn't expose the focused window to apps, so
/// the bundled extension publishes it on the session bus.
pub struct GnomeSource {
    bus: Option<Connection>,
    idle: LinuxIdle,
}

impl GnomeSource {
    pub fn new() -> Self {
        Self { bus: session_bus(), idle: LinuxIdle::new() }
    }
}

impl ActivitySource for GnomeSource {
    fn focused(&mut self) -> Result<Option<Focus>, Unavailable> {
        if self.bus.is_none() {
            self.bus = session_bus();
        }
        let bus = self.bus.as_ref().ok_or(Unavailable)?;
        let reply = bus
            .call_method(
                Some("org.gnome.Shell"),
                "/dev/komma/MiniStreaks/Focus",
                Some("dev.komma.MiniStreaks.Focus"),
                "GetFocused",
                &(),
            )
            .map_err(|_| Unavailable)?;
        let (app_id, app_name, wm_class, title): (String, String, String, String) =
            reply.body().deserialize().map_err(|_| Unavailable)?;
        if app_id.is_empty() && wm_class.is_empty() && title.is_empty() {
            return Ok(None);
        }
        // Windows without a desktop file get a synthetic "window:N" id; fall back to the class.
        let app_id = if app_id.starts_with("window:") { String::new() } else { app_id };
        let app_id = app_id.strip_suffix(".desktop").unwrap_or(&app_id).to_string();
        Ok(Some(Focus {
            app_id: if app_id.is_empty() { wm_class.clone() } else { app_id },
            app_name: if app_name.is_empty() { wm_class } else { app_name },
            title,
        }))
    }

    fn idle_seconds(&mut self) -> Option<u64> {
        self.idle.idle_seconds()
    }

    fn backend(&self) -> Backend {
        Backend::GnomeExtension
    }
}

/// True when something can show our tray icon (StatusNotifier host). Stock
/// GNOME has none unless the AppIndicator extension is enabled.
pub fn tray_host_available() -> bool {
    let Some(bus) = session_bus() else { return false };
    bus.call_method(
        Some("org.freedesktop.DBus"),
        "/org/freedesktop/DBus",
        Some("org.freedesktop.DBus"),
        "NameHasOwner",
        &("org.kde.StatusNotifierWatcher",),
    )
    .and_then(|m| m.body().deserialize::<bool>())
    .unwrap_or(false)
}

fn extensions_dir() -> Option<PathBuf> {
    let data = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))?;
    Some(data.join("gnome-shell/extensions").join(EXTENSION_UUID))
}

pub fn gnome_extension_installed() -> bool {
    extensions_dir().is_some_and(|d| d.join("extension.js").exists())
}

/// Parses gsettings' `['a', 'b']` / `@as []` output.
fn parse_strv(raw: &str) -> Vec<String> {
    let raw = raw.trim().trim_start_matches("@as").trim();
    raw.trim_start_matches('[')
        .trim_end_matches(']')
        .split(',')
        .map(|s| s.trim().trim_matches('\'').to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Copies the extension into the user's extensions folder and enables it.
/// GNOME on Wayland only loads new extensions after the next log-in.
pub fn install_gnome_extension() -> Result<(), String> {
    let dir = extensions_dir().ok_or("Couldn't find your home folder")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("Couldn't create {}: {e}", dir.display()))?;
    std::fs::write(dir.join("extension.js"), EXTENSION_JS).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("metadata.json"), EXTENSION_META).map_err(|e| e.to_string())?;

    // `gnome-extensions enable` refuses extensions the running shell hasn't
    // loaded yet, so add it to the enabled list directly.
    let current = Command::new("gsettings")
        .args(["get", "org.gnome.shell", "enabled-extensions"])
        .output()
        .map_err(|e| format!("Couldn't run gsettings: {e}"))?;
    let mut list = parse_strv(&String::from_utf8_lossy(&current.stdout));
    if !list.iter().any(|u| u == EXTENSION_UUID) {
        list.push(EXTENSION_UUID.to_string());
        let value = format!(
            "[{}]",
            list.iter().map(|u| format!("'{u}'")).collect::<Vec<_>>().join(", ")
        );
        let status = Command::new("gsettings")
            .args(["set", "org.gnome.shell", "enabled-extensions", &value])
            .status()
            .map_err(|e| format!("Couldn't run gsettings: {e}"))?;
        if !status.success() {
            return Err("GNOME refused to enable the extension".into());
        }
    }
    let disabled = Command::new("gsettings")
        .args(["get", "org.gnome.shell", "disable-user-extensions"])
        .output()
        .is_ok_and(|o| String::from_utf8_lossy(&o.stdout).trim() == "true");
    if disabled {
        return Err("Installed, but extensions are switched off in GNOME. Turn them on in the Extensions app.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_strv;

    #[test]
    fn parses_gsettings_lists() {
        assert_eq!(parse_strv("@as []\n"), Vec::<String>::new());
        assert_eq!(parse_strv("['a@b', 'c@d']\n"), vec!["a@b", "c@d"]);
    }
}

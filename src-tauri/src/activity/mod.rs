//! Where the tracker learns which app is focused and how long the user has been away.

use serde::Serialize;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
pub use linux::{gnome_extension_installed, install_gnome_extension, tray_host_available};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Focus {
    /// Stable id: desktop-file id on GNOME, window class or executable name elsewhere.
    pub app_id: String,
    pub app_name: String,
    pub title: String,
}

impl Focus {
    fn from_active_window(w: active_win_pos_rs::ActiveWindow) -> Self {
        let exe = w
            .process_path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        Focus {
            app_id: if exe.is_empty() { w.app_name.clone() } else { exe },
            app_name: w.app_name,
            title: w.title,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Backend {
    /// GNOME on Wayland through the bundled shell extension.
    GnomeExtension,
    /// X11, KDE/Hyprland on Wayland, Windows and macOS.
    ActiveWindow,
}

#[derive(Debug, Clone, Serialize)]
pub struct Capabilities {
    pub os: &'static str,
    pub desktop: String,
    pub session: String,
    pub backend: Backend,
    /// The last focus query worked.
    pub focus_ok: bool,
    pub idle_supported: bool,
    /// GNOME on Wayland, where focus tracking needs our extension.
    pub needs_gnome_extension: bool,
    pub gnome_extension_installed: bool,
    pub tray_available: bool,
}

/// Focus can't be read on this setup right now.
#[derive(Debug, Clone, Copy)]
pub struct Unavailable;

pub trait ActivitySource: Send {
    fn focused(&mut self) -> Result<Option<Focus>, Unavailable>;
    fn idle_seconds(&mut self) -> Option<u64>;
    fn backend(&self) -> Backend;
}

/// Works on X11, KDE and Hyprland Wayland, Windows and macOS.
struct ActiveWindowSource {
    #[cfg(target_os = "linux")]
    idle: linux::LinuxIdle,
}

impl ActivitySource for ActiveWindowSource {
    fn focused(&mut self) -> Result<Option<Focus>, Unavailable> {
        match active_win_pos_rs::get_active_window() {
            Ok(w) => Ok(Some(Focus::from_active_window(w))),
            // Nothing focused (e.g. desktop) is not a failure on these platforms.
            Err(()) => Ok(None),
        }
    }

    fn idle_seconds(&mut self) -> Option<u64> {
        #[cfg(target_os = "linux")]
        return self.idle.idle_seconds();
        #[cfg(target_os = "windows")]
        return windows::idle_seconds();
        #[cfg(target_os = "macos")]
        return macos::idle_seconds();
        #[allow(unreachable_code)]
        None
    }

    fn backend(&self) -> Backend {
        Backend::ActiveWindow
    }
}

pub fn desktop() -> String {
    std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default()
}

pub fn session_type() -> String {
    if cfg!(target_os = "linux") {
        std::env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| {
            if std::env::var_os("WAYLAND_DISPLAY").is_some() { "wayland".into() } else { "x11".into() }
        })
    } else {
        String::new()
    }
}

pub fn is_gnome_wayland() -> bool {
    cfg!(target_os = "linux")
        && session_type() == "wayland"
        && desktop().to_lowercase().split(':').any(|d| d == "gnome" || d == "ubuntu")
}

pub fn new_source() -> Box<dyn ActivitySource> {
    #[cfg(target_os = "linux")]
    if is_gnome_wayland() {
        return Box::new(linux::GnomeSource::new());
    }
    Box::new(ActiveWindowSource {
        #[cfg(target_os = "linux")]
        idle: linux::LinuxIdle::new(),
    })
}

pub fn capabilities(source: &mut dyn ActivitySource) -> Capabilities {
    let focus_ok = source.focused().is_ok();
    let idle_supported = source.idle_seconds().is_some();
    let needs_ext = is_gnome_wayland();
    #[cfg(target_os = "linux")]
    let (installed, tray) = (gnome_extension_installed(), tray_host_available());
    #[cfg(not(target_os = "linux"))]
    let (installed, tray) = (false, true);
    Capabilities {
        os: std::env::consts::OS,
        desktop: desktop(),
        session: session_type(),
        backend: source.backend(),
        focus_ok,
        idle_supported,
        needs_gnome_extension: needs_ext,
        gnome_extension_installed: installed,
        tray_available: tray,
    }
}

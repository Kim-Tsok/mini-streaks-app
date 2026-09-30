![Mini Streaks](src/assets/banner.png)

A tiny desktop companion that keeps your daily habits alive. Pick a habit and the apps it happens in. Mini Streaks counts the minutes while you work, fills your flame as you go, and grows the streak each day you hit your goal. For everything that doesn't happen on a computer (the gym, a book), check it off by hand.

## What it does

- **Counts by itself.** Choose apps (or window titles like “YouTube”) and a daily goal. Time counts only while one of them is focused, and pauses when you step away.
- **Or check in by hand.** Manual streaks get a one-tap *Check in*, with undo.
- **A living flame.** Your flame fills from ash to fire as today's goal gets closer. It grows through five stages as the streak gets longer: ember, spark, flame, blaze and inferno.
- **Forgiving streaks.** Pick which weekdays count, so rest days never break a streak. Every 7 days in a row earns a freeze (up to 2), and a freeze covers one missed day.
- **History that means something.** A 6-month heatmap that burns hotter on days you went past your goal, plus best streak, days done, on-schedule rate and hours tracked.
- **Gentle nudges.** A notification when a goal is reached, and an evening reminder before a streak would end.
- **Lives in the tray.** Today's progress, quick check-ins and pause controls. On desktops without a tray, the window minimizes to the taskbar instead of disappearing.
- **Your data stays local.** SQLite in your app data folder. Export and import JSON backups from Settings.

## Platform support

| Platform | Focus tracking | Idle detection |
|---|---|---|
| GNOME on Wayland | Bundled helper extension (installed from the app, active after one log-out) | Mutter IdleMonitor |
| GNOME/other on X11 | Built in | X11 screensaver extension (Mutter first on GNOME) |
| KDE Plasma / Hyprland on Wayland | Built in | Not available, so minutes count while a tracked app is focused |
| Windows | Built in | `GetLastInputInfo` |
| macOS | Built in (window titles need Screen Recording permission) | CoreGraphics |

The GNOME helper lives in `src-tauri/gnome-extension/`. It exposes the focused app's id, name, class and title on the session bus (`dev.komma.MiniStreaks.Focus.GetFocused`) and nothing else.

## Develop

```sh
pnpm install
pnpm tauri dev                          # the real app
pnpm dev                                # UI only, in a browser, with a mock backend and sample data
cd src-tauri && cargo test              # streak math, migrations, matching, settings
cd src-tauri && cargo run --example probe -- 30   # print what the tracker sees for 30 s
```

`pnpm dev` without Tauri uses `src/lib/mock.ts`, which stores sample streaks in `localStorage` and fakes a focused app so you can watch the flame fill.

## Build installers

- **This machine (Linux):** `pnpm tauri build` produces `.deb`, `.rpm` and `.AppImage` in `src-tauri/target/release/bundle/`.
- **All platforms:** push a version tag and GitHub Actions builds Windows (`.exe`, `.msi`), macOS (Apple silicon and Intel `.dmg`) and Linux on their own runners. The installers land in a draft GitHub Release. Publish it, and the website's download buttons pick it up.

  ```sh
  git tag v0.2.0 && git push origin v0.2.0
  ```

  The run can also be started by hand from the Actions tab (*Build → Run workflow*). Before tagging a new version, bump `version` in `src-tauri/tauri.conf.json`.

Builds are unsigned, so Windows SmartScreen and macOS Gatekeeper warn on first launch. Code signing needs an Apple Developer ID and a Windows certificate, both added later as repo secrets.

## How it fits together

- `src-tauri/src/stats.rs`: pure streak math. Streaks, freezes and rates are always derived from the day logs, never stored as counters.
- `src-tauri/src/db.rs`: SQLite schema and versioned migrations (v1 → v2 upgrades old installs in place).
- `src-tauri/src/tracker.rs`: background loop. Reads focus and idle time every 2 s, adds seconds to matching streaks, and emits `activity-logged`, `goal-completed`, `tracking-status` and `streaks-updated`.
- `src-tauri/src/activity/`: per-platform focus and idle sources.
- `src-tauri/src/apps.rs`: installed-app listing for the picker, and the app/title matching rules.
- `src-tauri/src/tray.rs`: the tray menu, rebuilt whenever streaks change.
- `src/`: React UI. The design tokens are CSS variables in `src/index.css`. The mascot is drawn in `src/components/Flame.tsx`.

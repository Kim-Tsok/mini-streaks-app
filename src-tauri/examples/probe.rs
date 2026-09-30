//! Prints what the tracker sees: the focused app and idle time, once a second.
//! Use it to check tracking on a new machine:
//!
//!     cargo run --example probe            # 10 seconds
//!     cargo run --example probe -- 60      # 60 seconds
//!
//! The `app_id` is what an "app" rule matches against.

use mini_streaks_lib::activity;

fn main() {
    let seconds: u32 = std::env::args().nth(1).and_then(|s| s.parse().ok()).unwrap_or(10);
    let mut source = activity::new_source();
    let caps = activity::capabilities(&mut *source);
    println!("{caps:#?}\n");
    for _ in 0..seconds {
        let focus = match source.focused() {
            Ok(Some(f)) => format!("app_id={:?} app_name={:?} title={:?}", f.app_id, f.app_name, f.title),
            Ok(None) => "nothing focused".into(),
            Err(_) => "UNAVAILABLE (can't read focus on this setup)".into(),
        };
        let idle = source.idle_seconds().map_or("unknown".into(), |s| format!("{s}s"));
        println!("idle {idle:>8} | {focus}");
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}

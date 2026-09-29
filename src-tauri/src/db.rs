use crate::stats::{self, Day, DayLog, StreakStats};
use chrono::{Local, NaiveDate};
use rusqlite::{params, Connection, OptionalExtension, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

const SCHEMA_VERSION: i64 = 2;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StreakKind {
    /// Counts minutes while a matching app is focused.
    Auto,
    /// Checked off by hand.
    Manual,
}

impl StreakKind {
    fn as_str(self) -> &'static str {
        match self {
            StreakKind::Auto => "auto",
            StreakKind::Manual => "manual",
        }
    }
    fn parse(s: &str) -> Self {
        if s == "manual" {
            StreakKind::Manual
        } else {
            StreakKind::Auto
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PatternKind {
    /// Matches the focused app's id, class or name.
    App,
    /// Matches text anywhere in the focused window's title.
    Title,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pattern {
    pub kind: PatternKind,
    pub value: String,
    /// Human-friendly name shown in the UI (e.g. "Visual Studio Code").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreakInput {
    pub name: String,
    pub icon: String,
    pub kind: StreakKind,
    pub patterns: Vec<Pattern>,
    pub daily_goal_minutes: u32,
    pub schedule_days: u8,
}

#[derive(Debug, Clone, Serialize)]
pub struct Streak {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub kind: StreakKind,
    pub patterns: Vec<Pattern>,
    pub daily_goal_minutes: u32,
    pub schedule_days: u8,
    pub created_at: String,
    pub archived: bool,
    pub sort_order: i64,
    pub stats: StreakStats,
}

impl Streak {
    pub fn goal_seconds(&self) -> u32 {
        self.daily_goal_minutes.max(1) * 60
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportLog {
    pub date: String,
    pub seconds: u32,
    pub met: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportStreak {
    #[serde(flatten)]
    pub input: StreakInput,
    pub created_at: String,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub logs: Vec<ExportLog>,
}

/// What happened when tracked time was added.
pub struct LogResult {
    pub today_seconds: u32,
    pub newly_met: bool,
}

pub struct Database {
    conn: Connection,
}

pub fn today() -> NaiveDate {
    Local::now().date_naive()
}

fn fmt_date(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

fn parse_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s.split_whitespace().next()?, "%Y-%m-%d").ok()
}

fn parse_id(id: &str) -> i64 {
    id.parse().unwrap_or(-1)
}

impl Database {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode = WAL;")?;
        Self::with_conn(conn)
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self> {
        Self::with_conn(Connection::open_in_memory()?)
    }

    fn with_conn(conn: Connection) -> Result<Self> {
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        let db = Self { conn };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        let version: i64 = self.conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version >= SCHEMA_VERSION {
            return Ok(());
        }
        let has_streaks: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'streaks')",
            [],
            |r| r.get(0),
        )?;

        let tx = self.conn.unchecked_transaction()?;
        if has_streaks && version < 2 {
            migrate_v1_to_v2(&tx)?;
        } else {
            tx.execute_batch(
                "
                CREATE TABLE streaks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    icon TEXT NOT NULL,
                    kind TEXT NOT NULL DEFAULT 'auto',
                    tracked_patterns TEXT NOT NULL DEFAULT '[]',
                    daily_goal_minutes INTEGER NOT NULL DEFAULT 30,
                    schedule_days INTEGER NOT NULL DEFAULT 127,
                    created_at TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    sort_order INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE streak_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    streak_id INTEGER NOT NULL,
                    date TEXT NOT NULL,
                    seconds_tracked INTEGER NOT NULL DEFAULT 0,
                    goal_met INTEGER NOT NULL DEFAULT 0,
                    source TEXT NOT NULL DEFAULT 'auto',
                    UNIQUE(streak_id, date),
                    FOREIGN KEY(streak_id) REFERENCES streaks(id) ON DELETE CASCADE
                );
                CREATE INDEX idx_logs_streak_date ON streak_logs(streak_id, date);
                ",
            )?;
        }
        tx.execute_batch(&format!("PRAGMA user_version = {SCHEMA_VERSION};"))?;
        tx.commit()
    }

    fn logs_for(&self, id: i64) -> Result<Vec<DayLog>> {
        let mut stmt = self
            .conn
            .prepare_cached("SELECT date, seconds_tracked, goal_met FROM streak_logs WHERE streak_id = ?1")?;
        let rows = stmt.query_map(params![id], |r| {
            let date: String = r.get(0)?;
            Ok((date, r.get::<_, u32>(1)?, r.get::<_, bool>(2)?))
        })?;
        let mut logs = Vec::new();
        for row in rows {
            let (date, seconds, met) = row?;
            if let Some(date) = parse_date(&date) {
                logs.push(DayLog { date, seconds, met });
            }
        }
        Ok(logs)
    }

    pub fn get_streaks(&self) -> Result<Vec<Streak>> {
        self.load_streaks(None)
    }

    pub fn get_streak(&self, id: &str) -> Result<Option<Streak>> {
        Ok(self.load_streaks(Some(parse_id(id)))?.pop())
    }

    fn load_streaks(&self, only: Option<i64>) -> Result<Vec<Streak>> {
        let today = today();
        let mut stmt = self.conn.prepare_cached(
            "
            SELECT id, name, icon, kind, tracked_patterns, daily_goal_minutes, schedule_days,
                   created_at, is_active, sort_order
            FROM streaks
            WHERE ?1 IS NULL OR id = ?1
            ORDER BY sort_order ASC, id ASC
            ",
        )?;
        let rows = stmt.query_map(params![only], |r| {
            let kind: String = r.get(3)?;
            let patterns: String = r.get(4)?;
            Ok((
                r.get::<_, i64>(0)?,
                Streak {
                    id: String::new(),
                    name: r.get(1)?,
                    icon: r.get(2)?,
                    kind: StreakKind::parse(&kind),
                    patterns: serde_json::from_str(&patterns).unwrap_or_default(),
                    daily_goal_minutes: r.get(5)?,
                    schedule_days: r.get(6)?,
                    created_at: r.get(7)?,
                    archived: !r.get::<_, bool>(8)?,
                    sort_order: r.get(9)?,
                    stats: StreakStats::default(),
                },
            ))
        })?;

        let mut out = Vec::new();
        for row in rows {
            let (id, mut streak) = row?;
            streak.id = id.to_string();
            let created = parse_date(&streak.created_at).unwrap_or(today);
            streak.stats = stats::compute(created, streak.schedule_days, &self.logs_for(id)?, today);
            out.push(streak);
        }
        Ok(out)
    }

    pub fn create_streak(&self, input: &StreakInput) -> Result<Streak> {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        self.insert_streak(input, &now, false)
    }

    fn insert_streak(&self, input: &StreakInput, created_at: &str, archived: bool) -> Result<Streak> {
        let patterns = serde_json::to_string(&input.patterns).unwrap_or_else(|_| "[]".into());
        let next_order: i64 = self
            .conn
            .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM streaks", [], |r| r.get(0))?;
        self.conn.execute(
            "
            INSERT INTO streaks (name, icon, kind, tracked_patterns, daily_goal_minutes, schedule_days,
                                 created_at, is_active, sort_order)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ",
            params![
                input.name.trim(),
                input.icon,
                input.kind.as_str(),
                patterns,
                input.daily_goal_minutes.clamp(1, 24 * 60),
                input.schedule_days & 0x7f,
                created_at,
                !archived,
                next_order
            ],
        )?;
        let id = self.conn.last_insert_rowid().to_string();
        Ok(self.get_streak(&id)?.expect("streak just inserted"))
    }

    pub fn update_streak(&self, id: &str, input: &StreakInput) -> Result<()> {
        let id_num = parse_id(id);
        let patterns = serde_json::to_string(&input.patterns).unwrap_or_else(|_| "[]".into());
        let goal = input.daily_goal_minutes.clamp(1, 24 * 60);
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "
            UPDATE streaks
            SET name = ?1, icon = ?2, kind = ?3, tracked_patterns = ?4,
                daily_goal_minutes = ?5, schedule_days = ?6
            WHERE id = ?7
            ",
            params![input.name.trim(), input.icon, input.kind.as_str(), patterns, goal, input.schedule_days & 0x7f, id_num],
        )?;
        // A new goal applies to today's tracked time; past days keep their result.
        tx.execute(
            "UPDATE streak_logs SET goal_met = (seconds_tracked >= ?1)
             WHERE streak_id = ?2 AND date = ?3 AND source = 'auto'",
            params![goal * 60, id_num, fmt_date(today())],
        )?;
        tx.commit()
    }

    pub fn set_archived(&self, id: &str, archived: bool) -> Result<()> {
        self.conn
            .execute("UPDATE streaks SET is_active = ?1 WHERE id = ?2", params![!archived, parse_id(id)])?;
        Ok(())
    }

    pub fn reorder(&self, ids: &[String]) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        for (i, id) in ids.iter().enumerate() {
            tx.execute("UPDATE streaks SET sort_order = ?1 WHERE id = ?2", params![i as i64, parse_id(id)])?;
        }
        tx.commit()
    }

    pub fn delete_streak(&self, id: &str) -> Result<()> {
        // Logs go with it via ON DELETE CASCADE.
        self.conn.execute("DELETE FROM streaks WHERE id = ?1", params![parse_id(id)])?;
        Ok(())
    }

    /// Adds tracked time for today and marks the goal met once it's reached.
    pub fn add_seconds(&self, streak: &Streak, seconds: u32) -> Result<LogResult> {
        let id_num = parse_id(&streak.id);
        let date = fmt_date(today());
        let tx = self.conn.unchecked_transaction()?;
        let was_met: bool = tx
            .query_row(
                "SELECT goal_met FROM streak_logs WHERE streak_id = ?1 AND date = ?2",
                params![id_num, date],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or(false);
        tx.execute(
            "
            INSERT INTO streak_logs (streak_id, date, seconds_tracked, goal_met, source)
            VALUES (?1, ?2, ?3, 0, 'auto')
            ON CONFLICT(streak_id, date) DO UPDATE SET
                seconds_tracked = seconds_tracked + excluded.seconds_tracked
            ",
            params![id_num, date, seconds],
        )?;
        let total: u32 = tx.query_row(
            "SELECT seconds_tracked FROM streak_logs WHERE streak_id = ?1 AND date = ?2",
            params![id_num, date],
            |r| r.get(0),
        )?;
        let newly_met = !was_met && total >= streak.goal_seconds();
        if newly_met {
            tx.execute(
                "UPDATE streak_logs SET goal_met = 1 WHERE streak_id = ?1 AND date = ?2",
                params![id_num, date],
            )?;
        }
        tx.commit()?;
        Ok(LogResult { today_seconds: total, newly_met })
    }

    /// Marks today done by hand. Returns true if it wasn't done before.
    pub fn check_in(&self, id: &str) -> Result<bool> {
        let id_num = parse_id(id);
        let date = fmt_date(today());
        let changed = self.conn.execute(
            "
            INSERT INTO streak_logs (streak_id, date, seconds_tracked, goal_met, source)
            VALUES (?1, ?2, 0, 1, 'manual')
            ON CONFLICT(streak_id, date) DO UPDATE SET goal_met = 1, source = 'manual'
            WHERE goal_met = 0
            ",
            params![id_num, date],
        )?;
        Ok(changed > 0)
    }

    /// Reverts a manual check-in. Tracked time stays, and still counts if it met the goal.
    pub fn undo_check_in(&self, id: &str) -> Result<()> {
        let id_num = parse_id(id);
        let goal: u32 = self
            .conn
            .query_row("SELECT daily_goal_minutes FROM streaks WHERE id = ?1", params![id_num], |r| r.get(0))
            .optional()?
            .unwrap_or(30);
        let date = fmt_date(today());
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM streak_logs WHERE streak_id = ?1 AND date = ?2 AND source = 'manual' AND seconds_tracked = 0",
            params![id_num, date],
        )?;
        tx.execute(
            "UPDATE streak_logs SET source = 'auto', goal_met = (seconds_tracked >= ?1)
             WHERE streak_id = ?2 AND date = ?3 AND source = 'manual'",
            params![goal * 60, id_num, date],
        )?;
        tx.commit()
    }

    pub fn history(&self, id: &str, days: u32) -> Result<Vec<Day>> {
        let Some(streak) = self.get_streak(id)? else {
            return Ok(Vec::new());
        };
        let today = today();
        let created = parse_date(&streak.created_at).unwrap_or(today);
        Ok(stats::history(created, streak.schedule_days, &self.logs_for(parse_id(id))?, today, days.clamp(7, 800)))
    }

    pub fn export(&self) -> Result<Vec<ExportStreak>> {
        let mut out = Vec::new();
        for s in self.get_streaks()? {
            let mut stmt = self.conn.prepare_cached(
                "SELECT date, seconds_tracked, goal_met, source FROM streak_logs WHERE streak_id = ?1 ORDER BY date",
            )?;
            let logs = stmt
                .query_map(params![parse_id(&s.id)], |r| {
                    Ok(ExportLog { date: r.get(0)?, seconds: r.get(1)?, met: r.get(2)?, source: r.get(3)? })
                })?
                .collect::<Result<Vec<_>>>()?;
            out.push(ExportStreak {
                input: StreakInput {
                    name: s.name,
                    icon: s.icon,
                    kind: s.kind,
                    patterns: s.patterns,
                    daily_goal_minutes: s.daily_goal_minutes,
                    schedule_days: s.schedule_days,
                },
                created_at: s.created_at,
                archived: s.archived,
                logs,
            });
        }
        Ok(out)
    }

    /// Adds the streaks from a backup alongside the existing ones.
    pub fn import(&self, streaks: &[ExportStreak]) -> Result<usize> {
        for s in streaks {
            let created = self.insert_streak(&s.input, &s.created_at, s.archived)?;
            let id_num = parse_id(&created.id);
            for log in &s.logs {
                if parse_date(&log.date).is_none() {
                    continue;
                }
                self.conn.execute(
                    "INSERT OR REPLACE INTO streak_logs (streak_id, date, seconds_tracked, goal_met, source)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![id_num, log.date, log.seconds, log.met, log.source],
                )?;
            }
        }
        Ok(streaks.len())
    }
}

/// v1 stored minutes, plain-string patterns and denormalised streak counters.
fn migrate_v1_to_v2(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        ALTER TABLE streaks ADD COLUMN kind TEXT NOT NULL DEFAULT 'auto';
        ALTER TABLE streaks ADD COLUMN schedule_days INTEGER NOT NULL DEFAULT 127;
        ALTER TABLE streaks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE streaks DROP COLUMN current_streak_count;
        ALTER TABLE streaks DROP COLUMN best_streak_count;
        UPDATE streaks SET sort_order = id;

        ALTER TABLE streak_logs ADD COLUMN seconds_tracked INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE streak_logs ADD COLUMN source TEXT NOT NULL DEFAULT 'auto';
        UPDATE streak_logs SET seconds_tracked = minutes_tracked * 60;
        ALTER TABLE streak_logs DROP COLUMN minutes_tracked;
        ",
    )?;

    let rows: Vec<(i64, String)> = conn
        .prepare("SELECT id, tracked_patterns FROM streaks")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_>>()?;
    for (id, raw) in rows {
        let old: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
        let new: Vec<Pattern> = old
            .into_iter()
            .filter(|p| !p.trim().is_empty())
            .map(|p| Pattern { kind: PatternKind::App, value: p.trim().to_string(), label: None })
            .collect();
        conn.execute(
            "UPDATE streaks SET tracked_patterns = ?1 WHERE id = ?2",
            params![serde_json::to_string(&new).unwrap_or_else(|_| "[]".into()), id],
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(kind: StreakKind) -> StreakInput {
        StreakInput {
            name: "Code".into(),
            icon: "code".into(),
            kind,
            patterns: vec![Pattern { kind: PatternKind::App, value: "code".into(), label: None }],
            daily_goal_minutes: 1,
            schedule_days: 0x7f,
        }
    }

    #[test]
    fn auto_goal_met_once() {
        let db = Database::in_memory().unwrap();
        let s = db.create_streak(&input(StreakKind::Auto)).unwrap();
        assert!(!db.add_seconds(&s, 30).unwrap().newly_met);
        let r = db.add_seconds(&s, 30).unwrap();
        assert!(r.newly_met);
        assert_eq!(r.today_seconds, 60);
        assert!(!db.add_seconds(&s, 2).unwrap().newly_met);
        let s = db.get_streak(&s.id).unwrap().unwrap();
        assert_eq!(s.stats.current, 1);
        assert!(s.stats.done_today);
    }

    #[test]
    fn check_in_and_undo() {
        let db = Database::in_memory().unwrap();
        let s = db.create_streak(&input(StreakKind::Manual)).unwrap();
        assert!(db.check_in(&s.id).unwrap());
        assert!(!db.check_in(&s.id).unwrap());
        assert_eq!(db.get_streak(&s.id).unwrap().unwrap().stats.current, 1);
        db.undo_check_in(&s.id).unwrap();
        assert_eq!(db.get_streak(&s.id).unwrap().unwrap().stats.current, 0);
    }

    #[test]
    fn undo_keeps_tracked_time() {
        let db = Database::in_memory().unwrap();
        let s = db.create_streak(&input(StreakKind::Auto)).unwrap();
        db.add_seconds(&s, 20).unwrap();
        db.check_in(&s.id).unwrap();
        db.undo_check_in(&s.id).unwrap();
        let s = db.get_streak(&s.id).unwrap().unwrap();
        assert_eq!(s.stats.today_seconds, 20);
        assert!(!s.stats.done_today);
    }

    #[test]
    fn raising_goal_reopens_today() {
        let db = Database::in_memory().unwrap();
        let s = db.create_streak(&input(StreakKind::Auto)).unwrap();
        db.add_seconds(&s, 60).unwrap();
        let mut inp = input(StreakKind::Auto);
        inp.daily_goal_minutes = 5;
        db.update_streak(&s.id, &inp).unwrap();
        assert!(!db.get_streak(&s.id).unwrap().unwrap().stats.done_today);
    }

    #[test]
    fn delete_cascades() {
        let db = Database::in_memory().unwrap();
        let s = db.create_streak(&input(StreakKind::Manual)).unwrap();
        db.check_in(&s.id).unwrap();
        db.delete_streak(&s.id).unwrap();
        let n: i64 = db.conn.query_row("SELECT COUNT(*) FROM streak_logs", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn export_import_roundtrip() {
        let db = Database::in_memory().unwrap();
        let s = db.create_streak(&input(StreakKind::Manual)).unwrap();
        db.check_in(&s.id).unwrap();
        let dump = db.export().unwrap();
        let other = Database::in_memory().unwrap();
        other.import(&dump).unwrap();
        let got = other.get_streaks().unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].stats.current, 1);
    }

    #[test]
    fn migrates_v1_schema() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE streaks (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, icon TEXT NOT NULL,
                tracked_patterns TEXT NOT NULL, daily_goal_minutes INTEGER NOT NULL DEFAULT 30,
                created_at TEXT NOT NULL, current_streak_count INTEGER NOT NULL DEFAULT 0,
                best_streak_count INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1);
            CREATE TABLE streak_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT, streak_id INTEGER NOT NULL, date TEXT NOT NULL,
                minutes_tracked INTEGER NOT NULL DEFAULT 0, goal_met INTEGER NOT NULL DEFAULT 0,
                UNIQUE(streak_id, date), FOREIGN KEY(streak_id) REFERENCES streaks(id) ON DELETE CASCADE);
            INSERT INTO streaks (name, icon, tracked_patterns, created_at, current_streak_count)
                VALUES ('Code', 'code', '[\"Code\"]', '2026-09-01 10:00:00', 4);
            INSERT INTO streak_logs (streak_id, date, minutes_tracked, goal_met) VALUES (1, '2026-09-02', 31, 1);
            ",
        )
        .unwrap();
        let db = Database::with_conn(conn).unwrap();
        let s = &db.get_streaks().unwrap()[0];
        assert_eq!(s.patterns[0], Pattern { kind: PatternKind::App, value: "Code".into(), label: None });
        assert_eq!(s.kind, StreakKind::Auto);
        let secs: u32 = db.conn.query_row("SELECT seconds_tracked FROM streak_logs", [], |r| r.get(0)).unwrap();
        assert_eq!(secs, 31 * 60);
    }
}

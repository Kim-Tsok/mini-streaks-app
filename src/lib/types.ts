// Mirrors the Rust types in src-tauri/src (serde field names).

export type StreakKind = 'auto' | 'manual';
export type PatternKind = 'app' | 'title';

export interface Pattern {
  kind: PatternKind;
  value: string;
  label?: string;
}

export interface StreakStats {
  current: number;
  best: number;
  total_days: number;
  completion_rate: number;
  total_seconds: number;
  today_seconds: number;
  done_today: boolean;
  scheduled_today: boolean;
  at_risk: boolean;
  freezes: number;
}

export interface Streak {
  id: string;
  name: string;
  icon: string;
  kind: StreakKind;
  patterns: Pattern[];
  daily_goal_minutes: number;
  /** Bit 0 = Monday … bit 6 = Sunday. */
  schedule_days: number;
  created_at: string;
  archived: boolean;
  sort_order: number;
  stats: StreakStats;
}

export interface StreakInput {
  name: string;
  icon: string;
  kind: StreakKind;
  patterns: Pattern[];
  daily_goal_minutes: number;
  schedule_days: number;
}

export type DayState = 'done' | 'frozen' | 'missed' | 'rest' | 'pending' | 'before';

export interface Day {
  date: string;
  state: DayState;
  seconds: number;
}

export type Theme = 'system' | 'light' | 'dark';

export interface AppSettings {
  theme: Theme;
  launch_on_startup: boolean;
  idle_timeout_minutes: number;
  pause_when_idle: boolean;
  notifications_enabled: boolean;
  reminders_enabled: boolean;
  reminder_time: string;
  onboarded: boolean;
  tracking_paused_until: string | null;
}

export type TrackingState = 'starting' | 'tracking' | 'watching' | 'idle' | 'paused' | 'unavailable';

export interface TrackingStatus {
  state: TrackingState;
  app_name: string | null;
  matched: string[];
}

export interface Capabilities {
  os: string;
  desktop: string;
  session: string;
  backend: 'gnome-extension' | 'active-window';
  focus_ok: boolean;
  idle_supported: boolean;
  needs_gnome_extension: boolean;
  gnome_extension_installed: boolean;
  tray_available: boolean;
}

export interface AppEntry {
  id: string;
  name: string;
  icon: string | null;
}

export interface AppList {
  recent: AppEntry[];
  installed: AppEntry[];
}

export interface GoalCompleted {
  id: string;
  name: string;
  current: number;
  milestone: number | null;
}

export interface ActivityLogged {
  id: string;
  today_seconds: number;
}

export interface EventMap {
  'streaks-updated': null;
  'activity-logged': ActivityLogged;
  'goal-completed': GoalCompleted;
  'tracking-status': TrackingStatus;
  'settings-updated': AppSettings;
}

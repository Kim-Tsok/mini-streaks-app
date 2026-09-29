// In-browser stand-in for the Rust backend, so `pnpm dev` works without Tauri
// (design review, screenshots). Mirrors src-tauri/src/stats.rs closely enough
// to look right; the Rust side is the source of truth.
import type {
  AppSettings,
  Day,
  DayState,
  Streak,
  StreakInput,
  StreakStats,
  TrackingStatus,
} from './types';
import { addDays, isScheduled, toISODate } from './dates';

interface Log {
  date: string;
  seconds: number;
  met: boolean;
  source: 'auto' | 'manual';
}
interface Stored extends StreakInput {
  id: string;
  created_at: string;
  archived: boolean;
  sort_order: number;
  logs: Log[];
}
interface Db {
  streaks: Stored[];
  settings: AppSettings;
  nextId: number;
}

const KEY = 'mini-streaks-mock-v2';

const defaultSettings: AppSettings = {
  theme: 'system',
  launch_on_startup: true,
  idle_timeout_minutes: 5,
  pause_when_idle: true,
  notifications_enabled: true,
  reminders_enabled: true,
  reminder_time: '20:00',
  onboarded: false,
  tracking_paused_until: null,
};

function seed(): Db {
  const today = new Date();
  const history = (days: number, rate: number, goal: number, skipRecent = 0): Log[] => {
    const logs: Log[] = [];
    for (let i = days; i >= 1 + skipRecent; i--) {
      const date = toISODate(addDays(today, -i));
      // Deterministic pseudo-random pattern.
      const r = Math.abs(Math.sin(i * 12.9898 + goal) * 43758.5453) % 1;
      const met = r < rate || i <= 14;
      logs.push({ date, seconds: met ? goal * 60 + Math.round(r * goal * 40) : Math.round(r * goal * 30), met, source: 'auto' });
    }
    return logs;
  };
  const mk = (id: number, s: Omit<Stored, 'id' | 'sort_order' | 'archived'>): Stored => ({
    ...s,
    id: String(id),
    sort_order: id,
    archived: false,
  });
  const created = (days: number) => `${toISODate(addDays(today, -days))} 09:00:00`;
  return {
    nextId: 5,
    settings: { ...defaultSettings, onboarded: true },
    streaks: [
      mk(1, {
        name: 'Code 30+ min',
        icon: 'code',
        kind: 'auto',
        patterns: [{ kind: 'app', value: 'code', label: 'Visual Studio Code' }],
        daily_goal_minutes: 30,
        schedule_days: 0x7f,
        created_at: created(120),
        logs: [...history(120, 0.8, 30), { date: toISODate(today), seconds: 18 * 60, met: false, source: 'auto' }],
      }),
      mk(2, {
        name: 'Read a book',
        icon: 'book',
        kind: 'manual',
        patterns: [],
        daily_goal_minutes: 20,
        schedule_days: 0x7f,
        created_at: created(40),
        logs: history(40, 0.7, 20).map(l => ({ ...l, source: 'manual' as const, seconds: 0 })),
      }),
      mk(3, {
        name: 'Hit the gym',
        icon: 'dumbbell',
        kind: 'manual',
        patterns: [],
        daily_goal_minutes: 45,
        schedule_days: 0b0010101,
        created_at: created(10),
        logs: [{ date: toISODate(today), seconds: 0, met: true, source: 'manual' }],
      }),
      mk(4, {
        name: 'Write 500 words',
        icon: 'pen',
        kind: 'auto',
        patterns: [{ kind: 'app', value: 'md.obsidian.Obsidian', label: 'Obsidian' }],
        daily_goal_minutes: 25,
        schedule_days: 0b0011111,
        created_at: created(3),
        logs: [],
      }),
    ],
  };
}

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Db;
  } catch {
    /* storage unavailable */
  }
  return seed();
}

let db = load();
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

type Listener = (p: unknown) => void;
const listeners = new Map<string, Set<Listener>>();
function emit(event: string, payload: unknown) {
  listeners.get(event)?.forEach(l => l(payload));
}

function walk(s: Stored, today: Date): { stats: StreakStats; days: Day[] } {
  const byDate = new Map(s.logs.map(l => [l.date, l]));
  const created = new Date(s.created_at.slice(0, 10) + 'T00:00:00');
  const firstLog = s.logs.reduce<string | null>((m, l) => (m === null || l.date < m ? l.date : m), null);
  let d = firstLog && new Date(firstLog + 'T00:00:00') < created ? new Date(firstLog + 'T00:00:00') : created;
  const todayKey = toISODate(today);
  const st: StreakStats = {
    current: 0, best: 0, total_days: 0, completion_rate: 0, total_seconds: 0,
    today_seconds: 0, done_today: false, scheduled_today: false, at_risk: false, freezes: 0,
  };
  let run = 0;
  let earned = 0;
  let elapsed = 0;
  const days: Day[] = [];
  while (toISODate(d) <= todayKey) {
    const key = toISODate(d);
    const log = byDate.get(key);
    const seconds = log?.seconds ?? 0;
    const met = !!log?.met;
    const scheduled = isScheduled(s.schedule_days, d);
    st.total_seconds += seconds;
    let state: DayState;
    if (met) {
      st.total_days++;
      if (scheduled) elapsed++;
      run++;
      if (Math.floor(run / 7) > earned) {
        earned = Math.floor(run / 7);
        st.freezes = Math.min(2, st.freezes + 1);
      }
      state = 'done';
    } else if (key === todayKey) {
      state = scheduled ? 'pending' : 'rest';
    } else if (!scheduled) {
      state = 'rest';
    } else {
      elapsed++;
      if (run > 0 && st.freezes > 0) {
        st.freezes--;
        state = 'frozen';
      } else {
        run = 0;
        earned = 0;
        state = 'missed';
      }
    }
    st.best = Math.max(st.best, run);
    if (key === todayKey) {
      st.today_seconds = seconds;
      st.done_today = met;
      st.scheduled_today = scheduled;
    }
    days.push({ date: key, state, seconds });
    d = addDays(d, 1);
  }
  st.current = run;
  st.at_risk = st.scheduled_today && !st.done_today && run > 0;
  st.completion_rate = elapsed ? Math.min(st.total_days, elapsed) / elapsed : 0;
  return { stats: st, days };
}

function view(s: Stored): Streak {
  const { logs: _logs, ...rest } = s;
  return { ...rest, stats: walk(s, new Date()).stats };
}

function find(id: unknown): Stored {
  const s = db.streaks.find(x => x.id === id);
  if (!s) throw 'That streak no longer exists';
  return s;
}

function todayLog(s: Stored): Log {
  const date = toISODate(new Date());
  let log = s.logs.find(l => l.date === date);
  if (!log) {
    log = { date, seconds: 0, met: false, source: 'auto' };
    s.logs.push(log);
  }
  return log;
}

function changed() {
  persist();
  emit('streaks-updated', null);
}

function goal(s: Stored) {
  const v = view(s);
  const milestone = [7, 30, 50, 100, 200, 365].includes(v.stats.current) ? v.stats.current : null;
  emit('goal-completed', { id: s.id, name: s.name, current: v.stats.current, milestone });
}

let status: TrackingStatus = { state: 'starting', app_name: null, matched: [] };

// Pretend the user is coding: the first unfinished auto streak fills up live.
setInterval(() => {
  if (db.settings.tracking_paused_until && new Date(db.settings.tracking_paused_until) > new Date()) {
    status = { state: 'paused', app_name: null, matched: [] };
    emit('tracking-status', status);
    return;
  }
  const target = db.streaks.find(s => s.kind === 'auto' && !s.archived && s.patterns.length);
  if (!target) {
    status = { state: 'watching', app_name: 'Firefox', matched: [] };
    emit('tracking-status', status);
    return;
  }
  status = { state: 'tracking', app_name: target.patterns[0].label ?? target.patterns[0].value, matched: [target.id] };
  emit('tracking-status', status);
  const log = todayLog(target);
  const wasMet = log.met;
  log.seconds += 20; // fast-forward so the fill is visible
  if (!wasMet && log.seconds >= target.daily_goal_minutes * 60) {
    log.met = true;
    persist();
    goal(target);
    emit('streaks-updated', null);
  } else {
    persist();
    emit('activity-logged', { id: target.id, today_seconds: log.seconds });
  }
}, 2000);

export const mock = {
  listen(event: string, cb: Listener) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(cb);
    return () => listeners.get(event)?.delete(cb);
  },

  download(name: string): number {
    const blob = new Blob([JSON.stringify({ app: 'mini-streaks', version: 1, streaks: db.streaks }, null, 2)], {
      type: 'application/json',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    return db.streaks.length;
  },

  async invoke<T>(cmd: string, a: Record<string, unknown>): Promise<T> {
    await new Promise(r => setTimeout(r, 30));
    const out = ((): unknown => {
      switch (cmd) {
        case 'get_streaks':
          return [...db.streaks].sort((x, y) => x.sort_order - y.sort_order).map(view);
        case 'create_streak': {
          const input = a.input as StreakInput;
          const s: Stored = {
            ...input,
            id: String(db.nextId++),
            created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
            archived: false,
            sort_order: db.streaks.length,
            logs: [],
          };
          db.streaks.push(s);
          changed();
          return view(s);
        }
        case 'update_streak': {
          const s = find(a.id);
          Object.assign(s, a.input as StreakInput);
          const log = s.logs.find(l => l.date === toISODate(new Date()));
          if (log && log.source === 'auto') log.met = log.seconds >= s.daily_goal_minutes * 60;
          changed();
          return null;
        }
        case 'delete_streak':
          db.streaks = db.streaks.filter(s => s.id !== a.id);
          changed();
          return null;
        case 'set_archived':
          find(a.id).archived = a.archived as boolean;
          changed();
          return null;
        case 'reorder_streaks':
          (a.ids as string[]).forEach((id, i) => {
            const s = db.streaks.find(x => x.id === id);
            if (s) s.sort_order = i;
          });
          changed();
          return null;
        case 'check_in': {
          const s = find(a.id);
          const log = todayLog(s);
          if (!log.met) {
            log.met = true;
            log.source = 'manual';
            persist();
            goal(s);
          }
          changed();
          return null;
        }
        case 'undo_check_in': {
          const s = find(a.id);
          const log = todayLog(s);
          if (log.source === 'manual') {
            log.source = 'auto';
            log.met = log.seconds >= s.daily_goal_minutes * 60;
          }
          changed();
          return null;
        }
        case 'get_history': {
          const s = find(a.id);
          const days = (a.days as number) ?? 182;
          const all = walk(s, new Date()).days;
          const byDate = new Map(all.map(d => [d.date, d]));
          const out: Day[] = [];
          for (let i = days - 1; i >= 0; i--) {
            const key = toISODate(addDays(new Date(), -i));
            out.push(byDate.get(key) ?? { date: key, state: 'before', seconds: 0 });
          }
          return out;
        }
        case 'get_settings':
          return db.settings;
        case 'save_settings':
          db.settings = a.settings as AppSettings;
          persist();
          emit('settings-updated', db.settings);
          return db.settings;
        case 'pause_tracking': {
          const m = a.minutes as number | null;
          db.settings = {
            ...db.settings,
            tracking_paused_until: m ? new Date(Date.now() + m * 60000).toISOString() : null,
          };
          persist();
          emit('settings-updated', db.settings);
          return null;
        }
        case 'get_capabilities':
          return {
            os: 'linux', desktop: 'GNOME', session: 'wayland', backend: 'gnome-extension',
            focus_ok: true, idle_supported: true, needs_gnome_extension: true,
            gnome_extension_installed: true, tray_available: false,
          };
        case 'get_tracking_status':
          return status;
        case 'install_gnome_extension':
          return null;
        case 'list_apps':
          return {
            recent: [
              { id: 'code', name: 'Visual Studio Code', icon: null },
              { id: 'org.mozilla.firefox', name: 'Firefox', icon: null },
            ],
            installed: [
              'Audacity', 'Blender', 'Calculator', 'Files', 'Firefox', 'GIMP', 'Inkscape', 'Obsidian',
              'Spotify', 'Steam', 'Terminal', 'Visual Studio Code', 'Zed',
            ].map(name => ({ id: name.toLowerCase().replace(/\s+/g, '-'), name, icon: null })),
          };
        case 'hide_window':
        case 'quit_app':
          return null;
        default:
          throw `mock: unknown command ${cmd}`;
      }
    })();
    return out as T;
  },
};

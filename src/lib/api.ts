import type {
  AppList,
  AppSettings,
  Capabilities,
  Day,
  EventMap,
  Streak,
  StreakInput,
  TrackingStatus,
} from './types';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type Unlisten = () => void;

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
  }
  const { mock } = await import('./mock');
  return mock.invoke<T>(cmd, args ?? {});
}

/** Subscribes to a backend event. Returns an unsubscribe function. */
export function on<K extends keyof EventMap>(event: K, cb: (payload: EventMap[K]) => void): Unlisten {
  let unlisten: Unlisten | null = null;
  let cancelled = false;
  (async () => {
    if (isTauri) {
      const { listen } = await import('@tauri-apps/api/event');
      const u = await listen<EventMap[K]>(event, e => cb(e.payload));
      if (cancelled) u();
      else unlisten = u;
    } else {
      const { mock } = await import('./mock');
      const u = mock.listen(event, cb as (p: unknown) => void);
      if (cancelled) u();
      else unlisten = u;
    }
  })();
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** Errors from Rust arrive as plain strings. */
export function errorText(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}

export const api = {
  getStreaks: () => call<Streak[]>('get_streaks'),
  createStreak: (input: StreakInput) => call<Streak>('create_streak', { input }),
  updateStreak: (id: string, input: StreakInput) => call<void>('update_streak', { id, input }),
  deleteStreak: (id: string) => call<void>('delete_streak', { id }),
  setArchived: (id: string, archived: boolean) => call<void>('set_archived', { id, archived }),
  reorder: (ids: string[]) => call<void>('reorder_streaks', { ids }),
  checkIn: (id: string) => call<void>('check_in', { id }),
  undoCheckIn: (id: string) => call<void>('undo_check_in', { id }),
  history: (id: string, days = 182) => call<Day[]>('get_history', { id, days }),

  getSettings: () => call<AppSettings>('get_settings'),
  saveSettings: (settings: AppSettings) => call<AppSettings>('save_settings', { settings }),
  pauseTracking: (minutes: number | null) => call<void>('pause_tracking', { minutes }),

  capabilities: () => call<Capabilities>('get_capabilities'),
  trackingStatus: () => call<TrackingStatus>('get_tracking_status'),
  installGnomeExtension: () => call<void>('install_gnome_extension'),
  listApps: () => call<AppList>('list_apps'),

  hideWindow: () => call<void>('hide_window'),
  quit: () => call<void>('quit_app'),

  /** Asks where to save, then writes a backup. Returns the number of streaks, or null if cancelled. */
  async exportBackup(): Promise<number | null> {
    const name = `mini-streaks-${new Date().toISOString().slice(0, 10)}.json`;
    if (!isTauri) {
      const { mock } = await import('./mock');
      return mock.download(name);
    }
    const { save } = await import('@tauri-apps/plugin-dialog');
    const path = await save({ defaultPath: name, filters: [{ name: 'Backup', extensions: ['json'] }] });
    if (!path) return null;
    return call<number>('export_data', { path });
  },

  /** Asks for a backup file and adds its streaks. Returns how many, or null if cancelled. */
  async importBackup(): Promise<number | null> {
    if (!isTauri) return null;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const path = await open({ multiple: false, filters: [{ name: 'Backup', extensions: ['json'] }] });
    if (!path || Array.isArray(path)) return null;
    return call<number>('import_data', { path });
  },

  async startDragging() {
    if (!isTauri) return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().startDragging();
  },
};

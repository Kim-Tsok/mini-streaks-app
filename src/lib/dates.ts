/** Local-time YYYY-MM-DD (never UTC, so late-evening days don't shift). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

/** Monday = 0 … Sunday = 6, matching the Rust bitmask. */
export function weekdayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function isScheduled(mask: number, d: Date): boolean {
  const m = (mask & 0x7f) === 0 ? 0x7f : mask;
  return (m & (1 << weekdayIndex(d))) !== 0;
}

export const EVERY_DAY = 0x7f;
export const WEEKDAYS = 0b0011111;
export const WEEKDAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function describeSchedule(mask: number): string {
  const m = mask & 0x7f;
  if (m === EVERY_DAY || m === 0) return 'Every day';
  if (m === WEEKDAYS) return 'Weekdays';
  if (m === 0b1100000) return 'Weekends';
  const names = WEEKDAY_NAMES.filter((_, i) => m & (1 << i)).map(n => n.slice(0, 3));
  return names.join(', ');
}

export function formatMinutes(seconds: number): string {
  return String(Math.floor(seconds / 60));
}

/** "42 h", "3 h 20 min", "25 min". */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 10 || m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Minutes since midnight for "HH:MM", or null. */
export function parseClock(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

export function isPastClock(s: string, now = new Date()): boolean {
  const at = parseClock(s);
  return at !== null && now.getHours() * 60 + now.getMinutes() >= at;
}

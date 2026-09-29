import { useMemo } from 'react';
import type { Day } from '../lib/types';
import { fromISODate, weekdayIndex } from '../lib/dates';

interface HeatmapProps {
  days: Day[];
  goalSeconds: number;
  manual: boolean;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Done days burn hotter with more time: coral at the goal, orange at 1.5×, yellow at 2×. */
function doneColor(seconds: number, goal: number, manual: boolean): string {
  if (manual || goal <= 0) return 'rgb(var(--coral))';
  const r = seconds / goal;
  if (r >= 2) return 'rgb(var(--yellow))';
  if (r >= 1.5) return 'rgb(var(--orange))';
  return 'rgb(var(--coral))';
}

function cellStyle(d: Day, goal: number, manual: boolean): React.CSSProperties {
  switch (d.state) {
    case 'done':
      return { background: doneColor(d.seconds, goal, manual) };
    case 'frozen':
      return { background: 'rgb(var(--ice) / 0.85)' };
    case 'pending':
      return {
        background: d.seconds > 0 ? 'rgb(var(--coral) / 0.25)' : 'transparent',
        boxShadow: 'inset 0 0 0 1.5px rgb(var(--coral))',
      };
    case 'missed':
      return {
        background: d.seconds > 0 ? 'rgb(var(--coral) / 0.18)' : 'rgb(var(--muted) / 0.12)',
      };
    case 'rest':
      return { background: 'transparent', boxShadow: 'inset 0 0 0 1px rgb(var(--muted) / 0.2)' };
    default:
      return { background: 'transparent' };
  }
}

function describe(d: Day): string {
  const date = fromISODate(d.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const mins = Math.floor(d.seconds / 60);
  const time = mins > 0 ? `, ${mins} min` : '';
  const state = {
    done: 'done',
    frozen: 'missed, saved by a freeze',
    missed: 'missed',
    rest: 'rest day',
    pending: 'today',
    before: 'before this streak',
  }[d.state];
  return `${date}: ${state}${time}`;
}

export function Heatmap({ days, goalSeconds, manual }: HeatmapProps) {
  const { cells, cols, months } = useMemo(() => {
    if (days.length === 0) return { cells: [], cols: 0, months: [] as { col: number; label: string }[] };
    const pad = weekdayIndex(fromISODate(days[0].date));
    const cells: (Day | null)[] = [...Array(pad).fill(null), ...days];
    const cols = Math.ceil(cells.length / 7);
    const months: { col: number; label: string }[] = [];
    let lastMonth = -1;
    for (let c = 0; c < cols; c++) {
      const first = cells.slice(c * 7, c * 7 + 7).find(Boolean);
      if (!first) continue;
      const m = fromISODate(first.date).getMonth();
      if (m !== lastMonth) {
        if (lastMonth !== -1 || c === 0) months.push({ col: c, label: MONTHS[m] });
        lastMonth = m;
      }
    }
    // Drop a label that would collide with the next one.
    const spaced = months.filter((m, i) => i === months.length - 1 || months[i + 1].col - m.col >= 3);
    return { cells, cols, months: spaced };
  }, [days]);

  const done = days.filter(d => d.state === 'done').length;

  return (
    <div>
      <div className="relative mb-1 h-4 text-xs text-muted" aria-hidden="true">
        {months.map(m => (
          <span key={m.col} className="absolute" style={{ left: `${(m.col / cols) * 100}%` }}>
            {m.label}
          </span>
        ))}
      </div>
      <div
        role="img"
        aria-label={`Last ${Math.round(days.length / 7)} weeks: ${done} days done`}
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: 'repeat(7, auto)', gridAutoFlow: 'column' }}
      >
        {cells.map((d, i) =>
          d ? (
            <span key={d.date} title={describe(d)} className="aspect-square rounded-[3px]" style={cellStyle(d, goalSeconds, manual)} />
          ) : (
            <span key={`pad-${i}`} className="aspect-square" />
          ),
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {manual ? (
          <Legend color="rgb(var(--coral))">Done</Legend>
        ) : (
          <span className="flex items-center gap-1">
            <span>Goal</span>
            {['--coral', '--orange', '--yellow'].map(c => (
              <span key={c} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: `rgb(var(${c}))` }} />
            ))}
            <span>2× goal</span>
          </span>
        )}
        <Legend color="rgb(var(--ice) / 0.85)">Freeze</Legend>
        <Legend color="rgb(var(--muted) / 0.12)">Missed</Legend>
      </div>
    </div>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {children}
    </span>
  );
}

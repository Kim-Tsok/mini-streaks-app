import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Check, Pencil, Snowflake, Trash2, Undo2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Day, Streak } from '../lib/types';
import { describeSchedule, formatDuration, plural } from '../lib/dates';
import { Flame, STAGE_LABEL, nextStage, stageFor } from './Flame';
import { todayProgress } from './StreakCard';
import { Heatmap } from './Heatmap';

interface StreakDetailProps {
  streak: Streak;
  counting: boolean;
  flareKey?: number;
  onEdit: () => void;
  onArchive: (archived: boolean) => void;
  onDelete: () => void;
  onCheckIn: () => void;
  onUndo: () => void;
  animClass: string;
}

function trackedApps(s: Streak): string {
  if (s.patterns.length === 0) return 'no app picked yet';
  const names = s.patterns.map(p => (p.kind === 'title' ? `“${p.value}” windows` : p.label ?? p.value));
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

export function StreakDetail({ streak, counting, flareKey, onEdit, onArchive, onDelete, onCheckIn, onUndo, animClass }: StreakDetailProps) {
  const [days, setDays] = useState<Day[]>([]);
  const st = streak.stats;
  const progress = todayProgress(streak);
  const next = nextStage(st.current);

  // Refetch when today's numbers change so the heatmap stays current.
  useEffect(() => {
    let alive = true;
    api
      .history(streak.id, 182)
      .then(d => alive && setDays(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [streak.id, st.done_today, st.current, Math.floor(st.today_seconds / 300)]);

  const manual = streak.kind === 'manual';
  const goalSecs = streak.daily_goal_minutes * 60;

  return (
    <div className={`h-full overflow-y-auto px-4 pb-6 no-scrollbar ${animClass}`}>
      <section className="flex flex-col items-center text-center">
        <Flame size={112} days={st.current} progress={progress} flareKey={flareKey} title={`${STAGE_LABEL[stageFor(st.current)]} flame`} />
        <h1 className="mt-1 font-display text-xl font-bold leading-tight">{streak.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {describeSchedule(streak.schedule_days)} · {manual ? 'checked by hand' : `counts ${trackedApps(streak)}`}
        </p>
        <p className="mt-3 flex items-baseline gap-2 font-display">
          <span className="num text-hero font-bold">{st.current}</span>
          <span className="text-lg font-bold text-muted">{st.current === 1 ? 'day' : 'days'}</span>
        </p>
        {next && st.current > 0 && (
          <p className="mt-1 text-xs text-muted">
            {plural(next.at - st.current, 'day')} until {STAGE_LABEL[next.stage].toLowerCase()}
          </p>
        )}
      </section>

      <section className="sticker mt-5 rounded-card p-4" aria-label="Today">
        {st.done_today ? (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-coral text-[#1a0f0c]">
              <Check size={18} strokeWidth={3} />
            </span>
            <div className="flex-1">
              <p className="font-display font-bold">Done for today</p>
              {!manual && <p className="num text-sm text-muted">{formatDuration(st.today_seconds)} tracked</p>}
            </div>
            <button type="button" onClick={onUndo} className="btn-secondary btn-sm">
              <Undo2 size={15} />
              Undo
            </button>
          </div>
        ) : manual ? (
          <button type="button" onClick={onCheckIn} className="btn-primary w-full">
            <Check size={18} strokeWidth={3} />
            Check in for today
          </button>
        ) : (
          <div>
            <div className="flex items-baseline justify-between">
              <p className="font-display font-bold">
                <span className="num">{Math.floor(st.today_seconds / 60)}</span> of <span className="num">{streak.daily_goal_minutes}</span> min today
              </p>
              {counting && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-coral-ink">
                  <span className="pulse-dot h-2 w-2 rounded-full bg-coral" /> Counting
                </span>
              )}
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-coral to-orange transition-[width] duration-700 ease-out"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted">Did it away from the computer?</span>
              <button type="button" onClick={onCheckIn} className="btn-ghost -mr-3">
                Mark done
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="sticker mt-4 rounded-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold">Last 6 months</h2>
          {st.freezes > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-ice/15 px-2 py-0.5 text-xs font-bold text-ink" title="A freeze keeps your streak alive through one missed day. You earn one every 7 days in a row, up to 2.">
              <Snowflake size={13} className="text-ice" />
              {plural(st.freezes, 'freeze')} saved
            </span>
          )}
        </div>
        <Heatmap days={days} goalSeconds={goalSecs} manual={manual} />
      </section>

      <dl className="sticker mt-4 grid grid-cols-2 overflow-hidden rounded-card">
        <Stat label="Best streak" value={plural(st.best, 'day')} />
        <Stat label="Days done" value={String(st.total_days)} />
        <Stat label="On schedule" value={`${Math.round(st.completion_rate * 100)}%`} />
        <Stat label={manual ? 'Freezes' : 'Time tracked'} value={manual ? String(st.freezes) : formatDuration(st.total_seconds)} />
      </dl>
      <p className="mt-2 px-1 text-xs text-muted">
        Every 7 days in a row earns a freeze (up to 2). A freeze covers one missed day, so a busy day won't break your streak.
      </p>

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onEdit} className="btn-secondary flex-1">
          <Pencil size={16} />
          Edit
        </button>
        <button type="button" onClick={() => onArchive(!streak.archived)} className="btn-secondary flex-1">
          {streak.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
          {streak.archived ? 'Restore' : 'Archive'}
        </button>
        <button type="button" onClick={onDelete} className="btn-danger !px-4" aria-label="Delete streak" title="Delete streak">
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line/20 p-3 [&:nth-child(-n+2)]:border-b [&:nth-child(odd)]:border-r" style={{ borderColor: 'rgb(var(--muted) / 0.2)' }}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="num mt-0.5 text-lg font-bold">{value}</dd>
    </div>
  );
}

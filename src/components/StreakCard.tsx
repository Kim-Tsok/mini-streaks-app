import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { Streak } from '../lib/types';
import { iconFor } from '../lib/icons';
import { plural } from '../lib/dates';
import { FlameMark } from './Flame';
import { ProgressRing } from './ProgressRing';

interface StreakCardProps {
  streak: Streak;
  counting: boolean;
  evening: boolean;
  celebrate: boolean;
  onOpen: () => void;
  onCheckIn: () => void;
  arranging?: boolean;
  onMove?: (dir: -1 | 1) => void;
  isFirst?: boolean;
  isLast?: boolean;
}

export function todayProgress(s: Streak): number {
  if (s.stats.done_today) return 1;
  if (s.kind === 'manual') return 0;
  return Math.min(1, s.stats.today_seconds / (s.daily_goal_minutes * 60));
}

function statusLine(s: Streak, counting: boolean, evening: boolean): { text: string; tone: 'done' | 'warn' | 'live' | 'quiet' } {
  const st = s.stats;
  if (st.done_today) return { text: 'Done today', tone: 'done' };
  if (!st.scheduled_today) return { text: 'Rest day', tone: 'quiet' };
  if (s.kind === 'auto') {
    const mins = Math.floor(st.today_seconds / 60);
    const base = `${mins} of ${s.daily_goal_minutes} min`;
    if (counting) return { text: `${base} · counting`, tone: 'live' };
    if (st.at_risk && evening) return { text: `${base} · ends tonight`, tone: 'warn' };
    if (s.patterns.length === 0) return { text: 'Pick an app to track', tone: 'warn' };
    return { text: base, tone: 'quiet' };
  }
  const days = st.current > 0 ? `${plural(st.current, 'day')} · ` : '';
  if (st.at_risk && evening) return { text: days ? `${days}ends tonight` : 'Ends tonight', tone: 'warn' };
  return { text: days ? `${days}not yet today` : 'Not yet today', tone: 'quiet' };
}

export function StreakCard({
  streak,
  counting,
  evening,
  celebrate,
  onOpen,
  onCheckIn,
  arranging,
  onMove,
  isFirst,
  isLast,
}: StreakCardProps) {
  const Icon = iconFor(streak.icon);
  const st = streak.stats;
  const status = statusLine(streak, counting, evening);
  const canCheckIn = streak.kind === 'manual' && !st.done_today && !arranging;

  return (
    <li
      className={[
        'sticker relative flex items-center gap-3 rounded-card py-3 pl-3 pr-4 transition-transform duration-200 ease-spring',
        !arranging && 'hover:bg-raised/60',
        celebrate && 'card-done',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!arranging && (
        <button
          type="button"
          onClick={onOpen}
          className="absolute inset-0 z-0 rounded-card"
          aria-label={`${streak.name}: ${plural(st.current, 'day')} streak, ${status.text}. Open details`}
        />
      )}

      <ProgressRing progress={todayProgress(streak)} className="pointer-events-none">
        <span
          className={[
            'flex h-[34px] w-[34px] items-center justify-center rounded-full',
            st.done_today ? 'bg-yellow text-navy' : 'bg-yellow/70 text-navy/80 dark:bg-raised dark:text-ink/80',
          ].join(' ')}
        >
          <Icon size={17} strokeWidth={2.4} />
        </span>
        {st.done_today && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-surface bg-coral text-[#1a0f0c]">
            <Check size={11} strokeWidth={3.5} />
          </span>
        )}
      </ProgressRing>

      <div className="pointer-events-none min-w-0 flex-1">
        <h3 className="truncate font-display text-base font-bold leading-tight">{streak.name}</h3>
        <p
          className={[
            'mt-0.5 flex items-center gap-1.5 truncate text-sm',
            status.tone === 'done' && 'font-semibold text-coral-ink',
            status.tone === 'warn' && 'font-semibold text-coral-ink',
            status.tone === 'live' && 'text-ink',
            status.tone === 'quiet' && 'text-muted',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {status.tone === 'live' && <span className="pulse-dot inline-block h-2 w-2 shrink-0 rounded-full bg-coral" />}
          <span className="num truncate">{status.text}</span>
        </p>
      </div>

      {arranging ? (
        <div className="relative z-10 flex flex-col">
          <button type="button" className="icon-btn h-7 w-7 disabled:opacity-25" disabled={isFirst} onClick={() => onMove?.(-1)} aria-label={`Move ${streak.name} up`}>
            <ChevronUp size={18} />
          </button>
          <button type="button" className="icon-btn h-7 w-7 disabled:opacity-25" disabled={isLast} onClick={() => onMove?.(1)} aria-label={`Move ${streak.name} down`}>
            <ChevronDown size={18} />
          </button>
        </div>
      ) : canCheckIn ? (
        <button type="button" onClick={onCheckIn} className="btn-primary btn-sm relative z-10">
          <Check size={15} strokeWidth={3.5} />
          Check in
        </button>
      ) : (
        <div className="pointer-events-none flex flex-col items-end leading-none" aria-hidden="true">
          <span className="flex items-center gap-1">
            <FlameMark size={15} lit={st.current > 0} />
            <span className="num text-xl font-bold">{st.current}</span>
          </span>
          <span className="mt-1 text-xs text-muted">{st.current === 1 ? 'day' : 'days'}</span>
        </div>
      )}
    </li>
  );
}

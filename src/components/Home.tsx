import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Streak, TrackingStatus } from '../lib/types';
import { plural } from '../lib/dates';
import { TEMPLATES, type Template } from '../lib/templates';
import { iconFor } from '../lib/icons';
import { Flame, STAGE_LABEL, stageFor } from './Flame';
import { StreakCard, todayProgress } from './StreakCard';

interface HomeProps {
  streaks: Streak[];
  status: TrackingStatus;
  evening: boolean;
  celebrateId: string | null;
  heroFlare: number | undefined;
  onOpen: (id: string) => void;
  onNew: (template?: Template) => void;
  onCheckIn: (s: Streak) => void;
  onReorder: (ids: string[]) => void;
  animClass: string;
}

function summary(streaks: Streak[], evening: boolean): string {
  const due = streaks.filter(s => s.stats.scheduled_today || s.stats.done_today);
  const done = due.filter(s => s.stats.done_today).length;
  if (due.length === 0) return 'Nothing due today. Enjoy the rest day.';
  if (done === due.length) return due.length === 1 ? 'Done for today. See you tomorrow.' : 'All done for today. See you tomorrow.';
  const left = due.length - done;
  if (evening && streaks.some(s => s.stats.at_risk)) return `${plural(left, 'streak')} left before midnight`;
  return `${done} of ${due.length} done today`;
}

export function Home({
  streaks,
  status,
  evening,
  celebrateId,
  heroFlare,
  onOpen,
  onNew,
  onCheckIn,
  onReorder,
  animClass,
}: HomeProps) {
  const [arranging, setArranging] = useState(false);

  const lead = useMemo(
    () => streaks.reduce<Streak | null>((best, s) => (!best || s.stats.current > best.stats.current ? s : best), null),
    [streaks],
  );
  const due = streaks.filter(s => s.stats.scheduled_today || s.stats.done_today);
  const heroProgress = due.length ? due.reduce((sum, s) => sum + todayProgress(s), 0) / due.length : 1;
  const days = lead?.stats.current ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea')) return;
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onNew();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNew]);

  const move = (index: number, dir: -1 | 1) => {
    const ids = streaks.map(s => s.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + dir, 0, id);
    onReorder(ids);
  };

  if (streaks.length === 0) {
    return (
      <div className={`h-full overflow-y-auto px-5 pb-6 no-scrollbar ${animClass}`}>
        <div className="flex flex-col items-center pt-4 text-center">
          <Flame size={128} days={0} progress={0} />
          <h1 className="mt-2 font-display text-xl font-bold">Light your first streak</h1>
          <p className="mt-2 max-w-[290px] text-sm text-muted">
            Pick something small you want to do every day. Mini Streaks counts the minutes while you work, or you check it off yourself.
          </p>
        </div>
        <ul className="mt-6 flex flex-col gap-2">
          {TEMPLATES.map(t => {
            const Icon = iconFor(t.input.icon);
            return (
              <li key={t.input.name}>
                <button
                  type="button"
                  onClick={() => onNew(t)}
                  className="tile !flex w-full !justify-start gap-3 px-3 py-2.5 text-left !font-normal !text-ink"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow text-navy">
                    <Icon size={17} strokeWidth={2.4} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display font-bold leading-tight">{t.input.name}</span>
                    <span className="block truncate text-xs text-muted">{t.hint}</span>
                  </span>
                  <Plus size={18} className="text-muted" />
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => onNew()} className="btn-primary mt-5 w-full">
          <Plus size={18} strokeWidth={3} />
          Start from scratch
        </button>
      </div>
    );
  }

  return (
    <div className={`relative flex h-full flex-col ${animClass}`}>
      <div className="flex-1 overflow-y-auto px-4 pb-6 no-scrollbar">
        <section className="flex flex-col items-center pb-5 text-center" aria-live="polite">
          <Flame size={136} days={days} progress={heroProgress} flareKey={heroFlare} title={`${STAGE_LABEL[stageFor(days)]}, ${Math.round(heroProgress * 100)}% of today done`} />
          <h1 className="-mt-1 flex items-baseline gap-2 font-display">
            <span className="num text-hero font-bold">{days}</span>
            <span className="text-lg font-bold text-muted">{days === 1 ? 'day' : 'days'}</span>
          </h1>
          {lead && days > 0 && (
            <p className="mt-1 max-w-[300px] truncate text-sm text-muted">
              {streaks.length > 1 ? `${lead.name}, your longest streak` : lead.name}
            </p>
          )}
          <p className="mt-3 rounded-full bg-raised px-3 py-1 text-sm font-semibold">{summary(streaks, evening)}</p>
        </section>

        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="font-display text-sm font-bold text-muted">Your streaks</h2>
          <div className="flex items-center gap-1">
            {streaks.length > 1 && (
              <button type="button" onClick={() => setArranging(a => !a)} className="btn-ghost !text-muted hover:!text-ink">
                {arranging ? 'Done' : 'Arrange'}
              </button>
            )}
            {!arranging && (
              <button
                type="button"
                onClick={() => onNew()}
                className="btn-primary btn-sm !mb-[3px]"
                title="New streak (N)"
              >
                <Plus size={15} strokeWidth={3.5} />
                New
              </button>
            )}
          </div>
        </div>
        <ul className="flex flex-col gap-3">
          {streaks.map((s, i) => (
            <StreakCard
              key={s.id}
              streak={s}
              counting={status.state === 'tracking' && status.matched.includes(s.id)}
              evening={evening}
              celebrate={celebrateId === s.id}
              onOpen={() => onOpen(s.id)}
              onCheckIn={() => onCheckIn(s)}
              arranging={arranging}
              onMove={dir => move(i, dir)}
              isFirst={i === 0}
              isLast={i === streaks.length - 1}
            />
          ))}
        </ul>
      </div>

    </div>
  );
}

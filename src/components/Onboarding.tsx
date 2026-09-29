import { useEffect, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import type { AppSettings, Capabilities } from '../lib/types';
import { TEMPLATES, type Template } from '../lib/templates';
import { iconFor } from '../lib/icons';
import { useReducedMotion } from '../hooks/useAppData';
import { Flame } from './Flame';
import { Toggle } from './Settings';
import { TrackingSetup } from './TrackingSetup';

interface OnboardingProps {
  settings: AppSettings;
  caps: Capabilities | null;
  onRefreshCaps: () => Promise<void>;
  onFinish: (settings: AppSettings, template: Template | 'blank' | null) => void;
}

/** Fills the flame once so the first screen shows what the app does. */
function useDemoProgress(): [number, number | undefined] {
  const reduced = useReducedMotion();
  const [p, setP] = useState(reduced ? 1 : 0);
  const [flare, setFlare] = useState<number>();
  useEffect(() => {
    if (reduced) return;
    const start = performance.now() + 500;
    let raf = 0;
    const tick = (t: number) => {
      const v = Math.max(0, Math.min(1, (t - start) / 2600));
      setP(v);
      if (v < 1) raf = requestAnimationFrame(tick);
      else setFlare(1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return [p, flare];
}

export function Onboarding({ settings, caps, onRefreshCaps, onFinish }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AppSettings>({ ...settings, launch_on_startup: true, notifications_enabled: true });
  const [progress, flare] = useDemoProgress();
  const finish = (t: Template | 'blank' | null) => onFinish({ ...draft, onboarded: true }, t);

  return (
    <div className="flex h-full flex-col px-5 pb-5">
      <div className="flex justify-center gap-1.5 pb-3" aria-label={`Step ${step + 1} of 3`}>
        {[0, 1, 2].map(i => (
          <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-coral' : 'w-1.5 bg-muted/30'}`} />
        ))}
      </div>

      {step === 0 && (
        <div key="s0" className="rise-in flex flex-1 flex-col items-center justify-center text-center">
          <Flame size={170} days={12} progress={progress} flareKey={flare} />
          <h1 className="mt-3 font-display text-xl font-bold">Streaks that keep themselves</h1>
          <p className="mt-2 max-w-[300px] text-sm text-muted">
            Pick a habit and the apps it happens in. Your flame fills up while you work, and the streak grows each day you hit your goal.
          </p>
          <div className="mt-auto w-full">
            <button type="button" className="btn-primary w-full" onClick={() => setStep(1)}>
              Get started
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div key="s1" className="rise-in flex flex-1 flex-col overflow-y-auto no-scrollbar [&>*]:shrink-0">
          <h1 className="font-display text-xl font-bold">Let it count for you</h1>
          <p className="mb-4 mt-1 text-sm text-muted">Mini Streaks runs quietly in the background and notices which app you’re using.</p>
          <TrackingSetup caps={caps} onRefresh={onRefreshCaps} />
          <div className="sticker mt-3 divide-y overflow-hidden rounded-card [&>*]:border-[rgb(var(--muted)/0.15)]">
            <label className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1">
                <span className="block font-display text-sm font-bold">Open when I log in</span>
                <span className="block text-xs text-muted">So no minutes slip by uncounted.</span>
              </span>
              <Toggle checked={draft.launch_on_startup} onChange={v => setDraft({ ...draft, launch_on_startup: v })} label="Open when I log in" />
            </label>
            <label className="flex items-center gap-3 px-4 py-3">
              <span className="flex-1">
                <span className="block font-display text-sm font-bold">Nudge me</span>
                <span className="block text-xs text-muted">When a goal is done, and at {draft.reminder_time} if a streak still needs today.</span>
              </span>
              <Toggle
                checked={draft.notifications_enabled}
                onChange={v => setDraft({ ...draft, notifications_enabled: v, reminders_enabled: v })}
                label="Notifications"
              />
            </label>
          </div>
          <div className="mt-auto pt-4">
            <button type="button" className="btn-primary w-full" onClick={() => setStep(2)}>
              Continue
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div key="s2" className="rise-in flex flex-1 flex-col overflow-y-auto no-scrollbar [&>*]:shrink-0">
          <h1 className="font-display text-xl font-bold">Pick your first streak</h1>
          <p className="mb-4 mt-1 text-sm text-muted">Small beats ambitious. You can change everything later.</p>
          <ul className="flex flex-col gap-2">
            {TEMPLATES.map(t => {
              const Icon = iconFor(t.input.icon);
              return (
                <li key={t.input.name}>
                  <button
                    type="button"
                    onClick={() => finish(t)}
                    className="tile !flex w-full !justify-start gap-3 px-3 py-2.5 text-left !font-normal !text-ink"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow text-navy">
                      <Icon size={17} strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display font-bold leading-tight">{t.input.name}</span>
                      <span className="block truncate text-xs text-muted">{t.hint}</span>
                    </span>
                    <ArrowRight size={16} className="text-muted" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto flex flex-col gap-2 pt-4">
            <button type="button" className="btn-primary w-full" onClick={() => finish('blank')}>
              <Plus size={18} strokeWidth={3} />
              Make my own
            </button>
            <button type="button" className="btn-ghost !text-muted hover:!text-ink" onClick={() => finish(null)}>
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

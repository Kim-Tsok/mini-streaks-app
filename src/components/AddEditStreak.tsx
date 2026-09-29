import { useEffect, useMemo, useRef, useState } from 'react';
import { AppWindow, Check, Plus, RefreshCw, Search, Type, X } from 'lucide-react';
import { NumberStepper } from './NumberStepper';
import { api, errorText } from '../lib/api';
import type { AppEntry, AppList, Pattern, StreakInput, StreakKind } from '../lib/types';
import { EVERY_DAY, WEEKDAYS, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../lib/dates';
import { STREAK_ICONS } from '../lib/icons';

interface AddEditStreakProps {
  initial?: StreakInput;
  editing: boolean;
  onSave: (input: StreakInput) => Promise<void>;
  animClass: string;
}

const GOALS = [5, 10, 15, 30, 45, 60, 90];
const MAX_GOAL = 12 * 60;

export function AddEditStreak({ initial, editing, onSave, animClass }: AddEditStreakProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'flame');
  const [kind, setKind] = useState<StreakKind>(initial?.kind ?? 'auto');
  const [patterns, setPatterns] = useState<Pattern[]>(initial?.patterns ?? []);
  const [goal, setGoal] = useState(initial?.daily_goal_minutes ?? 30);
  const [schedule, setSchedule] = useState(initial?.schedule_days ?? EVERY_DAY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) nameRef.current?.focus();
  }, [editing]);

  const needsApp = kind === 'auto' && patterns.length === 0;
  const canSave = name.trim().length > 0 && !needsApp && (schedule & 0x7f) !== 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        icon,
        kind,
        patterns: kind === 'auto' ? patterns : [],
        daily_goal_minutes: Math.max(1, Math.min(MAX_GOAL, Math.round(goal))),
        schedule_days: schedule,
      });
    } catch (e) {
      setError(errorText(e));
      setSaving(false);
    }
  };

  return (
    <form
      className={`flex h-full flex-col ${animClass}`}
      onSubmit={e => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex-1 overflow-y-auto px-4 pb-6 no-scrollbar">
        <h1 className="mb-5 font-display text-xl font-bold">{editing ? 'Edit streak' : 'New streak'}</h1>

        <Field label="Name" htmlFor="streak-name">
          <input
            id="streak-name"
            ref={nameRef}
            className="field"
            placeholder="Code for 30 minutes"
            value={name}
            maxLength={60}
            onChange={e => setName(e.target.value)}
          />
        </Field>

        <Field label="Icon">
          <div role="radiogroup" aria-label="Icon" className="grid grid-cols-8 gap-x-1.5 gap-y-1">
            {STREAK_ICONS.map(({ id, label, Icon }) => {
              const on = icon === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={label}
                  title={label}
                  onClick={() => setIcon(id)}
                  className="tile aspect-square !rounded-xl"
                >
                  <Icon size={18} strokeWidth={2.4} />
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="How it counts">
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            <KindOption on={kind === 'auto'} onClick={() => setKind('auto')} title="While I use an app" body="Counts minutes on its own" />
            <KindOption on={kind === 'manual'} onClick={() => setKind('manual')} title="I check it off" body="For the gym, reading, anything" />
          </div>
        </Field>

        {kind === 'auto' && (
          <>
            <Field label="Apps that count">
              <AppPicker patterns={patterns} onChange={setPatterns} />
            </Field>
            <Field label="Daily goal">
              <GoalPicker value={goal} onChange={setGoal} />
            </Field>
          </>
        )}

        <Field label="Which days">
          <SchedulePicker value={schedule} onChange={setSchedule} />
        </Field>

        {error && (
          <p role="alert" className="mt-2 rounded-field bg-coral/10 px-3 py-2 text-sm font-semibold text-coral-ink">
            {error}
          </p>
        )}
      </div>

      <div className="shrink-0 border-t bg-bg px-4 pb-4 pt-3" style={{ borderColor: 'rgb(var(--muted) / 0.15)' }}>
        <button type="submit" disabled={!canSave} className="btn-primary w-full">
          <Check size={18} strokeWidth={3} />
          {editing ? 'Save changes' : 'Start streak'}
        </button>
        {needsApp && name.trim() && <p className="mt-2 text-center text-xs text-muted">Pick at least one app, or switch to “I check it off”.</p>}
      </div>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label htmlFor={htmlFor} className="section-title block">
        {label}
      </label>
      {children}
    </div>
  );
}

function KindOption({ on, onClick, title, body }: { on: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className="tile !block !rounded-2xl p-3 text-left !font-normal"
    >
      <span className="flex items-center justify-between font-display text-sm font-bold">
        {title}
        {on && <Check size={15} strokeWidth={3} className="text-coral-ink" />}
      </span>
      <span className="mt-0.5 block text-xs text-muted">{body}</span>
    </button>
  );
}

function GoalPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex flex-wrap gap-x-1.5 gap-y-1">
        {GOALS.map(g => (
          <button key={g} type="button" onClick={() => onChange(g)} aria-pressed={value === g} className="tile num h-9 min-w-[40px] !rounded-xl px-2 text-sm">
            {g}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">Or set it to the minute</span>
        <NumberStepper value={value} onChange={onChange} min={1} max={MAX_GOAL} label="Daily goal in minutes" />
      </div>
    </div>
  );
}

function SchedulePicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const presets = [
    { label: 'Every day', mask: EVERY_DAY },
    { label: 'Weekdays', mask: WEEKDAYS },
    { label: 'Mon, Wed, Fri', mask: 0b0010101 },
  ];
  return (
    <div>
      <div className="flex gap-1.5" role="group" aria-label="Days of the week">
        {WEEKDAY_SHORT.map((d, i) => {
          const on = (value & (1 << i)) !== 0;
          return (
            <button
              key={i}
              type="button"
              aria-pressed={on}
              aria-label={WEEKDAY_NAMES[i]}
              onClick={() => onChange(value ^ (1 << i))}
              className="tile h-10 flex-1 !rounded-xl text-sm"
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="-ml-2 mt-1.5 flex gap-1">
        {presets.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.mask)}
            className={`btn-ghost !px-2 !py-1 !text-xs ${value === p.mask ? '' : '!text-muted hover:!text-ink'}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {(value & 0x7f) === 0 && <p className="mt-1 text-xs font-semibold text-coral-ink">Pick at least one day.</p>}
      {(value & 0x7f) !== EVERY_DAY && (value & 0x7f) !== 0 && (
        <p className="mt-1 text-xs text-muted">Other days are rest days. They never break the streak.</p>
      )}
    </div>
  );
}

function AppIcon({ app }: { app: AppEntry }) {
  const [broken, setBroken] = useState(false);
  if (app.icon && !broken) {
    return <img src={app.icon} alt="" className="h-6 w-6 shrink-0 object-contain" onError={() => setBroken(true)} draggable={false} />;
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-raised text-muted">
      <AppWindow size={14} />
    </span>
  );
}

function AppPicker({ patterns, onChange }: { patterns: Pattern[]; onChange: (p: Pattern[]) => void }) {
  const [apps, setApps] = useState<AppList | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setApps(await api.listApps());
    } catch {
      setApps({ recent: [], installed: [] });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const selected = (id: string) => patterns.some(p => p.kind === 'app' && p.value === id);
  const toggle = (app: AppEntry) =>
    onChange(
      selected(app.id)
        ? patterns.filter(p => !(p.kind === 'app' && p.value === app.id))
        : [...patterns, { kind: 'app', value: app.id, label: app.name }],
    );
  const addTitle = () => {
    const v = title.trim();
    if (!v || patterns.some(p => p.kind === 'title' && p.value.toLowerCase() === v.toLowerCase())) return;
    onChange([...patterns, { kind: 'title', value: v }]);
    setTitle('');
  };

  const groups = useMemo(() => {
    if (!apps) return [];
    const q = query.trim().toLowerCase();
    if (q) {
      const seen = new Set<string>();
      const hits = [...apps.recent, ...apps.installed].filter(a => {
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q);
      });
      return [{ title: `${hits.length} ${hits.length === 1 ? 'match' : 'matches'}`, apps: hits }];
    }
    const out = [];
    if (apps.recent.length) out.push({ title: 'Used recently', apps: apps.recent });
    out.push({ title: 'Installed', apps: apps.installed });
    return out;
  }, [apps, query]);

  return (
    <div>
      {patterns.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Selected">
          {patterns.map(p => (
            <li key={`${p.kind}:${p.value}`} className="flex items-center gap-1 rounded-full bg-coral/15 py-1 pl-2.5 pr-1 text-xs font-bold">
              {p.kind === 'title' && <Type size={12} className="text-muted" />}
              <span className="max-w-[180px] truncate">{p.kind === 'title' ? `“${p.value}” in title` : p.label ?? p.value}</span>
              <button
                type="button"
                onClick={() => onChange(patterns.filter(x => x !== p))}
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-coral/25"
                aria-label={`Remove ${p.label ?? p.value}`}
              >
                <X size={12} strokeWidth={3} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="sticker-flat overflow-hidden rounded-card">
        <div className="relative border-b" style={{ borderColor: 'rgb(var(--muted) / 0.15)' }}>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="w-full bg-transparent py-2.5 pl-9 pr-10 text-sm outline-none placeholder:text-muted/70"
            placeholder="Search apps"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search apps"
          />
          <button
            type="button"
            onClick={load}
            className="icon-btn absolute right-1.5 top-1/2 h-7 w-7 -translate-y-1/2"
            aria-label="Refresh app list"
            title="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="soft-scroll max-h-52 overflow-y-auto p-1.5">
          {!apps ? (
            <p className="py-6 text-center text-sm text-muted">Looking for apps…</p>
          ) : groups.every(g => g.apps.length === 0) ? (
            <p className="px-3 py-5 text-center text-sm text-muted">
              {query ? 'No app by that name. Try matching a window title below.' : 'No apps found. Add a window title below instead.'}
            </p>
          ) : (
            groups.map(g =>
              g.apps.length ? (
                <div key={g.title} className="mb-1">
                  <p className="px-2 pb-1 pt-1.5 text-xs font-bold text-muted">{g.title}</p>
                  {g.apps.map(app => {
                    const on = selected(app.id);
                    return (
                      <button
                        key={`${g.title}-${app.id}`}
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(app)}
                        className={[
                          'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sm transition-colors',
                          on ? 'bg-coral/15' : 'hover:bg-raised',
                        ].join(' ')}
                      >
                        <AppIcon app={app} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{app.name}</span>
                        <span
                          className={[
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2',
                            on ? 'border-coral bg-coral text-[#1a0f0c]' : 'border-muted/40',
                          ].join(' ')}
                        >
                          {on && <Check size={12} strokeWidth={3.5} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null,
            )
          )}
        </div>
      </div>

      <div className="mt-2 flex gap-2">
        <input
          className="field !py-2 text-sm"
          placeholder="Or a window title, like “GitHub”"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addTitle();
            }
          }}
          aria-label="Window title to match"
        />
        <button type="button" onClick={addTitle} disabled={!title.trim()} className="btn-secondary btn-sm shrink-0">
          <Plus size={15} />
          Add
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted">Title matches work for websites: “YouTube” counts that tab in any browser.</p>
    </div>
  );
}

import { useState } from 'react';
import { ArchiveRestore, Check, Download, Power, Upload } from 'lucide-react';
import { NumberStepper } from './NumberStepper';
import type { AppSettings, Capabilities, Streak, Theme } from '../lib/types';
import { TrackingSetup } from './TrackingSetup';

interface SettingsProps {
  settings: AppSettings;
  caps: Capabilities | null;
  archived: Streak[];
  onChange: (s: AppSettings) => void;
  onRefreshCaps: () => Promise<void>;
  onRestore: (id: string) => void;
  onExport: () => void;
  onImport: () => void;
  onQuit: () => void;
  animClass: string;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
        checked ? 'bg-coral' : 'bg-muted/30',
      ].join(' ')}
    >
      <span
        className={[
          'absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-spring',
          checked ? 'translate-x-6' : 'translate-x-1',
        ].join(' ')}
      />
    </button>
  );
}

function Row({ title, body, children }: { title: string; body?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-bold">{title}</p>
        {body && <p className="mt-0.5 text-xs text-muted">{body}</p>}
      </div>
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="section-title">{title}</h2>
      <div className="sticker divide-y overflow-hidden rounded-card [&>*]:border-[rgb(var(--muted)/0.15)]">{children}</div>
    </section>
  );
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

export function Settings({ settings, caps, archived, onChange, onRefreshCaps, onRestore, onExport, onImport, onQuit, animClass }: SettingsProps) {
  const set = (patch: Partial<AppSettings>) => onChange({ ...settings, ...patch });
  const [confirmQuit, setConfirmQuit] = useState(false);
  const timeout = settings.idle_timeout_minutes;

  return (
    <div className={`h-full overflow-y-auto px-4 pb-6 no-scrollbar ${animClass}`}>
      <h1 className="mb-5 font-display text-xl font-bold">Settings</h1>

      <Group title="Look">
        <Row title="Theme">
          <div role="radiogroup" aria-label="Theme" className="flex gap-1.5">
            {THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={settings.theme === t.id}
                onClick={() => set({ theme: t.id })}
                className="tile h-8 !rounded-xl px-3 text-xs"
              >
                {t.label}
              </button>
            ))}
          </div>
        </Row>
      </Group>

      <section className="mb-5">
        <h2 className="section-title">Tracking</h2>
        <TrackingSetup caps={caps} onRefresh={onRefreshCaps} />
        <div className="sticker mt-3 divide-y overflow-hidden rounded-card [&>*]:border-[rgb(var(--muted)/0.15)]">
          <Row
            title="Pause when I step away"
            body={
              caps && !caps.idle_supported
                ? 'This desktop doesn’t report idle time, so minutes count whenever a tracked app is focused.'
                : `Stops counting after ${timeout} ${timeout === 1 ? 'minute' : 'minutes'} without keyboard or mouse.`
            }
          >
            <Toggle checked={settings.pause_when_idle} onChange={v => set({ pause_when_idle: v })} label="Pause when I step away" />
          </Row>
          {settings.pause_when_idle && caps?.idle_supported !== false && (
            <Row title="Away after">
              <NumberStepper
                value={timeout}
                onChange={v => set({ idle_timeout_minutes: v })}
                min={1}
                max={120}
                label="Minutes before you count as away"
              />
            </Row>
          )}
        </div>
      </section>

      <Group title="Notifications">
        <Row title="Goal reached" body="A quick note when a streak is done for the day.">
          <Toggle checked={settings.notifications_enabled} onChange={v => set({ notifications_enabled: v })} label="Notify when a goal is reached" />
        </Row>
        <Row title="Evening reminder" body="If a streak still needs today, nudge me at this time.">
          <input
            type="time"
            value={settings.reminder_time}
            disabled={!settings.reminders_enabled}
            onChange={e => set({ reminder_time: e.target.value })}
            className="num rounded-xl bg-raised px-2 py-1 text-sm font-bold outline-none disabled:opacity-40"
            aria-label="Reminder time"
          />
          <Toggle checked={settings.reminders_enabled} onChange={v => set({ reminders_enabled: v })} label="Evening reminder" />
        </Row>
      </Group>

      <Group title="Startup">
        <Row title="Open when I log in" body="Starts quietly in the background so no minutes are missed.">
          <Toggle checked={settings.launch_on_startup} onChange={v => set({ launch_on_startup: v })} label="Open when I log in" />
        </Row>
        {caps && !caps.tray_available && (
          <Row
            title="No tray icon here"
            body="Your desktop has no tray, so closing minimizes Mini Streaks to the taskbar. On GNOME, the AppIndicator extension adds a tray."
          />
        )}
      </Group>

      {archived.length > 0 && (
        <Group title="Archived">
          {archived.map(s => (
            <Row key={s.id} title={s.name} body={`Best streak: ${s.stats.best} days`}>
              <button type="button" onClick={() => onRestore(s.id)} className="btn-secondary btn-sm">
                <ArchiveRestore size={15} />
                Restore
              </button>
            </Row>
          ))}
        </Group>
      )}

      <Group title="Your data">
        <Row title="Back up streaks" body="Saves every streak and its history to a file.">
          <button type="button" onClick={onExport} className="btn-secondary btn-sm">
            <Download size={15} />
            Export
          </button>
        </Row>
        <Row title="Restore a backup" body="Adds the streaks from a backup file.">
          <button type="button" onClick={onImport} className="btn-secondary btn-sm">
            <Upload size={15} />
            Import
          </button>
        </Row>
      </Group>

      <div className="mt-8 flex flex-col items-center gap-3 text-xs text-muted">
        {confirmQuit ? (
          <div className="flex items-center gap-2">
            <span>Tracking stops until you open it again.</span>
            <button type="button" onClick={onQuit} className="btn-danger btn-sm">
              <Check size={13} />
              Quit
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmQuit(true)} className="btn-secondary btn-sm !text-muted">
            <Power size={14} />
            Quit Mini Streaks
          </button>
        )}
        <p>Mini Streaks 0.2.0 · Your data stays on this computer.</p>
      </div>
    </div>
  );
}

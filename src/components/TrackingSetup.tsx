import { useState } from 'react';
import { CircleCheck, LogOut, Puzzle, RefreshCw, TriangleAlert } from 'lucide-react';
import { api, errorText } from '../lib/api';
import type { Capabilities } from '../lib/types';

function desktopName(caps: Capabilities): string {
  if (caps.os === 'macos') return 'macOS';
  if (caps.os === 'windows') return 'Windows';
  const d = caps.desktop.split(':').pop() || 'Linux';
  return caps.session ? `${d} on ${caps.session === 'wayland' ? 'Wayland' : 'X11'}` : d;
}

/** Explains whether auto-tracking works here, and fixes it when it can. */
export function TrackingSetup({ caps, onRefresh }: { caps: Capabilities | null; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justInstalled, setJustInstalled] = useState(false);

  if (!caps) {
    return <div className="sticker rounded-card p-4 text-sm text-muted">Checking what this computer supports…</div>;
  }

  const install = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.installGnomeExtension();
      setJustInstalled(true);
      await onRefresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const recheck = async () => {
    setBusy(true);
    await onRefresh();
    setBusy(false);
  };

  if (caps.focus_ok) {
    return (
      <div className="sticker flex items-start gap-3 rounded-card p-4">
        <CircleCheck size={22} className="mt-0.5 shrink-0 text-coral-ink" />
        <div>
          <p className="font-display text-sm font-bold">Auto-tracking works here</p>
          <p className="mt-0.5 text-xs text-muted">
            {desktopName(caps)}. Mini Streaks only reads which app is focused and its window title. Nothing leaves this computer.
          </p>
        </div>
      </div>
    );
  }

  if (caps.needs_gnome_extension) {
    const installed = caps.gnome_extension_installed || justInstalled;
    return (
      <div className="sticker rounded-card p-4">
        <div className="flex items-start gap-3">
          {installed ? <LogOut size={22} className="mt-0.5 shrink-0 text-orange" /> : <Puzzle size={22} className="mt-0.5 shrink-0 text-orange" />}
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold">{installed ? 'Log out and back in to finish' : 'One step for auto-tracking'}</p>
            <p className="mt-0.5 text-xs text-muted">
              {installed
                ? 'GNOME loads the focus helper at your next log-in. After that, minutes count on their own. Manual streaks work right now.'
                : 'GNOME on Wayland keeps the focused app private. A tiny helper extension shares just the focused app’s name and title with Mini Streaks, and only on this computer.'}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {!installed && (
            <button type="button" onClick={install} disabled={busy} className="btn-primary btn-sm flex-1">
              <Puzzle size={16} />
              {busy ? 'Installing…' : 'Install focus helper'}
            </button>
          )}
          <button type="button" onClick={recheck} disabled={busy} className={`btn-secondary btn-sm ${installed ? 'flex-1' : ''}`}>
            <RefreshCw size={15} className={busy ? 'animate-spin' : ''} />
            Check again
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs font-semibold text-coral-ink">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="sticker flex items-start gap-3 rounded-card p-4">
      <TriangleAlert size={22} className="mt-0.5 shrink-0 text-orange" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-bold">Auto-tracking isn’t available on {desktopName(caps)}</p>
        <p className="mt-0.5 text-xs text-muted">
          This desktop doesn’t tell apps which window is focused. Streaks you check off by hand work normally.
        </p>
        <button type="button" onClick={recheck} className="btn-ghost -ml-3 mt-1">
          Check again
        </button>
      </div>
    </div>
  );
}

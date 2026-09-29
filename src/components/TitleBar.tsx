import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Settings, X } from 'lucide-react';
import { api } from '../lib/api';
import type { TrackingStatus } from '../lib/types';
import { FlameMark } from './Flame';

interface TitleBarProps {
  status: TrackingStatus;
  hasAutoStreaks: boolean;
  onBack?: () => void;
  onSettings: () => void;
  onSetupTracking: () => void;
  onPause: (minutes: number | null) => void;
}

function minutesUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1);
  return Math.ceil((tomorrow.getTime() - now.getTime()) / 60000);
}

function chipText(status: TrackingStatus): { text: string; dot: string } | null {
  switch (status.state) {
    case 'tracking':
      return { text: status.app_name ? `Counting ${status.app_name}` : 'Counting', dot: 'bg-coral pulse-dot' };
    case 'watching':
      return { text: 'Standing by', dot: 'bg-muted/60' };
    case 'idle':
      return { text: 'Away', dot: 'bg-yellow' };
    case 'paused':
      return { text: 'Paused', dot: 'bg-ice' };
    case 'unavailable':
      return { text: 'Set up tracking', dot: 'bg-coral' };
    default:
      return null;
  }
}

export function TitleBar({ status, hasAutoStreaks, onBack, onSettings, onSetupTracking, onPause }: TitleBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const chip = hasAutoStreaks ? chipText(status) : null;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [menuOpen]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('button, [role="menu"]')) {
      api.startDragging().catch(() => undefined);
    }
  };

  const pick = (minutes: number | null) => {
    setMenuOpen(false);
    onPause(minutes);
  };

  return (
    <header onMouseDown={onMouseDown} className="relative z-50 flex h-12 shrink-0 items-center gap-2 px-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="icon-btn" aria-label="Back" title="Back (Esc)">
          <ArrowLeft size={18} />
        </button>
      ) : (
        <span className="flex items-center gap-1.5 pl-1 pr-1">
          <FlameMark size={18} />
          <span className="font-display text-sm font-bold tracking-tight">
            <span className="text-orange">mini</span> <span className="text-coral-ink">streaks</span>
          </span>
        </span>
      )}

      <div className="flex min-w-0 flex-1 justify-center" ref={menuRef}>
        {chip && (
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => (status.state === 'unavailable' ? onSetupTracking() : setMenuOpen(o => !o))}
              aria-haspopup={status.state === 'unavailable' ? undefined : 'menu'}
              aria-expanded={menuOpen}
              className="flex max-w-[180px] items-center gap-2 rounded-full bg-raised px-3 py-1 text-xs font-bold text-ink/90 transition-colors hover:text-ink"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${chip.dot}`} />
              <span className="truncate">{chip.text}</span>
            </button>
            {menuOpen && (
              <div role="menu" className="sticker rise-in fixed right-3 top-11 w-56 overflow-hidden rounded-card p-1.5 text-sm">
                {status.state === 'paused' ? (
                  <MenuItem onClick={() => pick(null)}>Resume tracking</MenuItem>
                ) : (
                  <>
                    <MenuItem onClick={() => pick(60)}>Pause for 1 hour</MenuItem>
                    <MenuItem onClick={() => pick(minutesUntilTomorrow())}>Pause until tomorrow</MenuItem>
                  </>
                )}
                <MenuItem
                  onClick={() => {
                    setMenuOpen(false);
                    onSetupTracking();
                  }}
                >
                  Tracking settings
                </MenuItem>
              </div>
            )}
          </div>
        )}
      </div>

      <button type="button" onClick={onSettings} className="icon-btn" aria-label="Settings" title="Settings">
        <Settings size={17} />
      </button>
      <button
        type="button"
        onClick={() => api.hideWindow()}
        className="icon-btn hover:!bg-coral hover:!text-[#1a0f0c]"
        aria-label="Close window (tracking keeps running)"
        title="Close (keeps tracking)"
      >
        <X size={17} />
      </button>
    </header>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="block w-full rounded-xl px-3 py-2 text-left font-semibold hover:bg-raised">
      {children}
    </button>
  );
}

import { useEffect, useRef } from 'react';

interface Action {
  label: string;
  run: () => void;
  tone?: 'danger' | 'primary' | 'quiet';
}

interface ConfirmDialogProps {
  title: string;
  body: string;
  actions: Action[];
  onCancel: () => void;
}

export function ConfirmDialog({ title, body, actions, onCancel }: ConfirmDialogProps) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onCancel]);

  return (
    <div className="fade-in absolute inset-0 z-[70] flex items-end justify-center bg-black/40 p-4" onMouseDown={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onMouseDown={e => e.stopPropagation()}
        className="sticker rise-in w-full rounded-card-lg p-5"
      >
        <h2 id="confirm-title" className="font-display text-lg font-bold">
          {title}
        </h2>
        <p id="confirm-body" className="mt-1 text-sm text-muted">
          {body}
        </p>
        <div className="mt-4 flex flex-col gap-2.5">
          {actions.map((a, i) => (
            <button
              key={a.label}
              ref={i === 0 ? first : undefined}
              type="button"
              onClick={a.run}
              className={
                a.tone === 'danger'
                  ? 'btn-danger w-full'
                  : a.tone === 'primary'
                    ? 'btn-primary w-full'
                    : 'btn-secondary w-full'
              }
            >
              {a.label}
            </button>
          ))}
          <button type="button" onClick={onCancel} className="btn-ghost mt-1 !text-muted hover:!text-ink">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

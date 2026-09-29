import { useEffect } from 'react';

export interface ToastData {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

export function Toast({ toast, onClose }: { toast: ToastData; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, toast.action ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  return (
    <div role="status" aria-live="polite" className="rise-in pointer-events-auto flex items-center gap-3 rounded-card bg-ink px-4 py-3 text-sm font-semibold text-bg shadow-lift">
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            onClose();
          }}
          className="btn-ghost shrink-0 !px-2 !py-1 !text-[rgb(var(--toast-action))] hover:!bg-white/10"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

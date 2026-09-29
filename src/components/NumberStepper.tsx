import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface NumberStepperProps {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  unit?: string;
  label: string;
}

const HOLD_DELAY = 380;

/**
 * Minute-precise number control: type any value, nudge by 1 with the
 * buttons or arrow keys, hold a button to run (it speeds up), Shift/PageUp
 * for steps of 10.
 */
export function NumberStepper({ value, onChange, min, max, unit = 'min', label }: NumberStepperProps) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const clamp = (n: number) => Math.max(min, Math.min(max, Math.round(n)));
  const nudge = (d: number) => {
    const next = clamp(valueRef.current + d);
    if (next !== valueRef.current) {
      valueRef.current = next;
      setDraft(String(next));
      onChange(next);
    }
  };

  const stopHold = () => window.clearTimeout(timer.current);
  const startHold = (d: number) => {
    nudge(d);
    let count = 0;
    const run = () => {
      nudge(d);
      count++;
      // Speeds up the longer it's held, but always moves one minute at a time.
      timer.current = window.setTimeout(run, count > 20 ? 30 : count > 8 ? 60 : 110);
    };
    timer.current = window.setTimeout(run, HOLD_DELAY);
  };
  useEffect(() => stopHold, []);

  const commit = () => {
    setEditing(false);
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onChange(clamp(n));
    else setDraft(String(value));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const big = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      nudge(e.key === 'PageUp' ? 10 : big);
    } else if (e.key === 'ArrowDown' || e.key === 'PageDown') {
      e.preventDefault();
      nudge(e.key === 'PageDown' ? -10 : -big);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setDraft(String(value));
      setEditing(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const holdProps = (d: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      startHold(d);
    },
    onPointerUp: stopHold,
    onPointerLeave: stopHold,
    onPointerCancel: stopHold,
    // Keyboard activation (Enter/Space) arrives as a click with no pointer.
    onClick: (e: React.MouseEvent) => {
      if (e.detail === 0) nudge(d);
    },
  });

  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className="tile h-9 w-9 !rounded-xl" disabled={value <= min} aria-label={`1 ${unit} less`} {...holdProps(-1)}>
        <Minus size={15} strokeWidth={3} />
      </button>
      <label className="field-inline mb-[3px] flex h-9 items-center rounded-xl px-2">
        <input
          type="text"
          inputMode="numeric"
          aria-label={label}
          value={draft}
          onFocus={e => {
            setEditing(true);
            e.target.select();
          }}
          onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          onBlur={commit}
          onKeyDown={onKey}
          className="num w-[3ch] bg-transparent text-right text-sm font-extrabold outline-none"
          style={{ width: `${Math.max(2, draft.length) + 0.5}ch` }}
        />
        <span className="ml-1 text-sm font-bold text-muted">{unit}</span>
      </label>
      <button type="button" className="tile h-9 w-9 !rounded-xl" disabled={value >= max} aria-label={`1 ${unit} more`} {...holdProps(1)}>
        <Plus size={15} strokeWidth={3} />
      </button>
    </div>
  );
}

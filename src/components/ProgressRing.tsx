interface ProgressRingProps {
  size?: number;
  stroke?: number;
  progress: number;
  children?: React.ReactNode;
  className?: string;
}

/** A ring that fills clockwise from 12 o'clock. */
export function ProgressRing({ size = 46, stroke = 4, progress, children, className = '' }: ProgressRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--muted) / 0.22)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--coral))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.25,1,0.5,1)' }}
          opacity={p === 0 ? 0 : 1}
        />
      </svg>
      {children}
    </span>
  );
}

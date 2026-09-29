import { useEffect, useRef } from 'react';
import type { GoalCompleted } from '../lib/types';
import { useReducedMotion } from '../hooks/useAppData';
import { Flame, stageFor, stageNoun } from './Flame';

const COLORS = ['#FF6F5E', '#FFD166', '#FF8A00', '#FFFBF5'];

function Sparks() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const parts = Array.from({ length: 46 }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const v = 3 + Math.random() * 5;
      return {
        x: w / 2,
        y: h * 0.42,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        r: 2 + Math.random() * 4,
        c: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 1,
        drop: Math.random() < 0.4,
      };
    });
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.14;
        p.vx *= 0.99;
        p.life -= 0.016;
        if (p.life <= 0) continue;
        alive = true;
        ctx.globalAlpha = Math.min(1, p.life * 1.4);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        if (p.drop) {
          // A little flame drop, like the ones around the mascot.
          ctx.moveTo(p.x, p.y - p.r * 1.8);
          ctx.quadraticCurveTo(p.x + p.r, p.y - p.r * 0.2, p.x + p.r, p.y + p.r * 0.3);
          ctx.arc(p.x, p.y + p.r * 0.3, p.r, 0, Math.PI);
          ctx.quadraticCurveTo(p.x - p.r, p.y - p.r * 0.2, p.x, p.y - p.r * 1.8);
        } else {
          ctx.arc(p.x, p.y, p.r * 0.7, 0, Math.PI * 2);
        }
        ctx.fill();
      }
      if (alive) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}

export function Celebration({ goal, onDone }: { goal: GoalCompleted; onDone: () => void }) {
  const reduced = useReducedMotion();
  const big = goal.milestone !== null;
  const stage = stageFor(goal.current);
  const stageChanged = [1, 7, 30, 100].includes(goal.current);

  useEffect(() => {
    const t = setTimeout(onDone, big ? 4200 : 2400);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onDone();
    window.addEventListener('keydown', esc);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', esc);
    };
  }, [onDone, big]);

  return (
    <div
      role="status"
      aria-live="assertive"
      onClick={onDone}
      className="fade-in absolute inset-0 z-[60] flex cursor-pointer flex-col items-center justify-center bg-bg/85 px-8 text-center backdrop-blur-sm"
    >
      {!reduced && <Sparks />}
      <Flame size={big ? 190 : 150} days={goal.current} progress={1} flareKey={`${goal.id}-${goal.current}`} />
      {big ? (
        <>
          <p className="num mt-1 font-display text-hero font-bold">{goal.milestone}</p>
          <p className="font-display text-lg font-bold">days of {goal.name}</p>
          <p className="mt-2 text-sm text-muted">
            {stageChanged ? `Your flame grew into ${stageNoun(stage)}.` : 'That’s a real habit now.'}
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 font-display text-xl font-bold">{goal.name}</p>
          <p className="mt-1 text-sm font-semibold text-muted">
            {goal.current === 1
              ? 'Day one. Your streak has started.'
              : stageChanged
                ? `Done for today. Your flame is now ${stageNoun(stage)}.`
                : `Done for today. ${goal.current} days in a row.`}
          </p>
        </>
      )}
    </div>
  );
}

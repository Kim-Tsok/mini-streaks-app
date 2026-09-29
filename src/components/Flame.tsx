/**
 * The living flame — the app's mascot, drawn as layered SVG in the style of
 * the brand mark (navy outline, coral/orange body, yellow tongue, yellow drops).
 *
 * - `days` sets the stage: ember → spark → flame → blaze → inferno.
 * - `progress` (0..1) fills the flame from the bottom with a rolling edge;
 *   the unlit part is ash. At 1 it burns fully.
 * - `flareKey` replays the goal-reached flare whenever it changes.
 */
import { useId, useMemo } from 'react';
import { useReducedMotion } from '../hooks/useAppData';

export type Stage = 'ember' | 'spark' | 'flame' | 'blaze' | 'inferno';

export function stageFor(days: number): Stage {
  if (days >= 100) return 'inferno';
  if (days >= 30) return 'blaze';
  if (days >= 7) return 'flame';
  if (days >= 1) return 'spark';
  return 'ember';
}

export const STAGE_LABEL: Record<Stage, string> = {
  ember: 'Ember',
  spark: 'Spark',
  flame: 'Flame',
  blaze: 'Blaze',
  inferno: 'Inferno',
};

/** "a blaze", "an inferno". */
export function stageNoun(stage: Stage): string {
  const word = STAGE_LABEL[stage].toLowerCase();
  return /^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`;
}

/** Next stage and the day it starts, for "12 days to Blaze". */
export function nextStage(days: number): { stage: Stage; at: number } | null {
  if (days < 1) return { stage: 'spark', at: 1 };
  if (days < 7) return { stage: 'flame', at: 7 };
  if (days < 30) return { stage: 'blaze', at: 30 };
  if (days < 100) return { stage: 'inferno', at: 100 };
  return null;
}

const OUTER =
  'M256 472C150 472 60 400 60 300C60 280 64 258 72 240C98 290 130 312 160 314C130 250 128 190 150 144' +
  'C162 185 180 205 206 212C196 140 230 70 298 36C282 110 300 160 334 190C366 220 372 258 346 284' +
  'C372 262 398 218 404 166C436 205 452 250 452 300C452 400 362 472 256 472Z';
// The orange right half of the body.
const SPLIT = 'M300 40C250 150 222 262 236 344C246 404 272 446 318 490L540 490L540 0L300 0Z';
const INNER =
  'M256 468C198 468 162 432 162 390C162 356 184 336 202 318C204 340 214 356 228 360C222 326 230 298 244 278' +
  'C264 318 302 336 318 374C332 408 322 440 298 456C286 464 272 468 256 468Z';
const TONGUE =
  'M296 458C270 444 252 410 250 372C248 342 250 312 246 290C266 322 296 340 310 372C318 390 310 404 300 404' +
  'C314 420 316 442 296 458Z';
const DROP = 'M0 -28C10 -12 20 -2 20 10C20 22 11 30 0 30C-11 30 -20 22 -20 10C-20 -2 -10 -12 0 -28Z';

// One wave period is 128 units, so shifting by 128 loops seamlessly.
const WAVE = (() => {
  let d = 'M-512 0Q-480 -16 -448 0';
  for (let x = -448 + 64; x <= 1088; x += 64) d += `T${x} 0`;
  return `${d}V620H-512Z`;
})();

interface StageLook {
  scale: number;
  drops: { x: number; y: number; s: number; delay: number; dx: number }[];
  glow: number;
  hotCore: boolean;
}

const LOOKS: Record<Stage, StageLook> = {
  ember: { scale: 0.8, drops: [], glow: 0, hotCore: false },
  spark: { scale: 0.86, drops: [{ x: 70, y: 110, s: 0.9, delay: 0, dx: -6 }], glow: 0.35, hotCore: false },
  flame: {
    scale: 0.93,
    drops: [
      { x: 64, y: 96, s: 1, delay: 0, dx: -6 },
      { x: 448, y: 130, s: 0.8, delay: 1.1, dx: 8 },
    ],
    glow: 0.5,
    hotCore: false,
  },
  blaze: {
    scale: 0.98,
    drops: [
      { x: 64, y: 96, s: 1, delay: 0, dx: -8 },
      { x: 448, y: 130, s: 0.85, delay: 0.8, dx: 10 },
      { x: 150, y: 40, s: 0.6, delay: 1.6, dx: -4 },
    ],
    glow: 0.7,
    hotCore: false,
  },
  inferno: {
    scale: 1,
    drops: [
      { x: 60, y: 96, s: 1.05, delay: 0, dx: -10 },
      { x: 452, y: 126, s: 0.9, delay: 0.6, dx: 10 },
      { x: 150, y: 36, s: 0.65, delay: 1.2, dx: -6 },
      { x: 390, y: 40, s: 0.55, delay: 1.8, dx: 6 },
    ],
    glow: 0.9,
    hotCore: true,
  },
};

interface FlameProps {
  size?: number;
  days?: number;
  /** 0..1 share of today's goal. */
  progress?: number;
  animated?: boolean;
  flareKey?: number | string;
  className?: string;
  title?: string;
}

export function Flame({
  size = 120,
  days = 0,
  progress = 1,
  animated = true,
  flareKey,
  className = '',
  title,
}: FlameProps) {
  const uid = useId().replace(/:/g, '');
  const reduced = useReducedMotion();
  const live = animated && !reduced;
  const stage = stageFor(days);
  const look = LOOKS[stage];
  const p = Math.max(0, Math.min(1, progress));
  const lit = p >= 0.999;
  // Keep a sliver visible at 0 so the ember still glows at the base.
  const waterline = 480 - Math.max(p, 0.06) * 450;
  const glowOpacity = look.glow * (0.35 + 0.65 * p);

  const ids = useMemo(
    () => ({ clip: `wave-${uid}`, glow: `glow-${uid}`, core: `core-${uid}` }),
    [uid],
  );

  const body = (ash: boolean) => (
    <>
      <g className="flame-layer flame-outer">
        <path d={OUTER} fill={ash ? 'rgb(var(--ash))' : '#FF6F5E'} />
        <path
          d={SPLIT}
          fill={ash ? 'rgb(var(--ash))' : '#FF8A00'}
          clipPath={`url(#outer-${uid})`}
          opacity={ash ? 0.7 : 1}
        />
      </g>
      <g className="flame-layer flame-mid">
        <path d={INNER} fill={ash ? 'rgb(var(--ash))' : '#FF8A00'} opacity={ash ? 0.55 : 1} />
      </g>
      <g className="flame-layer flame-core">
        <path d={TONGUE} fill={ash ? 'rgb(var(--ash))' : look.hotCore ? `url(#${ids.core})` : '#FFD166'} opacity={ash ? 0.4 : 1} />
      </g>
    </>
  );

  return (
    <span
      key={flareKey}
      className={`relative inline-flex shrink-0 items-center justify-center ${flareKey !== undefined ? 'flame-flare' : ''} ${className}`}
      style={{ width: size, height: size }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <svg viewBox="-24 -24 560 560" width={size} height={size} className={live ? 'flame-live' : ''} overflow="visible">
        <defs>
          <clipPath id={`outer-${uid}`}>
            <path d={OUTER} />
          </clipPath>
          <clipPath id={ids.clip}>
            {/* clipPath can't hold a <g>, so the path carries both the level and the roll. */}
            <path
              d={WAVE}
              className={live && !lit ? 'flame-wave' : undefined}
              style={{ '--y': `${waterline}px`, transform: `translate(0px, ${waterline}px)` } as React.CSSProperties}
            />
          </clipPath>
          <radialGradient id={ids.glow} cx="50%" cy="62%" r="50%">
            <stop offset="0%" stopColor="#FFD166" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#FF8A00" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#FF6F5E" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={ids.core} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#FFF4D6" />
            <stop offset="100%" stopColor="#A9D6FF" />
          </linearGradient>
        </defs>

        {look.glow > 0 && (
          <ellipse
            className="flame-layer flame-glow"
            cx="256"
            cy="330"
            rx="290"
            ry="250"
            fill={`url(#${ids.glow})`}
            opacity={glowOpacity}
          />
        )}

        <g transform={`translate(256 480) scale(${look.scale}) translate(-256 -480)`}>
          {/* Ash underneath, fire on top clipped to the waterline. */}
          {!lit && body(true)}
          <g clipPath={lit ? undefined : `url(#${ids.clip})`}>
            {body(false)}
          </g>

          <path d={OUTER} fill="none" stroke="#0B2A66" strokeWidth="22" strokeLinejoin="round" className="flame-layer flame-outer" />

          {look.drops.map((d, i) => (
            <g key={i} transform={`translate(${d.x} ${d.y}) scale(${d.s})`}>
              <path
                d={DROP}
                fill="#FFD166"
                className={live && p > 0.05 ? 'flame-spark' : ''}
                style={
                  live && p > 0.05
                    ? ({ animationDelay: `${d.delay}s`, '--dx': `${d.dx}px` } as React.CSSProperties)
                    : { opacity: p > 0.05 ? 1 : 0.35 }
                }
              />
            </g>
          ))}
        </g>
      </svg>
    </span>
  );
}

/** Tiny static flame for inline use next to numbers. */
export function FlameMark({ size = 14, lit = true, className = '' }: { size?: number; lit?: boolean; className?: string }) {
  return (
    <svg viewBox="-24 -24 560 560" width={size} height={size} className={className} aria-hidden="true">
      <path d={OUTER} fill={lit ? '#FF6F5E' : 'rgb(var(--ash))'} />
      {lit && <path d={INNER} fill="#FF8A00" />}
      {lit && <path d={TONGUE} fill="#FFD166" />}
      <path d={OUTER} fill="none" stroke={lit ? '#0B2A66' : 'rgb(var(--muted))'} strokeWidth="34" strokeLinejoin="round" />
    </svg>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, on } from '../lib/api';
import type { AppSettings, Capabilities, GoalCompleted, Streak, TrackingStatus } from '../lib/types';

export function useAppData(onGoal: (g: GoalCompleted) => void) {
  const [streaks, setStreaks] = useState<Streak[] | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<TrackingStatus>({ state: 'starting', app_name: null, matched: [] });
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const onGoalRef = useRef(onGoal);
  onGoalRef.current = onGoal;

  const reload = useCallback(async () => {
    try {
      setStreaks(await api.getStreaks());
    } catch (e) {
      console.error('Loading streaks failed', e);
      setStreaks(s => s ?? []);
    }
  }, []);

  const refreshCaps = useCallback(async () => {
    try {
      setCaps(await api.capabilities());
    } catch (e) {
      console.warn('Capabilities unavailable', e);
    }
  }, []);

  useEffect(() => {
    reload();
    refreshCaps();
    api.getSettings().then(setSettings).catch(() => undefined);
    api.trackingStatus().then(setStatus).catch(() => undefined);

    const offs = [
      on('streaks-updated', () => reload()),
      on('settings-updated', s => setSettings(s)),
      on('tracking-status', s => setStatus(s)),
      on('goal-completed', g => onGoalRef.current(g)),
      // Live minutes without a full reload every tick.
      on('activity-logged', ({ id, today_seconds }) =>
        setStreaks(list =>
          list?.map(s => (s.id === id ? { ...s, stats: { ...s.stats, today_seconds } } : s)) ?? list,
        ),
      ),
    ];
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    return () => {
      offs.forEach(off => off());
      window.removeEventListener('focus', onFocus);
    };
  }, [reload, refreshCaps]);

  const saveSeq = useRef(0);
  const saveSettings = useCallback(async (next: AppSettings) => {
    const seq = ++saveSeq.current;
    setSettings(next);
    try {
      const saved = await api.saveSettings(next);
      // Rapid changes (holding a stepper) can finish out of order; keep the newest.
      if (seq === saveSeq.current) setSettings(saved);
    } catch (e) {
      console.error('Saving settings failed', e);
    }
  }, []);

  return { streaks, settings, status, caps, reload, refreshCaps, saveSettings, setStreaks };
}

export function useTheme(theme: AppSettings['theme'] | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme !== 'light' && media.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

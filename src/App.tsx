import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText } from './lib/api';
import type { AppSettings, GoalCompleted, Streak, StreakInput } from './lib/types';
import { isPastClock, plural } from './lib/dates';
import type { Template } from './lib/templates';
import { useAppData, useTheme } from './hooks/useAppData';
import { TitleBar } from './components/TitleBar';
import { Home } from './components/Home';
import { StreakDetail } from './components/StreakDetail';
import { AddEditStreak } from './components/AddEditStreak';
import { Settings } from './components/Settings';
import { Onboarding } from './components/Onboarding';
import { Celebration } from './components/Celebration';
import { Toast, type ToastData } from './components/Toast';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Flame } from './components/Flame';

type View =
  | { name: 'home' }
  | { name: 'detail'; id: string }
  | { name: 'form'; id?: string; draft?: StreakInput }
  | { name: 'settings' };

function toInput(s: Streak): StreakInput {
  return {
    name: s.name,
    icon: s.icon,
    kind: s.kind,
    patterns: s.patterns,
    daily_goal_minutes: s.daily_goal_minutes,
    schedule_days: s.schedule_days,
  };
}

/** Re-renders every minute so time-of-day copy ("ends tonight") stays right. */
function useMinuteTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set(n => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
}

export default function App() {
  const [stack, setStack] = useState<View[]>([{ name: 'home' }]);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [navKey, setNavKey] = useState(0);
  const [celebration, setCelebration] = useState<GoalCompleted | null>(null);
  const [celebrateId, setCelebrateId] = useState<string | null>(null);
  const [heroFlare, setHeroFlare] = useState<number>();
  const [toast, setToast] = useState<ToastData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Streak | null>(null);
  useMinuteTick();

  const onGoal = useCallback((g: GoalCompleted) => {
    setCelebration(g);
    setCelebrateId(g.id);
    setHeroFlare(n => (n ?? 0) + 1);
    setTimeout(() => setCelebrateId(id => (id === g.id ? null : id)), 1200);
  }, []);

  const { streaks, settings, status, caps, refreshCaps, saveSettings, reload } = useAppData(onGoal);
  useTheme(settings?.theme);

  const view = stack[stack.length - 1];
  const push = useCallback((v: View) => {
    setDirection('forward');
    setNavKey(k => k + 1);
    setStack(s => [...s, v]);
  }, []);
  const back = useCallback(() => {
    setDirection('back');
    setNavKey(k => k + 1);
    setStack(s => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);
  const replace = useCallback((v: View, dir: 'forward' | 'back' = 'back') => {
    setDirection(dir);
    setNavKey(k => k + 1);
    setStack(s => [...s.slice(0, -1), v]);
  }, []);
  const goHome = useCallback(() => {
    setDirection('back');
    setNavKey(k => k + 1);
    setStack([{ name: 'home' }]);
  }, []);

  const notify = useCallback((message: string, action?: ToastData['action']) => {
    setToast({ id: Date.now(), message, action });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !celebration && !confirmDelete && stack.length > 1) {
        const inField = (e.target as HTMLElement).closest('input, textarea');
        if (!inField) back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, celebration, confirmDelete, stack.length]);

  const active = useMemo(() => streaks?.filter(s => !s.archived) ?? [], [streaks]);
  const archived = useMemo(() => streaks?.filter(s => s.archived) ?? [], [streaks]);
  const evening = settings ? isPastClock(settings.reminder_time) : false;
  const animClass = direction === 'forward' ? 'screen-forward' : 'screen-back';

  const run = async (fn: () => Promise<unknown>, fail = 'That didn’t work') => {
    try {
      await fn();
    } catch (e) {
      notify(`${fail}: ${errorText(e)}`);
    }
  };

  const checkIn = (s: Streak) =>
    run(async () => {
      await api.checkIn(s.id);
      notify(`Checked in: ${s.name}`, { label: 'Undo', run: () => run(() => api.undoCheckIn(s.id)) });
    });

  const saveStreak = async (input: StreakInput, id?: string) => {
    if (id) {
      await api.updateStreak(id, input);
      await reload();
      back();
      notify('Changes saved');
    } else {
      const created = await api.createStreak(input);
      await reload();
      replace({ name: 'detail', id: created.id }, 'forward');
      notify(input.kind === 'auto' ? 'Streak started. Minutes count from now.' : 'Streak started. Check in when you’ve done it.');
    }
  };

  const finishOnboarding = async (next: AppSettings, template: Template | 'blank' | null) => {
    await saveSettings(next);
    if (template === 'blank') push({ name: 'form' });
    else if (template) push({ name: 'form', draft: template.input });
  };

  if (!streaks || !settings) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Flame size={72} days={3} progress={0.5} />
      </div>
    );
  }

  const showOnboarding = !settings.onboarded;
  const detailStreak = view.name === 'detail' ? streaks.find(s => s.id === view.id) : undefined;
  const formStreak = view.name === 'form' && view.id ? streaks.find(s => s.id === view.id) : undefined;

  let screen: React.ReactNode;
  if (showOnboarding) {
    screen = <Onboarding settings={settings} caps={caps} onRefreshCaps={refreshCaps} onFinish={finishOnboarding} />;
  } else if (view.name === 'detail' && detailStreak) {
    screen = (
      <StreakDetail
        key={`detail-${navKey}`}
        streak={detailStreak}
        counting={status.state === 'tracking' && status.matched.includes(detailStreak.id)}
        flareKey={celebration?.id === detailStreak.id ? heroFlare : undefined}
        animClass={animClass}
        onEdit={() => push({ name: 'form', id: detailStreak.id })}
        onCheckIn={() => checkIn(detailStreak)}
        onUndo={() => run(() => api.undoCheckIn(detailStreak.id))}
        onArchive={archivedNow =>
          run(async () => {
            await api.setArchived(detailStreak.id, archivedNow);
            if (archivedNow) {
              goHome();
              notify(`Archived ${detailStreak.name}`, { label: 'Undo', run: () => run(() => api.setArchived(detailStreak.id, false)) });
            }
          })
        }
        onDelete={() => setConfirmDelete(detailStreak)}
      />
    );
  } else if (view.name === 'form') {
    screen = (
      <AddEditStreak
        key={`form-${navKey}`}
        editing={!!formStreak}
        initial={formStreak ? toInput(formStreak) : view.draft}
        onSave={input => saveStreak(input, formStreak?.id)}
        animClass={animClass}
      />
    );
  } else if (view.name === 'settings') {
    screen = (
      <Settings
        key={`settings-${navKey}`}
        settings={settings}
        caps={caps}
        archived={archived}
        onChange={saveSettings}
        onRefreshCaps={refreshCaps}
        onRestore={id => run(() => api.setArchived(id, false))}
        onExport={() =>
          run(async () => {
            const n = await api.exportBackup();
            if (n !== null) notify(`Backed up ${plural(n, 'streak')}`);
          }, 'Backup failed')
        }
        onImport={() =>
          run(async () => {
            const n = await api.importBackup();
            if (n !== null) notify(`Restored ${plural(n, 'streak')}`);
          }, 'Restore failed')
        }
        onQuit={() => api.quit()}
        animClass={animClass}
      />
    );
  } else {
    screen = (
      <Home
        key={`home-${navKey}`}
        streaks={active}
        status={status}
        evening={evening}
        celebrateId={celebrateId}
        heroFlare={heroFlare}
        animClass={animClass}
        onOpen={id => push({ name: 'detail', id })}
        onNew={t => push({ name: 'form', draft: t?.input })}
        onCheckIn={checkIn}
        onReorder={ids => run(() => api.reorder(ids))}
      />
    );
  }

  return (
    <div className="relative z-10 flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar
        status={status}
        hasAutoStreaks={!showOnboarding && active.some(s => s.kind === 'auto')}
        onBack={!showOnboarding && stack.length > 1 ? back : undefined}
        onSettings={() => (view.name === 'settings' ? back() : push({ name: 'settings' }))}
        onSetupTracking={() => view.name !== 'settings' && push({ name: 'settings' })}
        onPause={minutes => run(() => api.pauseTracking(minutes))}
      />
      <main className="relative flex-1 overflow-hidden">{screen}</main>

      <div className="pointer-events-none absolute inset-x-4 bottom-4 z-[65] flex justify-center">
        {toast && <Toast key={toast.id} toast={toast} onClose={() => setToast(null)} />}
      </div>

      {celebration && <Celebration goal={celebration} onDone={() => setCelebration(null)} />}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${confirmDelete.name}?`}
          body={
            confirmDelete.stats.total_days > 0
              ? `This erases ${plural(confirmDelete.stats.total_days, 'day')} of history for good. Archiving hides it and keeps the history.`
              : 'This can’t be undone.'
          }
          onCancel={() => setConfirmDelete(null)}
          actions={[
            ...(confirmDelete.stats.total_days > 0
              ? [
                  {
                    label: 'Archive instead',
                    tone: 'quiet' as const,
                    run: () => {
                      const s = confirmDelete;
                      setConfirmDelete(null);
                      run(async () => {
                        await api.setArchived(s.id, true);
                        goHome();
                        notify(`Archived ${s.name}`);
                      });
                    },
                  },
                ]
              : []),
            {
              label: 'Delete streak',
              tone: 'danger' as const,
              run: () => {
                const s = confirmDelete;
                setConfirmDelete(null);
                run(async () => {
                  await api.deleteStreak(s.id);
                  goHome();
                  notify(`Deleted ${s.name}`);
                });
              },
            },
          ]}
        />
      )}
    </div>
  );
}

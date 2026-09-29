import type { StreakInput } from './types';
import { EVERY_DAY, WEEKDAYS } from './dates';

export interface Template {
  input: StreakInput;
  hint: string;
}

export const TEMPLATES: Template[] = [
  {
    hint: 'Counts while your editor is focused',
    input: { name: 'Code 30 min', icon: 'code', kind: 'auto', patterns: [], daily_goal_minutes: 30, schedule_days: EVERY_DAY },
  },
  {
    hint: 'Check in when you put the book down',
    input: { name: 'Read a chapter', icon: 'book', kind: 'manual', patterns: [], daily_goal_minutes: 20, schedule_days: EVERY_DAY },
  },
  {
    hint: 'Counts while your notes app is focused',
    input: { name: 'Write 25 min', icon: 'pen', kind: 'auto', patterns: [], daily_goal_minutes: 25, schedule_days: WEEKDAYS },
  },
  {
    hint: 'Three days a week, checked by hand',
    input: { name: 'Work out', icon: 'dumbbell', kind: 'manual', patterns: [], daily_goal_minutes: 45, schedule_days: 0b0010101 },
  },
  {
    hint: 'Check in after practice',
    input: { name: 'Practice guitar', icon: 'guitar', kind: 'manual', patterns: [], daily_goal_minutes: 15, schedule_days: EVERY_DAY },
  },
];

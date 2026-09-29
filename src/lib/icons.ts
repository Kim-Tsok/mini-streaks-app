import {
  BedDouble,
  BookOpen,
  Brain,
  Camera,
  Code,
  Droplet,
  Dumbbell,
  Flame,
  Flower2,
  Footprints,
  Guitar,
  Languages,
  Music,
  Palette,
  PenLine,
  Sprout,
  type LucideIcon,
} from 'lucide-react';

export interface StreakIcon {
  id: string;
  label: string;
  Icon: LucideIcon;
}

export const STREAK_ICONS: StreakIcon[] = [
  { id: 'code', label: 'Code', Icon: Code },
  { id: 'book', label: 'Reading', Icon: BookOpen },
  { id: 'pen', label: 'Writing', Icon: PenLine },
  { id: 'dumbbell', label: 'Workout', Icon: Dumbbell },
  { id: 'run', label: 'Walk or run', Icon: Footprints },
  { id: 'music', label: 'Music', Icon: Music },
  { id: 'guitar', label: 'Instrument', Icon: Guitar },
  { id: 'art', label: 'Art', Icon: Palette },
  { id: 'brain', label: 'Study', Icon: Brain },
  { id: 'languages', label: 'Language', Icon: Languages },
  { id: 'meditate', label: 'Meditation', Icon: Flower2 },
  { id: 'water', label: 'Water', Icon: Droplet },
  { id: 'sleep', label: 'Sleep', Icon: BedDouble },
  { id: 'camera', label: 'Photography', Icon: Camera },
  { id: 'sprout', label: 'Growth', Icon: Sprout },
  { id: 'flame', label: 'Anything', Icon: Flame },
];

export function iconFor(id: string): LucideIcon {
  return STREAK_ICONS.find(i => i.id === id)?.Icon ?? Flame;
}

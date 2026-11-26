import {
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Car,
  Code,
  Coffee,
  Dumbbell,
  Footprints,
  Gamepad2,
  Heart,
  Mail,
  Moon,
  Music,
  NotebookPen,
  Palette,
  Sparkles,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react';
import { isIconKey, type IconKey } from './model';

/** Le dessin de chaque icône de module (la liste des clés est dans model.ts). */
export const MODULE_ICONS: Record<IconKey, LucideIcon> = {
  dumbbell: Dumbbell,
  notebook: NotebookPen,
  brain: Brain,
  book: BookOpen,
  briefcase: BriefcaseBusiness,
  code: Code,
  mail: Mail,
  users: Users,
  coffee: Coffee,
  utensils: Utensils,
  music: Music,
  palette: Palette,
  footprints: Footprints,
  heart: Heart,
  moon: Moon,
  car: Car,
  gamepad: Gamepad2,
  sparkles: Sparkles,
};

/** Une clé inconnue (base modifiée à la main) se dessine comme un carnet. */
export function moduleIcon(key: string): LucideIcon {
  return isIconKey(key) ? MODULE_ICONS[key] : NotebookPen;
}

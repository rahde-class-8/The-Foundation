import { Badge } from '@/components/ui/badge';

export type MasteryStatus = 'new' | 'learning' | 'reviewing' | 'mastered' | 'lapsed';

const LABEL: Record<MasteryStatus, string> = {
  new: 'New',
  learning: 'Learning',
  reviewing: 'Reviewing',
  mastered: 'Mastered',
  lapsed: 'Lapsed',
};
const VARIANT = {
  new: 'outline',
  learning: 'info',
  reviewing: 'secondary',
  mastered: 'success',
  lapsed: 'warning',
} as const;

/** Mastery status (MASTERY_MODEL §4) as a labeled badge; color is never the only signal. */
export function MasteryBadge({ status }: { status: MasteryStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}

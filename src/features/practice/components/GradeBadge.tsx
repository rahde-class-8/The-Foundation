import { Badge } from '@/components/ui/badge';
import type { Grade } from '../api/schemas';

const LABEL: Record<Grade, string> = { pass: 'Pass', partial: 'Partial', miss: 'Miss' };
const VARIANT = { pass: 'success', partial: 'warning', miss: 'outline' } as const;

export function GradeBadge({ grade }: { grade: Grade }) {
  return (
    <Badge variant={VARIANT[grade]} className="text-sm">
      {LABEL[grade]}
    </Badge>
  );
}

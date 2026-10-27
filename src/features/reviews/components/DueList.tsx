import { MasteryBadge } from '@/components/common/MasteryBadge';
import { Button } from '@/components/ui/button';
import { GradeBadge } from '@/features/practice';
import type { DueReview } from '../api/schemas';
import { formatDay } from '../model/format';

type Props = {
  items: DueReview[];
  timeZone: string;
  onReschedule: (item: DueReview) => void;
  onHistory: (conceptId: string) => void;
};

export function DueList({ items, timeZone, onReschedule, onHistory }: Props) {
  return (
    <ol className="space-y-2" aria-label="Reviews">
      {items.map((item) => (
        <li
          key={item.conceptId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
        >
          <div className="min-w-0 space-y-1">
            <p className="font-medium">
              {item.conceptTitle}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                · {item.serviceName}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <MasteryBadge status={item.masteryStatus} />
              {item.lastColdGrade ? <GradeBadge grade={item.lastColdGrade} /> : null}
              <span>
                Due {formatDay(item.dueAt, timeZone)}
                {item.manualDueOverride ? ' (rescheduled)' : ''}
              </span>
              {item.activeMisconceptions > 0 ? (
                <span>
                  {item.activeMisconceptions} misconception
                  {item.activeMisconceptions === 1 ? '' : 's'}
                </span>
              ) : null}
              <span title="Weak Box priority (higher is reviewed first)">
                Priority {item.priority.toFixed(1)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onHistory(item.conceptId)}
              aria-label={`History of ${item.conceptTitle}`}
            >
              History
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onReschedule(item)}
              aria-label={`Reschedule ${item.conceptTitle}`}
            >
              Reschedule
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}

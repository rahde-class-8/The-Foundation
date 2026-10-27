import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { addDays, localDateOf } from '@core/scheduler/dates.ts';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { overrideSchedule } from '../api/reviews';
import type { DueReview } from '../api/schemas';
import { reviewKeys } from '../hooks/useReviews';
import { formatDay } from '../model/format';

type Props = {
  item: DueReview;
  today: string;
  timeZone: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

/** Reschedule one concept to a chosen local date with a reason (WB-3, SPACED_REPETITION §7). */
export function RescheduleDialog({ item, today, timeZone, onClose, onDone }: Props) {
  const queryClient = useQueryClient();
  const currentDue = localDateOf(new Date(item.dueAt), timeZone);
  const [dueOn, setDueOn] = useState(currentDue < today ? today : addDays(currentDue, 1));
  const [reason, setReason] = useState('');
  // One key per dialog: a retried submit replays instead of writing a second event (P3-4).
  const [clientKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await overrideSchedule({
        conceptId: item.conceptId,
        dueOn,
        reason,
        clientKey,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: reviewKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      onDone(`${item.conceptTitle} moved to ${formatDay(result.reviewState.dueAt, timeZone)}.`);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not reschedule.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reschedule ${item.conceptTitle}`}
      description={`Currently due ${formatDay(item.dueAt, timeZone)}. The interval and ease stay the same.`}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="due-on">New review date</Label>
          <Input
            id="due-on"
            type="date"
            required
            min={today}
            max={addDays(today, 365)}
            value={dueOn}
            onChange={(event) => setDueOn(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reason">Reason</Label>
          <textarea
            id="reason"
            required
            maxLength={300}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || reason.trim() === ''}>
            {saving ? 'Saving…' : 'Reschedule'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

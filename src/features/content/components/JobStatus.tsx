import type { JobView } from '@core/contracts/content.ts';
import { Badge } from '@/components/ui/badge';
import { importErrorMessage } from '../model/upload';

const LABEL: Record<JobView['status'], string> = {
  queued: 'Waiting',
  running: 'Processing',
  stalled: 'Interrupted',
  succeeded: 'Ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

/** Import job progress and its typed error, if any (CNT-2, CNT-8). */
export function JobStatus({ job, label }: { job: JobView; label: string }) {
  if (job.status === 'failed') {
    return (
      <p role="alert" className="text-sm text-destructive">
        {importErrorMessage(job.errorCode)}
      </p>
    );
  }
  if (job.status === 'succeeded') {
    return <Badge variant="success">{job.passageCount} passages</Badge>;
  }
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div
        role="progressbar"
        aria-label={`${label}: ${LABEL[job.status]}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.progressPct}
        className="h-1.5 w-32 rounded-full bg-muted"
      >
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${job.progressPct}%` }} />
      </div>
      <span>
        {LABEL[job.status]} {job.progressPct}%
      </span>
    </div>
  );
}

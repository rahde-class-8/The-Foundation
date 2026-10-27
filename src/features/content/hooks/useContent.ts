import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type { JobView } from '@core/contracts/content.ts';
import { getOverview, ingest } from '../api/content';

export const contentKeys = {
  overview: ['content', 'overview'] as const,
  passages: (q: string, sourceId: string) => ['content', 'passages', q, sourceId] as const,
  draft: (id: string) => ['content', 'draft', id] as const,
};

export const useOverview = () => useQuery({ queryKey: contentKeys.overview, queryFn: getOverview });

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Drives ingest-source until the job is done (client-driven continuation, ADR-0001). Progress for
 * each job is kept in state; a busy job (another tab) is polled.
 */
export function useIngestRunner() {
  const queryClient = useQueryClient();
  const [jobs, setJobs] = useState<Record<string, JobView>>({});
  const running = useRef(new Set<string>());

  const run = useCallback(
    async (job: JobView, restart = false) => {
      if (running.current.has(job.id)) return;
      running.current.add(job.id);
      setJobs((current) => ({ ...current, [job.id]: job }));
      try {
        let response = await ingest(job.id, restart);
        for (let calls = 0; calls < 200; calls += 1) {
          setJobs((current) => ({ ...current, [job.id]: response.job }));
          if (!response.job.hasMore) break;
          if (response.busy) await wait(2000);
          response = await ingest(job.id);
        }
      } finally {
        running.current.delete(job.id);
        await queryClient.invalidateQueries({ queryKey: ['content'] });
      }
    },
    [queryClient],
  );

  return { jobs, run };
}

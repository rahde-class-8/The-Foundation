import { useQuery } from '@tanstack/react-query';
import { getConceptHistory, getDueReviews, getMisconceptions } from '../api/reviews';
import type { DueWindow } from '../api/schemas';

export const reviewKeys = {
  all: ['reviews'] as const,
  due: (window: DueWindow) => ['reviews', 'due', window] as const,
  history: (conceptId: string) => ['reviews', 'history', conceptId] as const,
  misconceptions: ['reviews', 'misconceptions'] as const,
};

export const useDueReviews = (window: DueWindow) =>
  useQuery({ queryKey: reviewKeys.due(window), queryFn: () => getDueReviews(window) });
export const useConceptHistory = (conceptId: string | null) =>
  useQuery({
    queryKey: reviewKeys.history(conceptId ?? ''),
    queryFn: () => getConceptHistory(conceptId ?? ''),
    enabled: conceptId !== null,
  });
export const useMisconceptions = () =>
  useQuery({ queryKey: reviewKeys.misconceptions, queryFn: getMisconceptions });

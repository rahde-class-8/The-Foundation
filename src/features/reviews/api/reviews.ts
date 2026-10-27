import { OverrideResponseSchema, type OverrideRequest } from '@core/contracts/reviews.ts';
import { invokeFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';
import { DueReviewsSchema, HistorySchema, MisconceptionsSchema, type DueWindow } from './schemas';

function unwrap<T>(context: string, result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

export async function getDueReviews(window: DueWindow) {
  return DueReviewsSchema.parse(
    unwrap('Could not load reviews', await supabase.rpc('due_reviews', { due_window: window })),
  );
}

export async function getConceptHistory(conceptId: string) {
  return HistorySchema.parse(
    unwrap(
      'Could not load the history',
      await supabase.rpc('concept_history', { concept_id: conceptId }),
    ),
  );
}

export async function getMisconceptions() {
  return MisconceptionsSchema.parse(
    unwrap(
      'Could not load misconceptions',
      await supabase.rpc('recurring_misconceptions', { include_single: true }),
    ),
  );
}

export function overrideSchedule(input: OverrideRequest) {
  return invokeFunction('override-schedule', input, OverrideResponseSchema);
}

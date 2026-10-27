import type { DimensionKey, ServiceProfile } from '../api/schemas';

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  what: 'What it is',
  how: 'How it works',
  problem: 'Problem it solves',
  solution: 'How it solves it',
  not_do: 'What it does NOT do',
  when: 'When to choose it',
  where: 'Where it belongs',
  trade_offs: 'Trade-offs',
};

export const RELATION_LABELS: Record<ServiceProfile['related'][number]['relation'], string> = {
  alternative_to: 'Alternatives',
  commonly_paired_with: 'Commonly paired with',
  prerequisite_for: 'Prerequisite for',
  often_confused_with: 'Often confused with',
};

export const MASTERY_LABELS = {
  new: 'New',
  learning: 'Learning',
  reviewing: 'Reviewing',
  mastered: 'Mastered',
  lapsed: 'Lapsed',
} as const;

/** "n of m concepts reviewing or better" — never a single mastered flag for a service (LIB-7a). */
export function serviceProgressLabel(reviewingOrBetter: number, total: number): string {
  return `${reviewingOrBetter} of ${total} ${total === 1 ? 'concept' : 'concepts'} reviewing or better`;
}

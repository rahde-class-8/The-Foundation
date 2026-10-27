import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Catalog } from './catalog/load.ts';

export const CALIBRATION_FILE = 'supabase/functions/_shared/ai/calibration/grading-v1.json';

export const CalibrationSchema = z.object({
  promptVersion: z.string(),
  description: z.string(),
  cases: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        service: z.string(),
        concept: z.string(),
        question: z.string(),
        expected: z.enum(['pass', 'partial', 'miss']),
        answer: z.string().min(1),
      }),
    )
    .min(25),
});
export type Calibration = z.infer<typeof CalibrationSchema>;

export function readCalibration(path = CALIBRATION_FILE): Calibration {
  return CalibrationSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

/** Finds the catalog question a calibration case refers to. */
export function findQuestion(catalog: Catalog, testCase: Calibration['cases'][number]) {
  const service = catalog.services.find((s) => s.slug === testCase.service);
  const concept = service?.concepts.find((c) => c.slug === testCase.concept);
  const question = concept?.questions.find((q) => q.key === testCase.question);
  return service && concept && question ? { service, concept, question } : null;
}

export type CalibrationReport = {
  total: number;
  agreement: number;
  inversions: string[];
  mismatches: string[];
};

/** Agreement rate and Pass↔Miss inversions (the gate: ≥ 90% agreement, 0 inversions). */
export function scoreCalibration(
  results: { id: string; expected: string; actual: string | null }[],
): CalibrationReport {
  const agree = results.filter((r) => r.actual === r.expected).length;
  return {
    total: results.length,
    agreement: results.length === 0 ? 0 : agree / results.length,
    inversions: results
      .filter(
        (r) =>
          (r.expected === 'pass' && r.actual === 'miss') ||
          (r.expected === 'miss' && r.actual === 'pass'),
      )
      .map((r) => r.id),
    mismatches: results
      .filter((r) => r.actual !== r.expected)
      .map((r) => `${r.id}: expected ${r.expected}, got ${r.actual ?? 'error'}`),
  };
}

// Runs the grading calibration set against a real provider (P2-2). Costs money; run manually.
// Usage: ANTHROPIC_API_KEY=... npm run ai:calibrate [-- --model claude-opus-5-5] [-- --effort medium]
import { parseArgs } from 'node:util';
import { AnthropicEvaluationProvider } from '../supabase/functions/_shared/ai/adapters/anthropic.ts';
import { evaluateWithPolicy } from '../supabase/functions/_shared/ai/policy.ts';
import { gradeEvaluation } from '../supabase/functions/_shared/core/grading/derive.ts';
import { normalizeEvaluation } from '../supabase/functions/_shared/core/grading/evaluation.ts';
import { findQuestion, readCalibration, scoreCalibration } from './lib/calibration.ts';
import { readCatalogFiles } from './lib/catalog/files.ts';
import { loadCatalog } from './lib/catalog/load.ts';

const { values: args } = parseArgs({
  options: {
    model: { type: 'string', default: 'claude-opus-5-5' },
    effort: { type: 'string', default: 'medium' },
  },
});
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Set ANTHROPIC_API_KEY to run the calibration set.');
  process.exit(2);
}

const calibration = readCalibration();
const { catalog } = loadCatalog(readCatalogFiles());
const provider = new AnthropicEvaluationProvider(
  args.model ?? 'claude-opus-5-5',
  (args.effort ?? 'medium') as 'medium',
  apiKey,
);
const results: { id: string; expected: string; actual: string | null }[] = [];
let cost = 0;

for (const testCase of calibration.cases) {
  const found = findQuestion(catalog, testCase);
  if (!found) throw new Error(`Unknown question for case ${testCase.id}`);
  const { concept, question } = found;
  const { result } = await evaluateWithPolicy(
    provider,
    {
      conceptTitle: concept.title,
      dimension: question.dimension,
      promptMd: question.prompt,
      referenceAnswerMd: question.referenceAnswer,
      rubric: question.rubric,
      answer: testCase.answer,
      mode: 'initial',
    },
    { timeoutMs: 60_000, deadlineMs: 120_000, maxRetries: 2 },
  );
  let actual: string | null = null;
  if (result.ok) {
    actual = gradeEvaluation(
      question.rubric,
      normalizeEvaluation(result.value, question.rubric, testCase.answer),
    ).grade;
    cost += provider.costUsd(result.usage);
  }
  results.push({ id: testCase.id, expected: testCase.expected, actual });
  console.log(
    `${actual === testCase.expected ? '✓' : '✗'} ${testCase.id}: expected ${testCase.expected}, got ${(actual ?? result.ok) || result.error}`,
  );
}

const report = scoreCalibration(results);
console.log(
  `\nAgreement ${(report.agreement * 100).toFixed(1)}% (${report.total} cases), inversions: ${report.inversions.length}, est. cost $${cost.toFixed(2)}`,
);
const passed = report.agreement >= 0.9 && report.inversions.length === 0;
console.log(
  passed
    ? 'Calibration gate passed.'
    : 'Calibration gate FAILED (needs ≥ 90% agreement and 0 Pass↔Miss inversions).',
);
process.exit(passed ? 0 : 1);

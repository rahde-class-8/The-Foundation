import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dashboardMetrics, type AnalyticsInput } from '@core/analytics/metrics.ts';
import {
  FIXTURE_ANSWERS,
  createLearner,
  days,
  fixtureConcepts,
  invoke,
  rpc,
  setClock,
} from '../support/learners.ts';

// P3-1: dashboard_summary (SQL) and core analytics (TypeScript) agree on five fixture histories.
// Each history is replayed through the real API for a fresh learner, on that learner's test clock.

type Grade = 'pass' | 'partial' | 'miss';
type Step = {
  day: number;
  concept: 'queues' | 'topics' | 'streams';
  grade: Grade;
  warm?: boolean;
  ai?: boolean;
  misconception?: string;
  correction?: Grade;
};
type History = { description: string; steps: Step[] };

const dir = 'tests/fixtures/histories';
const histories = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map(
    (f) =>
      [f.replace('.json', ''), JSON.parse(readFileSync(join(dir, f), 'utf8')) as History] as const,
  );

const runIntegration = Boolean(process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD);

async function replay(client: SupabaseClient, userId: string, history: History) {
  const concepts = await fixtureConcepts(client);
  const n = history.steps.length;
  for (const [i, step] of history.steps.entries()) {
    // Steps on the same day keep their order, ten minutes apart, and never pass the real now.
    await setClock(userId, days(step.day) - (n - i) * 600);
    const conceptId = concepts[step.concept];
    const session = await rpc<{ id: string }>(client, 'start_session', {
      scope_type: 'concept',
      scope_id: conceptId,
    });
    if (step.warm) await rpc(client, 'mark_concept_exposed', { concept_id: conceptId });
    const next = await rpc<{ candidates: { questionVersionId: string }[] }>(
      client,
      'next_questions',
      {
        session_id: session.id,
      },
    );
    const questionVersionId = next.candidates[0]?.questionVersionId;
    const answer = `${FIXTURE_ANSWERS[step.concept]?.[step.grade] ?? ''}${step.misconception ? ` [[mock:misconception:${step.misconception}]]` : ''}`;
    const attempt = await rpc<{ id: string }>(client, 'submit_attempt', {
      session_id: session.id,
      question_version_id: questionVersionId,
      answer_md: answer,
      client_key: crypto.randomUUID(),
    });

    let finalId: string;
    if (step.ai) {
      const evaluated = await invoke<{ evaluation: { id: string; grade: Grade } }>(
        client,
        'evaluate-attempt',
        {
          attemptId: attempt.id,
        },
      );
      expect(evaluated.evaluation.grade).toBe(step.grade);
      finalId = evaluated.evaluation.id;
    } else {
      finalId = (
        await rpc<{ id: string }>(client, 'submit_self_evaluation', {
          attempt_id: attempt.id,
          grade: step.grade,
        })
      ).id;
    }

    if (step.correction) {
      const correction = await rpc<{ id: string }>(client, 'submit_attempt', {
        session_id: session.id,
        question_version_id: questionVersionId,
        answer_md: FIXTURE_ANSWERS[step.concept]?.[step.correction] ?? '',
        client_key: crypto.randomUUID(),
        attempt_kind: 'correction',
        parent_attempt_id: attempt.id,
      });
      const graded = await rpc<{ id: string }>(client, 'submit_self_evaluation', {
        attempt_id: correction.id,
        grade: step.correction,
      });
      await invoke(client, 'finalize-attempt', {
        attemptId: correction.id,
        finalEvaluationId: graded.id,
      });
    }
    await invoke(client, 'finalize-attempt', { attemptId: attempt.id, finalEvaluationId: finalId });
    await rpc(client, 'end_session', { session_id: session.id });
  }
  await setClock(userId, 0);
}

type Row = Record<string, unknown>;
async function rows(
  query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

/** Builds the core's input from the learner's own rows, as the learner can read them. */
async function coreInput(client: SupabaseClient, summary: Summary): Promise<AnalyticsInput> {
  const certId = summary.certification?.id ?? '';
  const [
    attempts,
    evaluations,
    versions,
    questions,
    states,
    misconceptions,
    sessions,
    domains,
    mappings,
    concepts,
  ] = await Promise.all([
    rows(
      client
        .from('attempts')
        .select(
          'id, concept_id, attempt_kind, is_cold, status, finalized_at, final_evaluation_id, question_version_id, submitted_at',
        ),
    ),
    rows(client.from('evaluations').select('id, grade')),
    rows(client.from('question_versions').select('id, question_id')),
    rows(client.from('questions').select('id, dimension')),
    rows(
      client
        .from('review_state')
        .select('concept_id, mastery_status, due_at, ease, last_cold_grade')
        .eq('is_active', true),
    ),
    rows(client.from('misconceptions').select('concept_id, status, occurrence_count')),
    rows(client.from('study_sessions').select('status, ended_at')),
    rows(
      client
        .from('exam_domains')
        .select('id, code, name, weight_pct, sort_order')
        .eq('certification_id', certId),
    ),
    rows(client.from('concept_certifications').select('concept_id, exam_domain_id')),
    rows(
      client
        .from('service_concepts')
        .select('id, status, services!inner(status)')
        .eq('status', 'published')
        .eq('services.status', 'published'),
    ),
  ]);
  const grade = new Map(evaluations.map((e) => [e.id, e.grade as Grade | null]));
  const questionOf = new Map(versions.map((v) => [v.id, v.question_id]));
  const dimension = new Map(questions.map((q) => [q.id, q.dimension as string]));
  const practicable = new Set(concepts.map((c) => c.id as string));
  const domainIds = new Set(domains.map((d) => d.id as string));
  const certConcepts = new Map<string, string[]>();
  for (const m of mappings) {
    if (!practicable.has(m.concept_id as string) || !domainIds.has(m.exam_domain_id as string))
      continue;
    certConcepts.set(m.concept_id as string, [
      ...(certConcepts.get(m.concept_id as string) ?? []),
      m.exam_domain_id as string,
    ]);
  }
  const today = summary.today;
  const firstAttempt = new Map<string, string>();
  for (const a of attempts.filter((a) => a.attempt_kind === 'initial')) {
    const at = a.submitted_at as string;
    const prev = firstAttempt.get(a.concept_id as string);
    if (!prev || Date.parse(at) < Date.parse(prev)) firstAttempt.set(a.concept_id as string, at);
  }
  const startedToday = [...firstAttempt.values()].filter(
    (at) => new Date(at).toISOString().slice(0, 10) === today,
  ).length;

  return {
    now: new Date(summary.now),
    timeZone: summary.timezone,
    attempts: attempts.map((a) => ({
      conceptId: a.concept_id as string,
      attemptKind: a.attempt_kind as 'initial' | 'correction',
      isCold: Boolean(a.is_cold),
      status: a.status as 'finalized',
      grade: a.final_evaluation_id ? (grade.get(a.final_evaluation_id) ?? null) : null,
      finalizedAt: (a.finalized_at as string | null) ?? null,
      dimension: (dimension.get(questionOf.get(a.question_version_id)) ?? 'what') as 'what',
    })),
    states: states
      .filter((s) => practicable.has(s.concept_id as string))
      .map((s) => ({
        conceptId: s.concept_id as string,
        masteryStatus: s.mastery_status as 'new',
        dueAt: (s.due_at as string | null) ?? null,
        ease: Number(s.ease),
        lastColdGrade: (s.last_cold_grade as Grade | null) ?? null,
      })),
    concepts: [...certConcepts.entries()].map(([id, ids]) => ({ id, domainIds: ids })),
    domains: domains
      .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
      .map((d) => ({
        id: d.id as string,
        code: d.code as string,
        name: d.name as string,
        weightPct: Number(d.weight_pct),
      })),
    misconceptions: misconceptions.map((m) => ({
      conceptId: m.concept_id as string,
      status: m.status as 'active',
      occurrenceCount: Number(m.occurrence_count),
    })),
    sessions: sessions.map((s) => ({
      status: s.status as 'completed',
      endedAt: (s.ended_at as string | null) ?? null,
    })),
    newConceptsRemaining: Math.max(10 - startedToday, 0),
  };
}

type Summary = {
  now: string;
  today: string;
  timezone: string;
  certification: { id: string } | null;
  weakest: { conceptId: string; priority: number }[];
  domains: Row[];
} & Row;

/** Numbers compared at 4 decimals (Postgres numeric vs. JS floats). */
function norm(value: unknown): unknown {
  if (typeof value === 'number') return Math.round(value * 10_000) / 10_000;
  if (Array.isArray(value)) return value.map(norm);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, norm(v)]));
  return value;
}

describe.runIf(runIntegration)('analytics parity (P3-1)', () => {
  it.each(histories)(
    '%s: SQL and core agree',
    async (_name, history) => {
      const learner = await createLearner();
      await replay(learner.client, learner.id, history);

      const summary = await rpc<Summary>(learner.client, 'dashboard_summary');
      const core = dashboardMetrics(await coreInput(learner.client, summary));

      expect(summary.today).toBe(core.today);
      expect(norm(summary.counts)).toEqual(norm(core.counts));
      expect(norm(summary.coldAccuracy)).toEqual(norm(core.coldAccuracy));
      expect(norm(summary.accuracyByWeek)).toEqual(norm(core.accuracyByWeek));
      expect(norm(summary.retentionByInterval)).toEqual(norm(core.retentionByInterval));
      expect(norm(summary.dimensionAccuracy)).toEqual(norm(core.dimensionAccuracy));
      expect(summary.masteryDistribution).toEqual(core.masteryDistribution);
      expect(
        norm(summary.weakest.map((w) => ({ conceptId: w.conceptId, priority: w.priority }))),
      ).toEqual(norm(core.weakest));
      expect(norm(summary.domains)).toEqual(norm(core.domains));
      expect(norm(summary.readiness)).toEqual(norm(core.readiness));
      // Sanity: the history produced real activity.
      expect(core.coldAccuracy.n + core.readiness.coldAttempts).toBeGreaterThan(0);
    },
    180_000,
  );
});

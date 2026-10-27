import type { SupabaseClient } from '@supabase/supabase-js';
import { EvaluationViewSchema, type EvaluationView } from '../core/contracts/practice.ts';
import { DIMENSIONS, type Dimension } from '../core/grading/rubric.ts';
import type { ReviewSnapshot } from '../core/scheduler/next.ts';
import {
  VersionConflictError,
  type AttemptContext,
  type PracticeStore,
  type StoredReviewState,
} from '../practice/store.ts';

type Row = Record<string, unknown>;

function toView(row: Row): EvaluationView {
  return EvaluationViewSchema.parse({
    id: row.id,
    attemptId: row.attempt_id,
    source: row.source,
    status: row.status,
    grade: row.grade ?? null,
    rubricScore:
      row.rubric_score === null || row.rubric_score === undefined ? null : Number(row.rubric_score),
    confidence:
      row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    feedback: row.feedback ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    errorCode: row.error_code ?? null,
    overridesEvaluationId: row.overrides_evaluation_id ?? null,
    createdAt: row.created_at,
  });
}

function toState(row: Row): StoredReviewState & { conceptId: string } {
  return {
    conceptId: String(row.conceptId ?? row.concept_id),
    masteryStatus: (row.masteryStatus ?? row.mastery_status) as ReviewSnapshot['masteryStatus'],
    intervalDays: Number(row.intervalDays ?? row.interval_days),
    ease: Number(row.ease),
    consecutiveColdPasses: Number(row.consecutiveColdPasses ?? row.consecutive_cold_passes),
    lapseCount: Number(row.lapseCount ?? row.lapse_count),
    preLapseIntervalDays: (row.preLapseIntervalDays ?? row.pre_lapse_interval_days ?? null) as
      number | null,
    totalColdAttempts: Number(row.totalColdAttempts ?? row.total_cold_attempts),
    lastColdGrade: (row.lastColdGrade ??
      row.last_cold_grade ??
      null) as ReviewSnapshot['lastColdGrade'],
    lastReviewedAt: (row.lastReviewedAt ?? row.last_reviewed_at ?? null) as string | null,
    dueAt: (row.dueAt ?? row.due_at ?? null) as string | null,
    manualDueOverride: Boolean(row.manualDueOverride ?? row.manual_due_override),
    version: Number(row.version),
  };
}

function check<T>(result: { data: T; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new Error(`database: ${result.error.message}`);
  return result.data;
}

/** PracticeStore backed by the service-role client; every query is scoped to the authenticated user. */
export function createPracticeStore(db: SupabaseClient): PracticeStore {
  const evaluationsFor = async (attemptId: string) =>
    (
      check(
        await db.from('evaluations').select('*').eq('attempt_id', attemptId).order('created_at'),
      ) as Row[]
    ).map(toView);

  return {
    async getAttemptContext(userId, attemptId): Promise<AttemptContext | null> {
      const attempt = check(
        await db
          .from('attempts')
          .select(
            'id, status, attempt_kind, parent_attempt_id, is_cold, answer_md, concept_id, question_version_id',
          )
          .eq('id', attemptId)
          .eq('user_id', userId)
          .maybeSingle(),
      ) as Row | null;
      if (!attempt) return null;

      const version = check(
        await db
          .from('question_versions')
          .select('prompt_md, reference_answer_md, rubric, questions(dimension)')
          .eq('id', attempt.question_version_id as string)
          .single(),
      ) as Row;
      const concept = check(
        await db
          .from('service_concepts')
          .select('title')
          .eq('id', attempt.concept_id as string)
          .single(),
      ) as Row;
      const settings = check(
        await db
          .from('user_settings')
          .select('timezone, ai_grading_enabled, scheduler_overrides')
          .eq('user_id', userId)
          .maybeSingle(),
      ) as Row | null;
      const dimension = (version.questions as { dimension?: string } | null)?.dimension;

      return {
        attempt: {
          id: String(attempt.id),
          status: attempt.status as AttemptContext['attempt']['status'],
          attemptKind: attempt.attempt_kind as AttemptContext['attempt']['attemptKind'],
          parentAttemptId: (attempt.parent_attempt_id as string | null) ?? null,
          isCold: Boolean(attempt.is_cold),
          answerMd: String(attempt.answer_md),
          conceptId: String(attempt.concept_id),
        },
        question: {
          promptMd: String(version.prompt_md),
          referenceAnswerMd: String(version.reference_answer_md),
          rubric: version.rubric,
          dimension: (DIMENSIONS as readonly string[]).includes(dimension ?? '')
            ? (dimension as Dimension)
            : 'what',
        },
        conceptTitle: String(concept.title),
        evaluations: await evaluationsFor(attemptId),
        parentEvaluations: attempt.parent_attempt_id
          ? await evaluationsFor(String(attempt.parent_attempt_id))
          : [],
        settings: {
          timezone: String(settings?.timezone ?? 'UTC'),
          aiGradingEnabled: settings?.ai_grading_enabled !== false,
          schedulerOverrides: settings?.scheduler_overrides ?? {},
        },
      };
    },

    async aiUsageSince(userId, since) {
      const rows = check(
        await db
          .from('evaluations')
          .select('cost_usd')
          .eq('user_id', userId)
          .eq('source', 'ai')
          .in('status', ['completed', 'failed', 'invalid_response'])
          .gte('created_at', since.toISOString()),
      ) as Row[];
      return {
        count: rows.length,
        costUsd: rows.reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0),
      };
    },

    async recordAiEvaluation(userId, attemptId, record) {
      const data = check(
        await db.rpc('record_ai_evaluation', {
          p_user_id: userId,
          p_attempt_id: attemptId,
          p_evaluation: record,
        }),
      );
      return EvaluationViewSchema.parse(data);
    },

    async getReviewState(userId, conceptId) {
      const row = check(
        await db
          .from('review_state')
          .select('*')
          .eq('user_id', userId)
          .eq('concept_id', conceptId)
          .eq('is_active', true)
          .maybeSingle(),
      ) as Row | null;
      return row ? toState(row) : null;
    },

    async finalizeAttempt(input) {
      const { data, error } = await db.rpc('finalize_attempt', {
        p_user_id: input.userId,
        p_attempt_id: input.attemptId,
        p_final_evaluation_id: input.finalEvaluationId,
        p_expected_version: input.expectedVersion,
        p_transition: input.transition,
        p_config_version: input.configVersion,
      });
      if (error?.code === 'P0409') throw new VersionConflictError(error.message);
      if (error) throw new Error(`database: ${error.message}`);
      const result = data as { replayed: boolean; state: Row | null };
      return { replayed: result.replayed, state: result.state ? toState(result.state) : null };
    },
  };
}

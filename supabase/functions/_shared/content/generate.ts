import type { AiConfig } from '../ai/config.ts';
import { withPolicy } from '../ai/policy.ts';
import { DRAFT_PROMPT_VERSION } from '../ai/prompts/drafts/v1.ts';
import type { DraftProvider } from '../ai/types.ts';
import { GenerateRequestSchema, type GenerateResponse } from '../core/contracts/content.ts';
import { MAX_DRAFT_CONCEPTS, normalizeDrafts } from '../core/content/drafts.ts';
import { ApiError } from '../http/errors.ts';
import { CitationMismatchError, ForbiddenError, type ContentStore } from './store.ts';

export type GenerateDeps = {
  store: ContentStore;
  provider: DraftProvider | null;
  config: AiConfig;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * POST /generate-drafts (API_CONTRACTS §4). Passages go to the model as untrusted data; the only
 * writes are this job's draft rows, after citations are checked against the selected passages (CNT-9a).
 */
export async function generateDrafts(
  deps: GenerateDeps,
  userId: string,
  body: unknown,
): Promise<GenerateResponse> {
  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError('validation_failed', 'Choose 1 to 20 passages and a service.');
  }
  const passageIds = [...new Set(parsed.data.passageIds)];
  const maxConcepts = parsed.data.maxConcepts ?? Math.min(3, MAX_DRAFT_CONCEPTS);

  const service = await deps.store.getService(parsed.data.serviceId);
  if (!service) throw new ApiError('not_found', 'Service not found.');
  const passages = await deps.store.getPassages(userId, passageIds);
  if (passages.length !== passageIds.length)
    throw new ApiError('not_found', 'Some passages were not found.');

  let job;
  try {
    job = await deps.store.startDraftJob(userId, {
      passageIds,
      serviceId: service.id,
      maxConcepts,
      promptVersion: DRAFT_PROMPT_VERSION,
    });
  } catch (error) {
    if (error instanceof ForbiddenError)
      throw new ApiError('unauthorized', 'Only the owner can generate drafts.');
    throw error;
  }
  const finish = async (outcome: Parameters<ContentStore['finishJob']>[2]) => ({
    job: await deps.store.finishJob(userId, job.id, outcome),
    drafts: [],
    rejected: [],
  });

  if (!deps.provider)
    return finish({ errorCode: 'ai_unavailable', errorDetail: 'AI drafting is not configured' });

  const aliases = new Map(passages.map((p, i) => [`P${i + 1}`, p.id]));
  const request = {
    serviceName: service.name,
    passages: passages.map((p, i) => ({
      alias: `P${i + 1}`,
      sourceTitle: p.sourceTitle,
      text: p.text,
    })),
    maxConcepts,
  };
  const provider = deps.provider;
  const { result } = await withPolicy((call) => provider.generateDrafts(request, call), {
    // Drafting writes more than grading, so it gets twice the grading time limits.
    timeoutMs: deps.config.timeoutMs * 2,
    deadlineMs: deps.config.deadlineMs * 2,
    maxRetries: deps.config.maxRetries,
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
  });
  if (!result.ok) {
    return finish({
      errorCode: result.error === 'invalid_response' ? 'ai_invalid_response' : 'ai_unavailable',
      errorDetail: `${result.error}: ${result.message}`.slice(0, 500),
    });
  }

  const { drafts, rejected } = normalizeDrafts(result.value, aliases, maxConcepts);
  if (drafts.length === 0) {
    const citationProblem = rejected.some((r) => r.reason.startsWith('cites passages'));
    return {
      ...(await finish({
        errorCode: citationProblem ? 'citation_mismatch' : 'ai_invalid_response',
        errorDetail:
          rejected
            .map((r) => `${r.title}: ${r.reason}`)
            .join('; ')
            .slice(0, 500) || 'no drafts returned',
        result: { rejected },
      })),
      rejected,
    };
  }

  let conceptIds: string[];
  try {
    conceptIds = await deps.store.createDrafts(userId, job.id, service.id, drafts);
  } catch (error) {
    if (error instanceof CitationMismatchError) {
      return finish({
        errorCode: 'citation_mismatch',
        errorDetail: 'a citation is not a passage you can cite',
      });
    }
    throw error;
  }
  const finished = await deps.store.finishJob(userId, job.id, {
    result: {
      conceptIds,
      rejected,
      model: result.model,
      usage: result.usage,
      costUsd: provider.costUsd(result.usage),
    },
  });
  return {
    job: finished,
    drafts: drafts.map((d, i) => ({
      conceptId: conceptIds[i] ?? '',
      title: d.title,
      questionCount: d.questions.length,
    })),
    rejected,
  };
}

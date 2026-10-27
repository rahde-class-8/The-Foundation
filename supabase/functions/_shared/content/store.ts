import type { JobView } from '../core/contracts/content.ts';
import type { DraftConcept } from '../core/content/drafts.ts';
import type { ImportErrorCode } from '../core/content/limits.ts';
import type { Passage } from '../core/content/segment.ts';

export type ClaimedSource = {
  id: string;
  sourceType: string;
  storagePath: string | null;
  byteSize: number | null;
  sha256: string | null;
  noteBodyMd: string | null;
};

export type Claim =
  | { claimed: false; busy: boolean; job: JobView }
  | { claimed: true; busy: false; job: JobView; cursor: unknown; source: ClaimedSource | null };

export type StoredPassage = Passage & { textHash: string };

export class ForbiddenError extends Error {}
export class CitationMismatchError extends Error {}

/** Data access for ingest-source and generate-drafts (service-role client, scoped to the caller). */
export interface ContentStore {
  claimJob(userId: string, jobId: string, restart: boolean): Promise<Claim | null>;
  recordProgress(
    userId: string,
    jobId: string,
    passages: StoredPassage[],
    cursor: unknown,
    progressPct: number,
    pageCount?: number,
  ): Promise<JobView>;
  finishJob(
    userId: string,
    jobId: string,
    outcome: {
      errorCode?: ImportErrorCode;
      errorDetail?: string;
      result?: unknown;
      sha256?: string;
    },
  ): Promise<JobView>;
  /** Null when the object does not exist. */
  downloadUpload(storagePath: string): Promise<Uint8Array | null>;
  deleteUpload(storagePath: string): Promise<void>;
  /** True when another source of the learner already has this file. */
  shaInUse(userId: string, sha256: string, exceptSourceId: string): Promise<boolean>;
  getService(serviceId: string): Promise<{ id: string; name: string } | null>;
  /** Passages the learner may cite (own or shared sources), in the requested order. */
  getPassages(
    userId: string,
    ids: string[],
  ): Promise<{ id: string; text: string; sourceTitle: string }[]>;
  /** Throws ForbiddenError unless the learner is the owner. */
  startDraftJob(userId: string, params: unknown): Promise<JobView>;
  /** Throws CitationMismatchError when a citation is not a passage the learner may cite. */
  createDrafts(
    userId: string,
    jobId: string,
    serviceId: string,
    drafts: DraftConcept[],
  ): Promise<string[]>;
}

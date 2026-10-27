import type { ApiErrorCode } from '../core/contracts/practice.ts';

const STATUS: Record<ApiErrorCode, number> = {
  validation_failed: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

/** A failure with a safe, user-displayable message (API_CONTRACTS §2). */
export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }

  get status(): number {
    return STATUS[this.code];
  }
}

import type { ImportErrorCode } from '../core/content/limits.ts';

export type PdfDocument = { numPages: number; pageText(page: number): Promise<string> };

/** Opens PDFs for ingest-source; adapters translate parser errors into typed codes (CNT-8a). */
export interface PdfReader {
  open(bytes: Uint8Array): Promise<PdfDocument>;
}

export class PdfOpenError extends Error {
  readonly code: ImportErrorCode;

  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

// Upload and import rules (CONTENT_GOVERNANCE §5, SECURITY §6).

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_PAGES = 300;
export const MAX_UPLOADS_PER_DAY = 10;

export const IMPORT_ERROR_CODES = [
  'file_too_large',
  'unsupported_type',
  'duplicate_source',
  'rate_limited',
  'pdf_encrypted',
  'pdf_corrupt',
  'pdf_empty',
  'pdf_too_many_pages',
  'no_extractable_text',
  'segmentation_failed',
  'upload_missing',
  'ai_unavailable',
  'ai_invalid_response',
  'citation_mismatch',
] as const;
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];

/** Messages shown next to a failed job; they never echo file contents. */
export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  file_too_large: 'The file is larger than 20 MB.',
  unsupported_type: 'This is not a PDF file.',
  duplicate_source: 'You already uploaded this file.',
  rate_limited: 'You reached the limit of 10 uploads per day.',
  pdf_encrypted: 'The PDF is password-protected. Remove the password and upload it again.',
  pdf_corrupt: 'The PDF could not be read. It may be damaged.',
  pdf_empty: 'The PDF has no pages.',
  pdf_too_many_pages: 'The PDF has more than 300 pages. Split it into smaller files.',
  no_extractable_text: 'No text was found. Scanned PDFs need OCR, which is not supported.',
  segmentation_failed: 'The text could not be split into passages.',
  upload_missing: 'The uploaded file was not found. Upload it again.',
  ai_unavailable: 'The AI drafting service is unavailable. Try again later.',
  ai_invalid_response: 'The AI returned drafts that could not be used. Try again.',
  citation_mismatch: 'The AI cited passages that were not selected, so no drafts were saved.',
};

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** True when the bytes start with the PDF header, regardless of the file's name or declared type. */
export function hasPdfMagic(head: Uint8Array): boolean {
  return PDF_MAGIC.every((byte, i) => head[i] === byte);
}

/** Checks that run before parsing (CNT-2a): size and magic bytes. */
export function precheckUpload(input: {
  byteSize: number;
  head: Uint8Array;
}): ImportErrorCode | null {
  if (input.byteSize > MAX_UPLOAD_BYTES) return 'file_too_large';
  if (!hasPdfMagic(input.head)) return 'unsupported_type';
  return null;
}

/** Checks after the parser opened the document. */
export function checkPageCount(pages: number): ImportErrorCode | null {
  if (pages < 1) return 'pdf_empty';
  if (pages > MAX_PDF_PAGES) return 'pdf_too_many_pages';
  return null;
}

/** Lowercase hex SHA-256, available in Node, Deno, and browsers. */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

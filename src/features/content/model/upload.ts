import {
  IMPORT_ERROR_CODES,
  IMPORT_ERROR_MESSAGES,
  precheckUpload,
  type ImportErrorCode,
} from '@core/content/limits.ts';

/** Reads the first bytes of a file to check its type without trusting the name (CNT-2a). */
export async function precheckFile(file: File): Promise<ImportErrorCode | null> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  return precheckUpload({ byteSize: file.size, head });
}

export function importErrorMessage(
  code: string | null | undefined,
  fallback = 'Something went wrong.',
): string {
  return code && (IMPORT_ERROR_CODES as readonly string[]).includes(code)
    ? IMPORT_ERROR_MESSAGES[code as ImportErrorCode]
    : fallback;
}

/** Turns a database error such as "file_too_large" into the matching sentence. */
export function rpcErrorMessage(message: string): string {
  const code = IMPORT_ERROR_CODES.find((c) => message.includes(c));
  return code ? IMPORT_ERROR_MESSAGES[code] : message;
}

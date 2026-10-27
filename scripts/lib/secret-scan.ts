// Detects server-only credentials in client build output (SECURITY §5, acceptance X-3 / P0-6).

export type SecretFinding = { file: string; kind: string; excerpt: string };

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;

const VALUE_PATTERNS: ReadonlyArray<{ kind: string; pattern: RegExp }> = [
  { kind: 'supabase-secret-key', pattern: /sb_secret_[A-Za-z0-9_-]{16,}/g },
  { kind: 'anthropic-api-key', pattern: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'openai-api-key', pattern: /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { kind: 'private-key', pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
];

function decodeJwtRole(payloadSegment: string): string | null {
  try {
    const json = Buffer.from(payloadSegment, 'base64url').toString('utf8');
    const payload: unknown = JSON.parse(json);
    if (
      payload &&
      typeof payload === 'object' &&
      'role' in payload &&
      typeof payload.role === 'string'
    ) {
      return payload.role;
    }
  } catch {
    // Not a decodable JWT; ignore.
  }
  return null;
}

function redact(value: string): string {
  return value.length <= 12 ? '***' : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function scanText(file: string, text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const match of text.matchAll(JWT_PATTERN)) {
    const role = decodeJwtRole(match[1] ?? '');
    // The anon key is public by design; anything else signed for this project is not.
    if (role !== null && role !== 'anon') {
      findings.push({ file, kind: `jwt-role:${role}`, excerpt: redact(match[0]) });
    }
  }

  for (const { kind, pattern } of VALUE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      findings.push({ file, kind, excerpt: redact(match[0]) });
    }
  }

  return findings;
}

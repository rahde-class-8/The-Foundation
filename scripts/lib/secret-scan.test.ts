import { scanText } from './secret-scan.ts';

function fakeJwt(role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: 'supabase-demo', role, exp: 1983812996 })}.c2lnbmF0dXJlLXZhbHVl`;
}

describe('scanText', () => {
  it('allows the public anon key', () => {
    expect(scanText('index.js', `const key="${fakeJwt('anon')}"`)).toEqual([]);
  });

  it('flags an injected service-role key (P0-6 negative test)', () => {
    const findings = scanText('index.js', `const key="${fakeJwt('service_role')}"`);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: 'index.js', kind: 'jwt-role:service_role' });
    expect(findings[0]?.excerpt).not.toContain('signature');
  });

  it.each([
    ['supabase-secret-key', 'sb_secret_abcdefghijklmnop1234'],
    ['anthropic-api-key', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz'],
    ['openai-api-key', 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'],
    ['private-key', '-----BEGIN PRIVATE KEY-----'],
  ])('flags %s', (kind, value) => {
    expect(scanText('chunk.js', `x="${value}"`).map((finding) => finding.kind)).toContain(kind);
  });

  it('ignores ordinary minified code', () => {
    expect(scanText('chunk.js', 'function sk(a){return a.ask-ant}const eyJ=1;')).toEqual([]);
  });
});

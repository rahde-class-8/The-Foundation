import { buildHealthResponse, CORE_VERSION, HealthResponseSchema } from './health.ts';

describe('buildHealthResponse', () => {
  it('returns a schema-valid response stamped with the injected clock', () => {
    const now = new Date('2026-10-27T12:00:00.000Z');

    const response = buildHealthResponse('edge', now);

    expect(response).toEqual({
      status: 'ok',
      service: 'edge',
      coreVersion: CORE_VERSION,
      checkedAt: '2026-10-27T12:00:00.000Z',
    });
    expect(HealthResponseSchema.safeParse(response).success).toBe(true);
  });

  it('rejects an empty service name', () => {
    expect(() => buildHealthResponse('', new Date())).toThrow();
  });
});

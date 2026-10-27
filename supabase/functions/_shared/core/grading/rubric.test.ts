import { RubricV1Schema } from './rubric.ts';

const valid = {
  schemaVersion: 1,
  points: [
    { id: 'p1', text: 'Maximum duration is 15 minutes', weight: 3, critical: true },
    { id: 'p2', text: 'Default timeout is 3 seconds', weight: 1, critical: false },
  ],
};

describe('RubricV1Schema', () => {
  it('accepts a valid rubric and applies defaults', () => {
    const rubric = RubricV1Schema.parse(valid);

    expect(rubric.thresholds).toEqual({ pass: 0.8, partial: 0.4 });
    expect(rubric.knownMisconceptions).toEqual([]);
  });

  it('requires at least one critical point', () => {
    const result = RubricV1Schema.safeParse({
      ...valid,
      points: valid.points.map((point) => ({ ...point, critical: false })),
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/critical/);
  });

  it('rejects duplicate point ids', () => {
    const result = RubricV1Schema.safeParse({
      ...valid,
      points: [valid.points[0], { ...valid.points[1], id: 'p1' }],
    });

    expect(result.error?.issues.map((issue) => issue.message)).toContain('duplicate point id p1');
  });

  it('rejects inverted thresholds', () => {
    expect(
      RubricV1Schema.safeParse({ ...valid, thresholds: { pass: 0.4, partial: 0.8 } }).success,
    ).toBe(false);
  });
});

import { findQuestion, readCalibration, scoreCalibration } from './calibration.ts';
import { readCatalogFiles } from './catalog/files.ts';
import { loadCatalog } from './catalog/load.ts';

describe('grading calibration set', () => {
  const calibration = readCalibration();
  const { catalog } = loadCatalog(readCatalogFiles());

  it('references questions that exist in the catalog', () => {
    const missing = calibration.cases.filter((c) => !findQuestion(catalog, c)).map((c) => c.id);
    expect(missing).toEqual([]);
  });

  it('covers every grade and includes an injection attempt', () => {
    const grades = new Set(calibration.cases.map((c) => c.expected));
    expect([...grades].sort()).toEqual(['miss', 'partial', 'pass']);
    expect(calibration.cases.some((c) => /ignore the rubric/i.test(c.answer))).toBe(true);
  });

  it('scores agreement and Pass↔Miss inversions', () => {
    const report = scoreCalibration([
      { id: 'a', expected: 'pass', actual: 'pass' },
      { id: 'b', expected: 'pass', actual: 'miss' },
      { id: 'c', expected: 'partial', actual: 'miss' },
      { id: 'd', expected: 'miss', actual: null },
    ]);
    expect(report.agreement).toBe(0.25);
    expect(report.inversions).toEqual(['b']);
    expect(report.mismatches).toHaveLength(3);
  });
});

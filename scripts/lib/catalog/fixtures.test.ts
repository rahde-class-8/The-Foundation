import { readCatalogFiles } from './files.ts';
import { loadCatalog } from './load.ts';
import { withPerfFixture, withPracticeFixture } from './perf-fixture.ts';

describe('catalog test fixtures', () => {
  const { catalog, errors } = loadCatalog(readCatalogFiles());

  it('starts from a valid catalog', () => {
    expect(errors).toEqual([]);
  });

  it('adds a published practice service with questions', () => {
    const withPractice = withPracticeFixture(catalog);
    const service = withPractice.services.find((s) => s.slug === 'practice-fixture');

    expect(service?.status).toBe('published');
    expect(service?.concepts.flatMap((c) => c.questions)).toHaveLength(3);
    // Streams maps to a second exam domain so domain metrics have two rows (Phase 3).
    const domains = new Set(service?.concepts.flatMap((c) => c.mappings.map((m) => m.domain)));
    expect(domains.size).toBe(2);
  });

  it('combines with the performance fixture', () => {
    const combined = withPerfFixture(withPracticeFixture(catalog));

    expect(combined.services.filter((s) => s.slug.startsWith('perf-service-'))).toHaveLength(25);
    expect(combined.services.some((s) => s.slug === 'practice-fixture')).toBe(true);
  });
});

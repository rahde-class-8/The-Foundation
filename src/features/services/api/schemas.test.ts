// Fixtures are real responses captured from the catalog RPCs against the seed catalog.
import facets from '../test/facets-response.json';
import profile from '../test/profile-response.json';
import search from '../test/search-response.json';
import { FacetsSchema, SearchPageSchema, ServiceProfileSchema } from './schemas';

describe('catalog response schemas', () => {
  it('parse a real search_catalog response', () => {
    const page = SearchPageSchema.parse(search);

    expect(page.items[0]?.slug).toBe('lambda');
    expect(page.items[0]?.matchedConcepts.map((c) => c.slug)).toEqual(['concurrency']);
  });

  it('parse a real catalog_facets response', () => {
    const parsed = FacetsSchema.parse(facets);

    expect(parsed.certifications[0]?.domains.map((d) => d.code)).toEqual(['D1', 'D2', 'D3', 'D4']);
  });

  it('parse a real service_profile response', () => {
    const parsed = ServiceProfileSchema.parse(profile);

    expect(parsed.concepts.length).toBeGreaterThan(0);
    expect(parsed.concepts.every((c) => c.citations.length > 0)).toBe(true);
    expect(parsed.concepts.find((c) => c.slug === 'concurrency')?.progress?.masteryStatus).toBe(
      'learning',
    );
  });

  it('rejects a response with an unexpected shape', () => {
    expect(SearchPageSchema.safeParse({ items: [{ id: 'x' }], nextCursor: null }).success).toBe(
      false,
    );
  });
});

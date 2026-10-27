import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryBoundary } from '@/components/common/QueryBoundary';
import { Button } from '@/components/ui/button';
import { CatalogFilterBar } from '../components/CatalogFilterBar';
import { ServiceResults } from '../components/ServiceResults';
import { useCatalogFacets, useServiceSearch } from '../hooks/useCatalog';
import { useDebouncedValue } from '../hooks/useDebouncedValue';

export const SEARCH_DEBOUNCE_MS = 250;

export function ServicesPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  // The URL is the source of truth for filters, so searches are shareable and survive reloads.
  const urlQuery = params.get('q') ?? '';
  const domainId = params.get('domain') ?? '';
  const categoryId = params.get('category') ?? '';

  // Write the search box to the URL only when its debounced value changes, so clearing the
  // filters is not undone by a stale debounced value.
  const lastWritten = useRef(debouncedQuery);
  useEffect(() => {
    if (lastWritten.current === debouncedQuery) return;
    lastWritten.current = debouncedQuery;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (debouncedQuery) next.set('q', debouncedQuery);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [debouncedQuery, setParams]);

  const setParam = (key: 'domain' | 'category', value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const filters = useMemo(
    () => ({
      ...(urlQuery ? { q: urlQuery } : {}),
      ...(domainId ? { domainId } : {}),
      ...(categoryId ? { categoryId } : {}),
    }),
    [urlQuery, domainId, categoryId],
  );
  const facets = useCatalogFacets();
  const search = useServiceSearch(filters);
  const services = search.data?.pages.flatMap((page) => page.items);
  const hasFilters = Boolean(urlQuery || domainId || categoryId);

  return (
    <>
      <PageHeader
        title="Service library"
        description="Browse AWS services and their independently testable concepts."
      />
      <div className="space-y-6">
        <CatalogFilterBar
          query={query}
          onQueryChange={setQuery}
          domainId={domainId}
          onDomainChange={(value) => setParam('domain', value)}
          categoryId={categoryId}
          onCategoryChange={(value) => setParam('category', value)}
          facets={facets.data}
        />
        <QueryBoundary
          query={{ ...search, data: services }}
          loadingLabel="Loading services…"
          isEmpty={(items) => items.length === 0}
          empty={
            <div className="space-y-3 rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              <p>{hasFilters ? 'No services match these filters.' : 'The catalog is empty.'}</p>
              {hasFilters ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setQuery('');
                    setParams({}, { replace: true });
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          }
        >
          {(items) => (
            <div className="space-y-6">
              <p className="sr-only" aria-live="polite">
                {items.length} services shown
              </p>
              <ServiceResults services={items} />
              {search.hasNextPage ? (
                <Button
                  variant="outline"
                  onClick={() => void search.fetchNextPage()}
                  disabled={search.isFetchingNextPage}
                >
                  {search.isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              ) : null}
            </div>
          )}
        </QueryBoundary>
      </div>
    </>
  );
}

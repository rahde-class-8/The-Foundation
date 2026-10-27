import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCatalogFacets,
  getServiceProfile,
  markConceptExposed,
  searchCatalog,
  type CatalogFilters,
} from '../api/catalog';

export const catalogKeys = {
  facets: ['catalog', 'facets'] as const,
  search: (filters: CatalogFilters) => ['services', filters] as const,
  profile: (slug: string) => ['service', slug] as const,
};

export function useCatalogFacets() {
  return useQuery({
    queryKey: catalogKeys.facets,
    queryFn: getCatalogFacets,
    staleTime: 5 * 60_000,
  });
}

export function useServiceSearch(filters: CatalogFilters) {
  return useInfiniteQuery({
    queryKey: catalogKeys.search(filters),
    queryFn: ({ pageParam }) => searchCatalog(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function useServiceProfile(slug: string) {
  return useQuery({ queryKey: catalogKeys.profile(slug), queryFn: () => getServiceProfile(slug) });
}

export function useMarkConceptExposed(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markConceptExposed,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: catalogKeys.profile(slug) }),
        queryClient.invalidateQueries({ queryKey: ['services'] }),
      ]);
    },
  });
}

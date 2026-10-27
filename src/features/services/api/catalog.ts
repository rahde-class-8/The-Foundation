import { supabase } from '@/lib/supabase';
import {
  FacetsSchema,
  SearchPageSchema,
  ServiceProfileSchema,
  type Facets,
  type SearchPage,
  type ServiceProfile,
} from './schemas';

export type CatalogFilters = { q?: string; domainId?: string; categoryId?: string };

export const PAGE_SIZE = 24;

function fail(context: string, message: string): never {
  throw new Error(`${context}: ${message}`);
}

export async function searchCatalog(filters: CatalogFilters, after?: string): Promise<SearchPage> {
  const { data, error } = await supabase.rpc('search_catalog', {
    page_size: PAGE_SIZE,
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.domainId ? { domain_id: filters.domainId } : {}),
    ...(filters.categoryId ? { category_id: filters.categoryId } : {}),
    ...(after ? { after } : {}),
  });
  if (error) fail('Could not search the catalog', error.message);
  return SearchPageSchema.parse(data);
}

export async function getCatalogFacets(): Promise<Facets> {
  const { data, error } = await supabase.rpc('catalog_facets');
  if (error) fail('Could not load catalog filters', error.message);
  return FacetsSchema.parse(data);
}

/** Returns null when the service does not exist or is not visible. */
export async function getServiceProfile(slug: string): Promise<ServiceProfile | null> {
  const { data, error } = await supabase.rpc('service_profile', { service_slug: slug });
  if (error) fail('Could not load the service', error.message);
  return data === null ? null : ServiceProfileSchema.parse(data);
}

export async function markConceptExposed(conceptId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_concept_exposed', { concept_id: conceptId });
  if (error) fail('Could not record study progress', error.message);
}

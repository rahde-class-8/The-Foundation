// Parses and cross-validates the catalog, then builds the import_catalog payload.
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import {
  CategoriesFileSchema,
  CertificationFileSchema,
  ServiceFileSchema,
  SourcesFileSchema,
  type CategoriesFile,
  type CertificationFile,
  type ServiceFile,
  type SourcesFile,
} from './schema.ts';

export type CatalogFile = { path: string; content: string };

export type Catalog = {
  categories: CategoriesFile['categories'];
  sources: SourcesFile['sources'];
  certifications: CertificationFile[];
  services: (ServiceFile & { path: string })[];
};

export type LoadResult = { catalog: Catalog; errors: string[] };

function kindOf(path: string): 'categories' | 'sources' | 'certification' | 'service' | null {
  if (/(^|\/)categories\.ya?ml$/.test(path)) return 'categories';
  if (/(^|\/)sources\.ya?ml$/.test(path)) return 'sources';
  if (/(^|\/)certifications\/[^/]+\.ya?ml$/.test(path)) return 'certification';
  if (/(^|\/)services\/[^/]+\/[^/]+\.ya?ml$/.test(path)) return 'service';
  return null;
}

function formatIssues(path: string, error: z.ZodError): string[] {
  return error.issues.map(
    (issue) => `${path}: ${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );
}

function parseFile<S extends z.ZodType>(
  file: CatalogFile,
  schema: S,
  errors: string[],
): z.infer<S> | null {
  let raw: unknown;
  try {
    raw = parseYaml(file.content);
  } catch (error) {
    errors.push(`${file.path}: invalid YAML: ${(error as Error).message.split('\n')[0]}`);
    return null;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    errors.push(...formatIssues(file.path, result.error));
    return null;
  }
  return result.data;
}

export function loadCatalog(files: CatalogFile[]): LoadResult {
  const errors: string[] = [];
  const catalog: Catalog = { categories: [], sources: [], certifications: [], services: [] };

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    switch (kindOf(file.path)) {
      case 'categories': {
        const parsed = parseFile(file, CategoriesFileSchema, errors);
        if (parsed) catalog.categories.push(...parsed.categories);
        break;
      }
      case 'sources': {
        const parsed = parseFile(file, SourcesFileSchema, errors);
        if (parsed) catalog.sources.push(...parsed.sources);
        break;
      }
      case 'certification': {
        const parsed = parseFile(file, CertificationFileSchema, errors);
        if (parsed) catalog.certifications.push(parsed);
        break;
      }
      case 'service': {
        const parsed = parseFile(file, ServiceFileSchema, errors);
        if (parsed) catalog.services.push({ ...parsed, path: file.path });
        break;
      }
      default:
        errors.push(`${file.path}: unrecognized catalog file location`);
    }
  }

  errors.push(...crossValidate(catalog));
  return { catalog, errors };
}

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function crossValidate(catalog: Catalog): string[] {
  const errors: string[] = [];
  const categories = new Set(catalog.categories.map((c) => c.slug));
  const sources = new Map(catalog.sources.map((s) => [s.key, s]));
  const domains = new Set(
    catalog.certifications.flatMap((c) =>
      c.domains.map((d) => `${c.vendor}/${c.code}/${c.examVersion}#${d.code}`),
    ),
  );
  const services = new Set(catalog.services.map((s) => `${s.provider}/${s.slug}`));

  for (const dup of duplicates(catalog.categories.map((c) => c.slug)))
    errors.push(`categories: duplicate slug ${dup}`);
  for (const dup of duplicates(catalog.sources.map((s) => s.key)))
    errors.push(`sources: duplicate key ${dup}`);
  for (const dup of duplicates([...catalog.services.map((s) => `${s.provider}/${s.slug}`)])) {
    errors.push(`services: duplicate service ${dup}`);
  }
  for (const source of catalog.sources) {
    if (source.type !== 'curated' && !source.url)
      errors.push(`sources: ${source.key}: AWS sources need a url`);
  }
  for (const cert of catalog.certifications) {
    const total = cert.domains.reduce((sum, d) => sum + d.weightPct, 0);
    if (Math.abs(total - 100) > 0.01) {
      errors.push(
        `certifications: ${cert.code}-${cert.examVersion}: domain weights sum to ${total}, not 100`,
      );
    }
    for (const dup of duplicates(cert.domains.map((d) => d.code))) {
      errors.push(`certifications: ${cert.code}-${cert.examVersion}: duplicate domain ${dup}`);
    }
  }

  for (const service of catalog.services) {
    const at = (path: string) => `${service.path}: ${path}`;
    if (!categories.has(service.category))
      errors.push(at(`category: unknown category ${service.category}`));
    if (service.status === 'published' && service.origin === 'ai_draft' && !service.review) {
      errors.push(at('review: AI-drafted services need a review record before publication'));
    }
    service.related.forEach((rel, i) => {
      if (rel.service === service.slug)
        errors.push(at(`related.${i}: a service cannot relate to itself`));
      else if (!services.has(`${service.provider}/${rel.service}`)) {
        errors.push(at(`related.${i}: unknown service ${rel.service}`));
      }
    });
    for (const dup of duplicates(service.concepts.map((c) => c.slug)))
      errors.push(at(`concepts: duplicate slug ${dup}`));

    service.concepts.forEach((concept, i) => {
      const cAt = (path: string) => at(`concepts.${i}(${concept.slug}).${path}`);
      const conceptStatus = concept.status ?? service.status;
      const conceptOrigin = concept.origin ?? service.origin;

      concept.mappings.forEach((m, j) => {
        if (!domains.has(`${m.certification}#${m.domain}`)) {
          errors.push(cAt(`mappings.${j}: unknown domain ${m.certification} ${m.domain}`));
        }
      });
      concept.citations.forEach((citation, j) => {
        if (!sources.has(citation.source))
          errors.push(cAt(`citations.${j}: unknown source ${citation.source}`));
      });

      if (conceptStatus === 'published') {
        if (service.status !== 'published')
          errors.push(cAt('status: a published concept needs a published service'));
        if (conceptOrigin === 'ai_draft' && !concept.review && !service.review) {
          errors.push(cAt('review: AI-drafted concepts need a review record before publication'));
        }
        const unverified = concept.citations.filter((c) => !sources.get(c.source)?.retrievedAt);
        if (unverified.length > 0) {
          errors.push(
            cAt(
              `citations: cite only verified sources (retrievedAt) when published: ${unverified.map((c) => c.source).join(', ')}`,
            ),
          );
        }
        const officialVerbatim = concept.citations.some(
          (c) => c.excerptKind === 'verbatim' && sources.get(c.source)?.type.startsWith('aws_'),
        );
        if (!officialVerbatim) {
          errors.push(
            cAt(
              'citations: a published concept needs at least one verbatim excerpt from an official AWS source',
            ),
          );
        }
      }

      for (const dup of duplicates(concept.questions.map((q) => q.key)))
        errors.push(cAt(`questions: duplicate key ${dup}`));
      concept.questions.forEach((q, j) => {
        if ((q.status ?? conceptStatus) === 'published' && conceptStatus !== 'published') {
          errors.push(cAt(`questions.${j}: a published question needs a published concept`));
        }
      });
    });
  }

  return errors;
}

/** Builds the snake_case payload consumed by public.import_catalog. */
export function toImportPayload(catalog: Catalog) {
  return {
    categories: catalog.categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      sort_order: c.sortOrder,
    })),
    certifications: catalog.certifications.map((c) => ({
      vendor: c.vendor,
      code: c.code,
      exam_version: c.examVersion,
      name: c.name,
      status: c.status,
      exam_guide_url: c.examGuideUrl ?? null,
      domains: c.domains.map((d, i) => ({
        code: d.code,
        name: d.name,
        weight_pct: d.weightPct,
        sort_order: i + 1,
      })),
    })),
    sources: catalog.sources.map((s) => ({
      key: s.key,
      source_type: s.type,
      title: s.title,
      url: s.url ?? null,
      retrieved_at: s.retrievedAt ?? null,
    })),
    services: catalog.services.map((s) => ({
      provider: s.provider,
      slug: s.slug,
      name: s.name,
      aliases: s.aliases,
      category: s.category,
      summary_md: s.summary,
      what_it_is_md: s.dimensions.what ?? null,
      how_it_works_md: s.dimensions.how ?? null,
      problem_solved_md: s.dimensions.problem ?? null,
      how_it_solves_md: s.dimensions.solution ?? null,
      does_not_do_md: s.dimensions.not_do ?? null,
      when_to_choose_md: s.dimensions.when ?? null,
      architecture_placement_md: s.dimensions.where ?? null,
      trade_offs_md: s.dimensions.trade_offs ?? null,
      docs_url: s.docsUrl ?? null,
      status: s.status,
      origin: s.origin,
      related: s.related.map((r) => ({
        service: r.service,
        relation: r.relation,
        note_md: r.note ?? null,
      })),
      concepts: s.concepts.map((c, i) => {
        const conceptStatus = c.status ?? s.status;
        const conceptOrigin = c.origin ?? s.origin;
        return {
          slug: c.slug,
          title: c.title,
          sort_order: i + 1,
          summary_md: c.summary,
          explanation_md: c.explanation,
          examples_md: c.examples ?? null,
          limitations_md: c.limitations ?? null,
          status: conceptStatus,
          origin: conceptOrigin,
          mappings: c.mappings.map((m) => {
            const [vendor, code, examVersion] = m.certification.split('/');
            return {
              vendor,
              code,
              exam_version: examVersion,
              domain: m.domain,
              relevance: m.relevance,
            };
          }),
          citations: c.citations.map((ct) => ({
            source: ct.source,
            excerpt: ct.excerpt,
            excerpt_kind: ct.excerptKind,
            section_path: ct.section ?? null,
            support_type: ct.supports,
          })),
          questions: c.questions.map((q) => ({
            key: q.key,
            dimension: q.dimension,
            difficulty: q.difficulty,
            status: q.status ?? conceptStatus,
            origin: q.origin ?? conceptOrigin,
            prompt_md: q.prompt,
            reference_answer_md: q.referenceAnswer,
            rubric: q.rubric,
            rubric_schema_version: q.rubric.schemaVersion,
          })),
        };
      }),
    })),
  };
}

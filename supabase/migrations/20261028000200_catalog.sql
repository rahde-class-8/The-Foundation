-- Catalog: certifications, domains, categories, services, concepts, questions (DATA_MODEL §4.1).

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  vendor text not null check (vendor in ('aws', 'gcp', 'azure')),
  code text not null check (code ~ '^[A-Z0-9-]{2,20}$'),
  exam_version text not null check (char_length(exam_version) between 1 and 20),
  name text not null check (char_length(name) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'retired')),
  exam_guide_url text check (exam_guide_url ~ '^https://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor, code, exam_version)
);

create table public.exam_domains (
  id uuid primary key default gen_random_uuid(),
  certification_id uuid not null references public.certifications (id) on delete restrict,
  code text not null check (code ~ '^[A-Z0-9-]{1,10}$'),
  name text not null check (char_length(name) between 1 and 200),
  weight_pct numeric(5, 2) check (weight_pct between 0 and 100),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (certification_id, code),
  unique (id, certification_id)
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 1 and 100),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  cloud_provider text not null default 'aws' check (cloud_provider in ('aws', 'gcp', 'azure')),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(name) between 1 and 200),
  aliases text[] not null default '{}',
  category_id uuid not null references public.service_categories (id) on delete restrict,
  summary_md text check (char_length(summary_md) <= 600),
  -- The eight mastery dimensions (PRD §2). Null renders as "Not yet authored".
  what_it_is_md text check (char_length(what_it_is_md) <= 4000),
  how_it_works_md text check (char_length(how_it_works_md) <= 4000),
  problem_solved_md text check (char_length(problem_solved_md) <= 4000),
  how_it_solves_md text check (char_length(how_it_solves_md) <= 4000),
  does_not_do_md text check (char_length(does_not_do_md) <= 4000),
  when_to_choose_md text check (char_length(when_to_choose_md) <= 4000),
  architecture_placement_md text check (char_length(architecture_placement_md) <= 4000),
  trade_offs_md text check (char_length(trade_offs_md) <= 4000),
  docs_url text check (docs_url ~ '^https://'),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'retired')),
  origin text not null default 'manual' check (origin in ('curated', 'ai_draft', 'manual')),
  -- 'catalog' rows are owned by content/catalog and synced by import_catalog; 'app' rows by the app.
  managed_by text not null default 'app' check (managed_by in ('catalog', 'app')),
  search_tsv tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cloud_provider, slug)
);

create table public.service_relationships (
  from_service_id uuid not null references public.services (id) on delete restrict,
  to_service_id uuid not null references public.services (id) on delete restrict,
  relation text not null
    check (relation in ('alternative_to', 'commonly_paired_with', 'prerequisite_for', 'often_confused_with')),
  note_md text check (char_length(note_md) <= 1000),
  created_at timestamptz not null default now(),
  primary key (from_service_id, to_service_id, relation),
  check (from_service_id <> to_service_id)
);

create table public.service_concepts (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(title) between 1 and 200),
  sort_order int not null default 0,
  summary_md text check (char_length(summary_md) <= 600),
  explanation_md text check (char_length(explanation_md) <= 8000),
  examples_md text check (char_length(examples_md) <= 4000),
  limitations_md text check (char_length(limitations_md) <= 4000),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'retired')),
  origin text not null default 'manual' check (origin in ('curated', 'ai_draft', 'manual')),
  -- 'catalog' rows are owned by content/catalog and synced by import_catalog; 'app' rows by the app.
  managed_by text not null default 'app' check (managed_by in ('catalog', 'app')),
  visibility text not null default 'shared' check (visibility in ('shared', 'private')),
  owner_id uuid not null references auth.users (id) on delete restrict,
  revision int not null default 1 check (revision >= 1),
  published_at timestamptz,
  search_tsv tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_id, slug),
  check (status <> 'published' or published_at is not null)
);

-- Append-only snapshot of each published concept revision.
create table public.concept_revisions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.service_concepts (id) on delete restrict,
  revision int not null check (revision >= 1),
  snapshot jsonb not null,
  published_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (concept_id, revision)
);

create table public.concept_certifications (
  concept_id uuid not null references public.service_concepts (id) on delete restrict,
  certification_id uuid not null,
  exam_domain_id uuid not null,
  relevance text not null default 'core' check (relevance in ('core', 'supporting')),
  created_at timestamptz not null default now(),
  primary key (concept_id, exam_domain_id),
  -- Guarantees the domain belongs to the certification.
  foreign key (exam_domain_id, certification_id)
    references public.exam_domains (id, certification_id) on delete restrict
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.service_concepts (id) on delete restrict,
  key text not null check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(key) <= 80),
  question_type text not null default 'open_recall' check (question_type in ('open_recall')),
  dimension text not null
    check (dimension in ('what', 'how', 'problem', 'solution', 'not_do', 'when', 'where', 'trade_offs')),
  difficulty smallint not null default 2 check (difficulty between 1 and 3),
  status text not null default 'draft' check (status in ('draft', 'in_review', 'published', 'retired')),
  origin text not null default 'manual' check (origin in ('curated', 'ai_draft', 'manual')),
  -- 'catalog' rows are owned by content/catalog and synced by import_catalog; 'app' rows by the app.
  managed_by text not null default 'app' check (managed_by in ('catalog', 'app')),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (concept_id, key)
);

-- Immutable: edits create a new version (ADR-0006).
create table public.question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete restrict,
  version int not null check (version >= 1),
  prompt_md text not null check (char_length(prompt_md) between 1 and 2000),
  reference_answer_md text not null check (char_length(reference_answer_md) between 1 and 4000),
  rubric jsonb not null check (jsonb_typeof(rubric) = 'object'),
  rubric_schema_version int not null check (rubric_schema_version >= 1),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (question_id, version),
  unique (question_id, content_hash)
);

alter table public.questions
  add constraint questions_current_version_fk
  foreign key (current_version_id) references public.question_versions (id)
  deferrable initially deferred;

-- Mutable tables keep updated_at current.
create trigger set_updated_at before update on public.certifications
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.exam_domains
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.service_categories
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.services
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.service_concepts
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.questions
  for each row execute function private.set_updated_at();

-- Immutable tables.
create trigger forbid_change before update or delete on public.concept_revisions
  for each row execute function private.forbid_change();
create trigger forbid_change before update or delete on public.question_versions
  for each row execute function private.forbid_change();

-- Search vectors: names and aliases use the 'simple' config (exact tokens such as "ELB"),
-- prose uses 'english' (stemming).
create function private.services_search_tsv() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('simple'::regconfig,
      coalesce(new.name, '') || ' ' || coalesce(array_to_string(new.aliases, ' '), '') || ' ' || replace(new.slug, '-', ' ')), 'A')
    || setweight(to_tsvector('english'::regconfig, coalesce(new.name, '')), 'A')
    || setweight(to_tsvector('english'::regconfig, coalesce(new.summary_md, '')), 'C');
  return new;
end;
$$;

create trigger services_search_tsv before insert or update of name, aliases, slug, summary_md on public.services
  for each row execute function private.services_search_tsv();

create function private.concepts_search_tsv() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('simple'::regconfig, coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('english'::regconfig, coalesce(new.title, '')), 'A')
    || setweight(to_tsvector('english'::regconfig, coalesce(new.summary_md, '')), 'B')
    || setweight(to_tsvector('english'::regconfig,
         coalesce(new.explanation_md, '') || ' ' || coalesce(new.limitations_md, '')), 'D');
  return new;
end;
$$;

create trigger concepts_search_tsv
  before insert or update of title, summary_md, explanation_md, limitations_md on public.service_concepts
  for each row execute function private.concepts_search_tsv();

-- Indexes (DATA_MODEL §5).
create index services_search_tsv_idx on public.services using gin (search_tsv);
create index services_name_trgm_idx on public.services using gin (name extensions.gin_trgm_ops);
create index services_category_idx on public.services (category_id, name, id);
create index service_concepts_search_tsv_idx on public.service_concepts using gin (search_tsv);
create index service_concepts_service_idx on public.service_concepts (service_id, status, sort_order);
create index concept_certifications_domain_idx on public.concept_certifications (exam_domain_id);
create index questions_concept_idx on public.questions (concept_id, status);
create index service_relationships_to_idx on public.service_relationships (to_service_id);

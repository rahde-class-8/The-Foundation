-- Content sources, passages, and concept citations (DATA_MODEL §4.2, CONTENT_GOVERNANCE §2).

create table public.content_sources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete restrict,
  -- Stable key for curated sources defined in content/catalog (null for uploads and notes).
  catalog_key text unique check (catalog_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  source_type text not null
    check (source_type in ('aws_documentation', 'aws_whitepaper', 'aws_faq', 'curated', 'user_note', 'user_upload')),
  visibility text not null default 'shared' check (visibility in ('shared', 'private')),
  title text not null check (char_length(title) between 1 and 300),
  url text check (url ~ '^https://'),
  storage_path text,
  mime_type text,
  byte_size bigint check (byte_size >= 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count int check (page_count >= 0),
  note_body_md text check (char_length(note_body_md) <= 50000),
  -- When the cited page was last checked against its excerpts; null = not yet verified.
  retrieved_at timestamptz,
  status text not null default 'ready' check (status in ('pending', 'ready', 'failed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_type not in ('user_note', 'user_upload') or visibility = 'private'),
  check (source_type not like 'aws\_%' or url is not null),
  check (source_type <> 'user_upload' or storage_path is not null),
  unique (owner_id, sha256)
);

create table public.source_passages (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.content_sources (id) on delete restrict,
  ordinal int not null check (ordinal >= 1),
  -- 'verbatim' quotes the source; 'paraphrase' summarizes it and must not be presented as a quotation.
  excerpt_kind text not null default 'verbatim' check (excerpt_kind in ('verbatim', 'paraphrase')),
  page_start int check (page_start >= 1),
  page_end int,
  section_path text check (char_length(section_path) <= 300),
  char_start int check (char_start >= 0),
  char_end int,
  text text not null check (char_length(text) between 1 and 4000),
  text_hash text not null check (text_hash ~ '^[0-9a-f]{64}$'),
  search_tsv tsvector generated always as (to_tsvector('english'::regconfig, text)) stored,
  created_at timestamptz not null default now(),
  check (page_end is null or page_end >= page_start),
  check (char_end is null or char_end >= char_start),
  unique (source_id, ordinal),
  unique (source_id, text_hash)
);

create table public.concept_sources (
  concept_id uuid not null references public.service_concepts (id) on delete restrict,
  passage_id uuid not null references public.source_passages (id) on delete restrict,
  support_type text not null check (support_type in ('defines', 'example', 'limitation', 'evidence')),
  created_at timestamptz not null default now(),
  primary key (concept_id, passage_id, support_type)
);

create trigger set_updated_at before update on public.content_sources
  for each row execute function private.set_updated_at();
create trigger forbid_change before update or delete on public.source_passages
  for each row execute function private.forbid_change();

create index source_passages_search_tsv_idx on public.source_passages using gin (search_tsv);
create index concept_sources_passage_idx on public.concept_sources (passage_id);
create index content_sources_owner_idx on public.content_sources (owner_id, source_type);

-- Review state (DATA_MODEL §4.3). Phase 1 uses only the exposure columns ("studied", LIB-7);
-- scheduling columns are written by apply_review_transition from Phase 2.
create table public.review_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  concept_id uuid not null references public.service_concepts (id) on delete restrict,
  is_active boolean not null default true,
  mastery_status text not null default 'new'
    check (mastery_status in ('new', 'learning', 'reviewing', 'mastered', 'lapsed')),
  interval_days int not null default 0 check (interval_days >= 0),
  ease numeric(4, 2) not null default 2.50 check (ease between 1.30 and 3.00),
  consecutive_cold_passes int not null default 0 check (consecutive_cold_passes >= 0),
  lapse_count int not null default 0 check (lapse_count >= 0),
  pre_lapse_interval_days int check (pre_lapse_interval_days >= 0),
  total_cold_attempts int not null default 0 check (total_cold_attempts >= 0),
  last_cold_grade text check (last_cold_grade in ('pass', 'partial', 'miss')),
  last_reviewed_at timestamptz,
  first_studied_at timestamptz,
  last_exposure_at timestamptz,
  due_at timestamptz,
  manual_due_override boolean not null default false,
  version int not null default 0 check (version >= 0),
  config_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index review_state_one_active on public.review_state (user_id, concept_id) where is_active;
create index review_state_due_idx on public.review_state (user_id, due_at) where is_active;
create index review_state_status_idx on public.review_state (user_id, mastery_status) where is_active;

create trigger set_updated_at before update on public.review_state
  for each row execute function private.set_updated_at();

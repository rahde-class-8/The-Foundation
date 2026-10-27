# Directory Structure

**Status:** The skeleton exists as empty directories (with `.gitkeep` placeholders). No code, configuration, or dependencies have been added.
It implements SYSTEM_ARCHITECTURE §8.

```text
aws-architecture-muscle-memory/
├── .github/workflows/            # CI pipelines (Phase 0)
├── content/catalog/saa/          # Curated SAA catalog YAML: services, concepts, questions, rubrics, citations (ADR-0007)
├── docs/                         # Planning and project documentation
├── public/                       # Static assets served as-is by Vite
├── scripts/                      # Node scripts: catalog validate/import, type generation, AI calibration
├── src/                          # React SPA
│   ├── app/
│   │   ├── layout/               # App shell, navigation
│   │   ├── providers/            # QueryClient, auth/session, theme providers
│   │   └── router/               # Route table, auth guard
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives
│   │   └── common/               # App-wide components (QueryBoundary, Markdown renderer, badges)
│   ├── features/                 # One folder per feature/route; UI only, no business rules
│   │   ├── auth/                 #   /login
│   │   ├── dashboard/            #   /dashboard
│   │   ├── services/             #   /services, /services/:id
│   │   ├── practice/             #   /practice
│   │   ├── reviews/              #   /reviews (Weak Box)
│   │   ├── content/              #   /content
│   │   └── settings/             #   /settings
│   │       └── {components,api,hooks,routes}/   # same four subfolders in every feature
│   ├── lib/                      # Supabase client, env validation, generated DB types
│   ├── styles/                   # Tailwind entry and global CSS
│   └── test/                     # RTL/Vitest helpers and test utilities
├── supabase/
│   ├── migrations/               # Forward-only SQL migrations (written only after data-model approval)
│   ├── tests/                    # pgTAP: RLS, constraints, transition functions
│   └── functions/
│       ├── _shared/
│       │   ├── core/             # Pure TS domain core, imported by the SPA as @core (ADR-0002)
│       │   │   ├── scheduler/    #   Spaced repetition (SPACED_REPETITION.md)
│       │   │   ├── grading/      #   Rubric grade derivation and validation (GRADING_RUBRICS.md)
│       │   │   ├── selection/    #   Question selection and ranking (MASTERY_MODEL §5)
│       │   │   ├── correction/   #   Correction planning
│       │   │   ├── analytics/    #   Metric formulas (MASTERY_MODEL §6)
│       │   │   └── contracts/    #   Shared Zod schemas for API contracts
│       │   ├── ai/
│       │   │   ├── adapters/     #   Provider adapters (anthropic, mock, …) (ADR-0004)
│       │   │   ├── prompts/
│       │   │   │   ├── grading/      # Versioned grading prompts (v1, v2, …)
│       │   │   │   └── generation/   # Versioned draft-generation prompts
│       │   │   └── calibration/  #   Labeled grading calibration set
│       │   ├── db/               #   Typed queries using the caller's JWT
│       │   └── http/             #   Request validation, error envelope, CORS
│       ├── evaluate-attempt/     # Edge Function: AI grading
│       ├── finalize-attempt/     # Edge Function: finalize + schedule
│       ├── override-schedule/    # Edge Function: manual reschedule
│       ├── ingest-source/        # Edge Function: PDF/note extraction into passages
│       └── generate-drafts/      # Edge Function: AI draft concepts (always draft status)
└── tests/
    ├── e2e/                      # Playwright (golden path, failure paths, a11y)
    ├── integration/              # Vitest against local Supabase
    └── fixtures/
        ├── pdfs/                 #   Valid and malformed PDFs (CONTENT_GOVERNANCE §5)
        ├── ai/                   #   Recorded provider responses, injection cases
        └── histories/            #   Learning-history fixtures for scheduler/analytics parity
```

## Boundary rules
- `src/features/*` must not import another feature's internals. Shared pieces move to `src/components/common` or `src/lib`.
- `supabase/functions/_shared/core` must not import from `src/`, Deno/Node globals, or I/O (enforced by an ESLint rule in Phase 0).
- Edge Function folders contain only an entry point that wires `_shared` modules together.

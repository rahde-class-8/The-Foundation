// Single entry point for the core's runtime dependencies (ADR-0002).
// Node/Vite resolve 'zod' from node_modules; Deno resolves it through supabase/functions/**/deno.json.
export { z } from 'zod';

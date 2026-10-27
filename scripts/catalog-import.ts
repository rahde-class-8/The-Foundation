// Loads content/catalog into the LOCAL Supabase stack (idempotent).
// Usage: npm run catalog:import [-- --expect-no-changes] [-- --fixture perf] [-- --emit-json <file>]
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { readCatalogFiles } from './lib/catalog/files.ts';
import { loadCatalog, toImportPayload } from './lib/catalog/load.ts';
import { withPerfFixture } from './lib/catalog/perf-fixture.ts';
import { readLocalSupabase } from './lib/local-supabase.ts';

const { values: args } = parseArgs({
  options: {
    'expect-no-changes': { type: 'boolean', default: false },
    fixture: { type: 'string' },
    'emit-json': { type: 'string' },
  },
});

const { catalog: loaded, errors } = loadCatalog(readCatalogFiles());
if (errors.length > 0) {
  console.error('Catalog is invalid; run "npm run catalog:validate" for details.');
  process.exit(1);
}

if (args.fixture && args.fixture !== 'perf') {
  console.error(`Unknown fixture "${args.fixture}".`);
  process.exit(2);
}
const catalog = args.fixture === 'perf' ? withPerfFixture(loaded) : loaded;
const payload = toImportPayload(catalog);

if (args['emit-json']) {
  writeFileSync(args['emit-json'], JSON.stringify(payload));
  console.log(`Wrote import payload to ${args['emit-json']}.`);
  process.exit(0);
}

const { apiUrl, serviceRoleKey } = readLocalSupabase();
const admin = createClient(apiUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: users, error: usersError } = await admin.auth.admin.listUsers();
if (usersError) throw usersError;
const owner = users.users.find((user) => user.app_metadata.role === 'owner');
if (!owner) {
  console.error('No owner account found. Run "npm run db:create-owner" first.');
  process.exit(1);
}

const { data, error } = await admin.rpc('import_catalog', {
  p_catalog: payload,
  p_owner_id: owner.id,
});
if (error) {
  console.error(`Import failed: ${error.message}`);
  process.exit(1);
}

const changes = data as Record<string, number>;
const total = Object.values(changes).reduce((sum, n) => sum + n, 0);
console.log(`Catalog import complete: ${total} change(s).`);
for (const [table, count] of Object.entries(changes))
  if (count > 0) console.log(`  ${table}: ${count}`);

if (args['expect-no-changes'] && total > 0) {
  console.error('Expected an idempotent re-run with no changes.');
  process.exit(1);
}

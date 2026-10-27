import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Each Edge Function bundles with its own deno.json; they must match the shared import map.
const root = 'supabase/functions';
const shared = JSON.parse(readFileSync(join(root, 'deno.json'), 'utf8')) as {
  imports: Record<string, string>;
};

describe('Edge Function import maps', () => {
  const functions = readdirSync(root).filter(
    (name) =>
      !name.startsWith('_') &&
      statSync(join(root, name)).isDirectory() &&
      readdirSync(join(root, name)).includes('index.ts'),
  );

  it.each(functions)('%s/deno.json matches supabase/functions/deno.json', (name) => {
    const own = JSON.parse(readFileSync(join(root, name, 'deno.json'), 'utf8')) as {
      imports: Record<string, string>;
    };
    expect(own.imports).toEqual(shared.imports);
  });

  it('pins the same zod and SDK major versions as package.json', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    const major = (range: string) => range.replace(/^[^\d]*/, '').split('.')[0];
    expect(major(shared.imports.zod ?? '')).toBe(major(all.zod ?? ''));
    expect(major((shared.imports['@anthropic-ai/sdk'] ?? '').split('@').pop() ?? '')).toBe(
      major(all['@anthropic-ai/sdk'] ?? ''),
    );
  });
});

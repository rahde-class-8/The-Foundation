import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CatalogFile } from './load.ts';

export const CATALOG_DIR = 'content/catalog';

/** Reads every YAML file under the catalog directory (paths are repo-relative). */
export function readCatalogFiles(root = CATALOG_DIR): CatalogFile[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  return walk(root)
    .filter((path) => /\.ya?ml$/.test(path))
    .map((path) => ({ path: relative('.', path), content: readFileSync(path, 'utf8') }));
}

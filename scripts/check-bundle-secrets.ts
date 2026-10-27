// Fails when server-only credentials appear in the client build. Usage: node scripts/check-bundle-secrets.ts [dir]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scanText, type SecretFinding } from './lib/secret-scan.ts';

const root = process.argv[2] ?? 'dist';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

let files: string[];
try {
  files = listFiles(root);
} catch {
  console.error(`Build output not found at "${root}". Run "npm run build" first.`);
  process.exit(2);
}

const findings: SecretFinding[] = files
  .filter((file) => /\.(js|mjs|css|html|map|json|txt)$/.test(file))
  .flatMap((file) => scanText(file, readFileSync(file, 'utf8')));

if (findings.length > 0) {
  console.error('Server-only secrets found in client build output:');
  for (const finding of findings)
    console.error(`  ${finding.file}: ${finding.kind} (${finding.excerpt})`);
  process.exit(1);
}

console.log(`No secrets found in ${files.length} files under ${root}.`);

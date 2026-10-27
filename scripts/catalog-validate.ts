// Validates content/catalog. Usage: npm run catalog:validate
import { readCatalogFiles } from './lib/catalog/files.ts';
import { loadCatalog } from './lib/catalog/load.ts';

const files = readCatalogFiles();
const { catalog, errors } = loadCatalog(files);

if (errors.length > 0) {
  console.error(`Catalog validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}

const concepts = catalog.services.flatMap((s) => s.concepts);
const questions = concepts.flatMap((c) => c.questions);
console.log(
  `Catalog OK: ${files.length} files, ${catalog.services.length} services, ${concepts.length} concepts, ` +
    `${questions.length} questions, ${catalog.sources.length} sources.`,
);

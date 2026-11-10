import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { artifactFiles } from './render-core.js';
export { renderMarkdown } from './render-core.js';
export function writeArtifacts(bundle, status, outputDirectory, options = {}) {
  mkdirSync(outputDirectory, { recursive: true });
  for (const file of artifactFiles(bundle, status, options)) writeFileSync(join(outputDirectory, file.name), file.bytes);
  return outputDirectory;
}

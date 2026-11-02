// Project scaffolding uses only Node built-ins, including on an uninstalled copy.
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function initBook({ target, title, author, templates }) {
  // Check every name before creating anything. lstat also sees a dangling link,
  // which must never become a destination for a scaffold write.
  for (const name of ['AGENTS.md', 'book-config.yaml', 'chapters', 'assets']) {
    try {
      lstatSync(join(target, name));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw new Error(`a book project already exists at ${target} (${name} is present). Choose a new target; init never overwrites a project.`);
  }
  const values = {
    title: JSON.stringify(title), heading: title, author: JSON.stringify(author),
    completionCondition: 'Awaiting its owner.',
    productionRequirements: 'Awaiting its owner.',
    manuscriptChanges: 'Awaiting its owner.'
  };
  const render = (name) => {
    const template = readFileSync(join(templates, name), 'utf8');
    const text = template.replace(/\{\{(\w+)\}\}/g, (token, key) => {
      if (!(key in values)) throw new Error(`unknown substitution ${token} in ${name}. Repair the template before running init.`);
      return values[key];
    });
    if (name === 'book-AGENTS.md') {
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
      if (!frontmatter || /^(?:root|type|toolVersion)\s*:/mi.test(frontmatter) || /^## Provides\s*$/m.test(text)) {
        throw new Error('invalid book-AGENTS.md template. Keep only the book title in frontmatter and omit Provides.');
      }
    }
    return text;
  };
  // Read and render everything first, so a missing/broken template writes none.
  const agents = render('book-AGENTS.md');
  const config = render('book-config.yaml');
  const chapter = render('first-chapter.md');
  mkdirSync(target, { recursive: true });
  mkdirSync(join(target, 'chapters'));
  mkdirSync(join(target, 'assets'));
  writeFileSync(join(target, 'AGENTS.md'), agents, { flag: 'wx' });
  writeFileSync(join(target, 'book-config.yaml'), config, { flag: 'wx' });
  writeFileSync(join(target, 'chapters', '01-first-chapter.md'), chapter, { flag: 'wx' });
  return { ok: true, project: target, config: join(target, 'book-config.yaml'), title, indexStrategy: 'none' };
}

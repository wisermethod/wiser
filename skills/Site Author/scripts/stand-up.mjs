#!/usr/bin/env node
// Stand up a site envelope from the existing kit. Not a Wiser tool.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { exists, reject, parentFor, safeTree, noLinks, templateText, prepareMemory, writeEnvelope } from './envelope.mjs';

const widthValues = ['narrow', 'wide'];
const sectionsValues = ['column', 'bands'];
const menuValues = ['links', 'button'];
const articlesValues = ['home', 'page', 'both', 'none'];
const headlineValues = ['title', 'page'];

function expectOne(flag, value, allowed) {
  if (value === undefined) return;
  if (!allowed.includes(value)) reject(`--${flag} must be ${allowed.join(' or ')}: ${value}`);
}
function yamlString(value) {
  return JSON.stringify(value);
}
function patchStarterIndex(file, { hideTitle, suppressList }) {
  if (!hideTitle && !suppressList) return;
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) reject('starter index.md is missing frontmatter');
  let front = match[1];
  const body = match[2].replace(/^\n/, '');
  const titleMatch = front.match(/^title:\s*(.+)$/m);
  if (!titleMatch) reject('starter index.md is missing a title');
  const title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
  if (suppressList) front += '\nlistArticles: false';
  if (hideTitle) front += '\nshowTitle: false';
  const nextBody = hideTitle ? `# ${title}\n\n${body}` : body;
  const written = `---\n${front}\n---\n\n${nextBody}`;
  fs.writeFileSync(file, written.endsWith('\n') ? written : `${written}\n`);
}

try {
  const { values } = parseArgs({ options: {
    root: { type: 'string' },
    domain: { type: 'string' },
    'site-url': { type: 'string' },
    kit: { type: 'string' },
    work: { type: 'string' },
    magazine: { type: 'boolean', default: false },
    width: { type: 'string' },
    sections: { type: 'string' },
    'brand-text': { type: 'string' },
    'sticky-header': { type: 'boolean' },
    menu: { type: 'string' },
    'site-name': { type: 'string' },
    articles: { type: 'string' },
    'articles-page': { type: 'string' },
    'articles-title': { type: 'string' },
    headline: { type: 'string' },
  } });
  if (!values.root || !values.domain || !values['site-url'] || !values.kit) reject('required: --root --domain --site-url --kit');
  expectOne('width', values.width, widthValues);
  expectOne('sections', values.sections, sectionsValues);
  expectOne('menu', values.menu, menuValues);
  expectOne('articles', values.articles, articlesValues);
  expectOne('headline', values.headline, headlineValues);
  if (values['brand-text'] !== undefined && values['brand-text'].trim() === '') reject('--brand-text must be a non-empty string');
  if (values['site-name'] !== undefined && values['site-name'].trim() === '') reject('--site-name must be a non-empty string');
  if (values['articles-title'] !== undefined && values['articles-title'].trim() === '') reject('--articles-title must be a non-empty string');
  const articlesMode = values.articles ?? 'home';
  const headline = values.headline ?? 'title';
  const articlesPage = values['articles-page'];
  if ((articlesMode === 'page' || articlesMode === 'both') && !articlesPage) reject('--articles-page is required when --articles is page or both');
  if (articlesPage !== undefined && (!/^[a-z0-9-]+$/.test(articlesPage) || !/[a-z0-9]/.test(articlesPage) || articlesPage === 'index' || articlesPage === '404')) {
    reject(`--articles-page must be one lowercase segment of letters, digits and hyphens, not index or 404: ${articlesPage}`);
  }
  const root = path.resolve(values.root), kit = path.resolve(values.kit), domain = values.domain, siteUrl = values['site-url'];
  if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) reject(`domain must be a lowercase registrable host, no scheme: ${domain}`);
  const origin = new URL(siteUrl);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== siteUrl) reject(`site-url must be an HTTP(S) origin, no path, query, credentials or trailing slash: ${siteUrl}`);
  const parent = parentFor(root, values.work), dest = path.join(parent, 'sites', domain);
  noLinks(dest);
  safeTree(dest);
  if (exists(dest)) {
    if (exists(path.join(dest, 'site/kit.json'))) reject(`${dest} already is an envelope. Upgrade, do not stand up`);
    if (exists(path.join(dest, 'kit.json'))) reject('Milestone 1 to 3 shape: wrap to envelope, or declare foreign. Do not stand up');
    reject(`foreign folder (no kit.json) at ${dest}. Leaving it untouched`);
  }
  if (!exists(path.join(kit, 'KIT.md')) || !exists(path.join(kit, 'package.json'))) reject(`kit at ${kit} is missing KIT.md or package.json`);
  const template = templateText(kit);
  prepareMemory(root, dest);
  const skip = new Set(['node_modules', 'dist', '.astro', '.git', 'site-AGENTS.md', 'AGENTS.md', 'memory', 'builds.md', 'zArchive']);
  function copyTree(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const name of fs.readdirSync(from)) {
      if (skip.has(name)) continue;
      const src = path.join(from, name), out = path.join(to, name), stat = fs.lstatSync(src);
      if (stat.isSymbolicLink()) reject(`symbolic link in kit: ${src}`);
      if (stat.isDirectory()) copyTree(src, out); else fs.copyFileSync(src, out);
    }
  }
  copyTree(kit, path.join(dest, 'site'));
  const layoutGiven = values.width !== undefined || values.sections !== undefined || values['brand-text'] !== undefined || values['sticky-header'] === true || values.menu !== undefined;
  const articlesTitle = values['articles-title'] ?? 'Articles';
  let layout;
  if (layoutGiven) {
    const header = {
      ...(values['brand-text'] ? { brand: { text: values['brand-text'] } } : {}),
      sticky: values['sticky-header'] === true,
      menu: values.menu ?? 'links',
    };
    layout = { width: values.width ?? 'narrow', sections: values.sections ?? 'column', header };
  }
  const config = { kitVersion: '0.2.0', domain, siteUrl, collections: { pages: true, articles: articlesMode !== 'none', authors: true, sections: values.magazine, issues: values.magazine } };
  if (values['site-name']) config.siteName = values['site-name'];
  if (layout) config.layout = layout;
  if (articlesMode === 'page' || articlesMode === 'both') {
    const pageFile = path.join(dest, 'site/src/content/pages', `${articlesPage}.md`);
    const description = `Articles published on ${domain}.`;
    fs.writeFileSync(pageFile, `---\ntitle: ${yamlString(articlesTitle)}\ndescription: ${yamlString(description)}\nlistArticles: true\n---\n\n${description}\n`);
    config.footer = [{ label: articlesTitle, href: `/${articlesPage}` }];
  }
  fs.writeFileSync(path.join(dest, 'site/kit.json'), JSON.stringify(config, null, 2) + '\n');
  if (articlesMode === 'none') {
    const articlesDir = path.join(dest, 'site/src/content/articles');
    if (exists(articlesDir)) {
      for (const name of fs.readdirSync(articlesDir)) fs.rmSync(path.join(articlesDir, name), { recursive: true, force: true });
    }
  }
  patchStarterIndex(path.join(dest, 'site/src/content/pages/index.md'), { hideTitle: headline === 'page', suppressList: articlesMode === 'page' });
  writeEnvelope(root, dest, config, template);
  const choices = [`kitVersion ${config.kitVersion}`];
  if (layout) {
    choices.push(`width ${layout.width}`, `sections ${layout.sections}`);
    choices.push(layout.header.brand ? `brand "${layout.header.brand.text}"` : 'no brand');
    choices.push(layout.header.sticky ? 'sticky header' : 'sticky header off', `menu ${layout.header.menu}`);
  } else choices.push('no layout');
  if (config.siteName) choices.push(`siteName "${config.siteName}"`);
  choices.push(`articles ${articlesMode}`);
  if (articlesMode === 'page' || articlesMode === 'both') choices.push(`articles page ${articlesPage}`, `articles title "${articlesTitle}"`);
  choices.push(`headline ${headline}`);
  console.log(`stand-up: choices ${choices.join(', ')}`);
  console.log(`stand-up: wrote ${dest}`);
  console.log(`stand-up: run npm install and npm run dev in ${path.join(dest, 'site')}. check is next. No git init.`);
} catch (error) { console.error(`stand-up: ${error.message}`); process.exit(1); }

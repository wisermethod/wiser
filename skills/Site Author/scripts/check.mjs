#!/usr/bin/env node
// Walk KIT.md check steps 1 to 5. Step 6's served-HTML fetch is a later fetch.
// --built, before or after the envelope, also reads site/dist/ for nested anchors and a stale build.
// Not a Wiser tool. Fail closed.
import fs from "node:fs";
import path from "node:path";

import { currentKit } from "./envelope.mjs";

const CHECK_VERSION = "0.2.2";
const KNOWN_VERSIONS = ["0.1.0", "0.2.0", "0.2.1", "0.2.2"];
// feature, version introduced. A later release adds a row.
const introduced = [
  { feature: "layout", version: "0.2.0" },
  { feature: "style", version: "0.2.0" },
  { feature: "showTitle", version: "0.2.0" },
  { feature: "listArticles", version: "0.2.0" },
  { feature: "ConversationPlayer", version: "0.2.0" },
  { feature: "collections.articles false", version: "0.2.0" },
];

const args = process.argv.slice(2);
let built = false;
const positionals = [];
for (const arg of args) {
  if (arg === "--built") built = true;
  else if (arg.startsWith("-")) {
    console.error("usage: node check.mjs [--built] <envelope-folder>");
    process.exit(2);
  } else positionals.push(arg);
}
if (positionals.length !== 1) {
  console.error("usage: node check.mjs [--built] <envelope-folder>");
  process.exit(2);
}
const envelope = path.resolve(positionals[0]);

let site;
try { site = currentKit(envelope); }
catch (error) { console.error(`check FAIL ${envelope}: ${error.message}`); process.exit(1); }

const failures = [];
function fail(msg) {
  failures.push(msg);
}

if (fs.existsSync(path.join(site, ".git"))) fail("nested .git inside the domain folder");

const kitMd = path.join(site, "KIT.md");
if (!fs.existsSync(kitMd)) fail("missing KIT.md");

const kitJsonPath = path.join(site, "kit.json");
if (!fs.existsSync(kitJsonPath)) fail("missing kit.json");
let kit;
try {
  kit = JSON.parse(fs.readFileSync(kitJsonPath, "utf8"));
} catch (err) {
  fail(`kit.json is not JSON: ${err.message}`);
  kit = {};
}

if (!KNOWN_VERSIONS.includes(kit.kitVersion)) {
  const shown = typeof kit.kitVersion === "string" && kit.kitVersion !== "" ? kit.kitVersion : "missing";
  fail(`kitVersion ${shown} is not one of ${KNOWN_VERSIONS.join(", ")}: run Upgrade`);
}
function tooOld(feature, where) {
  const row = introduced.find((item) => item.feature === feature);
  if (!row || !KNOWN_VERSIONS.includes(kit.kitVersion)) return;
  if (KNOWN_VERSIONS.indexOf(kit.kitVersion) >= KNOWN_VERSIONS.indexOf(row.version)) return;
  fail(`${where} uses ${feature}, which kitVersion ${row.version} introduced: run Upgrade`);
}

function hrefProblem(href) {
  if (typeof href !== "string" || href === "") return "must be a non-empty string";
  if (/[\u0000-\u001f\u007f\s\\]/.test(href)) return "must not contain whitespace, control characters or backslashes";
  if (href.startsWith("/")) return href.startsWith("//") ? "must be a site path, not // (protocol-relative)" : null;
  if (href.startsWith("https://")) {
    try { const u = new URL(href); return u.protocol === "https:" && u.hostname ? null : "must be a valid https:// URL"; } catch { return "must be a valid https:// URL"; }
  }
  if (href.startsWith("mailto:")) return /^mailto:[^@]+@[^@]+$/.test(href) ? null : "must be mailto:<address>";
  return "must start with / (a site path), https://, or mailto:";
}

function checkLinkList(key) {
  if (!Object.hasOwn(kit, key)) return;
  const list = kit[key];
  if (!Array.isArray(list)) {
    fail(`kit.json ${key} must be an array of {label, href}`);
    return;
  }
  list.forEach((item, i) => {
    const where = `kit.json ${key}[${i}]`;
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      fail(`${where} must be an object with a non-empty label and an href`);
      return;
    }
    if (typeof item.label !== "string" || item.label.trim() === "") fail(`${where}.label must be a non-empty string`);
    const problem = hrefProblem(item.href);
    if (problem) fail(`${where}.href ${problem}`);
    if (Object.hasOwn(item, "style")) {
      tooOld("style", `${where}.style`);
      if (item.style !== "button") fail(`${where}.style must be button`);
    }
  });
}
checkLinkList("nav");
checkLinkList("footer");
if (Object.hasOwn(kit, "siteName") && (typeof kit.siteName !== "string" || kit.siteName.trim() === "")) fail("kit.json siteName must be a non-empty string");

function checkLogo(logo) {
  const where = "kit.json layout.header.brand.logo";
  if (typeof logo !== "string" || !logo.startsWith("/images/") || logo.includes("..") || logo.includes("\\") || logo.includes("?") || logo.includes("#")) {
    fail(`${where} must be a path starting /images/, with no .., no backslash, no query and no fragment`);
    return;
  }
  let rel;
  try { rel = decodeURIComponent(logo.slice("/images/".length)); } catch { rel = null; }
  if (rel === null || rel.includes("\\")) {
    fail(`${where} must be a path starting /images/, with no .., no backslash and no query`);
    return;
  }
  const parts = rel.split("/");
  if (rel === "" || parts.some((part) => part === "" || part === "." || part === "..")) {
    fail(`${where} must be a path starting /images/, with no .., no backslash and no query`);
    return;
  }
  const imagesRoot = path.resolve(site, "public", "images");
  const file = path.resolve(imagesRoot, ...parts);
  const relTo = path.relative(imagesRoot, file);
  if (relTo === ".." || relTo.startsWith(`..${path.sep}`) || path.isAbsolute(relTo) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    fail(`${where} file is missing under public/images/: ${logo}`);
  }
}
function checkBrand(brand) {
  if (brand === null || typeof brand !== "object" || Array.isArray(brand)) {
    fail("kit.json layout.header.brand must be an object");
    return;
  }
  for (const key of Object.keys(brand)) {
    if (key !== "text" && key !== "logo") fail(`kit.json layout.header.brand.${key} is not allowed`);
  }
  const hasText = Object.hasOwn(brand, "text");
  const hasLogo = Object.hasOwn(brand, "logo");
  if (!hasText && !hasLogo) fail("kit.json layout.header.brand needs a text, a logo, or both");
  if (hasText && (typeof brand.text !== "string" || brand.text.trim() === "")) fail("kit.json layout.header.brand.text must be a non-empty string");
  if (hasLogo) checkLogo(brand.logo);
}
function checkLayout(layout) {
  if (layout === null || typeof layout !== "object" || Array.isArray(layout)) {
    fail("kit.json layout must be an object");
    return;
  }
  for (const key of Object.keys(layout)) {
    if (key !== "width" && key !== "sections" && key !== "header") fail(`kit.json layout.${key} is not allowed`);
  }
  if (Object.hasOwn(layout, "width") && layout.width !== "narrow" && layout.width !== "wide") fail("kit.json layout.width must be narrow or wide");
  if (Object.hasOwn(layout, "sections") && layout.sections !== "column" && layout.sections !== "bands") fail("kit.json layout.sections must be column or bands");
  if (!Object.hasOwn(layout, "header")) return;
  const header = layout.header;
  if (header === null || typeof header !== "object" || Array.isArray(header)) {
    fail("kit.json layout.header must be an object");
    return;
  }
  for (const key of Object.keys(header)) {
    if (key !== "brand" && key !== "sticky" && key !== "menu") fail(`kit.json layout.header.${key} is not allowed`);
  }
  if (Object.hasOwn(header, "sticky") && typeof header.sticky !== "boolean") fail("kit.json layout.header.sticky must be a boolean");
  if (Object.hasOwn(header, "menu") && header.menu !== "links" && header.menu !== "button") fail("kit.json layout.header.menu must be links or button");
  if (Object.hasOwn(header, "brand")) checkBrand(header.brand);
}
if (Object.hasOwn(kit, "layout")) {
  tooOld("layout", "kit.json layout");
  checkLayout(kit.layout);
}
if (kit.collections === null || typeof kit.collections !== "object" || Array.isArray(kit.collections)) fail("kit.json collections must be an object of true or false values");
else {
  for (const [name, value] of Object.entries(kit.collections)) {
    if (typeof value !== "boolean") fail(`kit.json collections.${name} must be true or false`);
  }
  // The kit reads a missing articles key as on, so a site without one has articles nobody chose.
  if (!Object.hasOwn(kit.collections, "articles")) fail("kit.json collections.articles is missing: set it to true or false, because whether the site has an articles or blog section is the requester's choice");
}
const envelopeRouter = fs.existsSync(path.join(envelope, "AGENTS.md")) ? fs.readFileSync(path.join(envelope, "AGENTS.md"), "utf8") : "";
if (Object.hasOwn(kit, "layout") && !envelopeRouter.includes("`layout`")) fail("kit.json sets layout, but the envelope AGENTS.md does not mention it: refresh its Content vs code section from site-AGENTS.md");
if (kit.collections && kit.collections.articles === false) {
  tooOld("collections.articles false", "kit.json collections.articles");
  if (!envelopeRouter.includes("`collections.articles`")) fail("kit.json sets collections.articles to false, but the envelope AGENTS.md does not mention it: refresh its Content vs code section from site-AGENTS.md");
}
if (Object.hasOwn(kit, "nav") || Object.hasOwn(kit, "footer")) {
  const layoutPath = path.join(site, "src", "layouts", "SiteLayout.astro");
  const layout = fs.existsSync(layoutPath) ? fs.readFileSync(layoutPath, "utf8") : "";
  if (!layout.includes("site.nav.map(") || !layout.includes("site.footer.map(")) fail("kit.json sets nav or footer, but src/layouts/SiteLayout.astro does not render them: run Upgrade");
  const routerPath = path.join(envelope, "AGENTS.md");
  const router = fs.existsSync(routerPath) ? fs.readFileSync(routerPath, "utf8") : "";
  if (!router.includes("`nav`") || !router.includes("`footer`")) fail("kit.json sets nav or footer, but the envelope AGENTS.md predates them and still refuses every kit.json edit: refresh its Content vs code section from site-AGENTS.md");
}
if (!kit.siteUrl) fail("kit.json siteUrl missing");
else if (typeof kit.siteUrl !== "string") fail("kit.json siteUrl is not a string");
else if (kit.siteUrl.endsWith("/")) fail("siteUrl has a trailing slash");
else if (!/^https?:\/\//.test(kit.siteUrl)) fail("siteUrl is not an HTTP(S) origin");
else {
  try {
    const u = new URL(kit.siteUrl);
    if (u.pathname !== "/" && u.pathname !== "") fail("siteUrl has a trailing path");
  } catch (err) {
    fail(`siteUrl is not a URL: ${err.message}`);
  }
}

const astroPath = path.join(site, "astro.config.mjs");
if (!fs.existsSync(astroPath)) fail("missing astro.config.mjs");
else {
  const astro = fs.readFileSync(astroPath, "utf8");
  if (!/trailingSlash\s*:\s*['"]never['"]/.test(astro)) fail("astro.config.mjs missing trailingSlash: 'never'");
}

const configPath = ["src/content.config.ts", "src/content.config.js", "src/content/config.ts", "src/content/config.js"]
  .map((p) => path.join(site, p))
  .find((p) => fs.existsSync(p));
if (!configPath) fail("missing content collections config");
else {
  const cfg = fs.readFileSync(configPath, "utf8");
  for (const name of ["pages", "articles", "authors", "sections", "issues"]) {
    if (!cfg.includes(name)) fail(`collections schema missing ${name}`);
  }
}

function walkMd(dir, onFile) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkMd(p, onFile);
    else if (/\.(md|mdx)$/.test(name)) onFile(p);
  }
}

// A comment opener inside a quoted string is text, not a comment.
function stripComments(css) {
  let out = "";
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      const from = i;
      for (i++; i < css.length && css[i] !== c; i++) if (css[i] === "\\") i++;
      out += css.slice(from, i + 1);
    } else if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 1;
    } else out += c;
  }
  return out;
}

// Braces and at-keywords inside a quoted string are not CSS structure, so the scan steps over strings and their escapes.
function fontFaceBlocks(css) {
  const blocks = [];
  let start = -1;
  let depth = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      for (i++; i < css.length && css[i] !== c; i++) if (css[i] === "\\") i++;
      continue;
    }
    if (c === "\\") { i++; continue; }
    if (start === -1) {
      if (c === "@" && /^@font-face\b/i.test(css.slice(i, i + 11))) start = i;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && depth > 0 && --depth === 0) {
      blocks.push(css.slice(start, i + 1));
      start = -1;
    }
  }
  if (start !== -1) blocks.push(null);
  return blocks;
}

function urlsIn(block) {
  const urls = [];
  const re = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)"'\s]*))\s*\)/gi;
  let match;
  while ((match = re.exec(block))) urls.push((match[1] ?? match[2] ?? match[3]).trim());
  return urls;
}

function frontmatter(file) {
  const text = fs.readFileSync(file, "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const requiredArticle = ["title", "description", "pubDate", "author", "tags", "draft"];
const requiredPage = ["title", "description"];
walkMd(path.join(site, "src/content/articles"), (file) => {
  const fm = frontmatter(file);
  if (!fm) return fail(`${file}: no frontmatter`);
  for (const key of requiredArticle) {
    if (fm[key] === undefined || fm[key] === "") fail(`${file}: missing ${key}`);
  }
  // A date and time with no offset can be read in the build machine's own zone, so its day can differ from one machine to the next. The value is read as YAML gives it: a !!str tag dropped, quotes removed, spaces trimmed.
  const rawDate = topLevelFrontmatter(file).pubDate;
  if (rawDate !== undefined) {
    let value = rawDate.replace(/^!!str\s+/, "");
    if (/^!/.test(value) || (value.startsWith('"') && value.includes("\\"))) fail(`${file}: pubDate uses a YAML tag or escape check does not read; write the date plainly`);
    else {
      const quoted = /^(["'])([\s\S]*)\1$/.exec(value);
      if (quoted) value = quoted[1] === "'" ? quoted[2].replace(/''/g, "'") : quoted[2];
      value = value.trim();
      if (/^\d{4}-\d{1,2}-\d{1,2}(?:[Tt]|\s+)\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)) fail(`${file}: pubDate gives a time with no zone, so its day depends on the build machine; give a date alone, 2026-09-24, or add the offset, 2026-09-24T09:00:00Z`);
    }
  }
});
// Fenced code, inline code, HTML comments and MDX comments never render as markup, so neither a heading nor a component inside them counts.
function renderedSource(body) {
  const out = [];
  let fence = null;
  let prevBlank = true;
  let inIndentedCode = false;
  let inList = false;
  for (const raw of body.split(/\r?\n/)) {
    // A blockquote's contents render, so its markers are not part of the line.
    const line = raw.replace(/^(?: {0,3}>[ \t]?)+/, "");
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      const token = marker[1];
      if (!fence) {
        fence = token;
        continue;
      }
      if (token[0] === fence[0] && token.length >= fence.length && line.trim() === token) {
        fence = null;
        continue;
      }
    }
    if (fence) continue;
    const blank = line.trim() === "";
    // An indented code block starts after a blank line and outside a list; its lines render as code, not markup.
    const indented = /^(?: {4}|\t)/.test(line);
    if (!blank && indented && (inIndentedCode || (prevBlank && !inList))) { inIndentedCode = true; prevBlank = false; continue; }
    if (!blank) {
      inIndentedCode = false;
      if (!indented) inList = /^ {0,3}(?:[-*+]|\d+[.)])[ \t]/.test(line);
    }
    prevBlank = blank;
    out.push(line);
  }
  return out.join("\n").replace(/<!--[\s\S]*?-->/g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/`[^`\n]*`/g, "");
}
// A source count: an h1 that only an MDX expression decides is counted as written, and KIT.md step 6 counts the rendered page.
// In MDX a capitalised <H1> is a component, not the HTML element, so only lowercase counts there.
function countH1(body, mdx) {
  const lines = renderedSource(body).split("\n");
  let count = 0;
  lines.forEach((line, i) => {
    if (/^ {0,3}#(?:[ \t]|$)/.test(line)) count += 1;
    else if (/^ {0,3}=+[ \t]*$/.test(line) && i > 0 && lines[i - 1].trim() !== "" && !/^ {0,3}(?:#|>|[-*+] |\d+[.)] )/.test(lines[i - 1])) count += 1;
    count += (line.match(mdx ? /<h1(?=[\s>/])/g : /<h1(?=[\s>/])/gi) ?? []).length;
  });
  return count;
}
// Top-level frontmatter keys only: the root mapping sits at the indentation of its first key, a deeper line belongs to a value, and a quoted key is still that key.
function topLevelFrontmatter(file) {
  const m = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const out = {};
  if (!m) return out;
  const lines = m[1].split(/\r?\n/);
  const first = lines.find((line) => line.trim() !== "" && !/^\s*#/.test(line));
  const root = first ? first.match(/^ */)[0].length : 0;
  for (const line of lines) {
    if (line.match(/^ */)[0].length !== root) continue;
    const rest = line.slice(root);
    if (rest.trim() === "" || /^#/.test(rest) || /^-(?:\s|$)/.test(rest)) continue;
    const k = rest.match(/^(?:"((?:[^"\\]|\\.)+)"|'((?:[^']|'')+)'|([A-Za-z0-9_-]+))\s*:(.*)$/);
    // An explicit ? key, a << merge, a flow mapping or a tagged key can set showTitle or listArticles where this reader does not look, so each is refused.
    if (!k || k[3] === "<<") { fail(`${file}: frontmatter line "${rest.trim()}" is YAML check does not read; write each key plainly on its own line`); continue; }
    // A YAML escape in a quoted key names a key this reader cannot see, so it is refused rather than read past.
    if (k[1] !== undefined && k[1].includes("\\")) { fail(`${file}: frontmatter key "${k[1]}" uses an escape; write the key plainly`); continue; }
    out[k[1] ?? (k[2] !== undefined ? k[2].replace(/''/g, "'") : k[3])] = k[4].replace(/\s+#.*$/, "").trim();
  }
  return out;
}
// The spellings Astro's YAML reads as a boolean; anything else, a quoted one included, is not one.
function yamlBoolean(value) {
  const v = value.replace(/^!!bool\s+/, "");
  if (/^(?:true|True|TRUE)$/.test(v)) return "true";
  if (/^(?:false|False|FALSE)$/.test(v)) return "false";
  return null;
}
walkMd(path.join(site, "src/content/pages"), (file) => {
  const fm = frontmatter(file);
  if (!fm) return fail(`${file}: no frontmatter`);
  for (const key of requiredPage) {
    if (fm[key] === undefined || fm[key] === "") fail(`${file}: missing ${key}`);
  }
  const top = topLevelFrontmatter(file);
  for (const key of ["showTitle", "listArticles"]) {
    if (!Object.hasOwn(top, key)) continue;
    tooOld(key, file);
    if (yamlBoolean(top[key]) === null) fail(`${file}: ${key} must be true or false, unquoted`);
  }
  if (Object.hasOwn(top, "showTitle") && yamlBoolean(top.showTitle) === "false") {
    const body = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    const count = countH1(body, file.endsWith(".mdx"));
    if (count !== 1) fail(`${file}: showTitle false requires exactly one h1 in the body, found ${count}`);
  }
});
if (kit.collections && kit.collections.articles === false) {
  walkMd(path.join(site, "src/content/articles"), (file) => {
    const fm = frontmatter(file);
    if (!fm || fm.draft !== "true") fail(`${file}: collections.articles is false and this article is not draft: true`);
  });
}
function walkFiles(dir, pattern, onFile) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkFiles(p, pattern, onFile);
    else if (pattern.test(name)) onFile(p);
  }
}
// Astro gives a conversation the slug of its file name as its id, so a file name and the id that places it are both lowercase letters, digits and hyphens.
const conversationName = /^[a-z0-9][a-z0-9-]*$/;
walkFiles(path.join(site, "src/content/conversations"), /\.(ya?ml|json)$/i, (file) => {
  // Astro derives an id from the path and drops a trailing /index, so a subfolder can give two files one id.
  if (path.dirname(file) !== path.join(site, "src/content/conversations")) fail(`${file}: conversations sit directly in src/content/conversations/, with no subfolders`);
  const stem = path.basename(file).replace(/\.(ya?ml|json)$/i, "");
  if (!conversationName.test(stem) || !/\.(yaml|yml|json)$/.test(file)) fail(`${file}: a conversation file name is lowercase letters, digits and hyphens, ending .yaml, .yml or .json`);
});
// Each <ConversationPlayer ...> tag's attributes, read with quotes and braces respected, so one attribute's text cannot pose as another and a > inside a value does not end the tag. A braced value is recorded as an expression, not a literal.
function playerTags(text) {
  const tags = [];
  const re = /<ConversationPlayer(?=[\s/>])/g;
  let m;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length;
    const attrs = {};
    while (i < text.length) {
      while (/\s/.test(text[i] ?? "")) i++;
      if (text[i] === ">" || text.startsWith("/>", i)) break;
      if (text[i] === "{") {
        let depth = 0;
        for (; i < text.length; i++) { if (text[i] === "{") depth++; else if (text[i] === "}" && --depth === 0) { i++; break; } }
        attrs["{...}"] = true;
        continue;
      }
      const name = text.slice(i).match(/^[A-Za-z_:][-\w:.]*/);
      if (!name) { i++; continue; }
      i += name[0].length;
      while (/\s/.test(text[i] ?? "")) i++;
      if (text[i] !== "=") { attrs[name[0]] = true; continue; }
      i++;
      while (/\s/.test(text[i] ?? "")) i++;
      const q = text[i];
      if (q === '"' || q === "'") {
        const end = text.indexOf(q, i + 1);
        attrs[name[0]] = text.slice(i + 1, end === -1 ? text.length : end);
        i = end === -1 ? text.length : end + 1;
      } else if (q === "{") {
        let depth = 0;
        for (; i < text.length; i++) { if (text[i] === "{") depth++; else if (text[i] === "}" && --depth === 0) { i++; break; } }
        attrs[name[0]] = { expression: true };
      } else {
        attrs[name[0]] = true;
      }
    }
    tags.push(attrs);
    re.lastIndex = i;
  }
  return tags;
}
walkFiles(path.join(site, "src/content"), /\.mdx$/, (file) => {
  const text = renderedSource(fs.readFileSync(file, "utf8"));
  for (const attrs of playerTags(text)) {
    tooOld("ConversationPlayer", file);
    const id = typeof attrs.id === "string" ? attrs.id : "";
    if (!id) {
      fail(`${file}: ConversationPlayer is missing a literal id="..."`);
      continue;
    }
    if (!conversationName.test(id)) {
      fail(`${file}: ConversationPlayer id "${id}" must be lowercase letters, digits and hyphens, the name of its file in src/content/conversations/`);
      continue;
    }
    const dir = path.resolve(site, "src/content/conversations");
    const found = [".yaml", ".yml", ".json"].some((ext) => {
      const candidate = path.resolve(dir, `${id}${ext}`);
      const rel = path.relative(dir, candidate);
      return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel) && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    });
    if (!found) fail(`${file}: ConversationPlayer id "${id}" has no file in src/content/conversations/`);
  }
});

for (const rel of ["public/_redirects", "public/images/og-default.png", "src/styles/tokens.css", "package.json", ".gitignore"]) {
  if (!fs.existsSync(path.join(site, rel))) fail(`missing ${rel}`);
  else if (!fs.statSync(path.join(site, rel)).isFile()) fail(`${rel} must be a file`);
}
const tokensPath = path.join(site, "src/styles/tokens.css");
if (fs.existsSync(tokensPath)) {
  const tokens = stripComments(fs.readFileSync(tokensPath, "utf8"));
  const layerBody = (name) => {
    const start = tokens.search(new RegExp(`@layer\\s+${name}\\s*\\{`));
    if (start < 0) return null;
    let depth = 0;
    for (let i = tokens.indexOf("{", start); i < tokens.length; i++) {
      if (tokens[i] === "{") depth++;
      else if (tokens[i] === "}" && --depth === 0) return tokens.slice(start, i + 1);
    }
    return null;
  };
  const base = layerBody("base");
  const utilities = layerBody("utilities");
  if (base === null || utilities === null) fail("src/styles/tokens.css lacks the kit's @layer base or @layer utilities block; run Upgrade, then reapply the site's token update");
  else if (base.includes("--tw-prose-") || !/main\.prose\s*\{[^}]*--tw-prose-body/.test(utilities)) fail("src/styles/tokens.css predates the prose-colour fix: prose colours must sit in @layer utilities, not @layer base, where @tailwindcss/typography outranks them; run Upgrade, then reapply the site's token update");
  // A wide page's reading column is registered as a length or percentage, so a --measure that is a keyword or a bare number would widen it to the page. Check does not evaluate expressions; it refuses the values that cannot be lengths.
  const declarations = tokens.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, '""');
  for (const declared of declarations.matchAll(/(?:^|[{;\s])--measure\s*:([^;}]*)/g)) {
    const value = declared[1].replace(/!\s*important\s*$/i, "").replace(/\s+/g, " ").trim();
    if (value === "" || /^[a-z-]+$/i.test(value) || /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value) && Number(value) !== 0) {
      fail(`src/styles/tokens.css sets --measure to "${value}": it must be a length or a percentage, such as 65ch, not a keyword or a bare number`);
    }
  }
  const faces = fontFaceBlocks(tokens);
  const imports = tokens.match(/@import\b[^;]*;?/gi) ?? [];
  if ([...faces, ...imports].some((rule) => rule?.includes("\\"))) fail("src/styles/tokens.css uses a CSS escape in an @import or @font-face rule; write font URLs plainly so check can read them");
  if (faces.length && /@import\s+(?:url\(\s*["']?|["'])(?:https?:)?\/\//i.test(tokens)) fail("src/styles/tokens.css uses both font mechanisms: a remote font-source @import beside self-hosted @font-face rules still sends every visitor to the remote host; keep one");
  for (const block of faces) {
    if (block === null) {
      fail("src/styles/tokens.css has an unclosed @font-face rule");
      break;
    }
    for (const value of urlsIn(block)) {
      if (/^https?:/i.test(value) || value.startsWith("//")) {
        fail(`a font-face must load from /fonts/ on the site's own origin (a remote font belongs in the font-source @import, if at all): ${value}`);
        continue;
      }
      let pathname = value;
      const cut = pathname.search(/[?#]/);
      if (cut !== -1) pathname = pathname.slice(0, cut);
      let decoded = pathname;
      try { decoded = decodeURIComponent(pathname); } catch { decoded = pathname; }
      const parts = decoded.startsWith("/fonts/") ? decoded.slice("/fonts/".length).split("/") : null;
      if (!parts || parts.some((part) => part === "" || part === "." || part === "..")) {
        fail(`a font-face src must be a root-relative /fonts/ path on this site: ${value}`);
        continue;
      }
      const rel = parts.join("/");
      const fontsRoot = path.resolve(site, "public", "fonts");
      const file = path.resolve(fontsRoot, rel);
      const relToRoot = path.relative(fontsRoot, file);
      if (relToRoot === ".." || relToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relToRoot)) fail(`a font-face src must be a root-relative /fonts/ path on this site: ${value}`);
      else if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`missing public/fonts/${rel}`);
    }
  }
  const fontExt = new Set([".woff2", ".woff", ".ttf", ".otf"]);
  const fontNames = [];
  const walkFonts = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.lstatSync(p);
      if (st.isDirectory()) walkFonts(p);
      else if (st.isFile()) fontNames.push(name);
    }
  };
  walkFonts(path.join(site, "public", "fonts"));
  const hasFont = fontNames.some((name) => fontExt.has(path.extname(name).toLowerCase()));
  const hasLicence = fontNames.some((name) => !fontExt.has(path.extname(name).toLowerCase()) && /licen[cs]e|ofl/i.test(name));
  if (hasFont && !hasLicence) fail("font files ship without their licence");
}
const astroConfig = ["astro.config.mjs", "astro.config.ts"].map((p) => path.join(site, p)).find((p) => fs.existsSync(p));
if (astroConfig && !/format\s*:\s*['"]file['"]/.test(fs.readFileSync(astroConfig, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1"))) fail("astro config lacks build.format 'file': routes would build as <slug>/index.html, which static hosts redirect to a trailing slash; run Upgrade");
if (!fs.existsSync(path.join(site, "src/pages/404.astro"))) fail("missing src/pages/404.astro: without a top-level 404.html, Cloudflare Pages serves the homepage for missing paths; run Upgrade");
for (const reserved of ["404.md", "404.mdx"]) {
  if (fs.existsSync(path.join(site, "src/content/pages", reserved))) fail(`src/content/pages/${reserved}: the page id 404 is reserved for the kit's not-found route`);
}
for (const rel of ["vercel.json", "public/vercel.json"]) {
  const vercelPath = path.join(site, rel);
  let vercel;
  try { vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8")); } catch { vercel = null; }
  if (!vercel || vercel.cleanUrls !== true || vercel.trailingSlash !== false) fail(`${rel} must set cleanUrls true and trailingSlash false: Vercel serves <slug>.html at the slashless URL only then, from the source root or from dist; run Upgrade`);
}
const robots = ["src/pages/robots.txt.js", "src/pages/robots.txt.ts"].some((p) => fs.existsSync(path.join(site, p)));
const llms = ["src/pages/llms.txt.js", "src/pages/llms.txt.ts"].some((p) => fs.existsSync(path.join(site, p)));
if (!robots) fail("missing src/pages/robots.txt.js (generated from kit.json, not a static public file)");
if (!llms) fail("missing src/pages/llms.txt.js (generated from kit.json, not a static public file)");

// The scan follows HTML's own parsing where content can reach it: a comment, a raw-text element that ends only at its own closing tag,
// a <template> whose contents are their own scope, and SVG and MathML, where <a/> opens nothing, CDATA is text, and an HTML element
// such as <div> or a <foreignObject> returns to HTML. In HTML a trailing slash does not close <a>, and <![CDATA[ is a comment to the next >.
// It is not a full HTML parser; it reads what a site's content builds to.
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);
const FOREIGN = new Set(["svg", "math"]);
const HTML_INSIDE_FOREIGN = new Set(["foreignobject", "desc", "title", "mi", "mo", "mn", "ms", "mtext", "annotation-xml"]);
const BREAKOUT = new Set(["b", "big", "blockquote", "body", "br", "center", "code", "dd", "div", "dl", "dt", "em", "embed", "h1", "h2", "h3", "h4", "h5", "h6", "head", "hr", "i", "img", "li", "listing", "menu", "meta", "nobr", "ol", "p", "pre", "ruby", "s", "small", "span", "strong", "strike", "sub", "sup", "table", "tt", "u", "ul", "var"]);
// From just after a tag's name to its closing >, reading attributes as HTML does, so a / inside an unquoted value is that value's.
function readTag(html, k) {
  while (k < html.length) {
    const c = html[k];
    if (c === ">") return { end: k, selfClosing: false };
    if (c === "/") { if (html[k + 1] === ">") return { end: k + 1, selfClosing: true }; k++; continue; }
    if (/\s/.test(c)) { k++; continue; }
    k++;
    while (k < html.length && !/[\s/>=]/.test(html[k])) k++;
    while (k < html.length && /\s/.test(html[k])) k++;
    if (html[k] !== "=") continue;
    k++;
    while (k < html.length && /\s/.test(html[k])) k++;
    const q = html[k];
    if (q === '"' || q === "'") { const e = html.indexOf(q, k + 1); k = e === -1 ? html.length : e + 1; }
    else while (k < html.length && !/[\s>]/.test(html[k])) k++;
  }
  return { end: html.length, selfClosing: false };
}
function nestedAnchors(html) {
  const hits = [];
  let depth = 0;
  let outer = null;
  const scopes = [];
  const contexts = [];
  const inForeign = () => contexts.length > 0 && contexts[contexts.length - 1].foreign;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<![CDATA[", lt) && inForeign()) {
      const end = html.indexOf("]]>", lt + 9);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt + 2);
      i = end === -1 ? html.length : end + 1;
      continue;
    }
    const match = /^<(\/?)([A-Za-z][A-Za-z0-9:-]*)/.exec(html.slice(lt, lt + 64));
    if (!match) { i = lt + 1; continue; }
    const name = match[2].toLowerCase();
    const closing = match[1] === "/";
    const { end, selfClosing } = readTag(html, lt + match[0].length);
    const tag = html.slice(lt, end + 1);
    i = end + 1;
    if (closing) {
      const at = contexts.map((c) => c.name).lastIndexOf(name);
      if (at !== -1) contexts.length = at;
      if (name === "template" && !inForeign() && scopes.length) [depth, outer] = scopes.pop();
      if (name === "a") { depth = Math.max(0, depth - 1); if (depth === 0) outer = null; }
      continue;
    }
    if (inForeign() && BREAKOUT.has(name)) while (inForeign()) contexts.pop();
    if (inForeign()) {
      if (HTML_INSIDE_FOREIGN.has(name) && !selfClosing) contexts.push({ name, foreign: false });
    } else {
      if (FOREIGN.has(name) && !selfClosing) contexts.push({ name, foreign: true });
      if (RAW_TEXT.has(name)) {
        const close = new RegExp(`</${name}(?=[\\s/>])`, "gi");
        close.lastIndex = i;
        const found = close.exec(html);
        i = found ? found.index : html.length;
        continue;
      }
      if (name === "template") { scopes.push([depth, outer]); depth = 0; outer = null; continue; }
    }
    if (name === "a" && !(selfClosing && inForeign())) {
      if (depth > 0) hits.push({ line: html.slice(0, lt).split("\n").length, outer, inner: tag });
      else outer = tag;
      depth++;
    }
  }
  return hits;
}
// A walk that cannot read a folder or a file fails, so a PASS covers the whole built site.
function listHtml(dir, out) {
  let names;
  try { names = fs.readdirSync(dir); } catch (error) { fail(`cannot read ${path.relative(site, dir) || "."}: ${error.code ?? error.message}`); return out; }
  for (const name of names) {
    const file = path.join(dir, name);
    let st;
    try { st = fs.lstatSync(file); } catch (error) { fail(`cannot read ${path.relative(site, file)}: ${error.code ?? error.message}`); continue; }
    if (st.isSymbolicLink()) fail(`${path.relative(site, file)} is a symbolic link in the built site`);
    else if (st.isDirectory()) listHtml(file, out);
    else if (st.isFile()) {
      try { fs.accessSync(file, fs.constants.R_OK); } catch (error) { fail(`cannot read ${path.relative(site, file)}: ${error.code ?? error.message}`); continue; }
      if (name.endsWith(".html")) out.push({ file, mtimeMs: st.mtimeMs });
    }
  }
  return out;
}
// A folder's own time moves when a file in it is added, removed or renamed, so a page deleted after the build makes the build stale too.
function newestNewerThan(dir, oldest, best) {
  let names;
  try {
    const st = fs.statSync(dir);
    if (st.mtimeMs > oldest && (!best || st.mtimeMs > best.mtimeMs)) best = { file: dir, mtimeMs: st.mtimeMs };
    names = fs.readdirSync(dir);
  } catch { return best; }
  for (const name of names) {
    const file = path.join(dir, name);
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    if (st.isDirectory()) {
      best = newestNewerThan(file, oldest, best);
    } else if (st.isFile() && st.mtimeMs > oldest && (!best || st.mtimeMs > best.mtimeMs)) {
      best = { file, mtimeMs: st.mtimeMs };
    }
  }
  return best;
}
let builtPages = 0;
if (built) {
  const dist = path.join(site, "dist");
  let distDir = false;
  try { distDir = fs.existsSync(dist) && fs.statSync(dist).isDirectory(); } catch { distDir = false; }
  const pages = distDir ? listHtml(dist, []) : [];
  if (!distDir || pages.length === 0) {
    fail("no built HTML in site/dist/: run npm run build in site/ and then check --built");
  } else {
    builtPages = pages.length;
    const oldest = pages.reduce((min, page) => Math.min(min, page.mtimeMs), Infinity);
    let newest = null;
    for (const dir of ["src", "public"]) newest = newestNewerThan(path.join(site, dir), oldest, newest);
    for (const rel of ["kit.json", "astro.config.mjs"]) {
      const file = path.join(site, rel);
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      if (st.isFile() && st.mtimeMs > oldest && (!newest || st.mtimeMs > newest.mtimeMs)) newest = { file, mtimeMs: st.mtimeMs };
    }
    if (newest) fail(`${path.relative(site, newest.file)} is newer than the built HTML: run npm run build in site/ and then check --built`);
    const cause = 'An email address or web address written as a link\'s visible text is turned into a second link inside the first by the Markdown and MDX compilers. Write it as a Markdown link, [support@example.com](mailto:support@example.com), or in MDX as an expression, {"support@example.com"}.';
    for (const page of pages) {
      const html = fs.readFileSync(page.file, "utf8");
      for (const hit of nestedAnchors(html)) {
        fail(`${path.relative(site, page.file)}:${hit.line} ${hit.inner} inside ${hit.outer}. ${cause}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`check FAIL ${site}`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
const pass = built
  ? `check PASS ${site} (steps 1 to 5, and the built HTML of ${builtPages} pages). Step 6's served-HTML fetch is still to do.`
  : `check PASS ${site} (steps 1 to 5). Step 6 is the served-HTML fetch.`;
const earlier = kit.kitVersion !== CHECK_VERSION
  ? ` The site is at kitVersion ${kit.kitVersion}; this check is ${CHECK_VERSION}, and Upgrade takes the site to it.`
  : "";
console.log(pass + earlier);

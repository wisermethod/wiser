#!/usr/bin/env node
// Walk KIT.md check steps 1 to 5. Step 6's served-HTML fetch is a later fetch.
// --built, before or after the envelope, also reads site/dist/ for nested anchors and a stale build.
// Not a Wiser tool. Fail closed.
import fs from "node:fs";
import path from "node:path";

import { currentKit } from "./envelope.mjs";

const CHECK_VERSION = "0.4.0";
const KNOWN_VERSIONS = ["0.1.0", "0.2.0", "0.2.1", "0.2.2", "0.3.0", "0.4.0"];
// feature, version introduced. A later release adds a row.
const introduced = [
  { feature: "layout", version: "0.2.0" },
  { feature: "style", version: "0.2.0" },
  { feature: "showTitle", version: "0.2.0" },
  { feature: "listArticles", version: "0.2.0" },
  { feature: "ConversationPlayer", version: "0.2.0" },
  { feature: "collections.articles false", version: "0.2.0" },
  { feature: "src/custom/", version: "0.3.0" },
  { feature: "icon", version: "0.3.0" },
  { feature: "lang", version: "0.3.0" },
  { feature: "image", version: "0.3.0" },
  { feature: "blog", version: "0.4.0" },
  { feature: "listEvents", version: "0.4.0" },
  { feature: "heroAlt", version: "0.4.0" },
  { feature: "src/content/events/", version: "0.4.0" },
  { feature: "Video", version: "0.4.0" },
  { feature: "Faq", version: "0.4.0" },
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
if (Object.hasOwn(kit, "icon")) {
  tooOld("icon", "kit.json icon");
  checkImagePath(kit.icon, "kit.json icon");
}
if (Object.hasOwn(kit, "lang")) {
  tooOld("lang", "kit.json lang");
  if (typeof kit.lang !== "string" || !/^[A-Za-z]+(?:-[A-Za-z0-9]+)*$/.test(kit.lang)) fail("kit.json lang must be a language tag of letters, then hyphen-separated letters or digits, such as en, en-GB or pt-BR");
}
let blogConfig = {};
if (Object.hasOwn(kit, "blog")) {
  tooOld("blog", "kit.json blog");
  const blog = kit.blog;
  if (blog === null || typeof blog !== "object" || Array.isArray(blog)) fail("kit.json blog must be an object");
  else {
    blogConfig = blog;
    const allowed = new Set(["tags", "perPage", "readingTime", "byline", "hero", "related"]);
    for (const key of Object.keys(blog)) {
      if (!allowed.has(key)) fail(`kit.json blog.${key} is not allowed`);
    }
    for (const key of ["tags", "readingTime", "hero"]) {
      if (Object.hasOwn(blog, key) && typeof blog[key] !== "boolean") fail(`kit.json blog.${key} must be true or false`);
    }
    if (Object.hasOwn(blog, "perPage") && !(Number.isInteger(blog.perPage) && blog.perPage >= 2 && blog.perPage <= 50)) fail("kit.json blog.perPage must be a whole number from 2 to 50");
    if (Object.hasOwn(blog, "related") && !(Number.isInteger(blog.related) && blog.related >= 1 && blog.related <= 6)) fail("kit.json blog.related must be a whole number from 1 to 6");
    if (Object.hasOwn(blog, "byline") && blog.byline !== "author-date" && blog.byline !== "date" && blog.byline !== "none") fail("kit.json blog.byline must be author-date, date, or none");
  }
}

function checkImagePath(value, where) {
  if (typeof value !== "string" || !value.startsWith("/images/") || value.includes("..") || value.includes("\\") || value.includes("?") || value.includes("#")) {
    fail(`${where} must be a path starting /images/, with no .., no backslash, no query and no fragment`);
    return;
  }
  let rel;
  try { rel = decodeURIComponent(value.slice("/images/".length)); } catch { rel = null; }
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
    fail(`${where} file is missing under public/images/: ${value}`);
  }
}
function checkLogo(logo) {
  checkImagePath(logo, "kit.json layout.header.brand.logo");
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
checkCustom();
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

function unquote(value) {
  let v = String(value ?? "").replace(/^!!str\s+/, "").trim();
  const quoted = /^(["'])([\s\S]*)\1$/.exec(v);
  if (quoted) v = quoted[1] === "'" ? quoted[2].replace(/''/g, "'") : quoted[2];
  return v.trim();
}
function contentSegment(segment) {
  return segment.toLowerCase().replace(/[^\p{L}\p{N} _-]+/gu, "").replace(/ /g, "-");
}
function pageIdOf(file, top) {
  if (top && Object.hasOwn(top, "slug") && unquote(top.slug) !== "") return unquote(top.slug);
  const root = path.join(site, "src/content/pages");
  const rel = path.relative(root, file).replace(/\\/g, "/").replace(/\.(md|mdx)$/i, "");
  return rel.split("/").map(contentSegment).join("/").replace(/\/index$/, "");
}
function tagSlug(tag) {
  return String(tag).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}
function flowList(value) {
  const inner = String(value).trim();
  if (!inner.startsWith("[") || !inner.endsWith("]")) return null;
  const body = inner.slice(1, -1);
  const items = [];
  let buf = "";
  let quote = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      if (quote === "'" && c === "'" && body[i + 1] === "'") { buf += "'"; i++; continue; }
      if (c === quote) { quote = null; continue; }
      buf += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === ",") { items.push(buf.trim()); buf = ""; continue; }
    buf += c;
  }
  if (buf.trim() !== "" || items.length) items.push(buf.trim());
  return items.filter((item) => item !== "");
}
function articleTags(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const matched = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!matched) return [];
  const lines = matched[1].split(/\r?\n/);
  const first = lines.find((line) => line.trim() !== "" && !/^\s*#/.test(line));
  const rootIndent = first ? first.match(/^ */)[0].length : 0;
  const tags = [];
  let inTags = false;
  let itemIndent = null;
  for (const line of lines) {
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    const indent = line.match(/^ */)[0].length;
    if (indent <= rootIndent) {
      inTags = false;
      itemIndent = null;
      if (indent !== rootIndent) continue;
      const key = line.slice(rootIndent).match(/^tags\s*:(.*)$/);
      if (!key) continue;
      const value = key[1].replace(/\s+#.*$/, "").trim();
      if (value === "" || /^(?:>|\|)[+-]?$/.test(value)) { inTags = true; continue; }
      const flow = flowList(value);
      if (flow) return flow;
      const scalar = unquote(value);
      return scalar ? [scalar] : [];
    }
    if (!inTags) continue;
    const item = line.match(/^(\s*)-\s+(.*)$/);
    if (!item) continue;
    const at = item[1].length;
    if (itemIndent === null) itemIndent = at;
    if (at !== itemIndent) continue;
    const scalar = unquote(item[2].replace(/\s+#.*$/, "").trim());
    if (scalar) tags.push(scalar);
  }
  return tags;
}
function checkBlogPages() {
  if (blogConfig.tags === true) {
    for (const page of contentPages) {
      if (page.id === "tags" || page.id.startsWith("tags/")) fail(`${page.file}: page id ${page.id} collides with tag pages`);
    }
  }
  const perPage = blogConfig.perPage;
  if (!(Number.isInteger(perPage) && perPage >= 2 && perPage <= 50)) return;
  for (const listing of contentPages) {
    if (!listing.listArticles) continue;
    const escaped = listing.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${escaped}/([1-9][0-9]*)$`);
    for (const page of contentPages) {
      const match = re.exec(page.id);
      if (match && Number(match[1]) >= 2) fail(`${page.file}: page id ${page.id} collides with a later page of ${listing.id}`);
    }
  }
}
function checkArticleTags() {
  if (blogConfig.tags !== true) return;
  const seen = new Map();
  for (const file of publishedArticles) {
    for (const tag of articleTags(file)) {
      const slug = tagSlug(tag);
      if (!slug) { fail(`${file}: tag "${tag}" makes an empty address`); continue; }
      const prev = seen.get(slug);
      if (!prev) seen.set(slug, { tag, file });
      else if (prev.tag !== tag) fail(`${file}: tag "${tag}" and ${prev.file} tag "${prev.tag}" both slug to ${slug}`);
    }
  }
}
const OFFSET_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;
function checkEvents() {
  const dir = path.join(site, "src/content/events");
  let st;
  try { st = fs.lstatSync(dir); } catch { return; }
  tooOld("src/content/events/", "src/content/events/");
  if (st.isSymbolicLink() || !st.isDirectory()) { fail("src/content/events must be a directory"); return; }
  const known = new Set(["title", "description", "start", "end", "timezone", "location", "online", "signup", "draft"]);
  walkMd(dir, (file) => {
    if (!frontmatter(file)) return fail(`${file}: no frontmatter`);
    const top = topLevelFrontmatter(file);
    for (const key of Object.keys(top)) {
      if (!known.has(key)) fail(`${file}: ${key} is not an events field`);
    }
    for (const key of ["title", "description", "start", "timezone"]) {
      if (!Object.hasOwn(top, key) || unquote(top[key]) === "") fail(`${file}: missing ${key}`);
    }
    const start = Object.hasOwn(top, "start") ? unquote(top.start) : "";
    if (start && !OFFSET_INSTANT.test(start)) fail(`${file}: start must be a date and time with an offset, such as 2026-10-15T18:00:00-06:00`);
    if (Object.hasOwn(top, "end")) {
      const end = unquote(top.end);
      if (!OFFSET_INSTANT.test(end)) fail(`${file}: end must be a date and time with an offset, such as 2026-10-15T20:00:00-06:00`);
      else if (OFFSET_INSTANT.test(start) && Date.parse(end) <= Date.parse(start)) fail(`${file}: end must be after start`);
    }
    const zone = Object.hasOwn(top, "timezone") ? unquote(top.timezone) : "";
    if (zone) {
      try { Intl.DateTimeFormat("en-US", { timeZone: zone }); }
      catch { fail(`${file}: timezone must be an IANA name, such as America/Denver`); }
    }
    if (Object.hasOwn(top, "signup")) {
      const signup = unquote(top.signup);
      let ok = false;
      try { const url = new URL(signup); ok = url.protocol === "https:" && url.hostname !== ""; }
      catch { ok = false; }
      if (!ok) fail(`${file}: signup must be an https:// URL`);
    }
    if (Object.hasOwn(top, "location") && unquote(top.location) === "") fail(`${file}: location must be non-empty text`);
    if (Object.hasOwn(top, "online") && yamlBoolean(top.online) !== "true") fail(`${file}: online must be true, unquoted`);
    const onlineOn = Object.hasOwn(top, "online") && yamlBoolean(top.online) === "true";
    const hasLocation = Object.hasOwn(top, "location") && unquote(top.location) !== "";
    if (onlineOn === hasLocation) fail(`${file}: set location or online: true, and not both`);
    if (Object.hasOwn(top, "draft") && yamlBoolean(top.draft) === null) fail(`${file}: draft must be true or false, unquoted`);
  });
}
function checkVideo(file, attrs) {
  tooOld("Video", file);
  if (attrs["{...}"]) fail(`${file}: Video uses a spread; write youtube, vimeo or src and title as literals`);
  const title = attrs.title;
  if (typeof title !== "string" || title.trim() === "") fail(`${file}: Video is missing a literal title="..."`);
  const present = (key) => Object.hasOwn(attrs, key) && (typeof attrs[key] === "string" ? attrs[key] !== "" : true);
  const sources = ["youtube", "vimeo", "src"].filter(present);
  if (sources.length !== 1) {
    fail(`${file}: Video requires exactly one of youtube, vimeo or src`);
    return;
  }
  const key = sources[0];
  const value = attrs[key];
  if (typeof value !== "string") {
    fail(`${file}: Video ${key} must be a literal`);
    return;
  }
  if (key === "src") checkImagePath(value, `${file}: Video src`);
  else if (!/^[A-Za-z0-9_-]+$/.test(value)) fail(`${file}: Video ${key} id must be letters, digits, hyphens or underscores`);
}
const requiredArticle = ["title", "description", "pubDate", "author", "tags", "draft"];
const requiredPage = ["title", "description"];
const publishedArticles = [];
const contentPages = [];
walkMd(path.join(site, "src/content/articles"), (file) => {
  const fm = frontmatter(file);
  if (!fm) return fail(`${file}: no frontmatter`);
  for (const key of requiredArticle) {
    if (fm[key] === undefined || fm[key] === "") fail(`${file}: missing ${key}`);
  }
  // A date and time with no offset can be read in the build machine's own zone, so its day can differ from one machine to the next. The value is read as YAML gives it: a !!str tag dropped, quotes removed, spaces trimmed.
  const articleTop = topLevelFrontmatter(file);
  const rawDate = articleTop.pubDate;
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
  if (Object.hasOwn(articleTop, "heroAlt")) {
    tooOld("heroAlt", file);
    if (unquote(articleTop.heroAlt) === "") fail(`${file}: heroAlt must be non-empty text`);
  }
  if (yamlBoolean(articleTop.draft ?? "") !== "true") publishedArticles.push(file);
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
  for (const key of ["showTitle", "listArticles", "listEvents"]) {
    if (!Object.hasOwn(top, key)) continue;
    tooOld(key, file);
    if (yamlBoolean(top[key]) === null) fail(`${file}: ${key} must be true or false, unquoted`);
  }
  if (Object.hasOwn(top, "showTitle") && yamlBoolean(top.showTitle) === "false") {
    const body = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    const count = countH1(body, file.endsWith(".mdx"));
    if (count !== 1) fail(`${file}: showTitle false requires exactly one h1 in the body, found ${count}`);
  }
  if (Object.hasOwn(top, "image")) {
    tooOld("image", file);
    let imagePath = top.image.trim();
    const quoted = /^(["'])([\s\S]*)\1$/.exec(imagePath);
    if (quoted) imagePath = quoted[1] === "'" ? quoted[2].replace(/''/g, "'") : quoted[2];
    checkImagePath(imagePath, `${file}: image`);
  }
  contentPages.push({ file, id: pageIdOf(file, top), listArticles: yamlBoolean(top.listArticles ?? "") === "true" });
});
checkBlogPages();
checkArticleTags();
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
// Each <Name ...> tag's attributes, read with quotes and braces respected, so one attribute's text cannot pose as another and a > inside a value does not end the tag. A braced value is recorded as an expression, not a literal.
function elementTags(text, component) {
  const tags = [];
  const re = new RegExp(`<${component}(?=[\\s/>])`, "g");
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
function playerTags(text) {
  return elementTags(text, "ConversationPlayer");
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
  for (const attrs of elementTags(text, "Video")) checkVideo(file, attrs);
  for (const _attrs of elementTags(text, "Faq")) tooOld("Faq", file);
});
checkEvents();

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
function relToSite(file) {
  return path.relative(site, file).split(path.sep).join("/");
}
function isIdentChar(c) {
  return typeof c === "string" && /[A-Za-z0-9_$]/.test(c);
}
function skipJsString(code, i) {
  const q = code[i];
  if (q !== '"' && q !== "'" && q !== "`") return i + 1;
  for (let j = i + 1; j < code.length; j++) {
    if (code[j] === "\\") { j++; continue; }
    if (q === "`" && code[j] === "$" && code[j + 1] === "{") {
      let depth = 1;
      j += 2;
      for (; j < code.length && depth > 0; j++) {
        if (code[j] === '"' || code[j] === "'" || code[j] === "`") { j = skipJsString(code, j) - 1; continue; }
        if (code[j] === "{") depth++;
        else if (code[j] === "}") depth--;
      }
      j--;
      continue;
    }
    if (code[j] === q) return j + 1;
  }
  return code.length;
}
function jsStringContents(code, i) {
  const end = skipJsString(code, i);
  return { value: code.slice(i + 1, Math.max(i + 1, end - 1)), end };
}
// import ... from '...', import '...', and import('...'). import.meta is not one of them.
function readImportSpecifier(code, i) {
  let j = i;
  while (j < code.length && /\s/.test(code[j])) j++;
  if (j >= code.length) return null;
  if (code[j] === "(") {
    j++;
    while (j < code.length && /\s/.test(code[j])) j++;
    if (code[j] === "'" || code[j] === '"') {
      const read = jsStringContents(code, j);
      return { spec: read.value, end: read.end };
    }
    return { spec: null, raw: "import()", end: j };
  }
  if (code[j] === "'" || code[j] === '"') {
    const read = jsStringContents(code, j);
    return { spec: read.value, end: read.end };
  }
  let depth = 0;
  for (let k = j; k < code.length; k++) {
    const c = code[k];
    if (c === "'" || c === '"' || c === "`") { k = skipJsString(code, k) - 1; continue; }
    if (c === "/" && code[k + 1] === "*") {
      const end = code.indexOf("*/", k + 2);
      k = end === -1 ? code.length : end + 1;
      continue;
    }
    if (c === "/" && code[k + 1] === "/" && code[k - 1] !== ":") {
      const end = code.indexOf("\n", k + 2);
      k = end === -1 ? code.length : end;
      continue;
    }
    if (c === "{" || c === "(" || c === "[") depth++;
    else if ((c === "}" || c === ")" || c === "]") && depth > 0) depth--;
    else if (depth === 0 && c === ";") return null;
    else if (depth === 0 && code.startsWith("from", k) && !isIdentChar(code[k - 1]) && !isIdentChar(code[k + 4])) {
      let m = k + 4;
      while (m < code.length && /\s/.test(code[m])) m++;
      if (code[m] === "'" || code[m] === '"') {
        const read = jsStringContents(code, m);
        return { spec: read.value, end: read.end };
      }
      return null;
    }
  }
  return null;
}
function importSpecifiers(code) {
  const found = [];
  for (let i = 0; i < code.length; i++) {
    if (code.startsWith("<!--", i)) {
      const end = code.indexOf("-->", i + 4);
      i = end === -1 ? code.length : end + 2;
      continue;
    }
    const c = code[i];
    if (c === '"' || c === "'" || c === "`") { i = skipJsString(code, i) - 1; continue; }
    if (c === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end === -1 ? code.length : end + 1;
      continue;
    }
    if (c === "/" && code[i + 1] === "/" && code[i - 1] !== ":") {
      const end = code.indexOf("\n", i + 2);
      i = end === -1 ? code.length : end;
      continue;
    }
    if (code.startsWith("import", i) && !isIdentChar(code[i - 1]) && !isIdentChar(code[i + 6])) {
      if (code[i + 6] === ".") { i += 6; continue; }
      const spec = readImportSpecifier(code, i + 6);
      if (spec) found.push(spec);
      if (spec && spec.end > i) i = spec.end - 1;
    }
  }
  return found;
}
function tagAttrs(tag) {
  const attrs = {};
  const open = /^<\/?([A-Za-z][A-Za-z0-9:-]*)/.exec(tag);
  if (!open) return attrs;
  let i = open[0].length;
  while (i < tag.length) {
    while (i < tag.length && /[\s/]/.test(tag[i])) i++;
    if (i >= tag.length || tag[i] === ">") break;
    const name = /^[A-Za-z_:][-\w:.]*/.exec(tag.slice(i));
    if (!name) { i++; continue; }
    const key = name[0].toLowerCase();
    i += name[0].length;
    while (i < tag.length && /\s/.test(tag[i])) i++;
    if (tag[i] !== "=") { attrs[key] = ""; continue; }
    i++;
    while (i < tag.length && /\s/.test(tag[i])) i++;
    const q = tag[i];
    if (q === '"' || q === "'") {
      const end = tag.indexOf(q, i + 1);
      attrs[key] = tag.slice(i + 1, end === -1 ? tag.length : end);
      i = end === -1 ? tag.length : end + 1;
    } else {
      const start = i;
      while (i < tag.length && !/[\s>]/.test(tag[i])) i++;
      attrs[key] = tag.slice(start, i);
    }
  }
  return attrs;
}
function isAbsoluteAddress(value) {
  const v = String(value).trim();
  return /^https?:/i.test(v) || v.startsWith("//");
}
function remoteAssetTags(code) {
  const hits = [];
  for (let i = 0; i < code.length; i++) {
    if (code.startsWith("<!--", i)) {
      const end = code.indexOf("-->", i + 4);
      i = end === -1 ? code.length : end + 2;
      continue;
    }
    const c = code[i];
    if (c === '"' || c === "'" || c === "`") { i = skipJsString(code, i) - 1; continue; }
    if (c === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end === -1 ? code.length : end + 1;
      continue;
    }
    if (c === "/" && code[i + 1] === "/" && code[i - 1] !== ":") {
      const end = code.indexOf("\n", i + 2);
      i = end === -1 ? code.length : end;
      continue;
    }
    const open = /^<(script|link)(?=[\s/>])/i.exec(code.slice(i, i + 16));
    if (!open) continue;
    const name = open[1].toLowerCase();
    const read = readTag(code, i + open[0].length);
    const tag = code.slice(i, read.end + 1);
    const attrs = tagAttrs(tag);
    const value = name === "script" ? attrs.src : attrs.href;
    if (typeof value === "string" && isAbsoluteAddress(value)) hits.push({ name, value: value.trim() });
    i = read.end;
  }
  return hits;
}
function staysInsideCustom(fromFile, spec) {
  if (spec.includes("\\") || spec.includes("\0")) return false;
  let pathname = spec;
  const cut = pathname.search(/[?#]/);
  if (cut !== -1) pathname = pathname.slice(0, cut);
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  if (decoded.includes("\\") || decoded.includes("\0")) return false;
  const resolved = path.resolve(path.dirname(fromFile), decoded);
  const root = path.resolve(site, "src", "custom");
  const rel = path.relative(root, resolved);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}
function packageNameOf(spec) {
  if (!spec || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("\\") || /^[a-z][a-z0-9+.-]*:/i.test(spec)) return null;
  if (spec.startsWith("@")) {
    const parts = spec.split("/");
    if (parts.length < 2 || parts[0] === "@" || !parts[1]) return null;
    return `${parts[0]}/${parts[1]}`;
  }
  const name = spec.split("/")[0];
  if (!name || name === "." || name === "..") return null;
  return name;
}
function dependencyNames() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(site, "package.json"), "utf8"));
    if (pkg.dependencies && typeof pkg.dependencies === "object" && !Array.isArray(pkg.dependencies)) return new Set(Object.keys(pkg.dependencies));
  } catch { /* a missing package.json is its own failure */ }
  return new Set();
}
function kitComponentNames() {
  const dir = path.join(site, "src", "components");
  const names = new Set();
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch { return names; }
  for (const name of entries) {
    if (!name.endsWith(".astro")) continue;
    const file = path.join(dir, name);
    let st;
    try { st = fs.lstatSync(file); } catch { continue; }
    if (st.isSymbolicLink() || !st.isFile()) continue;
    names.add(name.slice(0, -".astro".length));
  }
  return names;
}
function classifyImport(spec, fromFile, deps) {
  if (spec === null) return 'import() is not a string literal';
  if (spec.includes("\\")) return `import "${spec}" uses an escape`;
  if (spec === "astro:content") return null;
  if (spec.startsWith("./") || spec.startsWith("../")) {
    return staysInsideCustom(fromFile, spec) ? null : `import "${spec}" leaves src/custom/`;
  }
  const name = packageNameOf(spec);
  if (name && deps.has(name)) return null;
  return `import "${spec}" is not a relative path inside src/custom/, astro:content, or a kit dependency`;
}
function cssImportsAndUrls(css) {
  const s = stripComments(css);
  const imports = [];
  const urls = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' || c === "'") { i = skipJsString(s, i) - 1; continue; }
    if (c === "@" && /^@import\b/i.test(s.slice(i, i + 16))) {
      let j = i;
      for (; j < s.length; j++) {
        if (s[j] === '"' || s[j] === "'") { j = skipJsString(s, j) - 1; continue; }
        if (s[j] === ";") { j++; break; }
      }
      imports.push(s.slice(i, j));
      i = j - 1;
      continue;
    }
    if ((c === "u" || c === "U") && /^url\s*\(/i.test(s.slice(i, i + 8)) && !isIdentChar(s[i - 1])) {
      const open = s.indexOf("(", i);
      let depth = 0;
      let j = open;
      for (; j < s.length; j++) {
        if (s[j] === '"' || s[j] === "'") { j = skipJsString(s, j) - 1; continue; }
        if (s[j] === "(") depth++;
        else if (s[j] === ")" && --depth === 0) { j++; break; }
      }
      urls.push(s.slice(i, j));
      i = j - 1;
    }
  }
  return { imports, urls };
}
function addressesInCssToken(token) {
  const values = urlsIn(token);
  const quoted = /@import\s+(?:"([^"]*)"|'([^']*)')/i.exec(token);
  if (quoted) values.push((quoted[1] ?? quoted[2]).trim());
  return values;
}
// CSS outside its strings and comments, where an escape could spell url or @import past the rules below.
function cssOutsideStrings(css) {
  return stripComments(css).replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, '""');
}
// The rules every piece of site CSS meets, in custom.css or in a component's <style>: no remote address, no escape outside a string, and nothing aimed at the frame's skip link or its #content target.
function checkSiteCss(css, where) {
  const { imports, urls } = cssImportsAndUrls(css);
  let escaped = false;
  for (const token of [...imports, ...urls]) {
    if (token.includes("\\")) escaped = true;
    for (const value of addressesInCssToken(token)) {
      if (isAbsoluteAddress(value)) fail(`${where}: absolute address in an @import or url(): ${value}`);
    }
  }
  const bare = cssOutsideStrings(css);
  if (escaped || bare.includes("\\")) fail(`${where} uses a CSS escape outside a string; write it plainly so check can read it`);
  if (/\.skip-link\b|#content\b/.test(bare)) fail(`${where} styles the kit's skip link or its #content target, which belong to the frame`);
}
function checkCustomAstro(file, deps) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (error) { fail(`cannot read ${relToSite(file)}: ${error.code ?? error.message}`); return; }
  const where = relToSite(file);
  // Only static imports can be read before the build runs, so a dynamic import or import.meta, however spaced or commented, is refused.
  if (/\bimport\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*(?:\(|\.\s*meta\b)/.test(text)) fail(`${where}: a dynamic import() or import.meta is not allowed in src/custom/; use a static import`);
  for (const m of text.matchAll(/<(script|link)\b[^>]*?\b(src|href)\s*=\s*\{/gi)) fail(`${where}: <${m[1].toLowerCase()} ${m[2].toLowerCase()}={...}> is an address check cannot read; write it as a quoted path on this site`);
  if (/\bid\s*=\s*(?:"content"|'content'|\{\s*["'`]content["'`]\s*\})/.test(text)) fail(`${where}: id="content" is the kit's skip-link target and belongs to the frame`);
  for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) checkSiteCss(m[1], `${where} <style>`);
  for (const found of importSpecifiers(text)) {
    const problem = classifyImport(found.spec, file, deps);
    if (problem) fail(`${where}: ${problem}`);
  }
  for (const hit of remoteAssetTags(text)) {
    const tag = hit.name === "script" ? "script src" : "link href";
    fail(`${where}: <${tag}="${hit.value}"> must not load an absolute http:, https: or // address`);
  }
}
function checkCustomCss(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (error) { fail(`cannot read ${relToSite(file)}: ${error.code ?? error.message}`); return; }
  checkSiteCss(text, relToSite(file));
}
function checkCustom() {
  const root = path.join(site, "src", "custom");
  let st;
  try { st = fs.lstatSync(root); } catch { return; }
  tooOld("src/custom/", "src/custom");
  if (!envelopeRouter.includes("src/custom/")) fail("src/custom/ exists, but the envelope AGENTS.md does not mention it: refresh its Content vs code section from site-AGENTS.md");
  if (st.isSymbolicLink()) { fail("src/custom is a symbolic link"); return; }
  if (!st.isDirectory()) { fail("src/custom is not a directory"); return; }
  const allowedTop = new Set(["Header.astro", "Footer.astro", "custom.css", "components"]);
  const kitNames = kitComponentNames();
  const deps = dependencyNames();
  const astroFiles = [];
  let names;
  try { names = fs.readdirSync(root); } catch (error) { fail(`cannot read src/custom: ${error.code ?? error.message}`); return; }
  for (const name of names) {
    const file = path.join(root, name);
    let entry;
    try { entry = fs.lstatSync(file); } catch (error) { fail(`cannot read ${relToSite(file)}: ${error.code ?? error.message}`); continue; }
    const shown = relToSite(file);
    if (entry.isSymbolicLink()) { fail(`${shown} is a symbolic link`); continue; }
    if (name === "components" && entry.isDirectory()) {
      let children;
      try { children = fs.readdirSync(file); } catch (error) { fail(`cannot read ${shown}: ${error.code ?? error.message}`); continue; }
      for (const child of children) {
        const childPath = path.join(file, child);
        let childStat;
        try { childStat = fs.lstatSync(childPath); } catch (error) { fail(`cannot read ${relToSite(childPath)}: ${error.code ?? error.message}`); continue; }
        const childShown = relToSite(childPath);
        if (childStat.isSymbolicLink()) { fail(`${childShown} is a symbolic link`); continue; }
        if (childStat.isDirectory()) { fail(`${childShown} is not allowed in src/custom/components/`); continue; }
        const stem = child.endsWith(".astro") ? child.slice(0, -".astro".length) : "";
        if (!childStat.isFile() || !/^[A-Z][A-Za-z0-9]*\.astro$/.test(child)) { fail(`${childShown} is not allowed in src/custom/components/`); continue; }
        if (kitNames.has(stem)) { fail(`${childShown} is the name of a kit component`); continue; }
        astroFiles.push(childPath);
      }
      continue;
    }
    if (!allowedTop.has(name) || !entry.isFile()) { fail(`${shown} is not allowed in src/custom/`); continue; }
    if (name.endsWith(".astro")) astroFiles.push(file);
    if (name === "custom.css") checkCustomCss(file);
  }
  for (const file of astroFiles) checkCustomAstro(file, deps);
}
// Head slots of a built page. Comments, scripts, styles, titles' own text, and templates do not supply an h1.
function builtPageFacts(html) {
  const facts = { title: "", description: false, canonical: false, ogTitle: false, ogUrl: false, jsonLd: false, h1: 0 };
  const contexts = [];
  let templateDepth = 0;
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
      if (name === "template" && !inForeign() && templateDepth > 0) templateDepth--;
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
        const textEnd = found ? found.index : html.length;
        if (templateDepth === 0 && name === "title") {
          const text = html.slice(i, textEnd).replace(/\s+/g, " ").trim();
          if (text) facts.title = facts.title || text;
        }
        // A script is raw text, so its type is read here, before the body is skipped.
        if (templateDepth === 0 && name === "script") {
          const attrs = tagAttrs(tag);
          if ((attrs.type || "").toLowerCase().split(/\s*;\s*/)[0] === "application/ld+json") facts.jsonLd = true;
        }
        i = found ? found.index : html.length;
        continue;
      }
      if (name === "template") { templateDepth++; continue; }
    }
    if (templateDepth > 0 || inForeign()) continue;
    const attrs = tagAttrs(tag);
    if (name === "meta") {
      if ((attrs.name || "").toLowerCase() === "description") facts.description = true;
      const prop = (attrs.property || "").toLowerCase();
      if (prop === "og:title") facts.ogTitle = true;
      if (prop === "og:url") facts.ogUrl = true;
    } else if (name === "link") {
      if ((attrs.rel || "").toLowerCase().split(/\s+/).includes("canonical")) facts.canonical = true;
    } else if (name === "h1") facts.h1++;
  }
  return facts;
}
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const LABEL_FREE_INPUT = new Set(["hidden", "submit", "reset", "button", "image"]);
function snippetOf(tag) {
  const flat = tag.replace(/\s+/g, " ").trim();
  return flat.length <= 140 ? flat : `${flat.slice(0, 137)}...`;
}
function namedBy(attrs, titleCounts) {
  if ((attrs["aria-label"] || "").trim() !== "") return true;
  if ((attrs["aria-labelledby"] || "").trim() !== "") return true;
  return titleCounts && (attrs.title || "").trim() !== "";
}
// The same scan as the head facts: comments, raw text, templates and foreign content stay out of the element rules. An id is counted on every start tag outside a template, including SVG and a raw-text element's own id.
function accessibilityFindings(html) {
  const findings = [];
  const contexts = [];
  let templateDepth = 0;
  const inForeign = () => contexts.length > 0 && contexts[contexts.length - 1].foreign;
  const stack = [];
  const ids = new Map();
  const labelFor = new Set();
  const pending = [];
  const addText = (chunk) => {
    if (!chunk) return;
    for (const frame of stack) if (frame.kind === "named") frame.text += chunk;
  };
  const finishFrame = (frame) => {
    if (frame.kind !== "named") return;
    if (frame.text.replace(/\s+/g, " ").trim() || frame.imgAlt || frame.attrName) return;
    findings.push(`${frame.snippet} has no accessible name`);
  };
  const closeStack = (name) => {
    const at = stack.map((frame) => frame.name).lastIndexOf(name);
    if (at === -1) return;
    for (let n = stack.length - 1; n >= at; n--) finishFrame(stack[n]);
    stack.length = at;
  };
  const noteId = (attrs, tag) => {
    if (!Object.hasOwn(attrs, "id")) return;
    const id = attrs.id;
    const snippet = snippetOf(tag);
    if (ids.has(id)) findings.push(`id "${id}" is used twice, on ${ids.get(id)} and ${snippet}`);
    else ids.set(id, snippet);
  };
  const inspect = (name, attrs, tag) => {
    if (name === "img") {
      if (!Object.hasOwn(attrs, "alt")) findings.push(`${snippetOf(tag)} has no alt attribute`);
      else if (attrs.alt.trim() !== "") for (const frame of stack) if (frame.kind === "named") frame.imgAlt = true;
    }
    if (name === "iframe" && (attrs.title || "").trim() === "") findings.push(`${snippetOf(tag)} has no title`);
    if (name === "label" && typeof attrs.for === "string" && attrs.for !== "") labelFor.add(attrs.for);
    if (name === "input" || name === "select" || name === "textarea") {
      const type = name === "input" ? (attrs.type || "text").toLowerCase() : "";
      if (!(name === "input" && LABEL_FREE_INPUT.has(type))) {
        pending.push({
          id: Object.hasOwn(attrs, "id") ? attrs.id : null,
          snippet: snippetOf(tag),
          ok: namedBy(attrs, false) || stack.some((frame) => frame.name === "label"),
        });
      }
    }
    if (VOID_TAGS.has(name) || RAW_TEXT.has(name)) return;
    const named = name === "button" || (name === "a" && Object.hasOwn(attrs, "href"));
    stack.push({ name, kind: named ? "named" : "plain", text: "", imgAlt: false, attrName: named && namedBy(attrs, true), snippet: snippetOf(tag) });
  };
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      if (templateDepth === 0 && !inForeign()) addText(html.slice(i));
      break;
    }
    if (templateDepth === 0 && !inForeign()) addText(html.slice(i, lt));
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
      if (name === "template" && !inForeign() && templateDepth > 0) templateDepth--;
      if (templateDepth === 0 && !inForeign()) closeStack(name);
      continue;
    }
    if (inForeign() && BREAKOUT.has(name)) while (inForeign()) contexts.pop();
    const attrs = tagAttrs(tag);
    if (templateDepth === 0) noteId(attrs, tag);
    if (inForeign()) {
      if (HTML_INSIDE_FOREIGN.has(name) && !selfClosing) contexts.push({ name, foreign: false });
      continue;
    }
    if (FOREIGN.has(name) && !selfClosing) { contexts.push({ name, foreign: true }); continue; }
    if (RAW_TEXT.has(name)) {
      if (templateDepth === 0) inspect(name, attrs, tag);
      const close = new RegExp(`</${name}(?=[\\s/>])`, "gi");
      close.lastIndex = i;
      const found = close.exec(html);
      i = found ? found.index : html.length;
      continue;
    }
    if (name === "template") { templateDepth++; continue; }
    if (templateDepth === 0) inspect(name, attrs, tag);
  }
  for (let n = stack.length - 1; n >= 0; n--) finishFrame(stack[n]);
  for (const control of pending) {
    if (control.ok) continue;
    if (control.id !== null && labelFor.has(control.id)) continue;
    findings.push(`${control.snippet} has no label`);
  }
  return findings;
}
function copiedFromPublic(dist, file) {
  const rel = path.relative(dist, file);
  if (rel === "pagefind" || rel.startsWith(`pagefind${path.sep}`)) return true;
  const pub = path.join(site, "public", rel);
  try { return fs.existsSync(pub) && fs.statSync(pub).isFile(); } catch { return false; }
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
      if (copiedFromPublic(dist, page.file)) continue;
      const facts = builtPageFacts(html);
      const shown = relToSite(page.file);
      if (!facts.title) fail(`${shown}: missing a non-empty <title>`);
      if (!facts.description) fail(`${shown}: missing a meta name="description"`);
      if (!facts.canonical) fail(`${shown}: missing a link rel="canonical"`);
      if (!facts.ogTitle) fail(`${shown}: missing og:title`);
      if (!facts.ogUrl) fail(`${shown}: missing og:url`);
      if (!facts.jsonLd) fail(`${shown}: missing a script type="application/ld+json"`);
      if (facts.h1 !== 1) fail(`${shown}: expected exactly one <h1>, found ${facts.h1}`);
      for (const finding of accessibilityFindings(html)) fail(`${shown}: ${finding}`);
      // A built page loads scripts and stylesheets from this site only, whatever wrote the tag.
      for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
        const isLink = /^<link/i.test(tag);
        if (isLink && !/\brel\s*=\s*["']?(?:stylesheet|preload|modulepreload)\b/i.test(tag)) continue;
        const attr = (isLink ? /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i : /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i).exec(tag);
        const value = attr && (attr[1] ?? attr[2] ?? attr[3]);
        if (value && /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(value.trim())) {
          let origin = null;
          try { origin = new URL(value.trim(), kit.siteUrl).origin; } catch { origin = null; }
          if (origin !== kit.siteUrl) fail(`${shown}: loads ${isLink ? "a stylesheet" : "a script"} from another site, ${value}`);
        }
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

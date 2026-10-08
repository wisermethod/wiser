#!/usr/bin/env node
// Walk KIT.md check steps 1 to 5. Step 6's served-HTML fetch is a later fetch.
// --built, before or after the envelope, also reads site/dist/ for nested anchors and a stale build.
// Not a Wiser tool. Fail closed.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

import { currentKit, versionLine } from "./envelope.mjs";
console.log(versionLine());

const CHECK_VERSION = "0.5.0";
const KNOWN_VERSIONS = ["0.1.0", "0.2.0", "0.2.1", "0.2.2", "0.3.0", "0.4.0", "0.4.1", "0.4.2", "0.4.3", "0.5.0"];
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
  { feature: "person", version: "0.4.0" },
  { feature: "src/content/llms.txt", version: "0.4.1" },
  { feature: "noindex", version: "0.4.2" },
  { feature: "public/files/", version: "0.4.2" },
  { feature: "a future pubDate", version: "0.4.3" },
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
function statedFunctionSha() {
  try {
    const stated = /The kit Function, `src\/function\/_worker\.js`, has sha256 `([0-9a-f]{64})`/.exec(fs.readFileSync(kitMd, "utf8"));
    return stated ? stated[1] : null;
  } catch { return null; }
}
if (KNOWN_VERSIONS.includes(kit.kitVersion)) {
  const functionDir = path.join(site, "src", "function");
  let functionPresent = false;
  try { functionPresent = fs.existsSync(functionDir); } catch { functionPresent = false; }
  if (kit.kitVersion === "0.5.0") {
    const workerFile = path.join(functionDir, "_worker.js");
    let workerStat = null;
    try { workerStat = fs.lstatSync(workerFile); } catch { workerStat = null; }
    if (!workerStat || !workerStat.isFile()) fail("src/function/_worker.js is missing: kit 0.5.0 carries the kit Function; run Upgrade");
    else {
      const actual = createHash("sha256").update(fs.readFileSync(workerFile)).digest("hex");
      const stated = statedFunctionSha();
      if (!stated) fail("site/KIT.md does not state the kit Function sha256");
      else if (actual !== stated) fail(`src/function/_worker.js sha256 ${actual} is not the sha256 site/KIT.md states (${stated})`);
    }
  } else if (functionPresent) fail("src/function/ is kit code from 0.5.0: run Upgrade");
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
if (Object.hasOwn(kit, "blog") && !envelopeRouter.includes("`blog`")) fail("kit.json sets blog, but the envelope AGENTS.md does not mention it: refresh its Content vs code section from site-AGENTS.md");
// The person a profile site declares. Only what is declared is emitted, so every field is checked here, and an unknown key fails rather than being dropped.
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";
const isHttps = (v) => { if (typeof v !== "string") return false; try { const u = new URL(v); return u.protocol === "https:" && Boolean(u.hostname); } catch { return false; } };
function onlyKeys(obj, allowed, where) { for (const key of Object.keys(obj)) if (!allowed.includes(key)) fail(`${where}.${key} is not allowed`); }
function isbnValid(raw) {
  if (typeof raw !== "string") return false;
  const d = raw.replace(/[\s-]/g, "");
  if (/^\d{9}[\dX]$/.test(d)) { let sum = 0; for (let i = 0; i < 10; i++) sum += (d[i] === "X" ? 10 : Number(d[i])) * (10 - i); return sum % 11 === 0; }
  if (/^97[89]\d{10}$/.test(d)) { let sum = 0; for (let i = 0; i < 13; i++) sum += Number(d[i]) * (i % 2 ? 3 : 1); return sum % 10 === 0; }
  return false;
}
function checkNamedOrg(org, where) {
  if (!isObject(org)) { fail(`${where} must be an object with a name`); return; }
  onlyKeys(org, ["name", "url"], where);
  if (!isText(org.name)) fail(`${where}.name must be non-empty text`);
  if (Object.hasOwn(org, "url") && !isHttps(org.url)) fail(`${where}.url must be an https:// URL`);
}
function publishedPage(id) {
  return ["md", "mdx"].some((ext) => {
    const file = path.join(site, "src/content/pages", `${id}.${ext}`);
    if (!fs.existsSync(file)) return false;
    const fm = frontmatter(file);
    return !fm || fm.draft !== "true";
  });
}
// A site's own llms.txt is src/content/llms.txt, which the kit's /llms.txt route serves; a public/llms.txt would collide with that route, and the build would skip one of them.
if (fs.existsSync(path.join(site, "public", "llms.txt"))) fail("public/llms.txt collides with the kit's /llms.txt route: move the site's own file to src/content/llms.txt, which the route serves as written");
if (fs.existsSync(path.join(site, "src", "content", "llms.txt"))) tooOld("src/content/llms.txt", "src/content/llms.txt");
// public/files/ holds a site's downloads. It is content, so it holds no file a browser runs as a page, script or stylesheet, SVG and XML included because either can carry a script, no hidden file, and no symbolic link.
const FILES_REFUSED = new Set([".html", ".htm", ".xhtml", ".xht", ".shtml", ".mht", ".mhtml", ".svg", ".svgz", ".xml", ".xsl", ".xslt", ".js", ".mjs", ".cjs", ".wasm", ".css"]);
{
  const filesRoot = path.join(site, "public", "files");
  let rootStat = null;
  try { rootStat = fs.lstatSync(filesRoot); } catch { rootStat = null; }
  if (rootStat) {
    tooOld("public/files/", "public/files");
    if (rootStat.isSymbolicLink()) fail("public/files is a symbolic link");
    else if (!rootStat.isDirectory()) fail("public/files is not a folder");
    else {
      const walk = (dir) => {
        let names;
        try { names = fs.readdirSync(dir); } catch (error) { fail(`cannot read ${path.relative(site, dir)}: ${error.code ?? error.message}`); return; }
        for (const name of names) {
          const file = path.join(dir, name);
          const shown = path.relative(site, file);
          let st;
          try { st = fs.lstatSync(file); } catch (error) { fail(`cannot read ${shown}: ${error.code ?? error.message}`); continue; }
          if (st.isSymbolicLink()) { fail(`${shown} is a symbolic link`); continue; }
          if (name.startsWith(".")) { fail(`${shown} is a hidden file or folder; public/files/ holds downloads only`); continue; }
          if (st.isDirectory()) { walk(file); continue; }
          if (FILES_REFUSED.has(path.extname(name).toLowerCase())) fail(`${shown}: a file a browser runs as a page, script or stylesheet (${[...FILES_REFUSED].join(" ")}) is code, not a download, and public/files/ refuses it`);
        }
      };
      walk(filesRoot);
    }
  }
}
if (Object.hasOwn(kit, "person")) {
  tooOld("person", "kit.json person");
  if (!envelopeRouter.includes("`person`")) fail("kit.json sets person, but the envelope AGENTS.md does not mention it: refresh its Content vs code section from site-AGENTS.md");
  const p = kit.person;
  const W = "kit.json person";
  if (!isObject(p)) fail(`${W} must be an object`);
  else {
    onlyKeys(p, ["name", "page", "url", "image", "jobTitle", "worksFor", "knowsAbout", "sameAs", "founded", "books"], W);
    if (!isText(p.name)) fail(`${W}.name must be non-empty text`);
    const page = Object.hasOwn(p, "page") ? p.page : "index";
    if (typeof page !== "string" || !/^[a-z0-9][a-z0-9/-]*$/.test(page) || !publishedPage(page)) fail(`${W}.page must name a published page in src/content/pages/: ${page}`);
    if (Object.hasOwn(p, "url") && !isHttps(p.url)) fail(`${W}.url must be an https:// URL`);
    if (Object.hasOwn(p, "image")) checkImagePath(p.image, `${W}.image`);
    if (Object.hasOwn(p, "jobTitle") && !isText(p.jobTitle)) fail(`${W}.jobTitle must be non-empty text`);
    if (Object.hasOwn(p, "worksFor")) checkNamedOrg(p.worksFor, `${W}.worksFor`);
    if (Object.hasOwn(p, "knowsAbout") && !(Array.isArray(p.knowsAbout) && p.knowsAbout.every(isText))) fail(`${W}.knowsAbout must be a list of non-empty text`);
    if (Object.hasOwn(p, "sameAs") && !(Array.isArray(p.sameAs) && p.sameAs.every(isHttps))) fail(`${W}.sameAs must be a list of https:// URLs`);
    if (Object.hasOwn(p, "founded")) {
      if (!Array.isArray(p.founded)) fail(`${W}.founded must be a list`);
      else p.founded.forEach((org, i) => {
        const w = `${W}.founded[${i}]`;
        if (!isObject(org)) { fail(`${w} must be an object`); return; }
        onlyKeys(org, ["name", "url", "alternateName", "parentOrganization"], w);
        if (!isText(org.name)) fail(`${w}.name must be non-empty text`);
        if (Object.hasOwn(org, "url") && !isHttps(org.url)) fail(`${w}.url must be an https:// URL`);
        if (Object.hasOwn(org, "alternateName") && !(Array.isArray(org.alternateName) && org.alternateName.every(isText))) fail(`${w}.alternateName must be a list of non-empty text`);
        if (Object.hasOwn(org, "parentOrganization")) checkNamedOrg(org.parentOrganization, `${w}.parentOrganization`);
      });
    }
    if (Object.hasOwn(p, "books")) {
      if (!Array.isArray(p.books)) fail(`${W}.books must be a list`);
      else p.books.forEach((book, i) => {
        const w = `${W}.books[${i}]`;
        if (!isObject(book)) { fail(`${w} must be an object`); return; }
        onlyKeys(book, ["name", "isbn", "publisher", "datePublished", "bookEdition", "url", "coAuthors"], w);
        if (!isText(book.name)) fail(`${w}.name must be non-empty text`);
        if (!isbnValid(book.isbn)) fail(`${w}.isbn must be an ISBN-10 or ISBN-13 whose check digit is right (hyphens allowed): ${book.isbn}`);
        if (!isText(book.publisher)) fail(`${w}.publisher must be the publisher's name`);
        {
          const parts = typeof book.datePublished === "string" ? /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(book.datePublished) : null;
          const ok = parts && (parts[2] === undefined || (Number(parts[2]) >= 1 && Number(parts[2]) <= 12)) && (parts[3] === undefined || calendarDate(Number(parts[1]), Number(parts[2]), Number(parts[3])));
          if (!ok) fail(`${w}.datePublished must be a real date written YYYY, YYYY-MM or YYYY-MM-DD`);
        }
        if (Object.hasOwn(book, "bookEdition") && !isText(book.bookEdition)) fail(`${w}.bookEdition must be non-empty text`);
        if (Object.hasOwn(book, "url") && !isHttps(book.url)) fail(`${w}.url must be an https:// URL`);
        if (Object.hasOwn(book, "coAuthors")) {
          if (!Array.isArray(book.coAuthors)) fail(`${w}.coAuthors must be a list`);
          else book.coAuthors.forEach((co, j) => {
            const c = `${w}.coAuthors[${j}]`;
            if (!isObject(co)) { fail(`${c} must be an object with a name`); return; }
            onlyKeys(co, ["name", "type"], c);
            if (!isText(co.name)) fail(`${c}.name must be non-empty text`);
            if (Object.hasOwn(co, "type") && co.type !== "Person" && co.type !== "Organization") fail(`${c}.type must be Person or Organization`);
          });
        }
      });
    }
  }
}
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
// A slug sets the address. An escape in a double-quoted one would give the build a different address than check reads, so it is refused.
const slugEscapeReported = new Set();
function slugOf(file, top) {
  if (!top || !Object.hasOwn(top, "slug")) return null;
  const raw = String(top.slug).replace(/^!!str\s+/, "").trim();
  if (raw.startsWith('"') && raw.includes("\\") && !slugEscapeReported.has(file)) {
    slugEscapeReported.add(file);
    fail(`${path.relative(site, file)}: slug uses a YAML escape, which check does not read; write the slug plainly`);
  }
  const value = unquote(top.slug);
  return value === "" ? null : value;
}
function pageIdOf(file, top) {
  if (slugOf(file, top) !== null) return slugOf(file, top);
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
    if (["articles", "tags", "events"].includes(listing.id)) fail(`${listing.file}: blog.perPage would put this page's later pages at /${listing.id}/2, which the kit's own ${listing.id} routes use; give the listing page another id`);
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
const OFFSET_INSTANT_SHAPE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))$/;
// A real calendar date: JavaScript turns 2026-02-30 into March 2 without a word, so the fields are checked, not just the parse.
function calendarDate(y, m, d) { return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); }
const OFFSET_INSTANT = { test(value) {
  const m = OFFSET_INSTANT_SHAPE.exec(value);
  if (!m || !calendarDate(Number(m[1]), Number(m[2]), Number(m[3]))) return false;
  if (Number(m[4]) > 23 || Number(m[5]) > 59 || (m[6] !== undefined && Number(m[6]) > 59)) return false;
  if (m[7] !== undefined && (Number(m[7]) > 14 || Number(m[8]) > 59)) return false;
  return Number.isFinite(Date.parse(value));
} };
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
  for (const key of ["showTitle", "listArticles", "listEvents", "noindex"]) {
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
// aria-labelledby is not a name until the ids it names are found to carry text, so it is resolved at the end of the page, not here.
function namedBy(attrs, titleCounts) {
  if ((attrs["aria-label"] || "").trim() !== "") return true;
  return titleCounts && (attrs.title || "").trim() !== "";
}
const visibleText = (text) => text.replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ").replace(/\s+/g, " ").trim();
// The same scan as the head facts: comments, raw text, templates and foreign content stay out of the element rules. An id is counted on every start tag outside a template, including SVG and a raw-text element's own id.
function accessibilityFindings(html) {
  const findings = [];
  const contexts = [];
  let templateDepth = 0;
  const inForeign = () => contexts.length > 0 && contexts[contexts.length - 1].foreign;
  const stack = [];
  const ids = new Map();
  const labels = [];
  const idText = new Map();
  const deferred = [];
  const pending = [];
  // Text under aria-hidden="true" names nothing. A frame collects text when it may need a name, is a label, or carries an id another element may point to.
  const addText = (chunk) => {
    if (!chunk || stack.some((frame) => frame.hidden)) return;
    for (const frame of stack) if (frame.kind !== "plain" || frame.id !== null) frame.text += chunk;
  };
  const finishFrame = (frame) => {
    if (frame.id !== null && !idText.has(frame.id)) idText.set(frame.id, visibleText(frame.text) || (frame.imgAlt ? "image" : ""));
    if (frame.kind !== "named") return;
    if (visibleText(frame.text) || frame.imgAlt || frame.attrName) return;
    if (frame.labelledby) { deferred.push(frame); return; }
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
    const hidden = (attrs["aria-hidden"] || "").toLowerCase() === "true";
    if (name === "img") {
      if (!Object.hasOwn(attrs, "alt")) findings.push(`${snippetOf(tag)} has no alt attribute`);
      else if (attrs.alt.trim() !== "" && !hidden && !stack.some((frame) => frame.hidden)) for (const frame of stack) frame.imgAlt = true;
    }
    if (name === "iframe" && (attrs.title || "").trim() === "") findings.push(`${snippetOf(tag)} has no title`);
    if (name === "input" || name === "select" || name === "textarea") {
      const type = name === "input" ? (attrs.type || "text").toLowerCase() : "";
      if (!(name === "input" && LABEL_FREE_INPUT.has(type))) {
        pending.push({
          id: Object.hasOwn(attrs, "id") ? attrs.id : null,
          snippet: snippetOf(tag),
          ok: namedBy(attrs, false),
          labelledby: (attrs["aria-labelledby"] || "").trim(),
          wrap: [...stack].reverse().find((frame) => frame.name === "label") ?? null,
        });
      }
    }
    if (VOID_TAGS.has(name) || RAW_TEXT.has(name)) return;
    const named = name === "button" || (name === "a" && Object.hasOwn(attrs, "href"));
    const frame = { name, kind: named ? "named" : name === "label" ? "label" : "plain", text: "", imgAlt: false, hidden,
      id: Object.hasOwn(attrs, "id") ? attrs.id : null, attrName: named && namedBy(attrs, true),
      labelledby: named ? (attrs["aria-labelledby"] || "").trim() : "", forId: name === "label" && typeof attrs.for === "string" ? attrs.for : "", snippet: snippetOf(tag) };
    if (name === "label") labels.push(frame);
    stack.push(frame);
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
  const resolves = (refs) => refs.split(/\s+/).some((ref) => (idText.get(ref) || "") !== "");
  const labelled = (frame) => Boolean(visibleText(frame.text) || frame.imgAlt);
  for (const frame of deferred) if (!resolves(frame.labelledby)) findings.push(`${frame.snippet} has no accessible name: its aria-labelledby names no element with text`);
  for (const control of pending) {
    if (control.ok) continue;
    if (control.labelledby && resolves(control.labelledby)) continue;
    if (control.wrap && labelled(control.wrap)) continue;
    if (control.id !== null && labels.some((label) => label.forId === control.id && labelled(label))) continue;
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
// The rules for a kit-built page. file is the dist path, or null when the text is a version schedule.bin carries; shown names it in each failure.
function checkKitHtml(shown, html, file, dist) {
  const cause = 'An email address or web address written as a link\'s visible text is turned into a second link inside the first by the Markdown and MDX compilers. Write it as a Markdown link, [support@example.com](mailto:support@example.com), or in MDX as an expression, {"support@example.com"}.';
  const where = file ? path.relative(site, file) : shown;
  for (const hit of nestedAnchors(html)) {
    fail(`${where}:${hit.line} ${hit.inner} inside ${hit.outer}. ${cause}`);
  }
  if (file && copiedFromPublic(dist, file)) return;
  const facts = builtPageFacts(html);
  if (!facts.title) fail(`${shown}: missing a non-empty <title>`);
  if (!facts.description) fail(`${shown}: missing a meta name="description"`);
  if (!facts.canonical) fail(`${shown}: missing a link rel="canonical"`);
  if (!facts.ogTitle) fail(`${shown}: missing og:title`);
  if (!facts.ogUrl) fail(`${shown}: missing og:url`);
  if (!facts.jsonLd) fail(`${shown}: missing a script type="application/ld+json"`);
  if (facts.h1 !== 1) fail(`${shown}: expected exactly one <h1>, found ${facts.h1}`);
  // Every @id a page's structured data points to is a node that page carries; a declared person is on every page, and the profile page is a ProfilePage about them.
  const nodes = new Set();
  const refs = [];
  let parsed = true;
  const types = [];
  const live = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<template\b[\s\S]*?<\/template\s*>/gi, "");
  for (const m of live.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    let data;
    try { data = JSON.parse(m[1]); } catch { parsed = false; continue; }
    const walk = (v) => {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v === null || typeof v !== "object") return;
      const keys = Object.keys(v);
      if (typeof v["@id"] === "string") { if (keys.length === 1) refs.push(v["@id"]); else nodes.add(v["@id"]); }
      if (v["@type"]) types.push({ type: v["@type"], id: v["@id"], main: v.mainEntity?.["@id"] });
      for (const key of keys) if (key !== "@id") walk(v[key]);
    };
    walk(data);
  }
  if (!parsed) fail(`${shown}: its JSON-LD does not parse`);
  for (const ref of refs) if (!nodes.has(ref)) fail(`${shown}: its JSON-LD points to ${ref}, a node the page does not carry`);
  if (isObject(kit.person)) {
    const route = file ? null : shown.slice(0, shown.lastIndexOf(" at "));
    const notFound = file ? file.endsWith(`${path.sep}404.html`) : route === "/404";
    if (!notFound) {
      const personId = `${kit.siteUrl}/#person`;
      if (!types.some((t) => t.type === "Person" && t.id === personId)) fail(`${shown}: kit.json declares a person, and the page carries no Person ${personId}`);
      const profileId = typeof kit.person.page === "string" ? kit.person.page : "index";
      const isProfile = file ? file === path.join(dist, `${profileId}.html`) : route === (profileId === "index" ? "/" : `/${profileId}`);
      if (isProfile && !types.some((t) => t.type === "ProfilePage" && t.main === personId)) fail(`${shown}: the profile page carries no ProfilePage whose mainEntity is ${personId}`);
    }
  }
  for (const finding of accessibilityFindings(html)) fail(`${shown}: ${finding}`);
  // A header or navigation landmark with nothing in it is a blank strip that a screen reader still announces.
  const liveMarkup = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<template\b[\s\S]*?<\/template\s*>/gi, "");
  if (/<nav\b[^>]*>\s*<\/nav\s*>/i.test(liveMarkup)) fail(`${shown}: an empty <nav>, a navigation landmark with no links`);
  if (/<header\b[^>]*>\s*<\/header\s*>/i.test(liveMarkup)) fail(`${shown}: an empty <header>`);
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
let builtPages = 0;
if (built) {
  const dist = path.join(site, "dist");
  let distDir = false;
  try { distDir = fs.existsSync(dist) && fs.statSync(dist).isDirectory(); } catch { distDir = false; }
  const pages = distDir ? listHtml(dist, []) : [];
  if (distDir && pages.length > 0) {
    // A page a site hides with noindex: true builds, carries the robots meta, and is in neither the sitemap nor llms.txt.
    const sitemapText = (() => { try { return fs.readdirSync(dist).filter((n) => /^sitemap.*\.xml$/.test(n)).map((n) => fs.readFileSync(path.join(dist, n), "utf8")).join("\n"); } catch { return ""; } })();
    const llmsText = fs.existsSync(path.join(dist, "llms.txt")) ? fs.readFileSync(path.join(dist, "llms.txt"), "utf8") : "";
    walkMd(path.join(site, "src/content/pages"), (file) => {
      const top = topLevelFrontmatter(file);
      if (!Object.hasOwn(top, "noindex") || yamlBoolean(top.noindex) !== "true") return;
      if (Object.hasOwn(top, "draft") && yamlBoolean(top.draft) === "true") return;
      const id = pageIdOf(file, top);
      const url = id === "index" ? `${kit.siteUrl}/` : `${kit.siteUrl}/${id}`;
      const built = path.join(dist, `${id}.html`);
      if (!fs.existsSync(built)) { fail(`${path.relative(site, file)} sets noindex, and the build wrote no ${path.relative(site, built)}`); return; }
      const html = fs.readFileSync(built, "utf8").replace(/<!--[\s\S]*?-->/g, "");
      if (!html.includes('<meta name="robots" content="noindex, nofollow">')) fail(`${path.relative(site, built)}: a noindex page without <meta name="robots" content="noindex, nofollow">`);
      if (sitemapText.includes(`<loc>${url}</loc>`)) fail(`${path.relative(site, built)}: a noindex page listed in the sitemap`);
      if (!/<body\b[^>]*\bdata-pagefind-ignore="all"/i.test(html) || /\bdata-pagefind-body\b/i.test(html)) fail(`${path.relative(site, built)}: a noindex page Pagefind would index; its <body> needs data-pagefind-ignore="all" and no data-pagefind-body`);
      // Any written form of the address counts: a Markdown link, an autolink, a bare URL, or a path on this site.
      const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const boundary = "(?![\\p{L}\\p{N}_\\-./~%])";
      const listed = id === "index"
        ? new RegExp(`${escape(kit.siteUrl)}/?${boundary}`, "u")
        : new RegExp(`(?:${escape(kit.siteUrl)}|(?<=^|[\\s(<\\[\\]"':]))/${escape(id)}${boundary}`, "mu");
      if (listed.test(llmsText)) fail(`${path.relative(site, built)}: a noindex page listed in llms.txt`);
    });
    const own = path.join(site, "src", "content", "llms.txt");
    const builtLlms = path.join(dist, "llms.txt");
    if (fs.existsSync(own)) {
      if (!fs.existsSync(builtLlms) || !fs.readFileSync(builtLlms).equals(fs.readFileSync(own))) fail("dist/llms.txt is not the site's own src/content/llms.txt, byte for byte: rebuild, and keep no public/llms.txt");
    } else if (!fs.existsSync(builtLlms)) fail("dist/llms.txt is missing: the kit's /llms.txt route did not build");
  }
  if (distDir && pages.length > 0 && isObject(kit.person)) {
    const profile = path.join(dist, `${typeof kit.person.page === "string" ? kit.person.page : "index"}.html`);
    if (!pages.some((page) => page.file === profile)) fail(`kit.json person.page names ${path.relative(site, profile)}, which the build did not write; a page's slug frontmatter may have moved it`);
  }
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
    for (const page of pages) checkKitHtml(relToSite(page.file), fs.readFileSync(page.file, "utf8"), page.file, dist);
  }
  for (const name of ["_worker.js", "_worker.bundle", "_routes.json"]) {
    let held = null;
    try { held = fs.lstatSync(path.join(dist, name)); } catch { held = null; }
    if (held) fail(`dist/ holds ${name}`);
  }
  let functionsHeld = null;
  try { functionsHeld = fs.lstatSync(path.join(dist, "functions")); } catch { functionsHeld = null; }
  if (functionsHeld) fail("dist/ holds a functions folder");
}

// Scheduled articles. A published article whose pubDate is after the build instant has no route in dist/ until a build at or after that instant. On kit 0.5.0 the kit Function serves the later version at the instant when dist-function/ carries it.
function articleIdOf(file, top) {
  if (slugOf(file, top) !== null) return slugOf(file, top);
  const root = path.join(site, "src/content/articles");
  const rel = path.relative(root, file).replace(/\\/g, "/").replace(/\.(md|mdx)$/i, "");
  return rel.split("/").map(contentSegment).join("/").replace(/\/index$/, "");
}
// pubDate as the build reads it. A plain YAML date or timestamp is read as YAML defines one, a one-digit month, day, hour or offset included; anything else is text, which the schema hands to Date.
const YAML_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YAML_TIMESTAMP = /^(\d{4})-(\d\d?)-(\d\d?)(?:[Tt]|[ \t]+)(\d\d?):(\d\d):(\d\d)(?:\.(\d*))?(?:[ \t]*(Z|([-+])(\d\d?)(?::(\d\d))?))?$/;
function pubInstant(top) {
  if (!Object.hasOwn(top, "pubDate")) return null;
  const raw = String(top.pubDate).trim();
  const text = /^!!str\s/.test(raw) || /^["']/.test(raw);
  const value = unquote(raw);
  if (!text) {
    const day = YAML_DATE.exec(value);
    if (day) return { at: Date.UTC(+day[1], +day[2] - 1, +day[3]), dateOnly: true };
    const stamp = YAML_TIMESTAMP.exec(value);
    if (stamp) {
      const ms = stamp[7] ? Number(stamp[7].slice(0, 3).padEnd(3, "0")) : 0;
      let at = Date.UTC(+stamp[1], +stamp[2] - 1, +stamp[3], +stamp[4], +stamp[5], +stamp[6], ms);
      if (stamp[9]) at -= (stamp[9] === "-" ? -1 : 1) * ((+stamp[10] * 60 + Number(stamp[11] ?? 0)) * 60000);
      return { at, dateOnly: false };
    }
  }
  const at = Date.parse(value);
  return Number.isFinite(at) ? { at, dateOnly: /^\d{4}-\d{2}-\d{2}$/.test(value) } : null;
}
const instantText = (at) => new Date(at).toISOString().replace(/\.000Z$/, "Z");
const BUILD_TIME_SHAPE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
let envInstant = null;
if (process.env.KIT_BUILD_TIME !== undefined && process.env.KIT_BUILD_TIME !== "") {
  if (BUILD_TIME_SHAPE.test(process.env.KIT_BUILD_TIME) && Number.isFinite(Date.parse(process.env.KIT_BUILD_TIME))) envInstant = Date.parse(process.env.KIT_BUILD_TIME);
  else fail(`KIT_BUILD_TIME must be a date, 2026-10-09, read as 00:00 UTC, or a date and time with an offset, 2026-10-09T09:00:00-06:00; it is ${process.env.KIT_BUILD_TIME}`);
}
// The instant the build in dist/ judged articles against: what the build recorded, else KIT_BUILD_TIME, else the time of the oldest built page.
function distInstant() {
  const dist = path.join(site, "dist");
  const pages = [];
  const walk = (dir) => {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return; }
    for (const name of names) {
      const file = path.join(dir, name);
      let st;
      try { st = fs.lstatSync(file); } catch { continue; }
      if (st.isDirectory()) walk(file);
      else if (st.isFile() && name.endsWith(".html")) pages.push({ file, mtimeMs: st.mtimeMs });
    }
  };
  walk(dist);
  if (pages.length === 0) return null;
  const oldest = pages.reduce((min, page) => Math.min(min, page.mtimeMs), Infinity);
  try {
    const file = path.join(site, ".astro", "kit-build.json");
    const record = JSON.parse(fs.readFileSync(file, "utf8"));
    const at = Date.parse(record.buildTime);
    // A record older than the built pages belongs to an earlier build.
    if (Number.isFinite(at) && BUILD_TIME_SHAPE.test(record.buildTime) && fs.statSync(file).mtimeMs >= oldest) return { at, from: "recorded by the build in .astro/kit-build.json" };
  } catch { /* no record */ }
  if (envInstant !== null) return { at: envInstant, from: "KIT_BUILD_TIME" };
  return { at: oldest, from: "the time of the oldest built page, since the build recorded none" };
}
function readScheduleNote() {
  try {
    const note = JSON.parse(fs.readFileSync(path.join(site, ".astro", "kit-schedule.json"), "utf8"));
    if (!note || typeof note !== "object" || Array.isArray(note)) return null;
    return note;
  } catch { return null; }
}
function sameInstantList(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}
function distHasPage(route) {
  const file = route === "/" ? path.join(site, "dist", "index.html") : path.join(site, "dist", `${route.replace(/^\//, "")}.html`);
  try { return fs.existsSync(file) && fs.statSync(file).isFile(); } catch { return false; }
}
// Pages: a * matches any remainder, including slashes. An exclude that matches wins over an include.
function pagesRuleMatches(rule, name) {
  if (typeof rule !== "string" || !rule.includes("*")) return rule === name;
  const body = rule.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}$`).test(name);
}
function carriedRoutesFinding(routes, name) {
  if (routes.exclude.some((rule) => pagesRuleMatches(rule, name))) return `_routes.json excludes ${name}, which schedule.bin carries`;
  if (!routes.include.some((rule) => pagesRuleMatches(rule, name))) return `_routes.json does not include ${name}, which schedule.bin carries`;
  return null;
}
// Arbitrary Tailwind syntax: square brackets (a value, a property or a variant) or a (--var) value.
function isArbitrarySyntax(candidate) {
  return candidate.includes("[") || /\([^)]*--/.test(candidate);
}
// A bracket pair with no whitespace, attached the way a candidate is. A Markdown link and a spaced list are not candidates.
function isTailwindArbitrary(token) {
  if (/\([^)]*--[A-Za-z0-9_-]+\)/.test(token)) return true;
  if (!token.includes("[")) return false;
  if (/\[[^\]]*:[^\]]*\]/.test(token)) return true;
  if (/\[[^\]]+\]:/.test(token)) return true;
  if (/[A-Za-z0-9][!:-][^\s]*\[/.test(token) || /[A-Za-z0-9_-]-\[/.test(token)) return true;
  return false;
}
function arbitrarySyntaxTokens(text) {
  const hits = [];
  const seen = new Set();
  const pattern = /(?:!?[A-Za-z0-9_]*:)*!?[A-Za-z0-9_-]*\[[^\s\]]+\][A-Za-z0-9_:/.[\]()'!#%&>,+;?=^$|~@*-]*|(?:!?[A-Za-z0-9_]*:)*!?[A-Za-z0-9_-]*\((?:[A-Za-z-]+:)?--[A-Za-z0-9_-]+\)[A-Za-z0-9_:/.-]*/g;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    if (seen.has(token) || !isArbitrarySyntax(token) || !isTailwindArbitrary(token)) continue;
    seen.add(token);
    hits.push(token);
  }
  return hits;
}
// The site's pinned Tailwind. Null when node_modules cannot answer, and the caller then uses the regex.
async function loadStylesheetJudge(site) {
  const root = path.join(site, "node_modules", "@tailwindcss");
  const nodeEntry = path.join(root, "node", "dist", "index.mjs");
  const oxideEntry = path.join(root, "oxide", "index.js");
  const cssPath = path.join(site, "src", "styles", "tokens.css");
  if (!fs.existsSync(nodeEntry) || !fs.existsSync(oxideEntry) || !fs.existsSync(cssPath)) return null;
  try {
    const tw = await import(pathToFileURL(nodeEntry).href);
    const oxide = await import(pathToFileURL(oxideEntry).href);
    const Scanner = oxide.Scanner || (oxide.default && oxide.default.Scanner);
    if (typeof tw.compile !== "function" || typeof Scanner !== "function") return null;
    const compiled = await tw.compile(fs.readFileSync(cssPath, "utf8"), {
      base: path.dirname(cssPath),
      onDependency() {},
    });
    const scanner = new Scanner({});
    let previous = compiled.build([]);
    const decided = new Map();
    const compiles = (token) => {
      if (decided.has(token)) return decided.get(token);
      let next;
      try { next = compiled.build([token]); }
      catch { decided.set(token, false); return false; }
      const added = next !== previous;
      previous = next;
      decided.set(token, added);
      return added;
    };
    return {
      tokens(text, extension) {
        try {
          const found = scanner.getCandidatesWithPositions({ content: text, extension: extension || "md" });
          const seen = new Set();
          const out = [];
          for (const item of found) {
            const token = item && item.candidate;
            if (typeof token !== "string" || seen.has(token) || !isArbitrarySyntax(token)) continue;
            seen.add(token);
            if (compiles(token)) out.push(token);
          }
          return out;
        } catch { return null; }
      },
    };
  } catch { return null; }
}
// A destination on another origin is ignored. One on this origin is the path: query and fragment dropped, percent-decoded, trailing slash and trailing .html removed.
function reducedRedirectPath(destination, origin) {
  let url;
  try { url = new URL(destination, `${origin}/`); }
  catch { return null; }
  if (url.origin !== origin) return null;
  let pathname = url.pathname;
  try { pathname = decodeURIComponent(pathname); }
  catch { /* the path the URL parser produced stands */ }
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "");
  if (pathname.endsWith(".html")) pathname = pathname.slice(0, -5);
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, "");
  return pathname || "/";
}
function redirectEndpoints(text, origin) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    rows.push({ source: parts[0], destination: reducedRedirectPath(parts[1], origin) });
  }
  return rows;
}
function parsedInstants(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const value of list) {
    if (typeof value !== "string") return null;
    const at = Date.parse(value);
    if (!Number.isFinite(at)) return null;
    out.push(at);
  }
  return out;
}
// carried and notCarried are a partition of the instants check itself reads off the articles.
function assessScheduleNote(note, recordedBuild, after) {
  const expected = [...new Set(after.map((item) => item.at))];
  const problems = [];
  if (!note || typeof note !== "object" || Array.isArray(note)) {
    problems.push(".astro/kit-schedule.json is missing");
    return { problems, excusesAbsence: false, carriedCount: 0 };
  }
  if (note.buildTime !== recordedBuild) problems.push(".astro/kit-schedule.json buildTime is not the build record's string");
  const carried = parsedInstants(note.carried);
  const notCarried = parsedInstants(note.notCarried);
  if (!carried || !notCarried) {
    problems.push(".astro/kit-schedule.json carried and notCarried are not lists of instants");
    return { problems, excusesAbsence: false, carriedCount: 0 };
  }
  const duplicates = (list, name) => {
    const seen = new Set();
    for (const at of list) {
      if (seen.has(at)) problems.push(`.astro/kit-schedule.json ${name} lists ${instantText(at)} more than once`);
      seen.add(at);
    }
  };
  duplicates(carried, "carried");
  duplicates(notCarried, "notCarried");
  const carriedSet = new Set(carried);
  const notSet = new Set(notCarried);
  for (const at of carriedSet) {
    if (notSet.has(at)) problems.push(`.astro/kit-schedule.json lists ${instantText(at)} in both carried and notCarried`);
  }
  const expectedSet = new Set(expected);
  for (const at of expected) {
    if (!carriedSet.has(at) && !notSet.has(at)) problems.push(`.astro/kit-schedule.json omits ${instantText(at)}, which an article schedules after the build instant`);
  }
  for (const at of carriedSet) {
    if (!expectedSet.has(at)) problems.push(`.astro/kit-schedule.json carried lists ${instantText(at)}, which no article schedules after the build instant`);
  }
  for (const at of notSet) {
    if (!expectedSet.has(at)) problems.push(`.astro/kit-schedule.json notCarried lists ${instantText(at)}, which no article schedules after the build instant`);
  }
  const excusesAbsence = problems.length === 0 && carried.length === 0 && expected.every((at) => notSet.has(at)) && notSet.size === expectedSet.size;
  return { problems, excusesAbsence, carriedCount: carried.length };
}
const SCHEDULE_TYPES = new Set(["text/html; charset=utf-8", "application/xml", "text/plain; charset=utf-8", "text/css; charset=utf-8", "application/javascript", "application/json"]);
function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function checkDistFunction(scheduled, builtAt) {
  if (!built || kit.kitVersion !== "0.5.0" || !builtAt) return;
  const fnDir = path.join(site, "dist-function");
  let fnStat = null;
  try { fnStat = fs.lstatSync(fnDir); } catch { fnStat = null; }
  const after = scheduled.filter((item) => item.at > builtAt.at);
  if (fnStat && fnStat.isSymbolicLink()) { fail("dist-function/ is a link"); return; }
  if (fnStat && !fnStat.isDirectory()) { fail("dist-function/ is present and is not a directory"); return; }
  const present = Boolean(fnStat && fnStat.isDirectory());
  const note = readScheduleNote();
  let recordedBuild = null;
  try { recordedBuild = JSON.parse(fs.readFileSync(path.join(site, ".astro", "kit-build.json"), "utf8")).buildTime; } catch { recordedBuild = null; }
  if (after.length) {
    const scheduleNote = assessScheduleNote(note, recordedBuild, after);
    for (const problem of scheduleNote.problems) fail(problem);
    if (!present && scheduleNote.carriedCount > 0) fail(".astro/kit-schedule.json carried is not empty while dist-function/ is absent");
    if (!present && !scheduleNote.excusesAbsence) fail("dist-function/ is absent while an article is scheduled after the build instant");
  }
  if (!after.length && present) fail("dist-function/ is present while no article is scheduled after the build instant");
  if (!present) return;
  const allowed = ["_worker.js", "_routes.json", "schedule.bin", "function.json"];
  let names = [];
  try { names = fs.readdirSync(fnDir); } catch { fail("dist-function/ cannot be read"); return; }
  for (const name of names) {
    let st = null;
    try { st = fs.lstatSync(path.join(fnDir, name)); } catch { fail(`dist-function/${name} cannot be read`); continue; }
    if (st.isSymbolicLink()) { fail(`dist-function/${name} is a link`); continue; }
    if (st.isDirectory()) { fail(`dist-function/${name} is a folder`); continue; }
    if (!allowed.includes(name)) fail(`dist-function/${name} is not one of _worker.js, _routes.json, schedule.bin and function.json`);
  }
  for (const name of allowed) if (!names.includes(name)) fail(`dist-function/${name} is missing`);
  const readBytes = (name) => { try { return fs.readFileSync(path.join(fnDir, name)); } catch { return null; } };
  const workerBytes = readBytes("_worker.js");
  const routesBytes = readBytes("_routes.json");
  const scheduleBytes = readBytes("schedule.bin");
  const functionBytes = readBytes("function.json");
  let record = null;
  try { record = JSON.parse(String(functionBytes)); } catch { record = null; }
  const shapeKeys = ["kitVersion", "buildTime", "worker", "routes", "schedule", "carried", "notCarried", "paths"];
  const hex64 = (value) => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
  const isoList = (value) => Array.isArray(value) && value.every((item) => typeof item === "string" && Number.isFinite(Date.parse(item)));
  const shape = Boolean(record && typeof record === "object" && !Array.isArray(record) && functionBytes
    && functionBytes.toString("utf8") === `${JSON.stringify(record, null, 2)}\n`
    && shapeKeys.every((key, index) => Object.keys(record)[index] === key) && Object.keys(record).length === shapeKeys.length
    && record.kitVersion === "0.5.0" && typeof record.buildTime === "string"
    && hex64(record.worker) && hex64(record.routes) && hex64(record.schedule)
    && isoList(record.carried) && isoList(record.notCarried)
    && Number.isInteger(record.paths) && record.paths >= 0);
  if (!shape) fail("function.json is not the contract's shape");
  let recorded = null;
  try { recorded = JSON.parse(fs.readFileSync(path.join(site, ".astro", "kit-build.json"), "utf8")).buildTime; } catch { recorded = null; }
  if (!record || record.buildTime !== recorded) fail("function.json buildTime is not the build record's string");
  if (record && Array.isArray(record.carried) && Array.isArray(record.notCarried) && (!note || !sameInstantList(note.carried, record.carried) || !sameInstantList(note.notCarried, record.notCarried))) fail(".astro/kit-schedule.json carried and notCarried are not function.json's");
  if (workerBytes && (!record || record.worker !== sha256(workerBytes))) fail("function.json worker is not the sha256 of dist-function/_worker.js");
  if (routesBytes && (!record || record.routes !== sha256(routesBytes))) fail("function.json routes is not the sha256 of dist-function/_routes.json");
  if (scheduleBytes && (!record || record.schedule !== sha256(scheduleBytes))) fail("function.json schedule is not the sha256 of dist-function/schedule.bin");
  let srcBytes = null;
  try { srcBytes = fs.readFileSync(path.join(site, "src", "function", "_worker.js")); } catch { srcBytes = null; }
  if (workerBytes && srcBytes && !workerBytes.equals(srcBytes)) fail("dist-function/_worker.js differs from src/function/_worker.js");
  const stated = statedFunctionSha();
  if (workerBytes && stated && sha256(workerBytes) !== stated) fail("dist-function/_worker.js sha256 is not the sha256 site/KIT.md states");
  let routesDoc = null;
  if (!routesBytes) fail("_routes.json breaks the contract");
  else {
    const text = routesBytes.toString("utf8");
    let routes = null;
    try { routes = JSON.parse(text); } catch { routes = null; }
    const rules = routes && Array.isArray(routes.include) && Array.isArray(routes.exclude) ? routes.include.concat(routes.exclude) : null;
    const sorted = (list) => list.every((rule, index) => index === 0 || list[index - 1] <= rule);
    const routesOk = Boolean(text.endsWith("\n") && routes && !Array.isArray(routes) && routes.version === 1 && rules
      && Object.keys(routes).join(",") === "version,include,exclude"
      && text === `${JSON.stringify({ version: 1, include: routes.include, exclude: routes.exclude })}\n`
      && routes.include.length > 0 && rules.length <= 100
      && rules.every((rule) => typeof rule === "string" && rule.startsWith("/") && rule.length <= 100 && rule.length > 1 || rule === "/")
      && sorted(routes.include) && sorted(routes.exclude));
    if (!routesOk) fail("_routes.json breaks the contract");
    else routesDoc = routes;
  }
  let parsed = null;
  let versionAts = null;
  const carriedHtml = [];
  if (!scheduleBytes) fail("schedule.bin does not parse as the contract says");
  else {
    try {
      if (scheduleBytes.length < 8 || scheduleBytes.subarray(0, 4).toString("utf8") !== "WKS1") throw new Error("magic");
      const length = scheduleBytes.readUInt32BE(4);
      if (8 + length > scheduleBytes.length) throw new Error("length");
      const head = JSON.parse(scheduleBytes.subarray(8, 8 + length).toString("utf8"));
      const blobs = scheduleBytes.subarray(8 + length);
      if (!head || head.v !== 1 || head.kitVersion !== "0.5.0" || typeof head.buildTime !== "string" || !head.paths || typeof head.paths !== "object" || Array.isArray(head.paths)) throw new Error("head");
      if (record && head.buildTime !== record.buildTime) throw new Error("buildTime");
      if (record && shape && record.paths !== Object.keys(head.paths).length) throw new Error("paths");
      const ats = new Set();
      for (const [route, entry] of Object.entries(head.paths)) {
        if (!route.startsWith("/") || !entry || typeof entry.page !== "boolean" || !Array.isArray(entry.list) || entry.list.length === 0) throw new Error(route);
        let previous = -Infinity;
        for (const version of entry.list) {
          if (!version || !Number.isSafeInteger(version.at) || version.at <= previous || !Number.isSafeInteger(version.off) || !Number.isSafeInteger(version.len) || !Number.isSafeInteger(version.size) || version.off < 0 || version.len < 0 || version.size < 0 || version.off + version.len > blobs.length || !/^[0-9a-f]{32}$/.test(version.etag) || !SCHEDULE_TYPES.has(version.type)) throw new Error(route);
          const raw = gunzipSync(blobs.subarray(version.off, version.off + version.len));
          if (raw.length !== version.size || sha256(raw).slice(0, 32) !== version.etag) throw new Error(route);
          if (version.type === "text/html; charset=utf-8") carriedHtml.push({ route, at: version.at, html: raw.toString("utf8") });
          ats.add(version.at);
          previous = version.at;
        }
      }
      parsed = head;
      versionAts = ats;
    } catch { fail("schedule.bin does not parse as the contract says"); }
  }
  if (parsed && record && Array.isArray(record.carried)) {
    const carriedAt = new Set(record.carried.map((value) => Date.parse(value)).filter((value) => Number.isFinite(value)));
    for (const item of after) {
      if (!carriedAt.has(item.at)) continue;
      const route = `/articles/${item.id}`;
      const entry = parsed.paths[route];
      if (!entry || entry.list[0].at !== item.at) fail(`${path.relative(site, item.file)} is scheduled after the build instant and carried, and has no ${route} entry whose first version is at its instant`);
    }
    if (versionAts) {
      const seen = new Set();
      for (const value of record.carried) {
        const at = Date.parse(value);
        if (!Number.isFinite(at) || seen.has(at)) continue;
        seen.add(at);
        if (!versionAts.has(at)) fail(`schedule.bin has no version at ${instantText(at)}, which function.json carries`);
      }
    }
  }
  if (parsed) {
    const dist = path.join(site, "dist");
    for (const item of carriedHtml) checkKitHtml(`${item.route} at ${instantText(item.at)}`, item.html, null, dist);
    if (routesDoc) {
      for (const [route, entry] of Object.entries(parsed.paths)) {
        const names = [route];
        if (entry.page && route !== "/" && !distHasPage(route)) names.push(`${route}.html`, `${route}/`);
        for (const name of names) {
          const finding = carriedRoutesFinding(routesDoc, name);
          if (finding) fail(finding);
        }
      }
    }
  }
}
if (kit.collections.articles !== false) {
  const scheduled = [];
  walkMd(path.join(site, "src/content/articles"), (file) => {
    const top = topLevelFrontmatter(file);
    if (yamlBoolean(top.draft ?? "") === "true") return;
    const when = pubInstant(top);
    if (when) scheduled.push({ file, id: articleIdOf(file, top), ...when });
    else if (Object.hasOwn(top, "pubDate")) fail(`${path.relative(site, file)}: pubDate is not a date the build reads; write a date, 2026-10-09, or a date and time with its offset, 2026-10-09T09:00:00-06:00`);
  });
  const nowAt = envInstant ?? Date.now();
  const builtAt = distInstant();
  let fnRecord = null;
  if (kit.kitVersion === "0.5.0") {
    try { fnRecord = JSON.parse(fs.readFileSync(path.join(site, "dist-function", "function.json"), "utf8")); } catch { fnRecord = null; }
    if (!fnRecord) {
      const note = readScheduleNote();
      let recorded = null;
      try { recorded = JSON.parse(fs.readFileSync(path.join(site, ".astro", "kit-build.json"), "utf8")).buildTime; } catch { recorded = null; }
      if (note && note.buildTime === recorded) fnRecord = note;
    }
  }
  const instantListed = (key, at) => Array.isArray(fnRecord?.[key]) && fnRecord[key].some((value) => Date.parse(value) === at);
  const belowFunction = KNOWN_VERSIONS.indexOf(kit.kitVersion) < KNOWN_VERSIONS.indexOf("0.5.0");
  let stylesheetJudge = null;
  if (scheduled.some((item) => item.at > nowAt)) stylesheetJudge = await loadStylesheetJudge(site);
  for (const item of scheduled) {
    const shown = path.relative(site, item.file);
    if (item.at > nowAt) {
      tooOld("a future pubDate", `${shown}, dated ${instantText(item.at)} and not a draft,`);
      const extension = path.extname(item.file).replace(/^\./, "") || "md";
      const body = fs.readFileSync(item.file, "utf8");
      let tokens = stylesheetJudge ? stylesheetJudge.tokens(body, extension) : null;
      const asked = Array.isArray(tokens);
      if (!asked) tokens = arbitrarySyntaxTokens(body);
      for (const token of tokens) {
        const unasked = asked ? "" : " The check could not ask Tailwind.";
        fail(`${shown}: ${token} would publish the text in the stylesheet before the article goes live; move the styling to src/custom/custom.css or drop it until the article is live.${unasked}`);
      }
      const note = item.dateOnly ? "; a date alone goes live at 00:00 UTC, which is the evening before in the Americas, so give a time and offset, such as 2026-10-09T09:00:00-06:00, for an exact moment" : "";
      if (kit.kitVersion === "0.5.0" && instantListed("carried", item.at)) console.log(`scheduled: ${shown} goes live ${instantText(item.at)} through the kit Function`);
      else if (kit.kitVersion === "0.5.0" && instantListed("notCarried", item.at)) console.log(`scheduled: ${shown} goes live ${instantText(item.at)}, not carried (over the size budget): it goes live at the first build and deploy after that instant`);
      else console.log(`scheduled: ${shown} goes live ${instantText(item.at)}${note}${belowFunction ? ". Upgrade to 0.5.0 and it goes live at its instant on Cloudflare Pages" : ""}`);
    } else if (builtAt && item.at > builtAt.at) {
      if (kit.kitVersion === "0.5.0" && instantListed("carried", item.at)) console.log(`live: ${shown} went live ${instantText(item.at)} through the kit Function; a rebuild and deploy adds it to the site's search`);
      else console.log(`due: ${shown} went live ${instantText(item.at)}, after dist/ was built (${instantText(builtAt.at)}): rebuild, run check --built and Webmaster Job 3, and deploy`);
    }
  }
  if (built && builtAt) {
    console.log(`check --built: build instant ${instantText(builtAt.at)}, from ${builtAt.from}`);
    const dist = path.join(site, "dist");
    const read = (name) => { try { return fs.readFileSync(path.join(dist, name), "utf8"); } catch { return ""; } };
    const feeds = [["rss.xml", read("rss.xml")], ["llms.txt", read("llms.txt")]];
    let redirectOrigin = null;
    try { redirectOrigin = new URL(kit.siteUrl).origin; } catch { redirectOrigin = null; }
    const redirectRows = redirectOrigin ? redirectEndpoints(read("_redirects"), redirectOrigin) : [];
    try { for (const name of fs.readdirSync(dist).filter((n) => /^sitemap.*\.xml$/.test(n))) feeds.push([name, read(name)]); } catch { /* listed above */ }
    const pageUrl = (file) => {
      const rel = path.relative(dist, file).split(path.sep).join("/").replace(/\.html$/, "");
      return `${kit.siteUrl}/${rel === "index" ? "" : rel.replace(/(^|\/)index$/, "")}`;
    };
    const htmlPages = listHtml(dist, []).map((page) => ({ shown: path.relative(site, page.file), url: pageUrl(page.file), html: fs.readFileSync(page.file, "utf8").replace(/<!--[\s\S]*?-->/g, "") }));
    const entities = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", sol: "/", period: "." };
    const decodeAttr = (text) => text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));?/gi, (whole, hex, dec, name) => hex ? String.fromCodePoint(parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec)) : (entities[name.toLowerCase()] ?? whole));
    const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const item of scheduled) {
      if (item.at <= builtAt.at) continue;
      const route = `/articles/${item.id}`;
      const shown = path.relative(site, item.file);
      if (fs.existsSync(path.join(dist, `${route.slice(1)}.html`))) fail(`dist${route}.html: ${shown} is dated ${instantText(item.at)}, after this build's instant, and must not be built`);
      for (const page of htmlPages) {
        for (const m of page.html.matchAll(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
          let target;
          try { target = new URL(decodeAttr((m[1] ?? m[2] ?? m[3]).trim()), page.url); } catch { continue; }
          if (target.origin !== new URL(kit.siteUrl).origin) continue;
          let href = target.pathname.replace(/\/+$/, "");
          try { href = decodeURI(href); } catch { /* keep as written */ }
          if (href === route) { fail(`${page.shown} links to ${route}, which ${shown} schedules for ${instantText(item.at)}, after this build's instant`); break; }
        }
      }
      const listed = new RegExp(`(?:${escape(kit.siteUrl)}|(?<=^|[\\s(<\\[\\]"':]))${escape(route)}(?![\\p{L}\\p{N}_\\-./~%])`, "mu");
      for (const [name, text] of feeds) if (listed.test(text)) fail(`dist/${name} lists ${route}, which ${shown} schedules for ${instantText(item.at)}, after this build's instant`);
      for (const row of redirectRows) {
        if (row.source === route || row.destination === route) {
          fail(`dist/_redirects lists ${route}, which ${shown} schedules for ${instantText(item.at)}, after this build's instant`);
          break;
        }
      }
    }
    checkDistFunction(scheduled, builtAt);
  }
}
if (built && kit.collections && kit.collections.articles === false) checkDistFunction([], distInstant());

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

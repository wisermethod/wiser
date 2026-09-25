#!/usr/bin/env node
// Walk KIT.md check steps 1 to 5. Step 6 (served HTML) is a later fetch.
// Not a Wiser tool. Fail closed.
import fs from "node:fs";
import path from "node:path";

import { currentKit } from "./envelope.mjs";
const envelope = process.argv[2] && path.resolve(process.argv[2]);
if (!envelope) {
  console.error("usage: node check.mjs <envelope-folder>");
  process.exit(2);
}

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

if (kit.kitVersion !== "0.1.0") fail(`kitVersion ${kit.kitVersion} does not match KIT.md 0.1.0`);

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
  });
}
checkLinkList("nav");
checkLinkList("footer");
if (Object.hasOwn(kit, "nav") || Object.hasOwn(kit, "footer")) {
  const layoutPath = path.join(site, "src", "layouts", "SiteLayout.astro");
  const layout = fs.existsSync(layoutPath) ? fs.readFileSync(layoutPath, "utf8") : "";
  if (!layout.includes("site.nav.map(") || !layout.includes("site.footer.map(")) fail("kit.json sets nav or footer, but src/layouts/SiteLayout.astro does not render them: run Upgrade");
  const routerPath = path.join(envelope, "AGENTS.md");
  const router = fs.existsSync(routerPath) ? fs.readFileSync(routerPath, "utf8") : "";
  if (!router.includes("`nav` and `footer`")) fail("kit.json sets nav or footer, but the envelope AGENTS.md predates them and still refuses every kit.json edit: refresh its Content vs code section from site-AGENTS.md");
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
});
walkMd(path.join(site, "src/content/pages"), (file) => {
  const fm = frontmatter(file);
  if (!fm) return fail(`${file}: no frontmatter`);
  for (const key of requiredPage) {
    if (fm[key] === undefined || fm[key] === "") fail(`${file}: missing ${key}`);
  }
});

for (const rel of ["public/_redirects", "public/images/og-default.png", "src/styles/tokens.css", "package.json", ".gitignore"]) {
  if (!fs.existsSync(path.join(site, rel))) fail(`missing ${rel}`);
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

if (failures.length) {
  console.error(`check FAIL ${site}`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`check PASS ${site} (steps 1 to 5). Step 6 is the served-HTML fetch.`);

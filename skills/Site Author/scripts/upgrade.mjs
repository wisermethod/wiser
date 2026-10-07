#!/usr/bin/env node
// Copy kit code over a site. Archive each replaced kit-owned file first.
// Does not touch src/content/**, src/custom/**, public/images/** or public/fonts/**. Does not git init.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    site: { type: "string" },
    kit: { type: "string" },
  },
});

function fail(msg) {
  console.error(`upgrade: ${msg}`);
  process.exit(1);
}

import { currentKit, safeTree, versionLine } from "./envelope.mjs";
console.log(versionLine());
const envelope = values.site && path.resolve(values.site);
const kit = values.kit && path.resolve(values.kit);
if (!envelope || !kit) fail("required: --site --kit");
let site;
try { site = currentKit(envelope); } catch (error) { fail(error.message); }
if (!fs.existsSync(path.join(kit, "KIT.md")) || !fs.existsSync(path.join(kit, "package.json"))) fail("kit missing KIT.md or package.json");
const template = JSON.parse(fs.readFileSync(path.join(kit, "kit.json"), "utf8"));
if (template.kitVersion !== "0.4.2") fail(`unsupported kitVersion ${template.kitVersion}`);

// Read and split the kit stylesheet before anything is replaced, so a kit that cannot be spliced stops Upgrade with the site untouched.
const kitTokensPath = path.join(kit, "src/styles/tokens.css");
if (!fs.existsSync(kitTokensPath)) fail("kit missing src/styles/tokens.css");
const kitTokensEarly = fs.readFileSync(kitTokensPath, "utf8");

const skipTop = new Set(["node_modules", "dist", ".astro", ".git", "src", "public", "kit.json", "site-AGENTS.md", "AGENTS.md", "memory", "builds.md", "zArchive"]);
const preserved = new Set();
const originalKit = JSON.parse(fs.readFileSync(path.join(site, "kit.json"), "utf8"));
if (!["0.1.0", "0.2.0", "0.2.1", "0.2.2", "0.3.0", "0.4.0", "0.4.1", "0.4.2"].includes(originalKit.kitVersion)) fail(`unsupported kitVersion ${originalKit.kitVersion}`);

// A site's own component named like a component this kit ships would be replaced by the kit's after Upgrade, changing the site without its say, so Upgrade stops first and names the file.
{
  const kitComponents = new Set(fs.readdirSync(path.join(kit, "src", "components")).filter((n) => n.endsWith(".astro")).map((n) => n.slice(0, -".astro".length)));
  const customDir = path.join(site, "src", "custom", "components");
  const clashes = fs.existsSync(customDir) ? fs.readdirSync(customDir).filter((n) => n.endsWith(".astro") && kitComponents.has(n.slice(0, -".astro".length))) : [];
  if (clashes.length) fail(`src/custom/components/${clashes.join(", src/custom/components/")} shares a name with a component kit ${template.kitVersion} ships; rename it and every place a page uses it, then run Upgrade. Nothing was replaced`);
}

function archivePath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `${yy}-${mm}-${dd}`;
  // Beside the file, except under src/ and public/: a zArchive inside src/ is in Astro's source tree (src/pages/zArchive becomes routes), and one inside public/ is copied into dist/ and published, so each mirrors into site/zArchive/src/ or site/zArchive/public/.
  const inside = (root) => {
    const rel = path.relative(root, dir);
    return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)) ? rel : null;
  };
  const relToSrc = inside(path.join(site, "src"));
  const relToPublic = inside(path.join(site, "public"));
  const archiveDir = relToSrc !== null ? path.join(site, "zArchive", "src", relToSrc)
    : relToPublic !== null ? path.join(site, "zArchive", "public", relToPublic)
    : path.join(dir, "zArchive");
  fs.mkdirSync(archiveDir, { recursive: true });
  let n = 1;
  let dest;
  do {
    dest = path.join(archiveDir, `${prefix} V${n} - ${base}`);
    n += 1;
  } while (fs.existsSync(dest));
  return dest;
}

function copyFile(src, dest) {
  if (fs.existsSync(dest)) {
    const a = fs.readFileSync(src);
    const b = fs.readFileSync(dest);
    if (Buffer.compare(a, b) === 0) return;
    fs.copyFileSync(dest, archivePath(dest));
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyTree(from, to, { preserveContentImages = false } = {}) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (["node_modules", "dist", ".astro", ".git", "zArchive", "site-AGENTS.md", "AGENTS.md", "memory", "builds.md"].includes(name)) continue;
    // tokens.css is spliced below: the site keeps its font slots and @theme block, and the kit layers replace the rest.
    if (name === "tokens.css" && path.basename(from) === "styles") continue;
    const src = path.join(from, name);
    const out = path.join(to, name);
    const st = fs.lstatSync(src);
    if (preserveContentImages && name === "content" && path.basename(from) === "src") {
      preserved.add(out);
      continue;
    }
    // src/custom/ is site-owned, like src/content/: never copied over, never archived.
    if (preserveContentImages && name === "custom" && path.basename(from) === "src") {
      preserved.add(out);
      continue;
    }
    if (preserveContentImages && name === "files" && path.basename(from) === "public") {
      preserved.add(out);
      continue;
    }
    if (preserveContentImages && name === "images" && path.basename(from) === "public") {
      preserved.add(out);
      continue;
    }
    if (preserveContentImages && name === "fonts" && path.basename(from) === "public") {
      preserved.add(out);
      continue;
    }
    // A site's redirect rows are its own, written by content jobs; the kit's file only seeds a site that has none.
    if (preserveContentImages && name === "_redirects" && path.basename(from) === "public" && fs.existsSync(out)) {
      preserved.add(out);
      continue;
    }
    if (st.isDirectory()) copyTree(src, out, { preserveContentImages });
    else copyFile(src, out);
  }
}

if (indexOfLayerBase(kitTokensEarly) < 0) fail("kit tokens.css has no @layer base");
// The site's stylesheet is read now too, so one that is a folder or unreadable stops Upgrade before anything is replaced.
const siteTokensPathEarly = path.join(site, "src/styles/tokens.css");
let siteTokensEarly = null;
if (fs.existsSync(siteTokensPathEarly)) {
  try {
    if (!fs.statSync(siteTokensPathEarly).isFile()) throw new Error("not a file");
    siteTokensEarly = fs.readFileSync(siteTokensPathEarly, "utf8");
  } catch (error) {
    fail(`site src/styles/tokens.css cannot be read (${error.message}); nothing was replaced`);
  }
}

const siteRedirects = path.join(site, "public", "_redirects");
if (fs.existsSync(siteRedirects) && !fs.lstatSync(siteRedirects).isFile()) fail("site public/_redirects is not a file; nothing was replaced");

// Before 0.2.1, Upgrade archived a replaced public/ file into public/zArchive/, which is copied into dist/ and published. Move any such archive out first, and name an archived _redirects that differs from the site's, since its rows may be live redirects the site lost.
const legacyArchive = path.join(site, "public", "zArchive");
if (fs.existsSync(legacyArchive) && fs.lstatSync(legacyArchive).isDirectory()) {
  const target = path.join(site, "zArchive", "public");
  fs.mkdirSync(target, { recursive: true });
  const current = fs.existsSync(siteRedirects) ? fs.readFileSync(siteRedirects, "utf8") : "";
  for (const name of fs.readdirSync(legacyArchive)) {
    let dest = path.join(target, name);
    const parts = /^(\d\d-\d\d-\d\d) V(\d+) - (.+)$/.exec(name);
    for (let n = parts ? Number(parts[2]) + 1 : 2; fs.existsSync(dest); n++) {
      dest = path.join(target, parts ? `${parts[1]} V${n} - ${parts[3]}` : `${name} V${n}`);
    }
    const from = path.join(legacyArchive, name);
    const lostRows = / - _redirects$/.test(name) && fs.lstatSync(from).isFile() && fs.readFileSync(from, "utf8") !== current;
    fs.renameSync(from, dest);
    console.log(`upgrade: moved public/zArchive/${name} to zArchive/public/${path.basename(dest)}, out of the published tree`);
    if (lostRows) console.log(`upgrade: zArchive/public/${path.basename(dest)} differs from public/_redirects; an earlier Upgrade replaced the site's redirects, so compare the two and restore any row the site still needs`);
  }
  fs.rmdirSync(legacyArchive);
}

for (const name of fs.readdirSync(kit)) {
  if (skipTop.has(name)) continue;
  const src = path.join(kit, name);
  const dest = path.join(site, name);
  const st = fs.lstatSync(src);
  if (st.isDirectory()) copyTree(src, dest);
  else copyFile(src, dest);
}

const kitSrc = path.join(kit, "src");
if (fs.existsSync(kitSrc)) copyTree(kitSrc, path.join(site, "src"), { preserveContentImages: true });
const kitPublic = path.join(kit, "public");
if (fs.existsSync(kitPublic)) copyTree(kitPublic, path.join(site, "public"), { preserveContentImages: true });

// The first @layer base outside a comment or a string. Everything before it is the site's font slots and @theme block.
function indexOfLayerBase(css) {
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      for (i++; i < css.length && css[i] !== c; i++) if (css[i] === "\\") i++;
      continue;
    }
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 1;
      continue;
    }
    if (c === "@" && /^@layer\s+base\b/.test(css.slice(i))) return i;
  }
  return -1;
}
function writeTokens(file, next, note) {
  fs.copyFileSync(file, archivePath(file));
  fs.writeFileSync(file, next);
  console.log(note);
}
const siteTokensPath = path.join(site, "src/styles/tokens.css");
const kitTokens = kitTokensEarly;
const kitLayer = indexOfLayerBase(kitTokens);
if (kitLayer < 0) fail("kit tokens.css has no @layer base");
const kitTail = kitTokens.slice(kitLayer);
if (!fs.existsSync(siteTokensPath)) {
  fs.mkdirSync(path.dirname(siteTokensPath), { recursive: true });
  fs.writeFileSync(siteTokensPath, kitTokens);
  console.log("upgrade: tokens.css was missing and was replaced with the kit file; the site must reapply its token update");
} else {
  const siteTokens = siteTokensEarly;
  const siteLayer = indexOfLayerBase(siteTokens);
  if (siteLayer < 0) {
    writeTokens(siteTokensPath, kitTokens, "upgrade: tokens.css has no @layer base and was replaced with the kit file; the site must reapply its token update");
  } else {
    const next = siteTokens.slice(0, siteLayer) + kitTail;
    if (next === siteTokens) console.log("upgrade: tokens.css unchanged");
    else writeTokens(siteTokensPath, next, "upgrade: tokens.css kept the site's font slots and @theme block and replaced the kit layers");
  }
}

// Rewrite from the site's own kit.json so site-owned keys stay, including domain, siteUrl, collections, nav, footer, siteName, layout, icon, lang and blog.
originalKit.kitVersion = template.kitVersion;
const configPath = path.join(site, "kit.json");
const updated = JSON.stringify(originalKit, null, 2) + "\n";
if (fs.readFileSync(configPath, "utf8") !== updated) {
  fs.copyFileSync(configPath, archivePath(configPath));
  fs.writeFileSync(configPath, updated);
}

console.log(`upgrade: applied kit ${template.kitVersion} onto ${site}`);
console.log("upgrade: left src/content, src/custom, public/images, public/files and public/fonts untouched");

// The envelope router is outside Upgrade; say so when its frontmatter still names another kitVersion.
const routerPath = path.join(envelope, "AGENTS.md");
if (fs.existsSync(routerPath) && fs.statSync(routerPath).isFile()) {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(routerPath, "utf8"));
  const routerVersion = front && /^kitVersion:[ \t]*["']?([^"'\s]+)["']?[ \t]*$/m.exec(front[1]);
  if (!routerVersion || routerVersion[1] !== template.kitVersion) {
    console.log(`upgrade: the envelope AGENTS.md was not touched; set its kitVersion to ${template.kitVersion} and refresh its Content vs code section from site-AGENTS.md`);
  }
}

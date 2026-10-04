#!/usr/bin/env node
// Copy kit code over a site. Archive each replaced kit-owned file first.
// Does not touch src/content/**, public/images/** or public/fonts/**. Does not git init.
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

import { currentKit, safeTree } from "./envelope.mjs";
const envelope = values.site && path.resolve(values.site);
const kit = values.kit && path.resolve(values.kit);
if (!envelope || !kit) fail("required: --site --kit");
let site;
try { site = currentKit(envelope); } catch (error) { fail(error.message); }
if (!fs.existsSync(path.join(kit, "KIT.md")) || !fs.existsSync(path.join(kit, "package.json"))) fail("kit missing KIT.md or package.json");
const template = JSON.parse(fs.readFileSync(path.join(kit, "kit.json"), "utf8"));
if (template.kitVersion !== "0.2.0") fail(`unsupported kitVersion ${template.kitVersion}`);

const skipTop = new Set(["node_modules", "dist", ".astro", ".git", "src", "public", "kit.json", "site-AGENTS.md", "AGENTS.md", "memory", "builds.md", "zArchive"]);
const preserved = new Set();
const originalKit = JSON.parse(fs.readFileSync(path.join(site, "kit.json"), "utf8"));
if (originalKit.kitVersion !== "0.1.0" && originalKit.kitVersion !== "0.2.0") fail(`unsupported kitVersion ${originalKit.kitVersion}`);

function archivePath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `${yy}-${mm}-${dd}`;
  // Beside the file, except under src/: a zArchive there is inside Astro's source tree (src/pages/zArchive becomes routes), so it mirrors into site/zArchive/src/.
  const srcRoot = path.join(site, "src");
  const relToSrc = path.relative(srcRoot, dir);
  const underSrc = relToSrc === "" || (!relToSrc.startsWith("..") && !path.isAbsolute(relToSrc));
  const archiveDir = underSrc ? path.join(site, "zArchive", "src", relToSrc) : path.join(dir, "zArchive");
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
    if (preserveContentImages && name === "images" && path.basename(from) === "public") {
      preserved.add(out);
      continue;
    }
    if (preserveContentImages && name === "fonts" && path.basename(from) === "public") {
      preserved.add(out);
      continue;
    }
    if (st.isDirectory()) copyTree(src, out, { preserveContentImages });
    else copyFile(src, out);
  }
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
const kitTokensPath = path.join(kit, "src/styles/tokens.css");
const siteTokensPath = path.join(site, "src/styles/tokens.css");
const kitTokens = fs.readFileSync(kitTokensPath, "utf8");
const kitLayer = indexOfLayerBase(kitTokens);
if (kitLayer < 0) fail("kit tokens.css has no @layer base");
const kitTail = kitTokens.slice(kitLayer);
if (!fs.existsSync(siteTokensPath)) {
  fs.mkdirSync(path.dirname(siteTokensPath), { recursive: true });
  fs.writeFileSync(siteTokensPath, kitTokens);
  console.log("upgrade: tokens.css was missing and was replaced with the kit file; the site must reapply its token update");
} else {
  const siteTokens = fs.readFileSync(siteTokensPath, "utf8");
  const siteLayer = indexOfLayerBase(siteTokens);
  if (siteLayer < 0) {
    writeTokens(siteTokensPath, kitTokens, "upgrade: tokens.css has no @layer base and was replaced with the kit file; the site must reapply its token update");
  } else {
    const next = siteTokens.slice(0, siteLayer) + kitTail;
    if (next === siteTokens) console.log("upgrade: tokens.css unchanged");
    else writeTokens(siteTokensPath, next, "upgrade: tokens.css kept the site's font slots and @theme block and replaced the kit layers");
  }
}

// Rewrite from the site's own kit.json so site-owned keys stay, including domain, siteUrl, collections, nav, and footer.
originalKit.kitVersion = template.kitVersion;
const configPath = path.join(site, "kit.json");
const updated = JSON.stringify(originalKit, null, 2) + "\n";
if (fs.readFileSync(configPath, "utf8") !== updated) {
  fs.copyFileSync(configPath, archivePath(configPath));
  fs.writeFileSync(configPath, updated);
}

console.log(`upgrade: applied kit ${template.kitVersion} onto ${site}`);
console.log("upgrade: left src/content, public/images and public/fonts untouched");

#!/usr/bin/env node
// Copy kit code over a site. Archive each replaced kit-owned file first.
// Does not touch src/content/** or public/images/**. Does not git init.
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

const site = values.site && path.resolve(values.site);
const kit = values.kit && path.resolve(values.kit);
if (!site || !kit) fail("required: --site --kit");
if (!fs.existsSync(path.join(site, "kit.json"))) fail(`${site} has no kit.json (foreign). Refusing`);
if (fs.existsSync(path.join(site, ".git"))) fail(`nested .git in ${site}. Refusing`);

const skipTop = new Set(["node_modules", "dist", ".astro", ".git", "src", "public", "kit.json"]);
const preserved = new Set();
const originalKit = JSON.parse(fs.readFileSync(path.join(site, "kit.json"), "utf8"));

function archivePath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const prefix = `${yy}-${mm}-${dd}`;
  const archiveDir = path.join(dir, "zArchive");
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
    if (name === "node_modules" || name === "dist" || name === ".astro" || name === ".git") continue;
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

const template = JSON.parse(fs.readFileSync(path.join(kit, "kit.json"), "utf8"));
originalKit.kitVersion = template.kitVersion;
fs.writeFileSync(path.join(site, "kit.json"), JSON.stringify(originalKit, null, 2) + "\n");

console.log(`upgrade: applied kit ${template.kitVersion} onto ${site}`);
console.log("upgrade: left src/content and public/images untouched");

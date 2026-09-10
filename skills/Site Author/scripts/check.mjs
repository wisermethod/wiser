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

#!/usr/bin/env node
// Stand up a kit site at <root>/sites/<domain>/. Not a Wiser tool.
// Refuses: undeclared sites/, foreign folder, nested git, git init.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    domain: { type: "string" },
    "site-url": { type: "string" },
    kit: { type: "string" },
    magazine: { type: "boolean", default: false },
  },
});

function fail(msg) {
  console.error(`stand-up: ${msg}`);
  process.exit(1);
}

const root = values.root && path.resolve(values.root);
const domain = values.domain;
const siteUrl = values["site-url"];
const kit = values.kit && path.resolve(values.kit);
if (!root || !domain || !siteUrl || !kit) {
  fail("required: --root --domain --site-url --kit");
}
function isHost(d) {
  return /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(d);
}
if (domain.includes("/") || domain.includes(":") || isHost(domain) === false) {
  fail(`domain must be a lowercase registrable host, no scheme: ${domain}`);
}
let parsed;
try {
  parsed = new URL(siteUrl);
} catch {
  fail(`site-url is not a URL: ${siteUrl}`);
}
if (siteUrl.endsWith("/") || (parsed.pathname !== "/" && parsed.pathname !== "")) {
  fail(`site-url must have no trailing path or slash: ${siteUrl}`);
}

const agents = path.join(root, "AGENTS.md");
if (!fs.existsSync(agents)) fail(`no AGENTS.md at ${root}`);
const agentsText = fs.readFileSync(agents, "utf8");
// Only a declared-directory table row counts. Prose that names `sites/` is not a declaration.
if (!/^\| `sites\/` \|/m.test(agentsText)) {
  fail(`owning root AGENTS.md does not declare sites/. Refusing stand-up into ${root}`);
}

const dest = path.join(root, "sites", domain);
const sitesDir = path.join(root, "sites");
if (path.resolve(dest) === path.resolve(sitesDir) || path.dirname(path.resolve(dest)) !== path.resolve(sitesDir)) {
  fail(`domain must resolve to a folder inside sites/: ${domain}`);
}
if (fs.existsSync(path.join(dest, ".git"))) {
  fail(`nested .git in ${dest}. Refusing`);
}
if (fs.existsSync(dest)) {
  const hasKit = fs.existsSync(path.join(dest, "kit.json"));
  if (!hasKit) fail(`foreign folder (no kit.json) at ${dest}. Leaving it untouched`);
  fail(`${dest} already exists. Upgrade, do not stand up over a kit site`);
}

if (!fs.existsSync(path.join(kit, "KIT.md")) || !fs.existsSync(path.join(kit, "package.json"))) {
  fail(`kit at ${kit} is missing KIT.md or package.json`);
}

const skip = new Set(["node_modules", "dist", ".astro", ".git"]);
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (skip.has(name)) continue;
    const src = path.join(from, name);
    const out = path.join(to, name);
    const st = fs.lstatSync(src);
    if (st.isDirectory()) copyTree(src, out);
    else fs.copyFileSync(src, out);
  }
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
copyTree(kit, dest);

const kitJson = {
  kitVersion: "0.1.0",
  domain,
  siteUrl,
  collections: {
    pages: true,
    articles: true,
    authors: true,
    sections: Boolean(values.magazine),
    issues: Boolean(values.magazine),
  },
};
fs.writeFileSync(path.join(dest, "kit.json"), JSON.stringify(kitJson, null, 2) + "\n");

const siteAgentsSrc = path.join(kit, "site-AGENTS.md");
const siteAgentsDest = path.join(dest, "AGENTS.md");
if (fs.existsSync(siteAgentsSrc)) {
  let text = fs.readFileSync(siteAgentsSrc, "utf8");
  text = text.replaceAll("{{domain}}", domain).replaceAll("{{siteUrl}}", siteUrl).replaceAll("{{kitVersion}}", kitJson.kitVersion);
  fs.writeFileSync(siteAgentsDest, text);
}

console.log(`stand-up: wrote ${dest}`);
console.log("stand-up: run npm install and npm run dev in that folder. check is next. no git init.");

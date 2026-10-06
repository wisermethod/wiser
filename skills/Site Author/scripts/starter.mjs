#!/usr/bin/env node
// Copy one reviewed starter into a site's src/custom/components/. Not a Wiser tool.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { currentKit } from "./envelope.mjs";

const NAMES = ["Testimonial", "CardGrid", "Card", "Steps", "CallToAction"];
const WITH = { CardGrid: ["CardGrid", "Card"] };
const startersDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "starters");

function fail(message) {
  console.error(`starter FAIL: ${message}`);
  process.exit(1);
}

function versionAtLeast(version, floor) {
  const parts = (value) => String(value ?? "").split(".").map((part) => Number(part));
  const got = parts(version);
  const need = parts(floor);
  for (let i = 0; i < 3; i++) {
    const left = Number.isFinite(got[i]) ? got[i] : 0;
    const right = Number.isFinite(need[i]) ? need[i] : 0;
    if (left > right) return true;
    if (left < right) return false;
  }
  return true;
}

let values;
try {
  ({ values } = parseArgs({
    options: {
      site: { type: "string" },
      name: { type: "string" },
      list: { type: "boolean" },
    },
    strict: true,
  }));
} catch (error) {
  fail(error.message);
}

if (values.list) {
  for (const name of NAMES) console.log(name);
  process.exit(0);
}
if (!values.site || !values.name) fail("usage: node starter.mjs --site <envelope> --name <Starter>");
if (!NAMES.includes(values.name)) fail(`unknown starter ${values.name}. node starter.mjs --list prints the names`);

let site;
try { site = currentKit(path.resolve(values.site)); }
catch (error) { fail(error.message); }

let kit;
try { kit = JSON.parse(fs.readFileSync(path.join(site, "kit.json"), "utf8")); }
catch (error) { fail(`kit.json: ${error.message}`); }
if (!versionAtLeast(kit.kitVersion, "0.3.0")) fail(`site is kitVersion ${kit.kitVersion ?? "missing"}; a starter needs 0.3.0 or newer`);

const names = WITH[values.name] ?? [values.name];
const destDir = path.join(site, "src", "custom", "components");
for (const name of names) {
  const dest = path.join(destDir, `${name}.astro`);
  if (fs.existsSync(dest)) fail(`${path.relative(site, dest)} already exists`);
}
fs.mkdirSync(destDir, { recursive: true });
for (const name of names) {
  fs.copyFileSync(path.join(startersDir, `${name}.astro`), path.join(destDir, `${name}.astro`));
  console.log(`starter: copied ${name}.astro`);
}

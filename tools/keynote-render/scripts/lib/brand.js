/**
 * Reading the presentation layer. A brand file names an installed theme, maps
 * the intents a deck spec uses onto that theme's master layouts, maps semantic
 * keys onto the text-item indices a master exposes, and optionally stamps a
 * logo.
 *
 * The brand file is a functional input the caller names by absolute path; this
 * tool searches for nothing and knows no library location. This module is the
 * only one that needs an installed package, so it is imported only when a
 * command was given a brand.
 */

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';

const LOGO_KEYS = new Set(['path', 'x', 'y', 'width', 'height', 'slides']);

/** Read and check one brand file. Returns { brand, dir }, dir anchoring its relative paths. */
export function loadBrand(file) {
  let brand;
  try {
    brand = parseYaml(readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`${file} is not valid YAML: ${e.message}`);
  }
  if (!isMap(brand)) {
    throw new Error(`${file} is empty or is not a YAML mapping.`);
  }

  const problems = [];
  for (const key of Object.keys(brand)) {
    if (!['theme', 'layouts', 'texts', 'logo'].includes(key)) {
      problems.push(`"${key}" is not part of a brand file; the sections are theme, layouts, texts, logo`);
    }
  }
  if (brand.theme !== undefined && typeof brand.theme !== 'string') {
    problems.push('theme must be the name of an installed theme');
  }
  if (brand.layouts !== undefined) {
    if (!isMap(brand.layouts)) problems.push('layouts must map intent names to master layout names');
    else for (const [intent, master] of Object.entries(brand.layouts)) {
      if (typeof master !== 'string') problems.push(`layouts.${intent} must be a master layout name`);
    }
  }
  if (brand.texts !== undefined) {
    if (!isMap(brand.texts)) problems.push('texts must map a master layout name to its semantic keys');
    else for (const [layout, keys] of Object.entries(brand.texts)) {
      if (!isMap(keys)) { problems.push(`texts.${layout} must map semantic keys to text item indices`); continue; }
      for (const [key, index] of Object.entries(keys)) {
        if (!Number.isInteger(index) || index < 0) {
          problems.push(`texts.${layout}.${key} must be a text item index, a whole number from 0`);
        }
      }
    }
  }
  if (brand.logo !== undefined) {
    if (!isMap(brand.logo)) problems.push('logo must be a mapping carrying at least a path');
    else {
      if (typeof brand.logo.path !== 'string') problems.push('logo.path is required and must be a file path');
      // Checked key by key, because an unrecognized key is silently ignored
      // downstream: a misspelled "slides" would stamp the logo on every slide
      // and report nothing.
      for (const key of Object.keys(brand.logo)) {
        if (!LOGO_KEYS.has(key)) {
          problems.push(`logo.${key} is not part of a logo; the fields are ${[...LOGO_KEYS].join(', ')}`);
        } else if (key !== 'path' && key !== 'slides' && typeof brand.logo[key] !== 'number') {
          problems.push(`logo.${key} must be a number of points`);
        }
      }
      if (brand.logo.slides !== undefined && !isSlideTarget(brand.logo.slides)) {
        problems.push('logo.slides must be "all", "first", or an array of slide numbers from 1');
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`${file} is not a valid brand file:\n- ${problems.join('\n- ')}`);
  }

  return { brand, dir: dirname(file) };
}

function isMap(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Which slides a logo lands on: every one, the first, or the numbers listed. */
function isSlideTarget(value) {
  if (value === 'all' || value === 'first') return true;
  return Array.isArray(value) && value.length > 0
    && value.every((n) => Number.isInteger(n) && n > 0);
}

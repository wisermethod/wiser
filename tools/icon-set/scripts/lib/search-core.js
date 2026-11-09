/** Portable catalog search. Pass the package's raw catalog: Phosphor's icons
 * export, or Health's meta-data.json array. Returns the CLI's complete object.
 * No files or Node APIs. licenceText is optional for pinned catalogs; hosts that
 * load LICENSE pass its text to preserve the installed copyright verbatim.
 */
export const PACKAGE = '@phosphor-icons/core';
export const VERSION = '2.1.1';
export const WEIGHTS = ['thin', 'light', 'regular', 'bold', 'fill', 'duotone'];
export const SETS = {
  phosphor: { package: PACKAGE, version: VERSION, weights: WEIGHTS, catalog: 'dist/index.mjs' },
  health: { package: 'healthicons', version: '2.0.0', weights: ['filled', 'outline'], catalog: 'public/icons/meta-data.json' }
};

export function searchIcons(icons, query, limit = 20, set = 'phosphor') {
  const words = query.toLowerCase().trim().split(/\s+/);
  return icons.map(icon => {
    const { name, tags, categories, title, category } = icon;
    const fields = [name, ...tags, ...(set === 'health' ? [title, category] : categories)].map(s => s.toLowerCase());
    const scores = words.map(word => {
      if (fields[0] === word) return 100;
      if (fields[0].split(set === 'health' ? /[-_]/ : '-').includes(word)) return 60;
      if (fields[0].includes(word)) return 40;
      if (fields.slice(1).some(field => field === word)) return 20;
      return fields.slice(1).some(field => field.includes(word)) ? 10 : 0;
    });
    return { ...icon, score: scores.every(Boolean) ? scores.reduce((a, b) => a + b, 0) : 0 };
  }).filter(icon => icon.score > 0)
    .sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .slice(0, limit).map(({ name, tags, categories, title, category }) => set === 'health'
      ? { name, path: `${category}/${name}`, title, category, tags, weights: SETS.health.weights }
      : { name, tags, categories });
}


const PINNED_LICENCES = {
  phosphor: 'MIT License\n\nCopyright (c) 2023 Phosphor Icons',
  health: 'MIT License\n\nCopyright (c) 2021 Resolve to Save Lives'
};

export function licenceLine(set, licence = PINNED_LICENCES[set]) {
  const { package: pkg, version } = SETS[set];
  const copyright = licence.split(/\r?\n/).find(line => /^Copyright \(c\)/.test(line));
  if (!/^MIT License\r?\n/.test(licence) || !copyright) throw new Error(`the ${pkg} licence is unreadable; restore the pinned package with node scripts/icon-set.js check --install`);
  return set === 'health'
    ? `Health Icons ${version}: icons CC0 1.0 (healthicons.org); package MIT License, ${copyright}`
    : `Phosphor Icons ${version}, MIT License, ${copyright}`;
}

export function normalizeCatalog(set, catalog) {
  return set === 'health'
    ? catalog.map(({ id, title, category, tags, path }) => ({ name: id, title, category,
      tags: tags.filter(tag => !/^dhis2:/i.test(tag)), path }))
    : catalog;
}

export function searchCatalog(set, catalog, query, limit = 20, licenceText) {
  if (!Object.hasOwn(SETS, set)) throw new Error(`unknown set "${set}"; choose phosphor or health`);
  return { results: searchIcons(normalizeCatalog(set, catalog), query, limit, set), license: licenceLine(set, licenceText) };
}

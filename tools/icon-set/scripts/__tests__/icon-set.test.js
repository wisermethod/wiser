import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSvg, nearestNames, searchIcons, WEIGHTS, SETS, assetPath } from '../lib/icons.js';

const TOOL = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TEMP = mkdtempSync(join(tmpdir(), 'wiser-icon-set-test-'));
const ENV = { ...process.env, WISER_ALLOW_INSTALL: '', npm_config_cache: join(TEMP, 'npm-cache'), npm_config_update_notifier: 'false' };
// An offline CI run may supply a cache already populated by the one pinned
// install. All other scratch, copied plugins and deliverables remain in TEMP.
if (process.env.npm_config_cache) ENV.npm_config_cache = process.env.npm_config_cache;

function copyTool(label) {
  const root = join(TEMP, label);
  const tool = join(root, 'tools', 'icon-set');
  mkdirSync(join(root, 'tools', 'lib'), { recursive: true });
  writeFileSync(join(root, 'tools', 'AGENTS.md'), '# Test plugin\n');
  cpSync(join(TOOL, '..', 'lib', 'consent.js'), join(root, 'tools', 'lib', 'consent.js'));
  for (const file of ['package.json', 'package-lock.json', 'scripts']) {
    cpSync(join(TOOL, file), join(tool, file), { recursive: true });
  }
  return { root, tool, script: join(tool, 'scripts', 'icon-set.js') };
}

function run(copy, args, env = {}) {
  const result = spawnSync(process.execPath, [copy.script, ...args], {
    encoding: 'utf8', cwd: TEMP, env: { ...ENV, ...env }, timeout: 120000
  });
  assert.ifError(result.error);
  return result;
}

function success(copy, args, env) {
  const result = run(copy, args, env);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function refusal(copy, args, pattern) {
  const result = run(copy, args);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, pattern);
  return result;
}

const missing = copyTool('missing');
const installed = copyTool('installed');
const output = name => join(TEMP, name);
const getArgs = (dest = output('icon.svg'), weight = 'fill', name = 'person-simple') =>
  ['get', '--name', name, '--weight', weight, '--size', '48', '--output', dest];

// The SAME assertion runs against a real fragment and the planted control.
// It examines every attribute in every tag, including descendant paths.
function assertFragment(svg) {
  assert.match(svg, /^<svg\s/);
  assert.match(svg, /<\/svg>\s*$/);
  assert.equal((svg.match(/<svg\b/g) || []).length, 1);
  for (const [attribute, value] of [['x', '-12.5'], ['y', '20'], ['width', '48'], ['height', '48']]) {
    assert.match(svg.slice(0, svg.indexOf('>')), new RegExp(`\\s${attribute}="${value}"`));
  }
  assert.match(svg, /aria-hidden="true"/);
  assert.doesNotMatch(svg, /\btransform\s*=/i);
  assert.doesNotMatch(svg, /<\?xml|<!doctype|<title\b/i);
}

after(() => rmSync(TEMP, { recursive: true, force: true }));

describe('fresh-copy usage and refusal before installation', () => {
  for (const args of [[], ['help'], ['--help'], ['-h'], ...['check', 'search', 'get'].flatMap(c =>
    [[c, 'help'], [c, '--help'], [c, '-h']])]) {
    it(`prints usage for ${JSON.stringify(args)} with no package or consent marker`, () => {
      const result = run(missing, args);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Usage:/);
      assert.equal(result.stderr, '');
      assert.equal(existsSync(join(missing.root, '.wiser-consent')), false);
      assert.equal(existsSync(join(missing.tool, 'node_modules')), false);
    });
  }

  for (const c of ['check', 'search', 'get']) {
    it(`${c} refuses unknown flags before an authorized install`, () => {
      refusal(missing, [c, '--install', '--bogus'], /unknown option "--bogus".*help/);
      assert.equal(existsSync(join(missing.root, '.wiser-consent')), false);
      assert.equal(existsSync(join(missing.tool, 'node_modules')), false);
    });
    it(`${c} refuses positional arguments`, () => refusal(missing, [c, 'unexpected'], /unexpected argument/));
    it(`${c} refuses repeated install flags`, () => refusal(missing, [c, '--install', '--install'], /more than once/));
  }

  it('refuses an unknown command', () => refusal(missing, ['draw'], /unknown command "draw"/));
  it('refuses extra arguments to top-level help', () => refusal(missing, ['help', '--bogus'], /unexpected argument/));
  it('importing the entry script does not run main or terminate the importer', () => {
    const code = `await import(${JSON.stringify(pathToFileURL(missing.script).href)}); console.log('imported');`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: ENV });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'imported\n');
  });
  it('check surveys an absent package even with an unattended install environment', () => {
    const result = success(missing, ['check'], { WISER_ALLOW_INSTALL: '1' });
    assert.equal(result.state, 'absent');
    assert.equal(result.installed, false);
    assert.match(result.remediation, /node scripts\/icon-set.js check --install/);
  });
  it('a saved consent marker alone does not make a survey install', () => {
    writeFileSync(join(missing.root, '.wiser-consent'), JSON.stringify({ realpath: realpathSync(missing.root) }));
    assert.equal(success(missing, ['check']).state, 'absent');
    assert.equal(existsSync(join(missing.tool, 'node_modules')), false);
    rmSync(join(missing.root, '.wiser-consent'));
  });
  for (const args of [['search', '--query', 'person'], getArgs()]) {
    it(`${args[0]} stops with the pinned package and the single install command`, () => {
      const result = refusal(missing, args, /@phosphor-icons\/core@2\.1\.1 is absent/);
      assert.match(result.stderr, /registry\.npmjs\.org/);
      assert.ok(result.stderr.includes(join(missing.tool, 'node_modules')));
      assert.match(result.stderr, /node scripts\/icon-set.js check --install/);
      assert.equal(existsSync(output('icon.svg')), false);
    });
  }
  it('ignores another plugin copy in the consent marker', () => {
    writeFileSync(join(missing.root, '.wiser-consent'), JSON.stringify({ realpath: installed.root }));
    refusal(missing, ['search', '--query', 'person'], /check --install/);
    rmSync(join(missing.root, '.wiser-consent'));
  });

  const mistakes = [
    [['check', '--set', 'health', '--install'], /unknown option "--set"/],
    ...['search', 'get'].flatMap(command => [
      [[command, '--set'], /--set needs a value/],
      [[command, '--set', 'other', '--install'], /unknown set.*phosphor or health/],
      [[command, '--set', 'health', '--set', 'health', '--install'], /--set was given more than once/]
    ]),
    [[...getArgs(), '--set', 'health', '--install'], /unknown weight.*health.*filled, outline/],
    [[...getArgs(output('wrong-phosphor.svg'), 'filled'), '--install'], /unknown weight.*phosphor.*thin, light, regular, bold, fill, duotone/],
    [[...getArgs(output('wrong-outline.svg'), 'outline'), '--set', 'phosphor', '--install'], /unknown weight.*phosphor/],
    [[...getArgs(output('health-accent.svg'), 'filled', 'doctor'), '--set', 'health', '--accent', 'red', '--install'], /--accent requires.*phosphor/],
    [[...getArgs(output('health-24px.svg'), 'filled-24px', 'doctor'), '--set', 'health', '--install'], /unknown weight.*filled, outline/],
    [['search'], /--query is required/],
    [['search', '--query'], /--query needs a value/],
    [['search', '--query', '   '], /--query is required/],
    [['search', '--query', 'person', '--query', 'screen'], /more than once/],
    ...['0', '-2', '1.5', 'all', '9007199254740992'].map(n => [['search', '--query', 'person', '--limit', n], /--limit must/]),
    [['get'], /--name is required/],
    [['get', '--name', 'person-simple'], /--weight is required/],
    [['get', '--name', 'person-simple', '--weight', 'heavy'], /unknown weight.*heavy/],
    [['get', '--name', 'person-simple', '--weight', 'fill'], /--size is required/],
    [['get', '--name', 'person-simple', '--weight', 'fill', '--size', '48'], /--output is required/],
    ...['0', '-1', '48px', 'NaN', 'Infinity'].map(n => [getArgs().map(v => v === '48' ? n : v), /--size must/]),
    [getArgs('relative.svg'), /--output must be absolute/],
    [getArgs(join(missing.tool, 'out.svg')), /inside this tool/],
    [getArgs(output('no-parent/icon.svg')), /parent must be an existing directory/],
    [[...getArgs(), '--x', '2'], /--x and --y require --fragment/],
    [[...getArgs(), '--fragment'], /--x is required/],
    [[...getArgs(), '--fragment', '--x', '2'], /--y is required/],
    [[...getArgs(), '--fragment', '--x', '2px', '--y', '2'], /--x must/],
    [[...getArgs(), '--accent', 'red'], /--accent requires/],
    [[...getArgs(), '--class', 'two classes'], /--class must/],
    [[...getArgs(), '--color', 'url(https://example.invalid/x)'], /--color must/],
    [[...getArgs(), '--color', 'red" onload="x'], /--color must/],
    [[...getArgs(), '--color', '--install'], /--color needs a value/],
    [['check', '--limit', '2'], /unknown option "--limit"/]
  ];
  for (const [args, message] of mistakes) {
    it(`refuses ${JSON.stringify(args)} without installation`, () => {
      refusal(missing, args, message);
      assert.equal(existsSync(join(missing.tool, 'node_modules')), false);
      assert.equal(existsSync(join(missing.root, '.wiser-consent')), false);
    });
  }
  it('refuses occupied destinations without changing their bytes', () => {
    const p = output('occupied.svg');
    writeFileSync(p, 'keep');
    refusal(missing, getArgs(p), /already exists/);
    assert.equal(readFileSync(p, 'utf8'), 'keep');
    refusal(missing, getArgs(TEMP), /already exists/);
  });
  it('canonicalizes symlinked parents before testing the tool boundary', () => {
    const p = output('tool-link');
    symlinkSync(missing.tool, p, 'dir');
    refusal(missing, getArgs(join(p, 'out.svg')), /inside this tool/);
  });
  it('refuses a variant spelling of the tool directory on a case-insensitive volume', (t) => {
    const variant = missing.tool.replace(/icon-set$/, 'ICON-SET');
    let caseInsensitive = false;
    try { caseInsensitive = statSync(variant).ino === statSync(missing.tool).ino; } catch {}
    if (!caseInsensitive) { t.skip('this volume is case-sensitive'); return; }
    refusal(missing, getArgs(join(variant, 'out.svg')), /inside this tool/);
    assert.equal(existsSync(join(missing.tool, 'out.svg')), false);
  });
  it('refuses dangling symlinks and hard links to tool files', () => {
    const p = output('dangling.svg');
    symlinkSync(join(TEMP, 'absent.svg'), p);
    refusal(missing, getArgs(p), /cannot be resolved/);
    const hard = output('hard.svg');
    linkSync(join(missing.tool, 'package.json'), hard);
    refusal(missing, getArgs(hard), /already exists/);
  });
});

describe('real Phosphor 2.1.1 in a temporary plugin copy', () => {
  before(() => {
    const result = success(installed, ['check', '--install']);
    assert.equal(result.installed, true);
    assert.equal(result.version, '2.1.1');
  });
  it('writes this temporary plugin copy’s consent marker at install time', () => {
    const marker = join(installed.root, '.wiser-consent');
    const data = JSON.parse(readFileSync(marker, 'utf8'));
    assert.equal(data.realpath, realpathSync(installed.root));
    assert.equal(data.tool, 'icon-set');
    assert.match(data.date, /^\d{4}-\d{2}-\d{2}$/);
    if (process.platform !== 'win32') assert.equal(statSync(marker).mode & 0o777, 0o600);
  });
  it('check reports the exact local version without installation', () => {
    const result = success(installed, ['check']);
    assert.equal(result.state, 'ready');
    assert.equal(result.requiredVersion, '2.1.1');
  });
  it('search person returns names containing person first and the default 20 results', () => {
    const { results } = success(installed, ['search', '--query', 'person']);
    assert.equal(results.length, 20);
    assert.ok(results.some(icon => icon.name.includes('person')));
    assert.ok(results[0].name.includes('person'));
    for (const icon of results) {
      assert.deepEqual(Object.keys(icon), ['name', 'tags', 'categories']);
      assert.ok(Array.isArray(icon.tags) && Array.isArray(icon.categories));
    }
  });
  it('search uses tags, categories, case-insensitive words, limits and deterministic ordering', () => {
    const { results } = success(installed, ['search', '--query', 'PEDESTRIAN PEOPLE', '--limit', '3']);
    assert.equal(results.length, 3);
    assert.ok(results.every(icon => [...icon.tags, ...icon.categories].join(' ').includes('pedestrian')));
    assert.deepEqual(results, success(installed, ['search', '--query', 'pedestrian people', '--limit', '3']).results);
    assert.deepEqual(success(installed, ['search', '--query', 'no-such-keyword-xyz']).results, []);
  });
  it('writes a recoloured standalone person-simple fill SVG and the exact licence line', () => {
    const p = output('standalone.svg');
    const before = readdirSync(TEMP).sort();
    const result = success(installed, [...getArgs(p), '--color', '#123abc']);
    const svg = readFileSync(p, 'utf8');
    assert.equal(result.output, realpathSync(p));
    assert.equal(result.name, 'person-simple');
    assert.equal(result.weight, 'fill');
    assert.equal(result.license, 'Phosphor Icons 2.1.1, MIT License, Copyright (c) 2023 Phosphor Icons');
    assert.match(svg, /data-icon="phosphor:person-simple:fill:2\.1\.1"/);
    assert.match(svg, /fill="#123abc"/);
    assert.match(svg, /width="48" height="48" viewBox="0 0 256 256"/);
    assert.match(svg, /role="img"/);
    assert.match(svg, /<title>person-simple<\/title>/);
    assert.doesNotMatch(svg, /currentColor|<script|\bid=|\bhref=|\btransform=/i);
    assert.deepEqual(readdirSync(TEMP).sort(), [...before, 'standalone.svg'].sort());
  });
  it('writes one nested SVG at the requested position, size and class without transforms', () => {
    const p = output('fragment.svg');
    success(installed, [...getArgs(p), '--fragment', '--x', '-12.5', '--y', '20', '--class', 'screen-glyph']);
    const svg = readFileSync(p, 'utf8');
    assertFragment(svg);
    assert.match(svg, /class="screen-glyph"/);
    assert.match(svg, /data-icon="phosphor:person-simple:fill:2\.1\.1"/);
  });
  it('the fragment assertion FAILS when a transform is planted on a descendant', () => {
    const svg = readFileSync(output('fragment.svg'), 'utf8');
    const planted = svg.replace('<path ', '<path transform="translate(1 2)" ');
    const control = output('fragment-control.test.mjs');
    writeFileSync(control, `import assert from 'node:assert/strict';\nimport { test } from 'node:test';\n${assertFragment.toString()}\ntest('planted transform', () => assertFragment(${JSON.stringify(planted)}));\n`);
    const controlEnv = { ...ENV };
    delete controlEnv.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', control], { encoding: 'utf8', env: controlEnv });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /# tests 1\b/);
    assert.match(result.stdout, /# pass 0\b/);
    assert.match(result.stdout, /# fail 1\b/);
    assert.match(result.stdout, /doesNotMatch|transform/);
  });
  it('duotone with accent recolours the background solid and leaves no fractional opacity', () => {
    const p = output('accent.svg');
    const result = success(installed, [...getArgs(p, 'duotone'), '--color', 'rgb(12 34 56)', '--accent', '#abcdef']);
    const svg = readFileSync(p, 'utf8');
    assert.match(svg, /fill="rgb\(12 34 56\)"/);
    assert.match(svg, /fill="#abcdef"/);
    assert.doesNotMatch(svg, /(?:fill-|stroke-)?opacity\s*=/);
    assert.doesNotMatch(svg, /currentColor/);
    assert.equal(result.background.opacity, 1);
  });
  it('duotone without accent preserves source opacity and reports the default', () => {
    const p = output('default-accent.svg');
    const result = success(installed, [...getArgs(p, 'duotone'), '--color', 'rebeccapurple']);
    assert.match(readFileSync(p, 'utf8'), /opacity="0.2"/);
    assert.equal(result.background.color, 'rebeccapurple');
    assert.deepEqual(result.background.sourceOpacities, [0.2]);
    assert.match(result.background.note, /--color at its source opacity/);
  });
  for (const weight of WEIGHTS) {
    it(`get supports ${weight} and uses its real source viewBox`, () => {
      const p = output(`weight-${weight}.svg`);
      success(installed, getArgs(p, weight));
      assert.match(readFileSync(p, 'utf8'), new RegExp(`phosphor:person-simple:${weight}:2\\.1\\.1`));
    });
  }
  it('refuses an unknown icon with three computed nearest names and writes no file', async () => {
    const iconsPath = join(installed.tool, 'node_modules', '@phosphor-icons', 'core', 'dist', 'index.mjs');
    const { icons } = await import(pathToFileURL(iconsPath).href);
    const names = nearestNames(icons, 'person-simpl');
    assert.equal(names.length, 3);
    assert.equal(names[0], 'person-simple');
    const result = refusal(installed, getArgs(output('unknown.svg'), 'fill', 'person-simpl'), /nearest names:/);
    assert.ok(result.stderr.includes(`nearest names: ${names.join(', ')}`));
    assert.equal(existsSync(output('unknown.svg')), false);
  });
  it('check refuses a wrong installed version, even with --install', () => {
    const p = join(installed.tool, 'node_modules', '@phosphor-icons', 'core', 'package.json');
    const original = readFileSync(p, 'utf8');
    try {
      writeFileSync(p, JSON.stringify({ ...JSON.parse(original), version: '2.1.0' }));
      refusal(installed, ['check'], /must be exactly 2\.1\.1; found 2\.1\.0/);
      refusal(installed, ['check', '--install'], /must be exactly 2\.1\.1; found 2\.1\.0/);
      refusal(installed, ['search', '--query', 'person'], /must be exactly/);
    } finally { writeFileSync(p, original); }
  });
  it('check distinguishes an incomplete install from an absent or ready package', () => {
    const p = join(installed.tool, 'node_modules', '@phosphor-icons', 'core', 'LICENSE');
    const original = readFileSync(p);
    try {
      rmSync(p);
      const result = success(installed, ['check']);
      assert.equal(result.state, 'incomplete');
      assert.equal(result.installed, false);
      assert.deepEqual(result.missing, ['LICENSE']);
    } finally { writeFileSync(p, original); }
  });
  it('an authorized get installs and completes in one run, without changing the lockfile', () => {
    const copy = copyTool('authorized-get');
    const lock = readFileSync(join(copy.tool, 'package-lock.json'), 'utf8');
    const p = output('installed-and-written.svg');
    const result = success(copy, [...getArgs(p), '--install']);
    assert.equal(result.name, 'person-simple');
    assert.equal(existsSync(p), true);
    assert.equal(readFileSync(join(copy.tool, 'package-lock.json'), 'utf8'), lock);
    // The matching marker authorizes the next install without a second flag.
    rmSync(join(copy.tool, 'node_modules'), { recursive: true });
    assert.ok(success(copy, ['search', '--query', 'person']).results.length > 0);
  });
  it('WISER_ALLOW_INSTALL authorizes search and writes the plugin marker', () => {
    const copy = copyTool('environment-consent');
    const result = success(copy, ['search', '--query', 'person'], { WISER_ALLOW_INSTALL: '1' });
    assert.ok(result.results.length > 0);
    assert.equal(JSON.parse(readFileSync(join(copy.root, '.wiser-consent'), 'utf8')).tool, 'icon-set');
  });
  it('all 9,072 pinned SVGs build in both forms with no scripts, ids, references or transforms', async () => {
    const base = join(installed.tool, 'node_modules', '@phosphor-icons', 'core');
    const { icons } = await import(pathToFileURL(join(base, 'dist/index.mjs')).href);
    let count = 0;
    for (const icon of icons) for (const weight of WEIGHTS) {
      const source = readFileSync(join(base, assetPath(icon.name, weight)), 'utf8');
      for (const fragment of [false, true]) {
        const { svg } = buildSvg(source, { name: icon.name, weight, size: 24, color: '#102030',
          accent: weight === 'duotone' ? '#aabbcc' : undefined, fragment, x: 1, y: 2 });
        assert.doesNotMatch(svg, /<script|\bid\s*=|\b(?:xlink:)?href\s*=|\btransform\s*=|currentColor|\bopacity\s*=/i);
      }
      count++;
    }
    assert.equal(count, 9072);
  });
});

describe('search ranking and closed SVG source parsing', () => {
  it('ranks name matches above tags and categories, matching every word', () => {
    const icons = [
      { name: 'other', tags: ['person'], categories: ['people'] },
      { name: 'person-simple', tags: ['human'], categories: ['people'] },
      { name: 'person', tags: ['human'], categories: ['people'] }
    ];
    assert.deepEqual(searchIcons(icons, 'PERSON').map(i => i.name), ['person', 'person-simple', 'other']);
    assert.deepEqual(searchIcons(icons, 'human people').map(i => i.name), ['person', 'person-simple']);
    assert.deepEqual(searchIcons(icons, 'human absent'), []);
  });
  it('recolours explicit fills and strokes, retaining none', () => {
    const source = '<svg viewBox="0 0 256 256" fill="black"><path fill="none" stroke="#000" d="M0 0L1 1"/></svg>';
    const { svg } = buildSvg(source, { name: 'test', weight: 'regular', size: 24, color: '#123456' });
    assert.match(svg, /fill="#123456"/);
    assert.match(svg, /fill="none" stroke="#123456"/);
    assert.doesNotMatch(svg, /black|#000/);
  });
  for (const body of ['<script/>', '<path d="M0 0" transform="translate(1 2)"/>',
    '<path d="M0 0" id="x"/>', '<path d="M0 0" href="https://example.invalid"/>',
    '<path d="M0 0" onload="x"/>']) {
    it(`refuses unsafe or unexpected source ${body}`, () => {
      assert.throws(() => buildSvg(`<svg viewBox="0 0 256 256">${body}</svg>`, {
        name: 'test', weight: 'fill', size: 24, fragment: true, x: 1, y: 2
      }), /unexpected SVG/);
    });
  }
});

const HEALTH_LICENSE = 'Health Icons 2.0.0: icons CC0 1.0 (healthicons.org); package MIT License, Copyright (c) 2021 Resolve to Save Lives';
const healthArgs = (dest, weight = 'filled', name = 'doctor') => [...getArgs(dest, weight, name), '--set', 'health'];
const healthBase = () => join(installed.tool, 'node_modules', 'healthicons');

describe('real Health Icons 2.0.0 in the temporary plugin copy', () => {
  it('check reports both pinned packages ready in separate objects, preserving Phosphor fields', () => {
    const result = success(installed, ['check']);
    for (const [set, spec] of Object.entries(SETS)) {
      const report = result.packages[set];
      assert.equal(report.package, spec.package);
      assert.equal(report.requiredVersion, spec.version);
      assert.equal(report.version, spec.version);
      assert.equal(report.installed, true);
      assert.equal(report.state, 'ready');
      assert.deepEqual(report.missing, []);
    }
    const { packages, ...original } = result;
    assert.deepEqual(original, packages.phosphor);
  });

  it('doctor search returns the exact id, title, category, filtered tags, weights and licence', () => {
    const result = success(installed, ['search', '--set', 'health', '--query', 'DOCTOR']);
    assert.equal(result.results[0].name, 'doctor');
    assert.equal(result.results[0].title, 'Doctor');
    assert.equal(result.results[0].category, 'people');
    assert.equal(result.results[0].path, 'people/doctor');
    assert.equal(result.license, HEALTH_LICENSE);
    for (const icon of result.results) {
      assert.deepEqual(Object.keys(icon), ['name', 'path', 'title', 'category', 'tags', 'weights']);
      assert.equal(icon.path, `${icon.category}/${icon.name}`);
      assert.deepEqual(icon.weights, ['filled', 'outline']);
      assert.ok(icon.tags.every(tag => !/^dhis2:/i.test(tag)));
    }
  });

  for (const query of ['nurse', 'elderly']) {
    it(`${query} search finds people`, () => {
      const result = success(installed, ['search', '--set', 'health', '--query', query]);
      assert.ok(result.results.some(icon => icon.name === query && icon.category === 'people'));
    });
  }

  it('search matches metadata titles, tags and categories with all words and a limit', () => {
    const title = success(installed, ['search', '--set', 'health', '--query', 'Tank vehicles', '--limit', '1']);
    assert.equal(title.results[0].name, 'war');
    const tags = success(installed, ['search', '--set', 'health', '--query', 'Military vehicles']);
    assert.ok(tags.results.some(icon => icon.name === 'war'));
    assert.deepEqual(success(installed, ['search', '--set', 'health', '--query', 'dhis2:war']).results, []);
    assert.deepEqual(success(installed, ['search', '--set', 'health', '--query', 'doctor no-such-keyword-xyz']).results, []);
    const args = ['search', '--set', 'health', '--query', 'people', '--limit', '3'];
    const result = success(installed, args).results;
    assert.equal(result.length, 3);
    assert.deepEqual(result, success(installed, args).results);
    assert.ok(result.every(icon => icon.category === 'people' || icon.tags.some(tag => /people/i.test(tag)) || /people/i.test(icon.title)));
  });

  it('Phosphor search also carries its installed licence and keeps its result shape', () => {
    const result = success(installed, ['search', '--query', 'person', '--limit', '1']);
    assert.equal(result.license, 'Phosphor Icons 2.1.1, MIT License, Copyright (c) 2023 Phosphor Icons');
    assert.deepEqual(Object.keys(result.results[0]), ['name', 'tags', 'categories']);
  });

  for (const weight of SETS.health.weights) for (const fragment of [false, true]) {
    it(`writes recoloured Health ${weight} as ${fragment ? 'fragment' : 'standalone'}`, () => {
      const dest = output(`health-${weight}-${fragment}.svg`);
      const result = success(installed, [...healthArgs(dest, weight), '--color', '#13579b',
        ...(fragment ? ['--fragment', '--x', '-12.5', '--y', '20', '--class', 'health-icon'] : [])]);
      const svg = readFileSync(dest, 'utf8');
      assert.equal(result.output, realpathSync(dest));
      assert.equal(result.name, 'doctor');
      assert.equal(result.weight, weight);
      assert.equal(result.fragment, fragment);
      assert.equal(result.background, null);
      assert.equal(result.license, HEALTH_LICENSE);
      assert.match(svg, new RegExp(`data-icon="health:doctor:${weight}:2\\.0\\.0"`));
      assert.match(svg, /width="48" height="48" viewBox="0 0 48 48"/);
      assert.match(svg, /fill="#13579b"/);
      assert.match(svg, /fill-rule="evenodd" clip-rule="evenodd"/);
      assert.doesNotMatch(svg, /currentColor|\btransform\s*=|\bid\s*=|<script|\b(?:xlink:)?href\s*=/i);
      if (fragment) {
        assertFragment(svg);
        assert.match(svg, /class="health-icon"/);
      } else {
        assert.match(svg, /role="img"/);
        assert.match(svg, /<title>doctor<\/title>/);
      }
    });
  }

  for (const name of ['doctor_female', 'A', '!']) {
    it(`uses the literal metadata path for ${name}`, () => {
      const dest = output(`health-literal-${name}.svg`);
      success(installed, [...healthArgs(dest, 'outline', name), '--color', 'rebeccapurple']);
      assert.ok(readFileSync(dest, 'utf8').includes(`data-icon="health:${name}:outline:2.0.0"`));
    });
  }

  it('refuses ambiguous metadata ids rather than silently selecting a category', () => {
    const dest = output('ambiguous-health.svg');
    refusal(installed, healthArgs(dest, 'filled', 'diabetes'), /ambiguous health icon.*people\/diabetes/);
    assert.equal(existsSync(dest), false);
  });

  it('takes <category>/<id> for an id two categories share', () => {
    const dest = output('people-diabetes.svg');
    success(installed, [...healthArgs(dest, 'outline', 'people/diabetes'), '--color', '#123abc']);
    assert.ok(readFileSync(dest, 'utf8').includes('data-icon="health:people/diabetes:outline:2.0.0"'));
  });

  it('search returns each Health result with its <category>/<id> path', () => {
    const { results } = success(installed, ['search', '--set', 'health', '--query', 'diabetes']);
    assert.ok(results.some(r => r.path === 'people/diabetes') && results.some(r => r.path === 'symbols/diabetes'));
  });

  it('refuses an unknown Health id with nearest names and no output file', () => {
    const dest = output('unknown-health.svg');
    refusal(installed, healthArgs(dest, 'filled', 'docto'), /unknown icon.*nearest names:.*doctor/);
    assert.equal(existsSync(dest), false);
  });

  it('refuses a wrong Health version even when --install is authorized', () => {
    const manifest = join(healthBase(), 'package.json');
    const original = readFileSync(manifest, 'utf8');
    try {
      writeFileSync(manifest, JSON.stringify({ ...JSON.parse(original), version: '2.0.1' }));
      refusal(installed, ['check'], /healthicons must be exactly 2\.0\.0; found 2\.0\.1/);
      refusal(installed, ['check', '--install'], /healthicons must be exactly 2\.0\.0; found 2\.0\.1/);
      refusal(installed, ['search', '--set', 'health', '--query', 'doctor'], /must be exactly/);
    } finally { writeFileSync(manifest, original); }
  });

  it('reports a missing Health asset as incomplete in a separate temporary copy', () => {
    const copy = copyTool('incomplete-health');
    const base = join(copy.tool, 'node_modules', 'healthicons');
    cpSync(healthBase(), base, { recursive: true });
    const asset = 'public/icons/svg/outline/people/doctor.svg';
    rmSync(join(base, asset));
    const result = success(copy, ['check']);
    assert.equal(result.packages.phosphor.state, 'absent');
    assert.equal(result.packages.health.state, 'incomplete');
    assert.equal(result.packages.health.installed, false);
    assert.deepEqual(result.packages.health.missing, [asset]);
    assert.match(result.packages.health.remediation, /check --install/);
    // An unprobed asset can be missing while the package survey is ready.
    cpSync(join(healthBase(), asset), join(base, asset));
    rmSync(join(base, 'public/icons/svg/filled/people/nurse.svg'));
    const dest = output('missing-health-asset.svg');
    refusal(copy, healthArgs(dest, 'filled', 'nurse'), /SVG for nurse\/filled is missing or unreadable/);
    assert.equal(existsSync(dest), false);
  });

  for (const file of ['public/icons/meta-data.json', 'LICENSE']) {
    it(`check detects an unreadable Health ${file}`, () => {
      const dest = join(healthBase(), file);
      const original = readFileSync(dest);
      try {
        writeFileSync(dest, 'damaged');
        const result = success(installed, ['check']);
        assert.equal(result.packages.health.state, 'incomplete');
        assert.deepEqual(result.packages.health.missing, [file]);
      } finally { writeFileSync(dest, original); }
    });
  }

  it('reads the Health copyright from the installed LICENSE for search and get', () => {
    const dest = join(healthBase(), 'LICENSE');
    const original = readFileSync(dest, 'utf8');
    try {
      writeFileSync(dest, original.replace('Copyright (c) 2021 Resolve to Save Lives', 'Copyright (c) 2021 Test Fixture'));
      assert.match(success(installed, ['search', '--set', 'health', '--query', 'doctor']).license, /Test Fixture$/);
      assert.match(success(installed, healthArgs(output('health-license-fixture.svg'))).license, /Test Fixture$/);
    } finally { writeFileSync(dest, original); }
  });

  it('all 1,380 pinned Health 48px assets build in both forms without unsafe content', () => {
    const base = healthBase();
    const rows = JSON.parse(readFileSync(join(base, 'public/icons/meta-data.json'), 'utf8'));
    assert.equal(rows.length, 690);
    let count = 0;
    for (const row of rows) for (const weight of SETS.health.weights) {
      const source = readFileSync(join(base, assetPath(row.path, weight, 'health')), 'utf8');
      for (const fragment of [false, true]) {
        const { svg } = buildSvg(source, { set: 'health', name: row.id, weight, size: 24, color: '#102030', fragment, x: 1, y: 2 });
        assert.ok(svg.includes(`data-icon="health:${row.id}:${weight}:2.0.0"`));
        assert.match(svg, /fill="#102030"/);
        assert.doesNotMatch(svg, /<script|\bid\s*=|\b(?:xlink:)?href\s*=|\btransform\s*=|currentColor/i);
      }
      count++;
    }
    assert.equal(count, 1380);
  });
});

describe('Health ranking and closed SVG parsing', () => {
  it('uses the same ranking scores for ids, segments, substrings and other metadata', () => {
    const icons = [
      { name: 'other', title: 'Doctor', category: 'people', tags: [] },
      { name: 'doctor_female', title: 'Person Female Doctor', category: 'people', tags: [] },
      { name: 'doctor', title: 'Doctor', category: 'people', tags: [] },
      { name: 'doctors', title: 'Physicians', category: 'people', tags: [] }
    ];
    assert.deepEqual(searchIcons(icons, 'DOCTOR', 20, 'health').map(icon => icon.name), ['doctor', 'doctor_female', 'doctors', 'other']);
    assert.deepEqual(searchIcons(icons, 'female people', 20, 'health').map(icon => icon.name), ['doctor_female']);
  });

  it('recolours Health single-colour fills and strokes while preserving none and rules', () => {
    const source = '<svg width="48" height="48" viewBox="0 0 48 48" fill="black"><path d="M0 0L1 1" fill="none" stroke="#000" fill-rule="evenodd" clip-rule="evenodd"/></svg>';
    const { svg } = buildSvg(source, { set: 'health', name: 'test', weight: 'outline', size: 24, color: '#abcdef' });
    assert.match(svg, /fill="#abcdef"/);
    assert.match(svg, /fill="none" stroke="#abcdef"/);
    assert.match(svg, /fill-rule="evenodd" clip-rule="evenodd"/);
    assert.doesNotMatch(svg, /black|#000|currentColor/);
  });

  for (const body of ['<script/>', '<g/>', '<use href="https://example.invalid/icon.svg"/>',
    '<path d="M0 0" transform="translate(1 2)"/>', '<path d="M0 0" id="x"/>',
    '<path d="M0 0" href="https://example.invalid"/>', '<path d="M0 0" onload="x"/>',
    '<path d="M0 0" style="fill:red"/>']) {
    it(`refuses unsafe Health source ${body}`, () => {
      assert.throws(() => buildSvg(`<svg width="48" height="48" viewBox="0 0 48 48">${body}</svg>`, {
        set: 'health', name: 'test', weight: 'filled', size: 24, fragment: true, x: 1, y: 2
      }), /unexpected SVG/);
    });
  }
});

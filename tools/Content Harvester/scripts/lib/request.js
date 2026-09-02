import { existsSync, readFileSync } from 'node:fs';

const URL_TYPES = new Set(['rss', 'substack_rss', 'reddit_rss', 'url']);

/**
 * Reads the request file. The parser's own message is never echoed: it quotes
 * the first bytes of whatever it was handed, and this path is a caller-supplied
 * argument that can land on any readable file.
 *
 * `requestPath` arrives already screened by the entry script: absolute,
 * canonicalized, and cleared of this tool's own directory. It is used exactly
 * as given, because re-resolving it here against the current directory would
 * open a path the screen never saw.
 */
export function loadRequest(requestPath, fail) {
  if (!existsSync(requestPath)) {
    fail(`Error: no file at ${requestPath}. Check the path passed to --request.`);
  }

  let text;

  try {
    text = readFileSync(requestPath, 'utf8');
  } catch (error) {
    fail(`Error: could not read ${requestPath}: ${error.code || 'read failed'}.`);
  }

  try {
    return { request: JSON.parse(text), requestPath };
  } catch {
    fail(`Error: ${requestPath} is not valid JSON. Run "node scripts/harvest.js sample" for a request this tool accepts.`);
  }
}

export function validateRequest(request) {
  const problems = [];

  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return ['the request must be a JSON object'];
  }

  if (typeof request.name !== 'string' || request.name.trim() === '') {
    problems.push('name is required and must be a non-empty string');
  }

  if (typeof request.consumer !== 'string' || request.consumer.trim() === '') {
    problems.push('consumer is required and must be a non-empty string');
  }

  if (!request.timebox || typeof request.timebox !== 'object') {
    problems.push('timebox is required, with from and to');
  } else {
    const from = isValidDate(request.timebox.from);
    const to = isValidDate(request.timebox.to);
    if (!from) problems.push('timebox.from must be a date string');
    if (!to) problems.push('timebox.to must be a date string');
    if (from && to && new Date(request.timebox.from) > new Date(request.timebox.to)) {
      problems.push('timebox.from must be at or before timebox.to');
    }
  }

  if (!Array.isArray(request.topics)) {
    problems.push('topics must be an array, empty if the request has no topic targets');
  }

  if (!Array.isArray(request.sources)) {
    problems.push('sources must be an array');
  } else {
    request.sources.forEach((source, index) => {
      problems.push(...validateSource(source, index));
    });
  }

  if (request.output !== undefined) {
    if (typeof request.output !== 'object' || request.output === null || Array.isArray(request.output)) {
      problems.push('output must be an object');
    } else if (request.output.directory !== undefined && typeof request.output.directory !== 'string') {
      problems.push('output.directory must be a string');
    }
  }

  if (request.user_agent !== undefined && typeof request.user_agent !== 'string') {
    problems.push('user_agent must be a string');
  }

  if (request.timeout_ms !== undefined && !(Number.isFinite(Number(request.timeout_ms)) && Number(request.timeout_ms) > 0)) {
    problems.push('timeout_ms must be a positive number of milliseconds');
  }

  return problems;
}

function validateSource(source, index) {
  const label = `sources[${index}]`;

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return [`${label} must be an object`];
  }

  if (source.enabled === false) {
    return [];
  }

  if (!source.type) {
    return [`${label}.type is required`];
  }

  const problems = [];

  if (URL_TYPES.has(source.type) && !source.url) {
    problems.push(`${label}.url is required for ${source.type}`);
  }

  if (source.type === 'manual_urls' && !Array.isArray(source.urls)) {
    problems.push(`${label}.urls must be an array for manual_urls`);
  }

  return problems;
}

function isValidDate(value) {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
}

export function sampleRequest() {
  return {
    name: 'example-harvest',
    consumer: 'the workflow asking for these candidates',
    timebox: {
      from: '2026-07-01T00:00:00Z',
      to: '2026-07-08T00:00:00Z'
    },
    topics: ['first topic', 'second topic'],
    sources: [
      {
        type: 'rss',
        url: 'https://example.com/feed.xml',
        source: 'Example Feed',
        role: 'independent_reporting'
      },
      {
        type: 'manual_urls',
        source: 'Curated URLs',
        role: 'curated',
        urls: ['https://example.com/an-article']
      }
    ],
    filters: {
      exclude_terms: ['sponsored'],
      max_items_per_source: 20,
      min_score: 0
    },
    output: {
      directory: '/absolute/path/to/a/work/directory/in/the/owning/root',
      markdown: true,
      json: true
    }
  };
}

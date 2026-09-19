/**
 * robots.txt parser for site-crawl. Honors Disallow for the tool's user-agent
 * token and for *, with a more specific group winning when both exist.
 */

function firstToken(userAgent) {
  const match = String(userAgent || '').trim().match(/^[^/\s]+/);
  return match ? match[0].toLowerCase() : '';
}

function parseGroups(text) {
  const groups = [];
  let agents = [];
  let rules = [];
  let sawRule = false;

  function commit() {
    if (agents.length > 0) groups.push({ agents, rules });
    agents = [];
    rules = [];
    sawRule = false;
  }

  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;

    const match = line.match(/^(user-agent|disallow|allow)\s*:\s*(.*)$/i);
    if (!match) continue;

    const field = match[1].toLowerCase();
    const value = match[2].trim();

    if (field === 'user-agent') {
      if (sawRule) commit();
      agents.push(value.toLowerCase());
      continue;
    }

    if (agents.length === 0) continue;
    sawRule = true;
    rules.push({ type: field, path: value });
  }

  commit();
  return groups;
}

function matchingGroups(groups, token) {
  const specific = groups.filter((group) => group.agents.some((agent) => agent === token));
  if (specific.length > 0) return specific;
  return groups.filter((group) => group.agents.some((agent) => agent === '*'));
}

function pathOf(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return '/';
  }
}

function escapeRegex(character) {
  return /[.*+?^${}()|[\]\\]/.test(character) ? `\\${character}` : character;
}

/**
 * RFC 9309: `*` is any sequence, `$` at the end of the pattern is end-anchor,
 * and a pattern without `$` is a prefix.
 */
function patternMatch(rulePath, candidate) {
  if (rulePath === '') return false;
  let source = '';
  for (let index = 0; index < rulePath.length; index += 1) {
    const character = rulePath[index];
    if (character === '*') {
      source += '.*';
      continue;
    }
    if (character === '$' && index === rulePath.length - 1) {
      source += '$';
      continue;
    }
    source += escapeRegex(character);
  }
  return new RegExp(`^${source}`).test(candidate);
}

/**
 * True when robots.txt Disallow for this user agent (or *) covers `url`.
 * An empty Disallow is an allow-all. The most specific match is the longest
 * pattern; when an Allow and a Disallow match at equal length, Allow wins.
 */
export function isDisallowed(robotsText, url, userAgent) {
  const token = firstToken(userAgent);
  const groups = matchingGroups(parseGroups(robotsText), token);
  if (groups.length === 0) return false;

  const candidate = pathOf(url);
  let disallowLength = -1;
  let allowLength = -1;

  for (const group of groups) {
    for (const rule of group.rules) {
      if (rule.path === '' && rule.type === 'disallow') continue;
      if (rule.path === '' && rule.type === 'allow') continue;
      if (!patternMatch(rule.path, candidate)) continue;
      const length = rule.path.length;
      if (rule.type === 'disallow' && length > disallowLength) disallowLength = length;
      if (rule.type === 'allow' && length > allowLength) allowLength = length;
    }
  }

  if (disallowLength < 0) return false;
  return disallowLength > allowLength;
}

export { firstToken };

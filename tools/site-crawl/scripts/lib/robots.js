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
// RFC 9309 section 2.2.2: percent-encoded unreserved ASCII octets are decoded
// on both sides before comparison, so /%70rivate and /private are one path,
// while reserved characters and non-ASCII keep their encoded spelling.
function decodeUnreserved(text) {
  return String(text).replace(/%([0-9a-f]{2})/gi, (whole, hex) => {
    const code = Number.parseInt(hex, 16);
    const character = String.fromCharCode(code);
    return /[A-Za-z0-9\-._~]/.test(character) ? character : whole.toUpperCase();
  });
}

function patternMatch(rulePath, candidate, check) {
  if (rulePath === '') return false;
  rulePath = decodeUnreserved(rulePath);
  candidate = decodeUnreserved(candidate);
  if (check) return checkedWildcardMatch(rulePath, candidate, check);
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

// Hosted matching must honor its deadline even on a pattern whose repeated
// wildcards would cause the local regular expression to backtrack excessively.
// Retry the most recent wildcard iteratively and check the clock throughout.
// A trailing $ requires the whole path; other rules match prefixes.
function checkedWildcardMatch(pattern, candidate, check) {
  const anchored = pattern.endsWith('$');
  if (anchored) pattern = pattern.slice(0, -1);
  let index = 0, cursor = 0, star = -1, retry = 0, steps = 0;
  while (index < candidate.length) {
    if ((steps++ & 255) === 0) check();
    if (cursor === pattern.length && !anchored) return true;
    if (pattern[cursor] === '*') {
      star = cursor++;
      retry = index;
    } else if (cursor < pattern.length && pattern[cursor] === candidate[index]) {
      cursor++;
      index++;
    } else if (star >= 0) {
      cursor = star + 1;
      index = ++retry;
    } else return false;
  }
  while (pattern[cursor] === '*') { check(); cursor++; }
  return cursor === pattern.length;
}

/**
 * True when robots.txt Disallow for this user agent (or *) covers `url`.
 * An empty Disallow is an allow-all. The most specific match is the longest
 * pattern; when an Allow and a Disallow match at equal length, Allow wins.
 */
export function isDisallowed(robotsText, url, userAgent, check) {
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
      check?.();
      if (!patternMatch(rule.path, candidate, check)) continue;
      const length = rule.path.length;
      if (rule.type === 'disallow' && length > disallowLength) disallowLength = length;
      if (rule.type === 'allow' && length > allowLength) allowLength = length;
    }
  }

  if (disallowLength < 0) return false;
  return disallowLength > allowLength;
}

export { firstToken };

async function proxyData(ctx, request) {
  const res = await ctx.proxy(request);
  return res && typeof res === 'object' && Object.hasOwn(res, 'data') ? res.data : res;
}

function invalidArguments(field) {
  return { status: 'invalid_arguments', field };
}

function extraKey(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidArguments('input');
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  return extra === undefined ? null : invalidArguments(extra);
}

function isNonEmptyString(value, max) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (max !== undefined && value.length > max) return false;
  return true;
}

function isBareDomain(value) {
  return typeof value === 'string' && value.trim() !== '' && !value.includes('://') && !value.includes('/');
}

function isAbsHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isBacklinksTarget(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (value.includes('://')) return isAbsHttpUrl(value);
  return !value.includes(' ');
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ORDER_BY = /^[a-z_.]+,(asc|desc)$/;
const ITEM_TYPES = new Set(['organic', 'paid', 'featured_snippet', 'local_pack']);
const BACKLINKS_STATUS = new Set(['all', 'live', 'lost']);

function firstInvalid(checks) {
  for (const check of checks) {
    if (check) return check;
  }
  return null;
}

function requireLocation(input) {
  const hasCode = Object.hasOwn(input, 'location_code');
  const hasName = Object.hasOwn(input, 'location_name');
  if (hasCode === hasName) return invalidArguments(hasCode ? 'location_name' : 'location_code');
  if (hasCode && !Number.isInteger(input.location_code)) return invalidArguments('location_code');
  if (hasName && !isNonEmptyString(input.location_name)) return invalidArguments('location_name');
  return null;
}

function optionalLocation(input) {
  const hasCode = Object.hasOwn(input, 'location_code');
  const hasName = Object.hasOwn(input, 'location_name');
  if (hasCode && hasName) return invalidArguments('location_name');
  if (hasCode && !Number.isInteger(input.location_code)) return invalidArguments('location_code');
  if (hasName && !isNonEmptyString(input.location_name)) return invalidArguments('location_name');
  return null;
}

function requireLanguage(input) {
  const hasCode = Object.hasOwn(input, 'language_code');
  const hasName = Object.hasOwn(input, 'language_name');
  if (hasCode === hasName) return invalidArguments(hasCode ? 'language_name' : 'language_code');
  if (hasCode && !isNonEmptyString(input.language_code)) return invalidArguments('language_code');
  if (hasName && !isNonEmptyString(input.language_name)) return invalidArguments('language_name');
  return null;
}

function optionalLanguage(input) {
  const hasCode = Object.hasOwn(input, 'language_code');
  const hasName = Object.hasOwn(input, 'language_name');
  if (hasCode && hasName) return invalidArguments('language_name');
  if (hasCode && !isNonEmptyString(input.language_code)) return invalidArguments('language_code');
  if (hasName && !isNonEmptyString(input.language_name)) return invalidArguments('language_name');
  return null;
}

function optionalBoolean(input, field) {
  if (!Object.hasOwn(input, field)) return null;
  return typeof input[field] === 'boolean' ? null : invalidArguments(field);
}

function optionalLimit(input) {
  if (!Object.hasOwn(input, 'limit')) return null;
  return Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 1000 ? null : invalidArguments('limit');
}

function optionalOffset(input) {
  if (!Object.hasOwn(input, 'offset')) return null;
  return Number.isInteger(input.offset) && input.offset >= 0 ? null : invalidArguments('offset');
}

function optionalFilters(input) {
  if (!Object.hasOwn(input, 'filters')) return null;
  const value = input.filters;
  if (!Array.isArray(value) || value.length > 8) return invalidArguments('filters');
  for (const item of value) {
    if (item === 'and' || item === 'or') continue;
    if (
      Array.isArray(item) &&
      item.length === 3 &&
      isNonEmptyString(item[0]) &&
      isNonEmptyString(item[1])
    ) continue;
    return invalidArguments('filters');
  }
  return null;
}

function optionalOrderBy(input) {
  if (!Object.hasOwn(input, 'order_by')) return null;
  const value = input.order_by;
  if (!Array.isArray(value) || value.length > 3) return invalidArguments('order_by');
  return value.every((item) => typeof item === 'string' && ORDER_BY.test(item))
    ? null
    : invalidArguments('order_by');
}

function requireKeywords(input, { max, itemMax } = {}) {
  const value = input.keywords;
  if (!Array.isArray(value) || value.length < 1 || value.length > max) return invalidArguments('keywords');
  if (!value.every((item) => isNonEmptyString(item, itemMax))) return invalidArguments('keywords');
  return null;
}

function optionalDate(input, field) {
  if (!Object.hasOwn(input, field)) return null;
  return typeof input[field] === 'string' && DATE.test(input[field]) ? null : invalidArguments(field);
}

function taskFrom(input, keys) {
  const task = {};
  for (const key of keys) {
    if (Object.hasOwn(input, key)) task[key] = input[key];
  }
  return task;
}

async function postTask(ctx, endpoint, task) {
  return proxyData(ctx, { endpoint, method: 'POST', body: [task] });
}

function livePost(endpoint, allowed, validate) {
  return async (input, ctx) => {
    const extra = extraKey(input, allowed);
    if (extra) return extra;
    const invalid = validate(input);
    if (invalid) return invalid;
    return postTask(ctx, endpoint, taskFrom(input, allowed));
  };
}

const LOCATION_LANGUAGE = ['location_code', 'location_name', 'language_code', 'language_name'];
const PAGE = ['limit', 'offset', 'filters', 'order_by'];

export const modules = {
  research: {
    serp: livePost(
      '/v3/serp/google/organic/live/advanced',
      ['keyword', ...LOCATION_LANGUAGE, 'device', 'depth'],
      (input) => firstInvalid([
        isNonEmptyString(input.keyword, 700) ? null : invalidArguments('keyword'),
        requireLocation(input),
        requireLanguage(input),
        Object.hasOwn(input, 'device') && !['desktop', 'mobile'].includes(input.device)
          ? invalidArguments('device')
          : null,
        Object.hasOwn(input, 'depth') && !(
          Number.isInteger(input.depth) &&
          input.depth >= 10 &&
          input.depth <= 700 &&
          input.depth % 10 === 0
        )
          ? invalidArguments('depth')
          : null,
      ]),
    ),
    keyword_ideas: livePost(
      '/v3/dataforseo_labs/google/keyword_ideas/live',
      ['keywords', ...LOCATION_LANGUAGE, 'limit', 'offset', 'include_serp_info', 'filters', 'order_by', 'closely_variants'],
      (input) => firstInvalid([
        requireKeywords(input, { max: 200 }),
        requireLocation(input),
        requireLanguage(input),
        optionalLimit(input),
        optionalOffset(input),
        optionalBoolean(input, 'include_serp_info'),
        optionalFilters(input),
        optionalOrderBy(input),
        optionalBoolean(input, 'closely_variants'),
      ]),
    ),
    related_keywords: livePost(
      '/v3/dataforseo_labs/google/related_keywords/live',
      ['keyword', ...LOCATION_LANGUAGE, 'depth', 'limit', 'offset', 'filters', 'order_by', 'include_serp_info'],
      (input) => firstInvalid([
        isNonEmptyString(input.keyword) ? null : invalidArguments('keyword'),
        requireLocation(input),
        requireLanguage(input),
        Object.hasOwn(input, 'depth') && !(Number.isInteger(input.depth) && input.depth >= 0 && input.depth <= 4)
          ? invalidArguments('depth')
          : null,
        optionalLimit(input),
        optionalOffset(input),
        optionalFilters(input),
        optionalOrderBy(input),
        optionalBoolean(input, 'include_serp_info'),
      ]),
    ),
    search_volume: livePost(
      '/v3/keywords_data/google_ads/search_volume/live',
      ['keywords', ...LOCATION_LANGUAGE, 'date_from', 'date_to', 'search_partners'],
      (input) => firstInvalid([
        requireKeywords(input, { max: 1000, itemMax: 80 }),
        optionalLocation(input),
        optionalLanguage(input),
        optionalDate(input, 'date_from'),
        optionalDate(input, 'date_to'),
        optionalBoolean(input, 'search_partners'),
      ]),
    ),
    keyword_difficulty: livePost(
      '/v3/dataforseo_labs/google/bulk_keyword_difficulty/live',
      ['keywords', ...LOCATION_LANGUAGE],
      (input) => firstInvalid([
        requireKeywords(input, { max: 1000 }),
        requireLocation(input),
        requireLanguage(input),
      ]),
    ),
    search_intent: livePost(
      '/v3/dataforseo_labs/google/search_intent/live',
      ['keywords', 'language_code'],
      (input) => firstInvalid([
        requireKeywords(input, { max: 1000 }),
        isNonEmptyString(input.language_code) ? null : invalidArguments('language_code'),
      ]),
    ),
    ranked_keywords: livePost(
      '/v3/dataforseo_labs/google/ranked_keywords/live',
      ['target', ...LOCATION_LANGUAGE, ...PAGE, 'item_types', 'load_rank_absolute'],
      (input) => firstInvalid([
        isBareDomain(input.target) ? null : invalidArguments('target'),
        requireLocation(input),
        requireLanguage(input),
        optionalLimit(input),
        optionalOffset(input),
        optionalFilters(input),
        optionalOrderBy(input),
        Object.hasOwn(input, 'item_types') && !(
          Array.isArray(input.item_types) &&
          input.item_types.every((item) => typeof item === 'string' && ITEM_TYPES.has(item))
        )
          ? invalidArguments('item_types')
          : null,
        optionalBoolean(input, 'load_rank_absolute'),
      ]),
    ),
    competitors: livePost(
      '/v3/dataforseo_labs/google/competitors_domain/live',
      ['target', ...LOCATION_LANGUAGE, 'limit', 'offset', 'filters', 'exclude_top_domains', 'intersecting_domains'],
      (input) => firstInvalid([
        isBareDomain(input.target) ? null : invalidArguments('target'),
        requireLocation(input),
        requireLanguage(input),
        optionalLimit(input),
        optionalOffset(input),
        optionalFilters(input),
        optionalBoolean(input, 'exclude_top_domains'),
        Object.hasOwn(input, 'intersecting_domains') && !(
          Array.isArray(input.intersecting_domains) &&
          input.intersecting_domains.length <= 20 &&
          input.intersecting_domains.every(isBareDomain)
        )
          ? invalidArguments('intersecting_domains')
          : null,
      ]),
    ),
    async locations(input, ctx) {
      const extra = extraKey(input, ['country']);
      if (extra) return extra;
      if (Object.hasOwn(input, 'country') && (typeof input.country !== 'string' || !/^[A-Za-z]{2}$/.test(input.country))) {
        return invalidArguments('country');
      }
      const data = await proxyData(ctx, {
        endpoint: '/v3/dataforseo_labs/locations_and_languages',
        method: 'GET',
      });
      if (!Object.hasOwn(input, 'country')) return data;
      if (!data || typeof data !== 'object' || !Array.isArray(data.tasks)) return data;
      const needle = input.country.toLowerCase();
      return {
        ...data,
        tasks: data.tasks.map((task, index) => {
          if (index !== 0 || !task || typeof task !== 'object' || !Array.isArray(task.result)) return task;
          return {
            ...task,
            result: task.result.filter((row) => String(row?.country_iso_code ?? '').toLowerCase() === needle),
          };
        }),
      };
    },
  },
  backlinks: {
    summary: livePost(
      '/v3/backlinks/summary/live',
      ['target', 'include_subdomains', 'backlinks_status_type'],
      (input) => firstInvalid([
        isBacklinksTarget(input.target) ? null : invalidArguments('target'),
        optionalBoolean(input, 'include_subdomains'),
        Object.hasOwn(input, 'backlinks_status_type') && !BACKLINKS_STATUS.has(input.backlinks_status_type)
          ? invalidArguments('backlinks_status_type')
          : null,
      ]),
    ),
    referring_domains: livePost(
      '/v3/backlinks/referring_domains/live',
      ['target', ...PAGE, 'include_subdomains', 'backlinks_status_type'],
      (input) => firstInvalid([
        isBacklinksTarget(input.target) ? null : invalidArguments('target'),
        optionalLimit(input),
        optionalOffset(input),
        optionalFilters(input),
        optionalOrderBy(input),
        optionalBoolean(input, 'include_subdomains'),
        Object.hasOwn(input, 'backlinks_status_type') && !BACKLINKS_STATUS.has(input.backlinks_status_type)
          ? invalidArguments('backlinks_status_type')
          : null,
      ]),
    ),
    anchors: livePost(
      '/v3/backlinks/anchors/live',
      ['target', ...PAGE, 'backlinks_status_type'],
      (input) => firstInvalid([
        isBacklinksTarget(input.target) ? null : invalidArguments('target'),
        optionalLimit(input),
        optionalOffset(input),
        optionalFilters(input),
        optionalOrderBy(input),
        Object.hasOwn(input, 'backlinks_status_type') && !BACKLINKS_STATUS.has(input.backlinks_status_type)
          ? invalidArguments('backlinks_status_type')
          : null,
      ]),
    ),
  },
};

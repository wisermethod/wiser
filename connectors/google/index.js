async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

function invalidArguments(field) {
  return { status: 'invalid_arguments', field };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const QUERY_DIMENSIONS = new Set(['country', 'device', 'page', 'query', 'searchAppearance', 'date', 'hour']);
const FILTER_DIMENSIONS = new Set(['country', 'device', 'page', 'query', 'searchAppearance']);
const FILTER_OPERATORS = new Set(['equals', 'notEquals', 'contains', 'notContains', 'includingRegex', 'excludingRegex']);
const SEARCH_TYPES = new Set(['web', 'image', 'video', 'news', 'discover', 'googleNews']);
const AGGREGATION_TYPES = new Set(['auto', 'byPage', 'byProperty', 'byNewsShowcasePanel']);
const DATA_STATES = new Set(['final', 'all', 'hourly_all']);
const QUERY_FIELDS = [
  'site_url',
  'start_date',
  'end_date',
  'dimensions',
  'row_limit',
  'start_row',
  'dimension_filter_groups',
  'search_type',
  'aggregation_type',
  'data_state',
];
const SEARCH_CONSOLE_ALLOWED = {
  query: QUERY_FIELDS,
  sites: [],
  sitemaps: ['site_url'],
  inspect: ['site_url', 'inspection_url', 'language_code'],
  get_sitemap: ['site_url', 'feedpath'],
};

function isAbsHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function isDomainProperty(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const match = /^sc-domain:([A-Za-z0-9.-]+)$/i.exec(value.trim());
  if (!match) return false;
  const host = match[1];
  if (host.includes('..') || host.startsWith('.') || host.endsWith('.') || !host.includes('.')) return false;
  return true;
}

function isSiteUrl(value) {
  return isAbsHttpUrl(value) || isDomainProperty(value);
}

function extraKey(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalidArguments('input');
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  return extra === undefined ? null : invalidArguments(extra);
}

function validateDimensionFilterGroups(value) {
  if (!Array.isArray(value)) return invalidArguments('dimension_filter_groups');
  for (const group of value) {
    if (!group || typeof group !== 'object' || Array.isArray(group) || !Array.isArray(group.filters)) {
      return invalidArguments('dimension_filter_groups');
    }
    for (const filter of group.filters) {
      if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return invalidArguments('dimension_filter_groups');
      if (typeof filter.dimension !== 'string' || !FILTER_DIMENSIONS.has(filter.dimension)) {
        return invalidArguments('dimension_filter_groups');
      }
      if (typeof filter.operator !== 'string' || !FILTER_OPERATORS.has(filter.operator)) {
        return invalidArguments('dimension_filter_groups');
      }
      if (typeof filter.expression !== 'string') return invalidArguments('dimension_filter_groups');
    }
  }
  return null;
}

function validateSearchConsole(input, ctx) {
  const allowed = SEARCH_CONSOLE_ALLOWED[ctx.action];
  const extra = extraKey(input, allowed);
  if (extra) return extra;
  if (ctx.action === 'query') {
    if (typeof input.site_url !== 'string' || !input.site_url.trim()) return invalidArguments('site_url');
    if (typeof input.start_date !== 'string' || !DATE.test(input.start_date)) return invalidArguments('start_date');
    if (typeof input.end_date !== 'string' || !DATE.test(input.end_date)) return invalidArguments('end_date');
    if (input.start_date > input.end_date) return invalidArguments('start_date');
    if (Object.hasOwn(input, 'dimensions') && !(
      Array.isArray(input.dimensions) &&
      input.dimensions.every((item) => typeof item === 'string' && QUERY_DIMENSIONS.has(item))
    )) return invalidArguments('dimensions');
    if (Object.hasOwn(input, 'row_limit') && !(
      Number.isInteger(input.row_limit) && input.row_limit >= 1 && input.row_limit <= 25000
    )) return invalidArguments('row_limit');
    if (Object.hasOwn(input, 'start_row') && !(Number.isInteger(input.start_row) && input.start_row >= 0)) {
      return invalidArguments('start_row');
    }
    if (Object.hasOwn(input, 'search_type') && !SEARCH_TYPES.has(input.search_type)) return invalidArguments('search_type');
    if (Object.hasOwn(input, 'aggregation_type') && !AGGREGATION_TYPES.has(input.aggregation_type)) {
      return invalidArguments('aggregation_type');
    }
    if (Object.hasOwn(input, 'data_state') && !DATA_STATES.has(input.data_state)) return invalidArguments('data_state');
    if (Object.hasOwn(input, 'dimension_filter_groups')) return validateDimensionFilterGroups(input.dimension_filter_groups);
    return null;
  }
  if (ctx.action === 'sitemaps') {
    return isSiteUrl(input.site_url) ? null : invalidArguments('site_url');
  }
  if (ctx.action === 'inspect') {
    if (!isSiteUrl(input.site_url)) return invalidArguments('site_url');
    if (!isAbsHttpUrl(input.inspection_url)) return invalidArguments('inspection_url');
    if (Object.hasOwn(input, 'language_code') && (typeof input.language_code !== 'string' || !input.language_code.trim())) {
      return invalidArguments('language_code');
    }
    return null;
  }
  if (ctx.action === 'get_sitemap') {
    if (!isSiteUrl(input.site_url)) return invalidArguments('site_url');
    if (!isAbsHttpUrl(input.feedpath)) return invalidArguments('feedpath');
    return null;
  }
  return null;
}

async function searchConsole(input, ctx) {
  const invalid = validateSearchConsole(input, ctx);
  if (invalid) return invalid;
  return viaCatalog(input, ctx);
}

function catalogWith(names) {
  return (input, ctx) => {
    const args = { ...input };
    for (const [from, to] of Object.entries(names)) {
      if (Object.hasOwn(args, from)) {
        args[to] = args[from];
        delete args[from];
      }
    }
    return viaCatalog(args, ctx);
  };
}

export const modules = {
  'search-console': {
    query: searchConsole,
    sites: searchConsole,
    sitemaps: searchConsole,
    inspect: searchConsole,
    get_sitemap: searchConsole,
  },
  'analytics': {
    run_report: catalogWith({ date_ranges: 'dateRanges' }),
    list_account_summaries: catalogWith({ page_size: 'pageSize', page_token: 'pageToken' }),
    get_property: viaCatalog,
  },
  'drive': {
    find_file: catalogWith({ page_size: 'pageSize', page_token: 'pageToken' }),
    get_file: catalogWith({ file_id: 'fileId' }),
  },
  'calendar': {
    list_events: catalogWith({ calendar_id: 'calendarId', time_min: 'timeMin', time_max: 'timeMax', max_results: 'maxResults', page_token: 'pageToken' }),
    get_event: catalogWith({ calendar_id: 'calendarId', event_id: 'eventId' }),
  },
  'gmail': {
    list_messages: viaCatalog,
    get_message: viaCatalog,
  },
  'sheets': {
    search: viaCatalog,
    get_values: catalogWith({
      major_dimension: 'majorDimension',
      value_render_option: 'valueRenderOption',
      date_time_render_option: 'dateTimeRenderOption',
    }),
  },
  'docs': {
    search: viaCatalog,
    get: catalogWith({
      document_id: 'id',
      include_tabs_content: 'includeTabsContent',
    }),
  },
  'slides': {
    get: catalogWith({
      presentation_id: 'presentationId',
      presentation_name: 'presentationName',
    }),
    get_page: catalogWith({
      presentation_id: 'presentationId',
      page_object_id: 'pageObjectId',
    }),
  },
};

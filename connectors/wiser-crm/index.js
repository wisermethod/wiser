import { isIP } from 'node:net';

const RECORDS = {
  contacts: { path: '/api/contacts', key: 'contact', filters: ['status', 'company_id'] },
  companies: { path: '/api/companies', key: 'company', filters: [] },
  deals: { path: '/api/deals', key: 'deal', filters: ['company_id', 'contact_id', 'stage'] },
};

const LIST_FILTERS = ['status', 'company_id', 'contact_id', 'stage'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = Number.isFinite;
const isString = (value) => typeof value === 'string';
const isBoolean = (value) => typeof value === 'boolean';

function invalid(field) {
  return { status: 'invalid_arguments', field };
}

function tooLong(value, max) {
  return value !== undefined && [...value].length > max;
}

function isDomain(domain) {
  if (tooLong(domain, 253) || isIP(domain) || /\.(localhost|local|internal)$/.test(domain)) return false;
  const labels = domain.split('.');
  if (labels.length < 2 || /^\d+$/.test(labels.at(-1))) return false;
  if (!labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)
      && !label.startsWith('xn--'))) return false;
  try {
    return new URL(`https://${domain}/`).hostname === domain;
  } catch {
    return false;
  }
}

export function recordPath(entity, id) {
  return `${RECORDS[entity].path}/${encodeURIComponent(id)}`;
}

async function read(ctx, endpoint, checks, input = {}, names = []) {
  const parameters = names.filter((name) => input[name] !== undefined)
    .map((name) => ({ name, value: String(input[name]), type: 'query' }));
  let response;
  try {
    response = await ctx.proxy({
      endpoint, method: 'GET', ...(parameters.length ? { parameters } : {}),
    });
  } catch (error) {
    if (error?.object?.status !== 'vendor_error') throw error;
    return { status: 'vendor_error', http_status: error.object.http_status, endpoint };
  }

  const { status: http_status } = response;
  if (http_status !== 200) return { status: 'vendor_error', http_status, endpoint };

  let { data } = response;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      data = null;
    }
  }
  if (!isObject(data) || !Object.entries(checks).every(([field, check]) => check(data[field]))) {
    return { status: 'vendor_error', reason: 'not_crm_answer', http_status, endpoint };
  }

  return Object.fromEntries(Object.keys(checks).map((field) => [field, data[field]]));
}

function listRecords(input, ctx) {
  const { entity, page, limit, search, status } = input;
  const record = RECORDS[entity];
  for (const filter of LIST_FILTERS) {
    if (input[filter] !== undefined && !record.filters.includes(filter)) return invalid(filter);
  }
  if (page !== undefined && (page < 1 || page > 10000)) return invalid('page');
  if (limit !== undefined && (limit < 1 || limit > 100)) return invalid('limit');
  if (tooLong(search, 200)) return invalid('search');
  if (tooLong(status, 64)) return invalid('status');

  return read(ctx, record.path, {
    [entity]: Array.isArray, total: isNumber, page: isNumber, limit: isNumber,
    ...(entity === 'deals' ? { totalValue: isNumber } : {}),
  }, input, ['page', 'limit', 'search', ...record.filters]);
}

function getRecord({ entity, id }, ctx) {
  return read(ctx, recordPath(entity, id), { [RECORDS[entity].key]: isObject });
}

function lookup(input, ctx) {
  const { email, domain } = input;
  if (email === undefined && domain === undefined) return invalid('email');
  if (tooLong(email, 254)) return invalid('email');
  if (domain !== undefined && !isDomain(domain)) return invalid('domain');

  return read(ctx, '/api/lookup', {
    contact: (value) => value === null || isObject(value),
    company: (value) => value === null || isObject(value),
    deals: Array.isArray,
    last_call_at: (value) => value === null || isString(value),
    next_meeting: (value) => value === null || isObject(value),
  }, input, ['email', 'domain']);
}

export const modules = {
  records: {
    list: listRecords,
    get: getRecord,
    lookup,
    stages: (_input, ctx) => read(ctx, '/api/stages', { stages: Array.isArray }),
    fields: (_input, ctx) => read(ctx, '/api/custom-fields', { defs: Array.isArray }),
    instance: (_input, ctx) => read(ctx, '/api/wiser/instance', {
      instance: isString, version: isString, caller: isString, read_only: isBoolean,
    }),
  },
  activities: {
    list: (input, ctx) => read(ctx, '/api/activities', { activities: Array.isArray }, input, ['entity_type', 'entity_id']),
  },
  people: {
    list: (_input, ctx) => read(ctx, '/api/wiser/people', { you: isString, people: Array.isArray }),
  },
};

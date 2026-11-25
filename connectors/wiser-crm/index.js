import { isIP } from 'node:net';

const RECORDS = {
  contacts: { path: '/api/contacts', key: 'contact', filters: ['status', 'company_id'] },
  companies: { path: '/api/companies', key: 'company', filters: [] },
  deals: { path: '/api/deals', key: 'deal', filters: ['company_id', 'contact_id', 'stage'] },
};

const LINKS = { company_id: 'companies', contact_id: 'contacts' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIELD_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const IMPORT_KEYS = new Set([
  'first_name', 'last_name', 'email', 'phone', 'title', 'status',
  'company', 'company_domain', 'company_industry', 'company_phone',
]);

const LIST_FILTERS = ['status', 'company_id', 'contact_id', 'stage'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isNumber = Number.isFinite;
const isString = (value) => typeof value === 'string';
const isBoolean = (value) => typeof value === 'boolean';
const isUuid = (value) => isString(value) && UUID.test(value);
const isScalar = (value) => value === null || isString(value) || isNumber(value) || isBoolean(value);

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
  return request(ctx, { endpoint, method: 'GET', ...(parameters.length ? { parameters } : {}) }, checks);
}

async function request(ctx, options, checks) {
  const { endpoint, method } = options;
  let response;
  try {
    response = await ctx.proxy(options);
  } catch (error) {
    if (error?.object?.status !== 'vendor_error') throw error;
    return { status: 'vendor_error', http_status: error.object.http_status, endpoint };
  }

  const { status: http_status } = response;
  if (http_status !== 200 && (method === 'GET' || http_status !== 201)) return { status: 'vendor_error', http_status, endpoint };

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

function validFields(fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (!FIELD_KEY.test(key)) return false;
    if (key === 'custom') {
      if (!isObject(value) || !Object.entries(value).every(([name, item]) => FIELD_KEY.test(name) && isScalar(item))) {
        return false;
      }
    } else if (!isScalar(value)) {
      return false;
    }
    if (Object.hasOwn(LINKS, key) && value !== null && !isUuid(value)) return false;
  }
  return Buffer.byteLength(JSON.stringify(fields), 'utf8') <= 16 * 1024;
}

function readLinkedRecord(ctx, entity, id) {
  return read(ctx, recordPath(entity, id), {
    [RECORDS[entity].key]: (record) => isObject(record) && record.id === id,
  });
}

function priorFields(fields, prior, links) {
  const keys = new Set([...Object.keys(fields), ...Object.keys(links)]);
  return Object.fromEntries([...keys].map((key) => [
    key,
    key === 'custom'
      ? Object.fromEntries(Object.keys(fields.custom).map((name) => [name, prior.custom?.[name] ?? prior[name] ?? null]))
      : prior[key] ?? null,
  ]));
}

async function writeRecord({ entity, id, fields }, ctx) {
  if (!validFields(fields)) return invalid('fields');

  const record = RECORDS[entity];
  const updating = id !== undefined;
  const endpoint = updating ? recordPath(entity, id) : record.path;
  const method = updating ? 'PUT' : 'POST';
  const checks = { [record.key]: updating ? isObject : (value) => isObject(value) && isUuid(value.id) };
  const expectedLinks = {};
  let contact;
  for (const [field, target] of Object.entries(LINKS)) {
    if (!Object.hasOwn(fields, field)) continue;
    const linkedId = fields[field];
    expectedLinks[field] = linkedId;
    if (linkedId === null) continue;
    const linked = await readLinkedRecord(ctx, target, linkedId);
    if (linked.status) return linked;
    if (field === 'contact_id') contact = linked.contact;
  }

  const checkingLinks = Object.keys(expectedLinks).length > 0;
  let prior;
  if (checkingLinks && updating) {
    const before = await readLinkedRecord(ctx, entity, id);
    if (before.status) return before;
    prior = before[record.key];
  }
  if (entity === 'deals' && contact && !Object.hasOwn(expectedLinks, 'company_id')) {
    // An update inherits the contact's company only when the deal has none.
    expectedLinks.company_id = prior?.company_id ?? contact.company_id ?? null;
  }

  const written = await request(ctx, { endpoint, method, body: fields }, checks);
  if (written.status || !checkingLinks) return written;

  const writtenId = updating ? id : written[record.key].id;
  const readEndpoint = recordPath(entity, writtenId);
  const after = await readLinkedRecord(ctx, entity, writtenId);
  if (!after.status && Object.entries(expectedLinks).every(([key, value]) => after[record.key][key] === value)) {
    return written;
  }

  const failure = after.status ? after : { status: 'vendor_error', reason: 'link_mismatch', endpoint: readEndpoint };
  if (!updating) {
    return { ...failure, id: writtenId, message: 'the record was created and left in place' };
  }

  const restored = await request(ctx, { endpoint, method, body: priorFields(fields, prior, expectedLinks) }, checks);
  if (!restored.status) return failure;
  return {
    ...failure,
    rollback_status: restored.http_status ?? restored.status,
    ...(restored.reason ? { rollback_reason: restored.reason } : {}),
    message: 'the new values may still be in place',
  };
}

function importContacts({ contacts }, ctx) {
  if (contacts.length < 1 || contacts.length > 500) return invalid('contacts');
  for (const contact of contacts) {
    if (!isObject(contact) || !Object.hasOwn(contact, 'first_name') || contact.first_name === '') {
      return invalid('contacts');
    }
    if (!Object.entries(contact).every(([key, value]) => IMPORT_KEYS.has(key) && isString(value) && !tooLong(value, 256))) {
      return invalid('contacts');
    }
  }
  return request(ctx, { endpoint: '/api/contacts/import', method: 'POST', body: { contacts } }, {
    imported: isNumber, matched: isNumber, companiesCreated: isNumber, skipped: isNumber, duplicates: isNumber,
  });
}

function logActivity({ entity_type, entity_id, type, body }, ctx) {
  const trimmed = body.trim();
  if (!trimmed || tooLong(body, 10000)) return invalid('body');
  return request(ctx, {
    endpoint: '/api/activities', method: 'POST', body: { entity_type, entity_id, type, body: trimmed },
  }, { ok: (value) => value === true });
}

export const modules = {
  records: {
    list: listRecords,
    get: getRecord,
    create: writeRecord,
    update: writeRecord,
    import_contacts: importContacts,
    lookup,
    stages: (_input, ctx) => read(ctx, '/api/stages', { stages: Array.isArray }),
    fields: (_input, ctx) => read(ctx, '/api/custom-fields', { defs: Array.isArray }),
    instance: (_input, ctx) => read(ctx, '/api/wiser/instance', {
      instance: isString, version: isString, caller: isString, read_only: isBoolean,
    }),
  },
  activities: {
    log: logActivity,
    list: (input, ctx) => read(ctx, '/api/activities', { activities: Array.isArray }, input, ['entity_type', 'entity_id']),
  },
  people: {
    list: (_input, ctx) => read(ctx, '/api/wiser/people', { you: isString, people: Array.isArray }),
  },
};

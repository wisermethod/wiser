function invalidArguments(field, message) {
  const result = { status: 'invalid_arguments', field };
  if (message !== undefined) result.message = message;
  return result;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// A gateway stop carries a string status and is returned to the caller untouched.
function isStatusObject(value) {
  return isPlainObject(value) && typeof value.status === 'string';
}

function extraKey(input, allowed) {
  if (!isPlainObject(input)) return invalidArguments('input');
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  return extra === undefined ? null : invalidArguments(extra);
}

function vendorError(endpoint, method) {
  return { status: 'vendor_error', endpoint, method };
}

function unwrap(payload) {
  return isPlainObject(payload) && Object.hasOwn(payload, 'data') ? payload.data : payload;
}

function isString(value) {
  return typeof value === 'string';
}

function isBoolean(value) {
  return typeof value === 'boolean';
}

// int32 on the wire. A larger safe integer passes a plain integer check and is
// then refused by the vendor, which spends a call to learn what this bound
// already knows.
const MIN_INT32 = -2147483648;
const MAX_INT32 = 2147483647;

function isInt32(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_INT32 && value <= MAX_INT32;
}

function withQuery(url, input, map) {
  const query = new URLSearchParams();
  for (const [from, to] of Object.entries(map)) {
    if (Object.hasOwn(input, from)) query.set(to, String(input[from]));
  }
  const qs = query.toString();
  return qs ? `${url}?${qs}` : url;
}

const CRM = 'https://cloudresourcemanager.googleapis.com/v3';
const SERVICE_USAGE = 'https://serviceusage.googleapis.com/v1';
const API_KEYS = 'https://apikeys.googleapis.com/v2';

// Project.projectId: "6 to 30 lowercase ASCII letters, digits, or hyphens. It
// must start with a letter. Trailing hyphens are prohibited." That is the whole
// rule. The quantified class is bounded at 30 characters, so it cannot recurse.
const PROJECT_ID = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

// A project number is equally valid everywhere this module builds a path, and
// refusing it was a bound the brief invented rather than read. Resource
// Manager's own parameter description gives a number as its example: "The name
// of the project (for example, `projects/415104041262`)", and Project.name is
// "an int64 generated number prefixed by projects/". The path patterns take
// [^/]+ throughout, so a number reaches every one of the four hosts. Bounded at
// 19 digits, which is int64.
const PROJECT_NUMBER = /^[0-9]{1,19}$/;

function isProject(value) {
  return typeof value === 'string' && (PROJECT_ID.test(value) || PROJECT_NUMBER.test(value));
}

// The schema states no pattern. Emptiness and slash checks are the module's
// own, needed to build a well-formed path, and not the vendor's. Whitespace is
// refused for the same path reason. Length check plus one flat negated-class
// scan, not a quantified group.
const SERVICE_FORBIDDEN = /[\s/]/;

function isService(value) {
  return typeof value === 'string' && value.length > 0 && !SERVICE_FORBIDDEN.test(value);
}

// The path pattern is [^/]+, so: non-empty, no /. Nothing more. Google's
// examples are UUID4 but the schema does not require it, and requiring it
// would refuse a key Google itself named differently.
function isKeyId(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('/');
}

// The id a caller may ASK for on create, which is a different rule from the one
// above: that one reads an id Google already assigned, this one proposes a new
// one. RFC 1034, lower case, at most 63 characters. Bounded, so no recursion.
const CREATE_KEY_ID = /^[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

function isCreateKeyId(value) {
  return typeof value === 'string' && CREATE_KEY_ID.test(value);
}

// Both generated documents declare this parameter's pattern outright:
// ^operations/[^/]+$ on apikeys operations.get and on serviceusage
// operations.get. An earlier version of this module enforced only that the
// string contained "operations/", which was a bound invented rather than read,
// and it broke endpoint confinement: a value such as
// a value ending "#operations/" after a path reaching another method passed it, and
// a URL fragment is not sent, so the authenticated proxy would have been handed
// the one API Keys method this connector exists to exclude. The response would
// have been refused by the reader, but the call would have been made. The
// example is not spelled out here: a test asserts this file names no token
// identifying that method, and the point survives without it.
// Anchored, single-segment, and the segment is encoded at the call site.
const OPERATION_NAME = /^operations\/[^/]+$/;

// "." and ".." survive encodeURIComponent unchanged and are resolved by ordinary
// URL normalisation, so "operations/.." reaches the collection path rather than
// the operation this module promised. Neither is a legal operation id, so
// refusing them costs nothing and keeps the built URL the one the comment above
// claims. Transport safety, not a vendor rule.
const DOT_SEGMENTS = new Set(['.', '..']);

function isOperationName(value) {
  if (typeof value !== 'string' || !OPERATION_NAME.test(value)) return false;
  return !DOT_SEGMENTS.has(value.slice('operations/'.length));
}

// GetPolicyOptions.requestedPolicyVersion: "Valid values are 0, 1, and 3.
// Requests specifying an invalid value will be rejected." 2 is not a member.
const POLICY_VERSIONS = new Set([0, 1, 3]);

function isPolicyVersion(value) {
  return isInt32(value) && POLICY_VERSIONS.has(value);
}

// displayName maximum 63 characters, which is the schema's own bound.
const DISPLAY_NAME_MAX = 63;

// Counted in code points. The vendor's 63 is a character count, and
// [...value].length counts supplementary characters once where value.length
// counts them twice, so a 32-emoji name is 32 here and 64 to String.length.
function isDisplayName(value) {
  return typeof value === 'string' && [...value].length <= DISPLAY_NAME_MAX;
}

// The schema makes every member of V2Restrictions optional, so restrictions: {}
// would satisfy a naive required check while restricting nothing at all. An
// unrestricted key is the predecessor's shipped defect and the thing this
// action exists to avoid. This required non-empty api_targets is the module's
// own, not the vendor's.
const RESTRICTIONS_SERVER_SIDE = 'a key this capability mints is a server-side key';

// browser_key_restrictions, android_key_restrictions, ios_key_restrictions and
// server_key_restrictions are refused by name. A key this capability mints is a
// server-side key. Measured 2026-09-19: a referrer-restricted key returns 403
// API_KEY_HTTP_REFERRER_BLOCKED through a connector, because a server-side call
// sends no referrer. None of the four has a named current use here;
// server_key_restrictions is an IP allowlist whose addresses the provider does
// not publish. This refusal is the module's own, not the vendor's.
const REFUSED_RESTRICTION_KINDS = new Set([
  'browser_key_restrictions',
  'android_key_restrictions',
  'ios_key_restrictions',
  'server_key_restrictions',
  'browserKeyRestrictions',
  'androidKeyRestrictions',
  'iosKeyRestrictions',
  'serverKeyRestrictions',
]);

function readRestrictions(value) {
  if (!isPlainObject(value)) return invalidArguments('restrictions');
  for (const key of Object.keys(value)) {
    if (REFUSED_RESTRICTION_KINDS.has(key)) {
      return invalidArguments(key, RESTRICTIONS_SERVER_SIDE);
    }
  }
  const extra = extraKey(value, ['api_targets']);
  if (extra) return extra;
  if (!Object.hasOwn(value, 'api_targets')
    || !Array.isArray(value.api_targets)
    || value.api_targets.length < 1) {
    return invalidArguments('api_targets');
  }
  const apiTargets = [];
  for (const entry of value.api_targets) {
    if (!isPlainObject(entry)) return invalidArguments('api_targets');
    const bad = extraKey(entry, ['service', 'methods']);
    if (bad) return bad;
    if (!isService(entry.service)) return invalidArguments('service');
    // methods is optional. The schema: "If empty, all methods for the service
    // are allowed." That is the intended shape for a key scoped to one API, so
    // an absent or empty methods is correct and must not be refused. This is
    // the module's own reading of that rule, and it is the opposite of
    // requiring a method list.
    if (Object.hasOwn(entry, 'methods')) {
      if (!Array.isArray(entry.methods) || !entry.methods.every((item) => typeof item === 'string')) {
        return invalidArguments('methods');
      }
    }
    const target = { service: entry.service };
    if (Object.hasOwn(entry, 'methods')) target.methods = entry.methods;
    apiTargets.push(target);
  }
  return { apiTargets };
}

function restrictionsBody(input) {
  const body = { restrictions: { apiTargets: input.apiTargets } };
  return body;
}

const PROJECT_STATES = new Set(['STATE_UNSPECIFIED', 'ACTIVE', 'DELETE_REQUESTED']);
const SERVICE_STATES = new Set(['STATE_UNSPECIFIED', 'DISABLED', 'ENABLED']);

const PROJECT_TYPES = {
  configuredCapabilities: Array.isArray,
  createTime: isString,
  deleteTime: isString,
  displayName: isString,
  etag: isString,
  isManagementProject: isBoolean,
  labels: isPlainObject,
  name: isString,
  parent: isString,
  projectId: isString,
  state: (value) => PROJECT_STATES.has(value),
  tags: isPlainObject,
  updateTime: isString,
};

const SEARCH_TYPES = {
  projects: Array.isArray,
  nextPageToken: isString,
};

const POLICY_TYPES = {
  auditConfigs: Array.isArray,
  bindings: Array.isArray,
  etag: isString,
  version: isInt32,
};

const SERVICE_TYPES = {
  config: isPlainObject,
  name: isString,
  parent: isString,
  state: (value) => SERVICE_STATES.has(value),
};

const LIST_SERVICES_TYPES = {
  services: Array.isArray,
  nextPageToken: isString,
};

const OPERATION_TYPES = {
  done: isBoolean,
  error: isPlainObject,
  metadata: isPlainObject,
  name: isString,
  response: isPlainObject,
};

const KEY_TYPES = {
  // The type URL an Any carries. See the projection note below: recognised so a
  // key returned inside an Operation.response is not refused, dropped so a type
  // URL does not reach the caller as a result field.
  '@type': isString,
  annotations: isPlainObject,
  createTime: isString,
  deleteTime: isString,
  displayName: isString,
  etag: isString,
  keyString: isString,
  name: isString,
  restrictions: isPlainObject,
  serviceAccountEmail: isString,
  uid: isString,
  updateTime: isString,
};

const LIST_KEYS_TYPES = {
  keys: Array.isArray,
  nextPageToken: isString,
};

// Return exactly these fields. keyString is in KEY_TYPES for recognition and
// is never copied here, even if a future vendor change populates it. That is a
// credential rule, not a projection preference: the constitution's Secrets
// clause keeps a secret's contents out of a result, and the one API Keys method
// that returns key material is excluded from this connector rather than
// implemented. Its name is deliberately absent from this file, because a test
// asserts that no token naming it appears here; CONNECTOR.md names it.
//
// deleteTime IS returned. An earlier draft omitted it because the brief's
// projection list did not name it, which lost the deletion time on a
// show_deleted listing for no reason: it is a timestamp, not key material.
//
// @type is recognised and dropped. A keys.create or get_operation response is
// google.protobuf.Any, whose ProtoJSON form carries a type URL; the generated
// schema says so in terms, "Contains field @type with type URL". A reader that
// refused it would turn every successful key creation into a vendor_error at
// the first live write. It is dropped rather than returned because a type URL
// is transport, not result.
const KEY_OUTPUT_KEYS = [
  'name',
  'uid',
  'displayName',
  'restrictions',
  'deleteTime',
  'createTime',
  'updateTime',
  'etag',
  'annotations',
  'serviceAccountEmail',
];

function readTyped(body, endpoint, method, types) {
  if (!isPlainObject(body)) return vendorError(endpoint, method);
  for (const key of Object.keys(body)) {
    if (!Object.hasOwn(types, key)) return vendorError(endpoint, method);
  }
  for (const key of Object.keys(body)) {
    if (!types[key](body[key])) return vendorError(endpoint, method);
  }
  return body;
}

function readProjectBody(body, endpoint, method) {
  return readTyped(body, endpoint, method, PROJECT_TYPES);
}

function readProject(payload, endpoint, method) {
  return readProjectBody(unwrap(payload), endpoint, method);
}

function readSearch(payload, endpoint, method) {
  const body = readTyped(unwrap(payload), endpoint, method, SEARCH_TYPES);
  if (isStatusObject(body)) return body;
  if (Object.hasOwn(body, 'projects')) {
    for (const item of body.projects) {
      const read = readProjectBody(item, endpoint, method);
      if (isStatusObject(read)) return read;
    }
  }
  return body;
}

function readPolicy(payload, endpoint, method) {
  return readTyped(unwrap(payload), endpoint, method, POLICY_TYPES);
}

function readServiceBody(body, endpoint, method) {
  return readTyped(body, endpoint, method, SERVICE_TYPES);
}

function readService(payload, endpoint, method) {
  return readServiceBody(unwrap(payload), endpoint, method);
}

function readServiceList(payload, endpoint, method) {
  const body = readTyped(unwrap(payload), endpoint, method, LIST_SERVICES_TYPES);
  if (isStatusObject(body)) return body;
  if (Object.hasOwn(body, 'services')) {
    for (const item of body.services) {
      const read = readServiceBody(item, endpoint, method);
      if (isStatusObject(read)) return read;
    }
  }
  return body;
}

function projectKey(body) {
  const out = {};
  for (const key of KEY_OUTPUT_KEYS) {
    if (Object.hasOwn(body, key)) out[key] = body[key];
  }
  return out;
}

function readKeyBody(body, endpoint, method) {
  const read = readTyped(body, endpoint, method, KEY_TYPES);
  if (isStatusObject(read)) return read;
  return projectKey(read);
}

function readKey(payload, endpoint, method) {
  return readKeyBody(unwrap(payload), endpoint, method);
}

function readKeyList(payload, endpoint, method) {
  const body = readTyped(unwrap(payload), endpoint, method, LIST_KEYS_TYPES);
  if (isStatusObject(body)) return body;
  const out = {};
  if (Object.hasOwn(body, 'keys')) {
    const keys = [];
    for (const item of body.keys) {
      const read = readKeyBody(item, endpoint, method);
      if (isStatusObject(read)) return read;
      keys.push(read);
    }
    out.keys = keys;
  }
  if (Object.hasOwn(body, 'nextPageToken')) out.nextPageToken = body.nextPageToken;
  return out;
}

// `metadata`, `error.details` and an unprojected `response` are all
// google.protobuf.Any in the generated schema, which means arbitrary vendor
// objects. Forwarding one crosses the credential boundary on trust: a Key
// carrying a keyString inside error.details would reach the caller through a
// reader whose whole job is to stop exactly that. Nothing here needs any of
// them, so none is forwarded. `error` is kept as code and message only, which
// is what a caller can act on and is also what standards/script-contract.md
// Output permits: the status and never the raw body.
function projectOperationError(error) {
  const out = {};
  if (typeof error.code === 'number') out.code = error.code;
  if (typeof error.message === 'string') out.message = error.message;
  return out;
}

function readOperationBody(body, endpoint, method, keyResponse) {
  const read = readTyped(body, endpoint, method, OPERATION_TYPES);
  if (isStatusObject(read)) return read;
  const out = {};
  if (Object.hasOwn(read, 'done')) out.done = read.done;
  if (Object.hasOwn(read, 'name')) out.name = read.name;
  if (Object.hasOwn(read, 'error')) out.error = projectOperationError(read.error);
  if (Object.hasOwn(read, 'response')) {
    if (keyResponse) {
      const projected = readKeyBody(read.response, endpoint, method);
      if (isStatusObject(projected)) return projected;
      out.response = projected;
    }
    // A services operation's response is an Any this module does not project,
    // so it is recognised and dropped rather than forwarded. `done` is what a
    // caller needs from it.
  }
  return out;
}

function readOperation(payload, endpoint, method, keyResponse = false) {
  return readOperationBody(unwrap(payload), endpoint, method, keyResponse);
}

function keyWireBody(input, restrictions) {
  const body = restrictionsBody(restrictions);
  if (Object.hasOwn(input, 'display_name')) body.displayName = input.display_name;
  return body;
}

export const modules = {
  projects: {
    // Contract from the approved plan dated 2026-09-19; live behavior unverified.
    async get(input, ctx) {
      const invalid = extraKey(input, ['project']);
      if (invalid) return invalid;
      if (!isProject(input.project)) return invalidArguments('project');
      const endpoint = `${CRM}/projects/${encodeURIComponent(input.project)}`;
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : readProject(result, endpoint, 'GET');
    },
    async search(input, ctx) {
      const invalid = extraKey(input, ['query', 'page_size', 'page_token']);
      if (invalid) return invalid;
      if (Object.hasOwn(input, 'query') && !isString(input.query)) return invalidArguments('query');
      if (Object.hasOwn(input, 'page_size') && !isInt32(input.page_size)) return invalidArguments('page_size');
      if (Object.hasOwn(input, 'page_token') && !isString(input.page_token)) return invalidArguments('page_token');
      const endpoint = withQuery(`${CRM}/projects:search`, input, {
        query: 'query',
        page_size: 'pageSize',
        page_token: 'pageToken',
      });
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : readSearch(result, endpoint, 'GET');
    },
    async get_iam_policy(input, ctx) {
      const invalid = extraKey(input, ['project', 'requested_policy_version']);
      if (invalid) return invalid;
      if (!isProject(input.project)) return invalidArguments('project');
      if (Object.hasOwn(input, 'requested_policy_version')
        && !isPolicyVersion(input.requested_policy_version)) {
        return invalidArguments('requested_policy_version');
      }
      const endpoint = `${CRM}/projects/${encodeURIComponent(input.project)}:getIamPolicy`;
      const body = Object.hasOwn(input, 'requested_policy_version')
        ? { options: { requestedPolicyVersion: input.requested_policy_version } }
        : {};
      const result = await ctx.proxy({ endpoint, method: 'POST', body });
      return isStatusObject(result) ? result : readPolicy(result, endpoint, 'POST');
    },
  },
  services: {
    // Contract from the approved plan dated 2026-09-19; live behavior unverified.
    async list(input, ctx) {
      const invalid = extraKey(input, ['project', 'filter', 'page_size', 'page_token']);
      if (invalid) return invalid;
      if (!isProject(input.project)) return invalidArguments('project');
      if (Object.hasOwn(input, 'filter') && !isString(input.filter)) return invalidArguments('filter');
      if (Object.hasOwn(input, 'page_size') && !isInt32(input.page_size)) return invalidArguments('page_size');
      if (Object.hasOwn(input, 'page_token') && !isString(input.page_token)) return invalidArguments('page_token');
      const endpoint = withQuery(
        `${SERVICE_USAGE}/projects/${encodeURIComponent(input.project)}/services`,
        input,
        { filter: 'filter', page_size: 'pageSize', page_token: 'pageToken' },
      );
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : readServiceList(result, endpoint, 'GET');
    },
    async get(input, ctx) {
      const invalid = extraKey(input, ['project', 'service']);
      if (invalid) return invalid;
      if (!isProject(input.project)) return invalidArguments('project');
      if (!isService(input.service)) return invalidArguments('service');
      const endpoint = `${SERVICE_USAGE}/projects/${encodeURIComponent(input.project)}/services/${encodeURIComponent(input.service)}`;
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : readService(result, endpoint, 'GET');
    },
    async enable(input, ctx) {
      const invalid = extraKey(input, ['project', 'service']);
      if (invalid) return invalid;
      if (!isProject(input.project)) return invalidArguments('project');
      if (!isService(input.service)) return invalidArguments('service');
      const endpoint = `${SERVICE_USAGE}/projects/${encodeURIComponent(input.project)}/services/${encodeURIComponent(input.service)}:enable`;
      // EnableServiceRequest declares no properties at all. Send {}. Do not
      // invent a field to put in it.
      const result = await ctx.proxy({ endpoint, method: 'POST', body: {} });
      return isStatusObject(result) ? result : readOperation(result, endpoint, 'POST');
    },
    async get_operation(input, ctx) {
      const invalid = extraKey(input, ['operation_name']);
      if (invalid) return invalid;
      if (!isOperationName(input.operation_name)) return invalidArguments('operation_name');
      // Same anchoring and encoding as the keys module's operation read.
      const endpoint = `${SERVICE_USAGE}/operations/${encodeURIComponent(input.operation_name.slice('operations/'.length))}`;
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : readOperation(result, endpoint, 'GET');
    },
  },
  keys: {
    // Contract from the approved plan dated 2026-09-19; live behavior unverified.
    async list(input, ctx) {
      const invalid = extraKey(input, ['project', 'page_size', 'page_token', 'show_deleted']);
      if (invalid) return invalid;
      if (!isProject(input.project)) return invalidArguments('project');
      if (Object.hasOwn(input, 'page_size') && !isInt32(input.page_size)) return invalidArguments('page_size');
      if (Object.hasOwn(input, 'page_token') && !isString(input.page_token)) return invalidArguments('page_token');
      if (Object.hasOwn(input, 'show_deleted') && !isBoolean(input.show_deleted)) {
        return invalidArguments('show_deleted');
      }
      const endpoint = withQuery(
        `${API_KEYS}/projects/${encodeURIComponent(input.project)}/locations/global/keys`,
        input,
        { page_size: 'pageSize', page_token: 'pageToken', show_deleted: 'showDeleted' },
      );
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : readKeyList(result, endpoint, 'GET');
    },
    async get(input, ctx) {
      const invalid = extraKey(input, ['project', 'key_id']);
      if (invalid) return invalid;
      if (!isProject(input.project)) return invalidArguments('project');
      if (!isKeyId(input.key_id)) return invalidArguments('key_id');
      const endpoint = `${API_KEYS}/projects/${encodeURIComponent(input.project)}/locations/global/keys/${encodeURIComponent(input.key_id)}`;
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : readKey(result, endpoint, 'GET');
    },
    async create(input, ctx) {
      const invalid = extraKey(input, ['project', 'key_id', 'display_name', 'restrictions']);
      if (invalid) return invalid;
      if (!isProject(input.project)) return invalidArguments('project');
      // The generated parameter carries no `pattern` field and states the rule
      // in its description instead, as a regular expression: "the id must match
      // the regular expression: [a-z]([a-z0-9-]{0,61}[a-z0-9])?". That is the
      // generated document speaking, not an HTML page, and it is a hard "must",
      // so a value it refuses would be refused at Google too and refusing it
      // here costs nothing. An earlier version accepted any string, including
      // one carrying a slash.
      if (Object.hasOwn(input, 'key_id') && !isCreateKeyId(input.key_id)) {
        return invalidArguments('key_id');
      }
      if (Object.hasOwn(input, 'display_name') && !isDisplayName(input.display_name)) {
        return invalidArguments('display_name');
      }
      const restrictions = readRestrictions(input.restrictions);
      if (isStatusObject(restrictions)) return restrictions;
      const endpoint = withQuery(
        `${API_KEYS}/projects/${encodeURIComponent(input.project)}/locations/global/keys`,
        input,
        { key_id: 'keyId' },
      );
      const body = keyWireBody(input, restrictions);
      const result = await ctx.proxy({ endpoint, method: 'POST', body });
      return isStatusObject(result) ? result : readOperation(result, endpoint, 'POST', true);
    },
    async patch(input, ctx) {
      const invalid = extraKey(input, ['project', 'key_id', 'restrictions']);
      if (invalid) return invalid;
      if (!isProject(input.project)) return invalidArguments('project');
      if (!isKeyId(input.key_id)) return invalidArguments('key_id');
      const restrictions = readRestrictions(input.restrictions);
      if (isStatusObject(restrictions)) return restrictions;
      // updateMask=restrictions is fixed by the module, not a caller input.
      const endpoint = `${API_KEYS}/projects/${encodeURIComponent(input.project)}/locations/global/keys/${encodeURIComponent(input.key_id)}?updateMask=restrictions`;
      const result = await ctx.proxy({
        endpoint,
        method: 'PATCH',
        body: restrictionsBody(restrictions),
      });
      return isStatusObject(result) ? result : readOperation(result, endpoint, 'PATCH', true);
    },
    async get_operation(input, ctx) {
      const invalid = extraKey(input, ['operation_name']);
      if (invalid) return invalid;
      if (!isOperationName(input.operation_name)) return invalidArguments('operation_name');
      // Anchored to ^operations/[^/]+$ above, and the id encoded as one path
      // segment so nothing in it can re-route the request.
      const endpoint = `${API_KEYS}/operations/${encodeURIComponent(input.operation_name.slice('operations/'.length))}`;
      const result = await ctx.proxy({ endpoint, method: 'GET' });
      return isStatusObject(result) ? result : readOperation(result, endpoint, 'GET', true);
    },
  },
};

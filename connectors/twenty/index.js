// Code points, not UTF-16 code units. standards/script-contract.md Published input schema.
function codePoints(value) {
  return [...value].length;
}

function invalid(field) {
  return { status: 'invalid_arguments', field };
}

function unknownField(input, allowed) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('input');
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  return extra === undefined ? null : invalid(extra);
}

function vendorError(endpoint, httpStatus, method, code) {
  const out = {
    status: 'vendor_error',
    http_status: typeof httpStatus === 'number' ? httpStatus : null,
    endpoint,
    method,
  };
  if (code) out.code = code;
  return out;
}

const API_NAME = /^[a-z][a-zA-Z0-9]{0,62}$/;
// Same language as API_NAME. namePlural publishes this spelling so a sampler
// with one exemplar per pattern does not emit nameSingular's exemplar again.
// Equal names are refused below, which a schema cannot say.
const NAME_PLURAL = /^[a-z](?:[a-zA-Z0-9]{0,62})$/;
const OPTION_LABEL = /^[^,]+$/;
const OPTION_VALUE = /^(?!.*__)[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
const ICON = /^Icon[A-Za-z0-9]{1,60}$/;
const CURSOR = /^[A-Za-z0-9+/=_-]{1,512}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const GRAPHQL_CODE = /^[A-Z_]{1,64}$/;
const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
const OBJECT_PLURALS = {
  person: 'people',
  company: 'companies',
  opportunity: 'opportunities',
  note: 'notes',
  noteTarget: 'noteTargets',
  task: 'tasks',
  taskTarget: 'taskTargets',
};
// Twenty's own fields on every object. records.update refuses them as data keys: deletedAt
// would delete or restore the record, and the rest are the workspace's own bookkeeping.
const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', 'searchVector']);
const FIELD_TYPES = new Set(['TEXT', 'NUMBER', 'BOOLEAN', 'DATE', 'DATE_TIME', 'SELECT', 'MULTI_SELECT']);
const SELECT_TYPES = new Set(['SELECT', 'MULTI_SELECT']);
// Twenty's TAG_COLORS, from the amended plan. red is first so a sampler's enum exemplar is red.
const COLORS = new Set([
  'red', 'ruby', 'crimson', 'tomato', 'orange', 'amber', 'yellow', 'lime', 'grass', 'green',
  'jade', 'mint', 'turquoise', 'cyan', 'sky', 'blue', 'iris', 'violet', 'purple', 'plum',
  'pink', 'bronze', 'gold', 'brown', 'gray',
]);

// Twenty's own standard objects at v2.45.6 (6007ad5a, STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS),
// every one but the CRM's seven: person, company, opportunity, note, noteTarget, task and
// taskTarget. records.create and records.update refuse each by name, before any call. A
// created workflow, campaign or message could send email, and the rest are the workspace's
// own machinery.
// Every other name is admitted, custom objects among them.
const SYSTEM_OBJECTS = new Set([
  'agentChatThread', 'agentChatThreadTarget', 'agentMessage', 'agentMessagePart', 'agentTurn',
  'agentTurnEvaluation', 'attachment', 'blocklist', 'calendarChannelEventAssociation',
  'calendarEvent', 'calendarEventParticipant', 'calendarEventTarget', 'callRecording',
  'campaignDelivery', 'dashboard', 'message', 'messageCampaign',
  'messageChannelMessageAssociation', 'messageChannelMessageAssociationMessageFolder',
  'messageList', 'messageListMember', 'messageParticipant', 'messageSuppression', 'messageThread',
  'messageThreadTarget', 'recordShare', 'shortLink', 'timelineActivity', 'workflow',
  'workflowAutomatedTrigger', 'workflowRun', 'workflowVersion', 'workspaceMember',
]);

const GRAPHQL = '/graphql';
const METADATA = '/metadata';

const OBJECTS_QUERY = [
  'query {',
  '  objects(paging: { first: 200 }, filter: {}) {',
  '    pageInfo { hasNextPage }',
  '    edges { node {',
  '      id nameSingular namePlural labelSingular labelPlural isSystem isActive',
  '      fields(paging: { first: 200 }, filter: {}) {',
  '        pageInfo { hasNextPage }',
  '        edges { node { id name label type isSystem isActive options } }',
  '      }',
  '    } }',
  '  }',
  '}',
].join('\n');

const WORKSPACE_QUERY = 'query { currentWorkspace { id subdomain displayName } }';
const OBJECT_NAMES_QUERY = 'query { objects(paging: { first: 200 }, filter: {}) { pageInfo { hasNextPage } edges { node { nameSingular namePlural } } } }';
const FIELD_QUERY = 'query ($id: UUID!) { field(id: $id) { id type options } }';
const CREATE_OBJECT_QUERY = 'mutation ($input: CreateOneObjectInput!) { createOneObject(input: $input) { id } }';
const CREATE_FIELD_QUERY = 'mutation ($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id } }';
const UPDATE_FIELD_QUERY = 'mutation ($input: UpdateOneFieldMetadataInput!) { updateOneField(input: $input) { id } }';

function httpStatusOf(res) {
  return res && typeof res === 'object' && typeof res.status === 'number' ? res.status : null;
}

function bodyOf(res) {
  if (res && typeof res === 'object' && Object.hasOwn(res, 'data')) return res.data;
  return null;
}

function graphqlCode(error) {
  const code = error && typeof error === 'object' ? error.extensions?.code : undefined;
  return typeof code === 'string' && GRAPHQL_CODE.test(code) ? code : null;
}

const CREDENTIAL_WORDS = /token|secret|passw(?:or)?d|credential|api[\s_-]*key|bearer|authorization/i;
const JWT_RUN = /eyJ[A-Za-z0-9_-]{10,}/;

// The words are tested with control characters removed as well as replaced, so a
// control character inside a word does not hide it.
function graphqlMessage(error) {
  if (!error || typeof error.message !== 'string') return null;
  const message = error.message.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  const joined = error.message.replace(/[\u0000-\u001f\u007f]/g, '');
  if (!message || [message, joined].some((text) => CREDENTIAL_WORDS.test(text) || JWT_RUN.test(text))) {
    return null;
  }
  return [...message].slice(0, 300).join('');
}

// Twenty answers a GraphQL failure with HTTP 200 and an errors array. A REST 4xx
// throws from ctx.proxy before this returns, and that throw is left alone.
async function graphql(ctx, endpoint, query, variables) {
  const res = await ctx.proxy({ endpoint, method: 'POST', body: { query, variables } });
  const httpStatus = httpStatusOf(res);
  const body = bodyOf(res);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return vendorError(endpoint, httpStatus, 'POST');
  }
  if (Array.isArray(body.errors) && body.errors.length > 0) {
    const error = vendorError(endpoint, httpStatus, 'POST', graphqlCode(body.errors[0]));
    const message = graphqlMessage(body.errors[0]);
    if (message) error.message = message;
    return error;
  }
  if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
    return vendorError(endpoint, httpStatus, 'POST');
  }
  return { payload: body.data, httpStatus };
}

async function restGet(ctx, endpoint) {
  const res = await ctx.proxy({ endpoint, method: 'GET' });
  const httpStatus = httpStatusOf(res);
  const body = bodyOf(res);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return vendorError(endpoint, httpStatus, 'GET');
  }
  return body;
}

function checkApiName(value, field) {
  if (typeof value !== 'string' || !API_NAME.test(value)) return invalid(field);
  return null;
}

function checkRecordData(data, refused = new Set()) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return invalid('data');
  const keys = Object.keys(data);
  if (keys.length > 100) return invalid('data');
  for (const key of keys) {
    if (!API_NAME.test(key) || refused.has(key)) return invalid('data');
  }
  return null;
}

// Twenty names a record's mutations and input types with twenty-shared's pascalCase, which
// is lodash camelCase capitalized (6007ad5a). This is that word split for an API name, so
// foo2bar is Foo2Bar and fooBAR is FooBar there. Checked against lodash.camelcase 4.3.0, the
// version Twenty resolves, which has no ordinal rule: foo2nd is Foo2Nd.
const HUMPED = /[a-z][A-Z]|[A-Z]{2,}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]/;
const NAME_WORD = /[A-Z]?[a-z]+(?=[A-Z]|$)|[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+|[A-Z]+|\d+/g;

function typeName(object) {
  const words = HUMPED.test(object) ? object.match(NAME_WORD) : [object];
  return words.map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join('');
}

function checkBoundedText(value, field, max, min = 1) {
  if (typeof value !== 'string' || codePoints(value) < min || codePoints(value) > max) return invalid(field);
  return null;
}

function checkDescription(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || codePoints(value) > 500) return invalid('description');
  return null;
}

function checkOptionList(options) {
  if (!Array.isArray(options) || options.length < 1 || options.length > 50) return invalid('options');
  const seen = new Set();
  for (const item of options) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return invalid('options');
    const extra = Object.keys(item).find((key) => key !== 'label' && key !== 'value' && key !== 'color');
    if (extra !== undefined) return invalid('options');
    if (typeof item.label !== 'string' || !OPTION_LABEL.test(item.label) || codePoints(item.label) < 1 || codePoints(item.label) > 63) {
      return invalid('options');
    }
    if (typeof item.value !== 'string' || !OPTION_VALUE.test(item.value) || codePoints(item.value) > 63) {
      return invalid('options');
    }
    if (!COLORS.has(item.color)) return invalid('options');
    if (seen.has(item.value)) return invalid('options');
    seen.add(item.value);
  }
  return null;
}

function withPositions(options) {
  return options.map((item, position) => ({
    label: item.label,
    value: item.value,
    color: item.color,
    position,
  }));
}

function createdId(payload, key) {
  const node = payload && typeof payload === 'object' ? payload[key] : undefined;
  const id = node && typeof node === 'object' ? node.id : undefined;
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return null;
  return { id };
}

const INCOMPLETE = 'RESULT_INCOMPLETE';

function hasMore(connection) {
  return Boolean(connection && typeof connection === 'object' && connection.pageInfo && connection.pageInfo.hasNextPage === true);
}

async function restName(ctx, object) {
  if (Object.hasOwn(OBJECT_PLURALS, object)) return { namePlural: OBJECT_PLURALS[object] };
  if (Object.values(OBJECT_PLURALS).includes(object)) return { namePlural: object };
  const result = await graphql(ctx, METADATA, OBJECT_NAMES_QUERY, {});
  if (result.status === 'vendor_error') return result;
  const connection = result.payload.objects;
  if (!connection || typeof connection !== 'object' || Array.isArray(connection)
    || !Array.isArray(connection.edges) || typeof connection.pageInfo?.hasNextPage !== 'boolean') {
    return vendorError(METADATA, result.httpStatus, 'POST');
  }
  const nodes = [];
  for (const edge of connection.edges) {
    const node = edge && typeof edge === 'object' ? edge.node : undefined;
    if (!node || typeof node !== 'object' || Array.isArray(node)
      || typeof node.nameSingular !== 'string' || typeof node.namePlural !== 'string') {
      return vendorError(METADATA, result.httpStatus, 'POST');
    }
    nodes.push(node);
  }
  const match = nodes.find((node) => node.nameSingular === object) || nodes.find((node) => node.namePlural === object);
  if (!match) {
    return hasMore(connection) ? vendorError(METADATA, result.httpStatus, 'POST', INCOMPLETE) : invalid('object');
  }
  if (!API_NAME.test(match.namePlural)) return vendorError(METADATA, result.httpStatus, 'POST');
  return { namePlural: match.namePlural };
}

function projectFields(fields) {
  const edges = fields && typeof fields === 'object' ? fields.edges : undefined;
  if (!Array.isArray(edges)) return null;
  if (hasMore(fields)) return INCOMPLETE;
  const out = [];
  for (const edge of edges) {
    const node = edge && typeof edge === 'object' ? edge.node : undefined;
    if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
    out.push({
      id: node.id,
      name: node.name,
      label: node.label,
      type: node.type,
      isSystem: node.isSystem,
      isActive: node.isActive,
      options: node.options,
    });
  }
  return out;
}

function projectObjects(payload) {
  const edges = payload && payload.objects && typeof payload.objects === 'object' ? payload.objects.edges : undefined;
  if (!Array.isArray(edges)) return null;
  if (hasMore(payload.objects)) return INCOMPLETE;
  const objects = [];
  for (const edge of edges) {
    const node = edge && typeof edge === 'object' ? edge.node : undefined;
    if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
    const fields = projectFields(node.fields);
    if (!fields || fields === INCOMPLETE) return fields;
    objects.push({
      id: node.id,
      nameSingular: node.nameSingular,
      namePlural: node.namePlural,
      labelSingular: node.labelSingular,
      labelPlural: node.labelPlural,
      isSystem: node.isSystem,
      isActive: node.isActive,
      fields,
    });
  }
  return { objects };
}

function plainCopy(option) {
  const copy = {};
  for (const key of Object.keys(option)) copy[key] = option[key];
  return copy;
}

// Which workspace the bound key belongs to. Solve box 32 read currentWorkspace with an API key.
async function workspace(input, ctx) {
  const bad = unknownField(input, []);
  if (bad) return bad;
  const result = await graphql(ctx, METADATA, WORKSPACE_QUERY, {});
  if (result.status === 'vendor_error') return result;
  const node = result.payload.currentWorkspace;
  if (!node || typeof node !== 'object' || Array.isArray(node) || typeof node.id !== 'string' || !SAFE_ID.test(node.id)) {
    return vendorError(METADATA, result.httpStatus, 'POST');
  }
  return {
    id: node.id,
    subdomain: typeof node.subdomain === 'string' ? node.subdomain : null,
    displayName: typeof node.displayName === 'string' ? node.displayName : null,
  };
}

export const modules = {
  records: {
    async list(input, ctx) {
      const bad = unknownField(input, ['object', 'limit', 'cursor']) || checkApiName(input.object, 'object');
      if (bad) return bad;
      let limit = 20;
      if (input.limit !== undefined) {
        if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 60) return invalid('limit');
        limit = input.limit;
      }
      if (input.cursor !== undefined) {
        if (typeof input.cursor !== 'string' || !CURSOR.test(input.cursor) || codePoints(input.cursor) > 512) {
          return invalid('cursor');
        }
      }
      const resolved = await restName(ctx, input.object);
      if (resolved.status) return resolved;
      let endpoint = `/rest/${encodeURIComponent(resolved.namePlural)}?limit=${limit}`;
      if (input.cursor !== undefined) endpoint += `&starting_after=${encodeURIComponent(input.cursor)}`;
      return restGet(ctx, endpoint);
    },

    // One record is asked for and dropped here, so a count never carries a row.
    async count(input, ctx) {
      const bad = unknownField(input, ['object']) || checkApiName(input.object, 'object');
      if (bad) return bad;
      const resolved = await restName(ctx, input.object);
      if (resolved.status) return resolved;
      const endpoint = `/rest/${encodeURIComponent(resolved.namePlural)}?limit=1`;
      const body = await restGet(ctx, endpoint);
      if (body.status === 'vendor_error') return body;
      if (!Number.isInteger(body.totalCount) || body.totalCount < 0) return vendorError(endpoint, null, 'GET');
      return { totalCount: body.totalCount };
    },

    workspace,

    async create(input, ctx) {
      const bad = unknownField(input, ['object', 'data']) || checkApiName(input.object, 'object');
      if (bad) return bad;
      if (SYSTEM_OBJECTS.has(input.object)) return invalid('object');
      const data = checkRecordData(input.data);
      if (data) return data;
      // The mutation and input type names are the checked object as Twenty spells them.
      // Values stay in variables.
      const name = typeName(input.object);
      const query = `mutation ($data: ${name}CreateInput!) { create${name}(data: $data) { id } }`;
      const result = await graphql(ctx, GRAPHQL, query, { data: input.data });
      if (result.status === 'vendor_error') return result;
      const created = createdId(result.payload, `create${name}`);
      if (!created) return vendorError(GRAPHQL, result.httpStatus, 'POST');
      return created;
    },

    async update(input, ctx) {
      const bad = unknownField(input, ['object', 'id', 'data']) || checkApiName(input.object, 'object');
      if (bad) return bad;
      if (SYSTEM_OBJECTS.has(input.object)) return invalid('object');
      if (typeof input.id !== 'string' || !UUID.test(input.id)) return invalid('id');
      const data = checkRecordData(input.data, SYSTEM_FIELDS);
      if (data) return data;
      const name = typeName(input.object);
      const query = `mutation ($id: UUID!, $data: ${name}UpdateInput!) { update${name}(id: $id, data: $data) { id } }`;
      const result = await graphql(ctx, GRAPHQL, query, { id: input.id, data: input.data });
      if (result.status === 'vendor_error') return result;
      const updated = createdId(result.payload, `update${name}`);
      if (!updated) return vendorError(GRAPHQL, result.httpStatus, 'POST');
      return updated;
    },
  },

  metadata: {
    async list_objects(input, ctx) {
      const bad = unknownField(input, []);
      if (bad) return bad;
      const result = await graphql(ctx, METADATA, OBJECTS_QUERY, {});
      if (result.status === 'vendor_error') return result;
      const projected = projectObjects(result.payload);
      if (projected === INCOMPLETE) return vendorError(METADATA, result.httpStatus, 'POST', INCOMPLETE);
      if (!projected) return vendorError(METADATA, result.httpStatus, 'POST');
      return projected;
    },

    workspace,

    async create_object(input, ctx) {
      const bad = unknownField(input, ['nameSingular', 'namePlural', 'labelSingular', 'labelPlural', 'icon', 'description'])
        || checkApiName(input.nameSingular, 'nameSingular');
      if (bad) return bad;
      if (typeof input.namePlural !== 'string' || !NAME_PLURAL.test(input.namePlural) || !API_NAME.test(input.namePlural)) {
        return invalid('namePlural');
      }
      if (input.nameSingular === input.namePlural) return invalid('namePlural');
      const label = checkBoundedText(input.labelSingular, 'labelSingular', 63)
        || checkBoundedText(input.labelPlural, 'labelPlural', 63);
      if (label) return label;
      if (input.icon !== undefined && (typeof input.icon !== 'string' || !ICON.test(input.icon) || codePoints(input.icon) > 64)) {
        return invalid('icon');
      }
      const description = checkDescription(input.description);
      if (description) return description;
      const object = {
        nameSingular: input.nameSingular,
        namePlural: input.namePlural,
        labelSingular: input.labelSingular,
        labelPlural: input.labelPlural,
      };
      if (input.icon !== undefined) object.icon = input.icon;
      if (input.description !== undefined) object.description = input.description;
      const result = await graphql(ctx, METADATA, CREATE_OBJECT_QUERY, { input: { object } });
      if (result.status === 'vendor_error') return result;
      const created = createdId(result.payload, 'createOneObject');
      if (!created) return vendorError(METADATA, result.httpStatus, 'POST');
      return created;
    },

    async create_field(input, ctx) {
      const bad = unknownField(input, ['objectMetadataId', 'name', 'label', 'type', 'description', 'options'])
        || (typeof input.objectMetadataId !== 'string' || !UUID.test(input.objectMetadataId) ? invalid('objectMetadataId') : null)
        || checkApiName(input.name, 'name')
        || checkBoundedText(input.label, 'label', 63)
        || (FIELD_TYPES.has(input.type) ? null : invalid('type'));
      if (bad) return bad;
      const description = checkDescription(input.description);
      if (description) return description;
      const select = SELECT_TYPES.has(input.type);
      if (select) {
        const options = checkOptionList(input.options);
        if (options) return options;
      } else if (Object.hasOwn(input, 'options')) {
        return invalid('options');
      }
      const field = {
        objectMetadataId: input.objectMetadataId,
        type: input.type,
        name: input.name,
        label: input.label,
      };
      if (input.description !== undefined) field.description = input.description;
      if (select) field.options = withPositions(input.options);
      const result = await graphql(ctx, METADATA, CREATE_FIELD_QUERY, { input: { field } });
      if (result.status === 'vendor_error') return result;
      const created = createdId(result.payload, 'createOneField');
      if (!created) return vendorError(METADATA, result.httpStatus, 'POST');
      return created;
    },

    async add_field_options(input, ctx) {
      const bad = unknownField(input, ['fieldId', 'options'])
        || (typeof input.fieldId !== 'string' || !UUID.test(input.fieldId) ? invalid('fieldId') : null)
        || checkOptionList(input.options);
      if (bad) return bad;
      const read = await graphql(ctx, METADATA, FIELD_QUERY, { id: input.fieldId });
      if (read.status === 'vendor_error') return read;
      const field = read.payload.field;
      if (!field || typeof field !== 'object' || Array.isArray(field) || typeof field.type !== 'string') {
        return vendorError(METADATA, read.httpStatus, 'POST');
      }
      if (!SELECT_TYPES.has(field.type)) return invalid('fieldId');
      let existing;
      if (field.options == null) existing = [];
      else if (!Array.isArray(field.options)) return vendorError(METADATA, read.httpStatus, 'POST');
      else existing = field.options;
      const values = new Set();
      const labels = new Set();
      let top = -1;
      for (const option of existing) {
        if (!option || typeof option !== 'object' || Array.isArray(option)) {
          return vendorError(METADATA, read.httpStatus, 'POST');
        }
        if (option.position !== undefined && option.position !== null) {
          if (typeof option.position !== 'number' || !Number.isFinite(option.position)) {
            return vendorError(METADATA, read.httpStatus, 'POST');
          }
          if (option.position > top) top = option.position;
        }
        if (typeof option.value === 'string') values.add(option.value);
        if (typeof option.label === 'string') labels.add(option.label);
      }
      for (const item of input.options) {
        if (values.has(item.value) || labels.has(item.label)) return invalid('options');
      }
      if (existing.length + input.options.length > 100) return invalid('options');
      // New options continue above the highest existing position, which need not be the count.
      const base = Math.max(Math.floor(top) + 1, existing.length);
      const options = existing.map(plainCopy);
      input.options.forEach((item, index) => {
        options.push({
          label: item.label,
          value: item.value,
          color: item.color,
          position: base + index,
        });
      });
      const updated = await graphql(ctx, METADATA, UPDATE_FIELD_QUERY, {
        input: { id: input.fieldId, update: { options } },
      });
      if (updated.status === 'vendor_error') return updated;
      const created = createdId(updated.payload, 'updateOneField');
      if (!created) return vendorError(METADATA, updated.httpStatus, 'POST');
      return created;
    },
  },
};

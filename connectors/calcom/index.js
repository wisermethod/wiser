import { readFileSync } from 'node:fs';
import { routes, withheldFields } from './routes.js';

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));
const withheldKeys = new Set(withheldFields);
const querySeparators = { form: ',', spaceDelimited: ' ', pipeDelimited: '|' };

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasType(value, type) {
  if (type === 'object') return isObject(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return Number.isFinite(value);
  return typeof value === type;
}

function checkRules(value, schema, field, nested = false) {
  if (nested) {
    if (schema.enum && !schema.enum.includes(value)) return field;
    if (schema.type && !hasType(value, schema.type)) return field;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return field;
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (length < schema.minLength || length > schema.maxLength) return field;
  }
  if (typeof value === 'number' && (value < schema.minimum || value > schema.maximum)) return field;
  if (Array.isArray(value)) {
    if (value.length < schema.minItems || value.length > schema.maxItems) return field;
    for (const [index, item] of value.entries()) {
      const invalid = checkRules(item, schema.items ?? {}, `${field}[${index}]`, nested);
      if (invalid !== null) return invalid;
    }
  }
  if (isObject(value) && schema.properties) {
    const childPath = (name) => field ? `${field}.${name}` : name;
    for (const name of schema.required ?? []) {
      if (!Object.hasOwn(value, name)) return childPath(name);
    }
    for (const [name, child] of Object.entries(value)) {
      const path = childPath(name);
      if (!Object.hasOwn(schema.properties, name)) {
        if (schema.additionalProperties === false) return path;
        continue;
      }
      // The gateway validates the root properties and array item types. It stops
      // at an object's boundary. From there this function checks every rule.
      const invalid = checkRules(child, schema.properties[name], path, field !== '');
      if (invalid !== null) return invalid;
    }
  }
  return null;
}

function requestFor(input, route) {
  const { method, path, queryParameters, bodyProperties, bodyRequired, wholeBody, version } = route;
  const endpoint = path.replace(/\{([^{}]+)\}/g, (_, name) => encodeURIComponent(input[name]));
  const parameters = [];
  for (const { name, style, explode } of queryParameters) {
    if (!Object.hasOwn(input, name)) continue;
    const value = input[name];
    const values = Array.isArray(value)
      ? (explode ? value.map(String) : [value.map(String).join(querySeparators[style])])
      : [String(value)];
    for (const string of values) parameters.push({ name, value: string, type: 'query' });
  }
  if (version) parameters.push({ name: 'cal-api-version', value: version, type: 'header' });

  const body = wholeBody ? input[wholeBody] : Object.fromEntries(bodyProperties
    .filter((name) => Object.hasOwn(input, name)).map((name) => [name, input[name]]));
  return {
    endpoint, method,
    ...(parameters.length ? { parameters } : {}),
    ...(body !== undefined && (bodyRequired || wholeBody || Object.keys(body).length) ? { body } : {}),
  };
}

function redact(value, withheld, path = '') {
  if (Array.isArray(value)) return value.map((item, i) => redact(item, withheld, `${path}[${i}]`));
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    const childPath = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
      ? (path ? `${path}.${key}` : key)
      : `${path}[${JSON.stringify(key)}]`;
    if (!withheldKeys.has(key)) return [key, redact(child, withheld, childPath)];
    withheld.push(childPath);
    return [key, null];
  }));
}

function handlerFor(route, schema) {
  return async (input, ctx) => {
    const field = checkRules(input, schema, '');
    if (field !== null) return { status: 'invalid_arguments', field };
    if (route.rejectWorkflowStepSecret && input.steps?.some((step) => Object.hasOwn(step, 'secret'))) {
      return { status: 'invalid_arguments', field: 'steps' };
    }
    const request = requestFor(input, route);
    // The proxy can throw a gateway status signal. Let the gateway handle it.
    const response = await ctx.proxy(request);
    if (typeof response?.status === 'string') return response;

    const { data: body, status } = response ?? {};
    const ok = typeof status === 'number' && status >= 200 && status < 300;
    if (!ok || !isObject(body) || body.status === 'error') {
      const error = {
        status: 'vendor_error',
        http_status: Number.isFinite(status) ? status : null,
        endpoint: request.endpoint,
        method: route.method,
      };
      if (ok && body?.status === 'error' && typeof body.error?.code === 'string') error.code = body.error.code;
      return error;
    }

    const withheld = [];
    const result = redact(body, withheld);
    return withheld.length ? { ...result, withheld } : result;
  };
}

export const modules = {};
for (const [id, route] of Object.entries(routes)) {
  const [, module, action] = id.split('.');
  modules[module] ??= {};
  modules[module][action] = handlerFor(route, manifest.modules[module].actions[action].input);
}

// No file is read here: the hosted service runs connectors in Cloudflare Workers, which has no
// filesystem, so each action's published input comes from the generated routes.js (2026-11-23).
import { inputs, routes, withheldFields } from './routes.js';

const withheldKeys = new Set(withheldFields);
const querySeparators = { form: ',', spaceDelimited: ' ', pipeDelimited: '|' };
const feedIntegration = 'ics-feed_calendar';
const feedAlias = 'ics-feed';
const calendarListRoute = routes['calcom.calendars.list'];

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

function isFeedAddress(value) {
  const address = value.trim();
  if (!/^(?:https?|webcals?):\/\//i.test(address)) return false;
  try {
    const { protocol, hostname, pathname } = new URL(address);
    return Boolean(hostname) && (protocol === 'webcal:' || protocol === 'webcals:' ||
      /\.ics\/*$|\/calendar\/ical\//i.test(pathname));
  } catch {
    return false;
  }
}

// A feed address can sit inside a longer string, such as `<credentialId>,<address>` or a sentence.
function containsFeedAddress(value) {
  for (const [token] of value.matchAll(/(?:https?|webcals?):\/\/[^\s"'<>]+/gi)) {
    const trimmed = token.replace(/[.,;:!?)\]}]+$/, '');
    if ([token, trimmed, ...trimmed.split(',')].some(isFeedAddress)) return true;
  }
  return false;
}

// An answer can echo a resolved address decoded, encoded either way, trimmed, or only its secret part.
// Every needle is at least 16 characters, so a degenerate stored address cannot blank ordinary text.
function addressNeedles(address) {
  const forms = new Set([address]);
  try { forms.add(decodeURIComponent(address)); } catch { /* keep the raw form */ }
  for (const form of [...forms]) {
    forms.add(form.replace(/%40/gi, '@'));
    forms.add(form.replace(/@/g, '%40'));
    try { forms.add(encodeURIComponent(form)); } catch { /* keep the other forms */ }
  }
  const needles = new Set();
  for (const form of forms) {
    needles.add(form);
    needles.add(form.replace(/\/+$/, ''));
    for (const segment of form.split(/[/?#&=]/)) {
      if (/^[A-Za-z0-9_-]+$/.test(segment) && /\d/.test(segment)) needles.add(segment);
    }
  }
  return [...needles].filter((needle) => needle.length >= 16).map((needle) => needle.toLowerCase());
}

function redactedAnswer(answer, withholdFeedUrls, resolvedAddresses) {
  const withheld = [];
  const needles = resolvedAddresses.flatMap(addressNeedles);
  function redact(value, path, withhold = false) {
    if (withhold || (withholdFeedUrls && typeof value === 'string' &&
        (containsFeedAddress(value) || needles.some((needle) => value.toLowerCase().includes(needle))))) {
      withheld.push(path);
      return null;
    }
    if (Array.isArray(value)) return value.map((item, i) => redact(item, `${path}[${i}]`));
    if (!isObject(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => {
      const childPath = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
        ? (path ? `${path}.${key}` : key)
        : `${path}[${JSON.stringify(key)}]`;
      const withholdChild = withheldKeys.has(key) || (key === 'externalId' && value.integration === feedIntegration);
      return [key, redact(child, childPath, withholdChild)];
    }));
  }
  const result = redact(answer, '');
  return withheld.length ? { ...result, withheld } : result;
}

function isSuccessful(status) {
  return typeof status === 'number' && status >= 200 && status < 300;
}

function vendorError(request, status) {
  return {
    status: 'vendor_error',
    http_status: Number.isFinite(status) ? status : null,
    endpoint: request.endpoint,
    method: request.method,
  };
}

async function proxyFeedRequest(ctx, request) {
  // The request may carry a private address. Report the route and status only on proxy failure.
  try {
    const response = await ctx.proxy(request);
    return response?.status === 'vendor_error' ? vendorError(request, response.http_status) : response;
  } catch (error) {
    if (error?.name === 'StatusSignal' && error.object?.status !== 'vendor_error') return error.object;
    return vendorError(request, error?.object?.http_status);
  }
}

async function resolveFeed(ctx, credentialId, field) {
  const request = requestFor({}, calendarListRoute);
  const response = await proxyFeedRequest(ctx, request);
  const connected = response?.data?.data?.connectedCalendars;
  if (!isSuccessful(response?.status) || response.data?.status === 'error' || !Array.isArray(connected)) {
    return { error: vendorError(request, response?.http_status ?? response?.status) };
  }

  const id = typeof credentialId === 'string' && /^\d+$/.test(credentialId) ? Number(credentialId) : credentialId;
  const matches = Number.isSafeInteger(id) ? connected.flatMap((entry) =>
    entry?.credentialId === id && Array.isArray(entry.calendars)
      ? entry.calendars.filter((calendar) => calendar?.integration === feedIntegration)
      : []) : [];
  const address = matches[0]?.externalId;
  if (matches.length !== 1 || typeof address !== 'string' || !address.trim()) {
    return { error: { status: 'invalid_arguments', field } };
  }
  return { address };
}

function handlerFor(route, schema, module, action) {
  const withholdFeedUrls = module === 'calendars';
  const busyTimes = withholdFeedUrls && action === 'get_busy_times';
  const selectedCalendar = withholdFeedUrls && ['add_selected', 'remove_selected'].includes(action);
  return async (input, ctx) => {
    const field = checkRules(input, schema, '');
    if (field !== null) return { status: 'invalid_arguments', field };
    if (route.rejectWorkflowStepSecret && input.steps?.some((step) => Object.hasOwn(step, 'secret'))) {
      return { status: 'invalid_arguments', field: 'steps' };
    }
    let requestInput = input;
    const resolvedAddresses = [];
    if (busyTimes) {
      const calendar = [...input.calendar];
      for (const [index, item] of calendar.entries()) {
        const match = /^(\d+),ics-feed$/.exec(item);
        if (!match) continue;
        const [, credentialId] = match;
        const { address, error } = await resolveFeed(ctx, credentialId, 'calendar');
        if (error) return error;
        resolvedAddresses.push(address);
        calendar[index] = `${credentialId},${address}`;
      }
      requestInput = { ...input, calendar };
    } else if (selectedCalendar && input.externalId === feedAlias) {
      const { address, error } = await resolveFeed(ctx, input.credentialId, 'externalId');
      if (error) return error;
      resolvedAddresses.push(address);
      requestInput = { ...input, externalId: address };
    }

    const request = requestFor(requestInput, route);
    const response = resolvedAddresses.length ? await proxyFeedRequest(ctx, request) : await ctx.proxy(request);
    const answer = (value) => redactedAnswer(value, withholdFeedUrls, resolvedAddresses);
    if (typeof response?.status === 'string') return answer(response);

    const { data: body, status } = response ?? {};
    const ok = isSuccessful(status);
    if (!ok || !isObject(body) || body.status === 'error') {
      const error = vendorError(request, status);
      if (ok && body?.status === 'error' && typeof body.error?.code === 'string') error.code = body.error.code;
      return answer(error);
    }

    return answer(body);
  };
}

export const modules = {};
for (const [id, route] of Object.entries(routes)) {
  const [, module, action] = id.split('.');
  modules[module] ??= {};
  modules[module][action] = handlerFor(route, inputs[id], module, action);
}

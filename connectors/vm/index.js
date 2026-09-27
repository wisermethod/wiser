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

// A lone surrogate has no UTF-8 encoding, so the bytes sent would not be the text named.
function representable(value) {
  return Buffer.from(value, 'utf8').toString('utf8') === value;
}

const MACHINE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/;
// A unit starting with - would be read by systemctl as an option, so the pattern
// refuses one and both vectors end option parsing with -- before the unit.
const UNIT = /^[A-Za-z0-9@._:][A-Za-z0-9@._:-]{0,119}\.(service|timer|socket|target|path|mount)$/;
const ABS_PATH = /^\/[^\u0000\r\n]*$/;
const VERBS = new Set(['start', 'stop', 'restart', 'reload', 'enable', 'disable']);
const ARGV_MAX_ITEMS = 64;
const ARG_MAX = 4096;
const PATH_MAX = 4096;
const CONTENT_MAX = 60000;
// The router's decoded request-body cap. Checked on write_file, whose content can
// expand under JSON escaping while staying inside the code-point bound.
const REQUEST_MAX_BYTES = 262144;

function checkMachine(value) {
  if (typeof value !== 'string' || !MACHINE.test(value)) return invalid('machine');
  return null;
}

function checkUnit(value) {
  if (typeof value !== 'string' || !UNIT.test(value)) return invalid('unit');
  return null;
}

function checkVerb(value) {
  if (!VERBS.has(value)) return invalid('verb');
  return null;
}

function checkPath(value) {
  if (typeof value !== 'string' || !ABS_PATH.test(value) || codePoints(value) > PATH_MAX || !representable(value)) {
    return invalid('path');
  }
  return null;
}

function checkArgv(argv) {
  if (!Array.isArray(argv) || argv.length < 1 || argv.length > ARGV_MAX_ITEMS) return invalid('argv');
  for (const el of argv) {
    if (typeof el !== 'string' || codePoints(el) > ARG_MAX) return invalid('argv');
  }
  if (argv[0] === '') return invalid('argv');
  return null;
}

function checkContent(value) {
  if (typeof value !== 'string' || codePoints(value) > CONTENT_MAX || !representable(value)) return invalid('content');
  return null;
}

function jsonBytes(body) {
  return Buffer.byteLength(JSON.stringify(body), 'utf8');
}

async function callRouter(ctx, endpoint, body) {
  const res = await ctx.proxy({ endpoint, method: 'POST', body });
  const data = res && typeof res === 'object' && Object.hasOwn(res, 'data') ? res.data : res;
  if (data && typeof data === 'object' && !Array.isArray(data) && typeof data.outcome === 'string') return data;
  return {
    status: 'vendor_error',
    http_status: res && typeof res === 'object' && typeof res.status === 'number' ? res.status : null,
    endpoint,
    method: 'POST',
  };
}

export const modules = {
  inventory: {
    async health(input, ctx) {
      const bad = unknownField(input, ['machine']) || checkMachine(input.machine);
      if (bad) return bad;
      return callRouter(ctx, '/health', { machine: input.machine });
    },
    async facts(input, ctx) {
      const bad = unknownField(input, ['machine']) || checkMachine(input.machine);
      if (bad) return bad;
      return callRouter(ctx, '/facts', { machine: input.machine });
    },
    async list_hosts(input, ctx) {
      const bad = unknownField(input, []);
      if (bad) return bad;
      return callRouter(ctx, '/list_hosts', {});
    },
  },
  command: {
    async run(input, ctx) {
      const bad = unknownField(input, ['machine', 'argv']) || checkMachine(input.machine) || checkArgv(input.argv);
      if (bad) return bad;
      return callRouter(ctx, '/exec', { machine: input.machine, argv: input.argv });
    },
  },
  files: {
    async read_file(input, ctx) {
      const bad = unknownField(input, ['machine', 'path']) || checkMachine(input.machine) || checkPath(input.path);
      if (bad) return bad;
      return callRouter(ctx, '/read_file', { machine: input.machine, path: input.path });
    },
    async write_file(input, ctx) {
      const bad = unknownField(input, ['machine', 'path', 'content'])
        || checkMachine(input.machine)
        || checkPath(input.path)
        || checkContent(input.content);
      if (bad) return bad;
      const body = { machine: input.machine, path: input.path, content: input.content };
      if (jsonBytes(body) > REQUEST_MAX_BYTES) return invalid('content');
      return callRouter(ctx, '/write_file', body);
    },
  },
  units: {
    async status(input, ctx) {
      const bad = unknownField(input, ['machine', 'unit']) || checkMachine(input.machine) || checkUnit(input.unit);
      if (bad) return bad;
      return callRouter(ctx, '/service', {
        machine: input.machine,
        argv: ['systemctl', 'status', '--no-pager', '--', input.unit],
      });
    },
    async service(input, ctx) {
      const bad = unknownField(input, ['machine', 'verb', 'unit'])
        || checkMachine(input.machine)
        || checkVerb(input.verb)
        || checkUnit(input.unit);
      if (bad) return bad;
      return callRouter(ctx, '/service', {
        machine: input.machine,
        argv: ['systemctl', input.verb, '--', input.unit],
      });
    },
  },
};

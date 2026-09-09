import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('./manifest.json', import.meta.url), 'utf8'));

function matches(value, schema) {
  if (schema.type === 'array') return Array.isArray(value) && Array.from(value).every((item) => matches(item, schema.items));
  if (schema.type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (schema.type === 'integer') return Number.isInteger(value);
  if (typeof value !== schema.type) return false;
  if (schema.minLength && value.length < schema.minLength) return false;
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
  return !schema.enum || schema.enum.includes(value);
}

function validated(run) {
  return async (input, ctx) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 'invalid_arguments', field: 'input' };
    const schema = manifest.modules[ctx.module].actions[ctx.action].input;
    for (const field of schema.required ?? []) {
      if (!Object.hasOwn(input, field) || !matches(input[field], schema.properties[field])) return { status: 'invalid_arguments', field };
    }
    for (const [field, value] of Object.entries(input)) {
      if (!Object.hasOwn(schema.properties, field) || !matches(value, schema.properties[field])) return { status: 'invalid_arguments', field };
    }
    return run(input, ctx);
  };
}

async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
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
  crm: {
    get: validated((input, ctx) => catalogWith({"id":"ids"})({ ...input, module_api_name: 'Leads' }, ctx)),
    search: validated(viaCatalog),
    create: validated(catalogWith({"last_name":"Last_Name","first_name":"First_Name","email":"Email","company":"Company","phone":"Phone","description":"Description","lead_source":"Lead_Source","lead_status":"Lead_Status","website":"Website"})),
  },
  mail: {
    list: validated(viaCatalog),
    get: validated(viaCatalog),
  },
  books: {
    list: validated(viaCatalog),
    get: validated(viaCatalog),
  },
  desk: {
    list: validated(viaCatalog),
    get: validated(viaCatalog),
  },
  inventory: {
    list: validated(viaCatalog),
    get: validated(viaCatalog),
  },
  invoice: {
    list: validated(viaCatalog),
    get: validated(viaCatalog),
  },
  bigin: {
    list: validated((input, ctx) => viaCatalog({ ...input, module_api_name: 'Contacts' }, ctx)),
    get: validated((input, ctx) => viaCatalog({ ...input, module_api_name: 'Contacts' }, ctx)),
  },
};

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
    get: (input, ctx) => catalogWith({"id":"ids"})({ ...input, module_api_name: 'Leads' }, ctx),
    search: viaCatalog,
    create: catalogWith({"last_name":"Last_Name","first_name":"First_Name","email":"Email","company":"Company","phone":"Phone","description":"Description","lead_source":"Lead_Source","lead_status":"Lead_Status","website":"Website"}),
  },
  mail: {
    list: viaCatalog,
    get: viaCatalog,
  },
  books: {
    list: viaCatalog,
    get: viaCatalog,
  },
  desk: {
    list: viaCatalog,
    get: viaCatalog,
  },
  inventory: {
    list: viaCatalog,
    get: viaCatalog,
  },
  invoice: {
    list: viaCatalog,
    get: viaCatalog,
  },
  bigin: {
    list: (input, ctx) => viaCatalog({ ...input, module_api_name: 'Contacts' }, ctx),
    get: (input, ctx) => viaCatalog({ ...input, module_api_name: 'Contacts' }, ctx),
  },
};

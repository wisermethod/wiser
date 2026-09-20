async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

export const modules = {
  outlook: {
    list_messages: viaCatalog,
    get_message: viaCatalog,
  },
  calendar: {
    list_events: viaCatalog,
    get_event: viaCatalog,
  },
  onedrive: {
    find: viaCatalog,
    get: viaCatalog,
  },
  sharepoint: {
    list: viaCatalog,
    get: viaCatalog,
  },
  excel: {
    search: viaCatalog,
    get_values: viaCatalog,
  },
  teams: {
    list: (input, ctx) => viaCatalog({ ...input, user_id: 'me' }, ctx),
    get: viaCatalog,
  },
};

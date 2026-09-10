async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

export const modules = {
  repos: {
    get: viaCatalog,
    list_for_user: viaCatalog,
  },
  issues: {
    list: viaCatalog,
    create: viaCatalog,
  },
  users: {
    me: viaCatalog,
  },
};

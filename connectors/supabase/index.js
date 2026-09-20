async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

export const modules = {
  projects: {
    list: viaCatalog,
    get: viaCatalog,
  },
};

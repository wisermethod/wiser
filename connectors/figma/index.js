async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

export const modules = {
  files: {
    get: viaCatalog,
    list: viaCatalog,
  },
};

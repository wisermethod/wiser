async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

export const modules = {
  boards: {
    list: viaCatalog,
    list_items: viaCatalog,
  },
};

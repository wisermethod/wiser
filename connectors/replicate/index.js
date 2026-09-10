async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

export const modules = {
  'models': {
    list_collections: viaCatalog,
    create_prediction: viaCatalog,
    get_prediction: viaCatalog,
  },
};

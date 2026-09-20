async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

export const modules = {
  hub: {
    get_model: viaCatalog,
    list_datasets: viaCatalog,
  },
};

async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

export const modules = {
  billing: {
    list_customers: viaCatalog,
    get_customer: viaCatalog,
    list_charges: viaCatalog,
    get_charge: viaCatalog,
  },
};

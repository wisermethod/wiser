async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

export const modules = {
  profile: {
    me: viaCatalog,
    get_post: viaCatalog,
  },
};

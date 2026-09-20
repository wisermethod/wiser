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
    get_contact: catalogWith({"contact_id":"contactId"}),
    search_contacts: catalogWith({"filter_groups":"filterGroups"}),
  },
};

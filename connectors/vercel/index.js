async function viaCatalog(input, ctx) {
  const args = { ...input };
  const names = { team_id: 'teamId', id_or_name: 'idOrName', project_id: 'projectId', git_source: 'gitSource' };
  for (const [from, to] of Object.entries(names)) {
    if (Object.hasOwn(args, from)) {
      args[to] = args[from];
      delete args[from];
    }
  }
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, args);
}

export const modules = {
  'projects': {
    list: viaCatalog,
    get: viaCatalog,
  },
  'deployments': {
    list: viaCatalog,
    create: viaCatalog,
  },
};

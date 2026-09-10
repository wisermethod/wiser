/**
 * A connector module may:
 *   import Node built-ins and files inside this directory
 *   call ctx.catalog, ctx.proxy, ctx.http, ctx.audit
 *   return a result object
 *
 * A connector module may not:
 *   import anything outside this directory (no provider client, no gateway src)
 *   read a credential file, or put a credential on ctx or in a result
 *   name a provider slug (the catalog adapter maps our action id)
 *   write a file, install a package, or start a connect flow
 *
 * Placeholders are substituted before this directory lands.
 */

const MODULE = '{{MODULE}}';

async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

export const modules = {
  [MODULE]: {
    get: viaCatalog,
    async update(input, ctx) {
      return ctx.proxy({
        endpoint: `/items/${input.id}`,
        method: 'PATCH',
        body: input,
      });
    },
  },
};

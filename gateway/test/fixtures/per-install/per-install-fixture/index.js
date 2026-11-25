async function ping(_input, ctx) {
  return (await ctx.proxy({ endpoint: '/fixture/ping' })).data;
}

export const modules = { records: { ping }, activities: { ping }, people: { ping } };

async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

export const modules = {
  dns: {
    list_records: viaCatalog,
    get_record: viaCatalog,
    create_record: viaCatalog,
    update_record: viaCatalog,
    delete_record: viaCatalog,
    async export_zone(input, ctx) {
      const res = await ctx.proxy({
        endpoint: `/zones/${input.zone_id}/dns_records/export`,
        method: 'GET',
      });
      return { zone_file: res.data };
    },
    async import_zone(input, ctx) {
      // Content type for BIND import is Milestone 3 evidence; v1 sends the zone text as body.file.
      return ctx.proxy({
        endpoint: `/zones/${input.zone_id}/dns_records/import`,
        method: 'POST',
        body: { file: input.zone_file, proxied: input.proxied },
      });
    },
    async batch(input, ctx) {
      return ctx.proxy({
        endpoint: `/zones/${input.zone_id}/dns_records/batch`,
        method: 'POST',
        body: {
          deletes: input.deletes,
          patches: input.patches,
          puts: input.puts,
          posts: input.posts,
        },
      });
    },
  },
};

import { randomUUID } from 'node:crypto';

function remap(input, pairs) {
  const out = { ...(input || {}) };
  for (const [from, to] of Object.entries(pairs)) {
    if (from in out && to !== from) {
      out[to] = out[from];
      delete out[from];
    }
  }
  return out;
}

async function viaCatalog(input, ctx) {
  return ctx.catalog(`${ctx.service}.${ctx.module}.${ctx.action}`, input);
}

function withQuery(path, input, names) {
  const url = new URL(path, 'https://api.cloudflare.com');
  for (const name of names) {
    if (!input || input[name] == null || input[name] === '') continue;
    url.searchParams.set(name, String(input[name]));
  }
  return url.pathname + url.search;
}

async function proxyData(ctx, req) {
  const res = await ctx.proxy(req);
  if (res && typeof res === 'object' && Object.prototype.hasOwnProperty.call(res, 'data')) {
    return res.data;
  }
  return res;
}

export const modules = {
  dns: {
    async list_records(input, ctx) {
      return proxyData(ctx, {
        endpoint: withQuery(`/zones/${input.zone_id}/dns_records`, input, ['type', 'name', 'page', 'per_page']),
        method: 'GET',
      });
    },
    // confirmed proxy execute 2026-09-08; object result in the vendor envelope.
    async get_record(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/zones/${input.zone_id}/dns_records/${input.record_id}`,
        method: 'GET',
      });
    },
    async create_record(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/zones/${input.zone_id}/dns_records`,
        method: 'POST',
        body: {
          type: input.type,
          name: input.name,
          content: input.content,
          ...(input.ttl != null ? { ttl: input.ttl } : {}),
          ...(input.proxied != null ? { proxied: input.proxied } : {}),
          ...(input.priority != null ? { priority: input.priority } : {}),
        },
      });
    },
    async update_record(input, ctx) {
      return ctx.catalog('cloudflare.dns.update_record', remap(input, { record_id: 'dns_record_id' }));
    },
    async delete_record(input, ctx) {
      return ctx.catalog('cloudflare.dns.delete_record', remap(input, { record_id: 'dns_record_id' }));
    },
    async export_zone(input, ctx) {
      const res = await ctx.proxy({
        endpoint: `/zones/${input.zone_id}/dns_records/export`,
        method: 'GET',
      });
      return { zone_file: res.data };
    },
    async import_zone(input, ctx) {
      // JSON returned 400 on 2026-09-08. Assemble multipart here; the
      // gateway's provider forwards raw binary_body without assembling a form.
      let boundary;
      do { boundary = `wiser-${randomUUID()}`; } while (input.zone_file.includes(boundary));
      const parts = [
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="zone.txt"\r\nContent-Type: text/plain\r\n\r\n${input.zone_file}\r\n`,
      ];
      if (input.proxied !== undefined) {
        parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="proxied"\r\n\r\n${input.proxied}\r\n`);
      }
      parts.push(`--${boundary}--\r\n`);
      return proxyData(ctx, {
        endpoint: `/zones/${input.zone_id}/dns_records/import`,
        method: 'POST',
        binary_body: {
          base64: Buffer.from(parts.join(''), 'utf8').toString('base64'),
          content_type: `multipart/form-data; boundary=${boundary}`,
        },
      });
    },
    async batch(input, ctx) {
      return proxyData(ctx, {
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

  zones: {
    async list(input, ctx) {
      const onePage = input && input.page != null;
      const pageSize = (input && input.per_page) || 50;
      let page = (input && input.page) || 1;
      const all = [];
      let last = null;
      while (true) {
        const q = {
          name: input && input.name,
          status: input && input.status,
          page,
          per_page: pageSize,
        };
        const endpoint = withQuery('/zones', q, ['name', 'status', 'page', 'per_page']);
        const extra = (input && input.account_id)
          ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}account.id=${encodeURIComponent(input.account_id)}`
          : endpoint;
        last = await proxyData(ctx, { endpoint: extra, method: 'GET' });
        const rows = last && Array.isArray(last.result) ? last.result : [];
        all.push(...rows);
        if (onePage) return last;
        const totalPages = (last && last.result_info && last.result_info.total_pages) || 1;
        if (page >= totalPages) break;
        page += 1;
      }
      return {
        success: true,
        errors: [],
        result: all,
        result_info: {
          count: all.length,
          total_count: (last && last.result_info && last.result_info.total_count) || all.length,
          page: 1,
          per_page: pageSize,
          total_pages: 1,
        },
      };
    },
    async get(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/zones/${input.zone_id}`,
        method: 'GET',
      });
    },
    async list_accounts(input, ctx) {
      return proxyData(ctx, {
        endpoint: withQuery('/accounts', input || {}, ['page', 'per_page', 'name']),
        method: 'GET',
      });
    },
    async create(input, ctx) {
      return proxyData(ctx, {
        endpoint: '/zones',
        method: 'POST',
        body: {
          name: input.name,
          type: input.type,
          account: input.account_id ? { id: input.account_id } : undefined,
        },
      });
    },
    async delete(input, ctx) {
      return ctx.catalog('cloudflare.zones.delete', input);
    },
  },

  pages: {
    // confirmed proxy execute 2026-09-08; { success, result, errors, messages, result_info }.
    // Live result was an empty array on every account the zones grant listed.
    async list_projects(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/accounts/${input.account_id}/pages/projects`,
        method: 'GET',
      });
    },
    async get_project(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/accounts/${input.account_id}/pages/projects/${input.project_name}`,
        method: 'GET',
      });
    },
    async list_deployments(input, ctx) {
      return proxyData(ctx, {
        endpoint: `/accounts/${input.account_id}/pages/projects/${input.project_name}/deployments`,
        method: 'GET',
      });
    },
  },

  rulesets: {
    // grant ACTIVE 2026-09-08; create not run. get with an invented id was
    // catalog HTTP 400; live envelope UNVERIFIED.
    create: viaCatalog,
    get: viaCatalog,
    delete: viaCatalog,
    add_rule: viaCatalog,
    remove_rule: viaCatalog,
  },
};

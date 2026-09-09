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
  'search-console': {
    query: viaCatalog,
    sites: viaCatalog,
    sitemaps: viaCatalog,
  },
  'analytics': {
    run_report: catalogWith({ date_ranges: 'dateRanges' }),
    list_account_summaries: catalogWith({ page_size: 'pageSize', page_token: 'pageToken' }),
    get_property: viaCatalog,
  },
  'drive': {
    find_file: catalogWith({ page_size: 'pageSize', page_token: 'pageToken' }),
    get_file: catalogWith({ file_id: 'fileId' }),
  },
  'calendar': {
    list_events: catalogWith({ calendar_id: 'calendarId', time_min: 'timeMin', time_max: 'timeMax', max_results: 'maxResults', page_token: 'pageToken' }),
    get_event: catalogWith({ calendar_id: 'calendarId', event_id: 'eventId' }),
  },
  'gmail': {
    list_messages: viaCatalog,
    get_message: viaCatalog,
  },
  'sheets': {
    search: viaCatalog,
    get_values: catalogWith({
      major_dimension: 'majorDimension',
      value_render_option: 'valueRenderOption',
      date_time_render_option: 'dateTimeRenderOption',
    }),
  },
};

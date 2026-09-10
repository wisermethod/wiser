export const modules = {
  analytics: {
    async export(input, ctx) {
      if (![1, 2, 3].includes(input.numOfDays)) {
        return { status: 'invalid_arguments', field: 'numOfDays' };
      }
      return ctx.catalog('clarity.analytics.export', input);
    },
  },
};

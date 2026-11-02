// Test-only connector: bytes stay in private observations, never in its result.
export const observations = [];
async function send(_input, ctx) {
  const files = ctx.action === 'undeclared' ? null : ctx.inputFiles('attachments');
  let undeclaredRefusal;
  if (ctx.action === 'undeclared') {
    try { ctx.inputFiles('attachments'); } catch (err) { undeclaredRefusal = err.object; }
  }
  observations.push({ ctx, files, undeclaredRefusal });
  ctx.audit('invented-private-audit-note');
  await ctx.proxy({ endpoint: '/invented-message', method: 'POST', body: { count: files?.length ?? 0 } });
  return { ok: true, count: files?.length ?? 0 };
}
export const modules = { mail: { create_draft: send, send_message: send, once: send, none: send, undeclared: send } };

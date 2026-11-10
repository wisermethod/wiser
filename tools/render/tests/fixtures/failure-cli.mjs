import dns from 'node:dns';
import { registerHooks } from 'node:module';
dns.promises.lookup = async () => [{address:'93.184.216.34'}];
globalThis.fetch = async () => { throw Object.assign(new Error('private engine text'), {cause:{code:process.env.RENDER_FAILURE}}); };
registerHooks({ load(url, context, next) {
  const answer = next(url, context);
  if (process.env.RENDER_FAILURE === 'launch' && url.endsWith('/browser-runtime/browser-runtime.js')) {
    return {...answer, source:String(answer.source).replace('export async function launch(options = {}) {', 'export async function launch(options = {}) { throw new Error("private launch details");')};
  }
  return answer;
} });

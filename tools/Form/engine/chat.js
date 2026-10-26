// In-chat transport only. The renderer owns every visible word.
import { App } from '@modelcontextprotocol/ext-apps';
import { checkForm } from '../scripts/format.js';
import './engine.js';

const view = globalThis.WiserForm;
const app = new App({ name: 'wiser-form', version: '0.1.0' }, { availableDisplayModes: ['inline'] });
let received = false;
let host = 'unknown';
const sends = () => Boolean(window.openai) || /chatgpt|openai/i.test(host);
function syncHost() {
  host = app.getHostVersion()?.name || host;
  view.setHost({host,sends:sends()});
  view.setTheme(app.getHostContext()?.theme);
}
async function deliver({payload,summary}) {
  let context = 'failed';
  try {
    const result = await app.updateModelContext({ content: [{ type: 'text', text: `Form answers, structured:\n${JSON.stringify(payload)}` }], structuredContent: payload });
    if (!result?.isError) context = 'sent';
  } catch { /* Message delivery still runs when context is unavailable. */ }
  let sent = false, channel = 'failed';
  try {
    const result = await app.sendMessage({ role: 'user', content: [{ type: 'text', text: summary }] });
    sent = !result?.isError;
    if (sent) channel = 'message';
  } catch { /* Try the host's direct bridge only after message delivery fails. */ }
  if (!sent && typeof window.openai?.sendFollowUpMessage === 'function') {
    try {
      const result = await window.openai.sendFollowUpMessage({prompt:summary});
      sent = !result?.isError;
      if (sent) channel = 'openai';
    } catch { /* The renderer keeps a copy and offers retry. */ }
  }
  return {sent, delivery:`context:${context};message:${channel}`};
}
function accept(form,source) {
  if (received || form === undefined) return;
  received = true;
  syncHost();
  view.metadata({host,source});
  if (!checkForm(form).ok) { view.showEmpty(true); return; }
  view.render(form,{onSubmit:deliver,host,source,sends:sends()});
}
app.ontoolinput = params => accept(params?.arguments?.form,'tool-call');
app.ontoolresult = params => accept(params?.structuredContent?.form,'tool-result');
app.onhostcontextchanged = syncHost;
void app.connect().then(syncHost,() => {});
function directOutput() { accept(window.openai?.toolOutput?.form,'openai'); }
// The first available source wins; ChatGPT may supply its output at load or later.
directOutput();
window.addEventListener('openai:set_globals',directOutput);
const poll = setInterval(() => { directOutput(); if (received) clearInterval(poll); },100);
setTimeout(() => { clearInterval(poll); if (!received) view.showEmpty(); },3000);

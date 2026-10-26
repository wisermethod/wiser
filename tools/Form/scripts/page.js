import { readFileSync } from 'node:fs';
const style = readFileSync(new URL('../engine/style.css',import.meta.url),'utf8');
const escape = text => String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function composePage({script,form,title} = {}) {
  if (typeof script !== 'string') throw new TypeError('script must be a string.');
  if (/@import|url\s*\(/i.test(style)) throw new Error('Refused style: @import or url(.');
  const data = form === undefined ? '' : `<script type="application/json" id="wiser-form">${JSON.stringify(form).replace(/</g,'\\u003c')}</script>`;
  const code = script.replace(/<\/(script)/gi,'<\\/$1');
  // The checks read the page's own markup, style and script. The title and the form are a member's words, escaped, and never code.
  const shell = `<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>\u0000TITLE\u0000</title><style>${style}</style></head><body><main id="root"></main>\u0000DATA\u0000<script>${code}</script></body></html>`;
  for (const [name,pattern] of [
    ['innerHTML',/innerHTML/i],['outerHTML',/outerHTML/i],['insertAdjacentHTML',/insertAdjacentHTML/i],['document.write',/document\s*\.\s*write/i],
    ['script src',/<script\b[^>]*\bsrc\s*=/i],['link',/<link\b/i],['src= or href=',/\b(?:src|href)\s*=/i]
  ]) if (pattern.test(shell)) throw new Error(`Refused page: ${name}.`);
  return shell.replace('\u0000TITLE\u0000',() => escape(title ?? form?.title ?? 'Wiser form')).replace('\u0000DATA\u0000',() => data);
}

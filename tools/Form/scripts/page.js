import { readFileSync } from 'node:fs';
import {FONT_HOSTS} from './format.js';
const boardsLibrary = readFileSync(new URL('../engine/boards-lib.js',import.meta.url),'utf8').replace(/\bexport /g,'');
const boardContract = readFileSync(new URL('./boards.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/\bexport /g,'');
const boardView = readFileSync(new URL('../engine/boards.js',import.meta.url),'utf8');
const boards = `(() => {${boardsLibrary}\n${boardContract}\nglobalThis.WiserBoards={BOARD_CSS,BOARD_PARTS,PUBLIC_FONT_FILES,BOARD_LIMITS,resolveBoards,actionAllowed,minimumPicks,displayOnly,FONT_HOSTS:${JSON.stringify(FONT_HOSTS)}};})();\n${boardView}\n`;
const style = readFileSync(new URL('../engine/style.css',import.meta.url),'utf8');
const escape = text => String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function composePage({script,form,title,closes} = {}) {
  if (typeof script !== 'string') throw new TypeError('script must be a string.');
  if (closes !== undefined && !Number.isFinite(closes)) throw new TypeError('closes must be a finite number.');
  if (/@import|url\s*\(/i.test(style)) throw new Error('Refused style: @import or url(.');
  const data = form === undefined ? '' : `<script type="application/json" id="wiser-form">${JSON.stringify(form).replace(/</g,'\\u003c')}</script>`;
  const code = (boards+script).replace(/<\/(script)/gi,'<\\/$1');
  // The checks read the page's own markup, style and script. The title and the form are a member's words, escaped, and never code.
  const head = '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>';
  const middle = `</title><style>${style}</style></head><body><main id="root"></main>`;
  const tail = `<script>${code}</script></body></html>`;
  const shell = head + middle + tail;
  for (const [name,pattern] of [
    ['innerHTML',/innerHTML/i],['outerHTML',/outerHTML/i],['insertAdjacentHTML',/insertAdjacentHTML/i],['document.write',/document\s*\.\s*write/i],
    ['script src',/<script\b[^>]*\bsrc\s*=/i],['link',/<link\b/i],['src= or href=',/\b(?:src|href)\s*=/i]
  ]) if (pattern.test(shell)) throw new Error(`Refused page: ${name}.`);
  const deadline = closes === undefined ? '' : `<script type="application/json" id="wiser-form-closes">${JSON.stringify(closes)}</script>`;
  return head + escape(title ?? form?.title ?? 'Wiser form') + middle + data + deadline + tail;
}

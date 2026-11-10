/** Refuse report lists from their minimum JSON size before allocating them. */
export const ANSWER_CHARACTERS = 48000;
export function checkAnswerSize(characters) {
  if (characters >= ANSWER_CHARACTERS) {
    throw new Error('Error: answer reaches 48,000 serialized characters; refused whole.');
  }
}
export function checkAnswerListSize(count, minimumItemCharacters) {
  // Brackets plus one comma between items. Each item's real JSON can only be
  // larger, so this never refuses a list that could fit in the final answer.
  checkAnswerSize(count === 0 ? 2 : count * (minimumItemCharacters + 1) + 1);
}

/** Count JSON characters without first constructing a potentially huge string.
 * Answers contain JSON values only. Work stops at the whole-answer cap.
 */
export function checkAnswerValueSize(value) {
  let characters = 0;
  const add = count => { characters += count; checkAnswerSize(characters); };
  function string(text) {
    add(text.length + 2);
    for (let at = 0; at < text.length; at++) {
      const code = text.charCodeAt(at);
      if (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code)) add(1);
      else if (code < 32) add(5);
      else if (code >= 0xd800 && code <= 0xdbff && text.charCodeAt(at + 1) >= 0xdc00 && text.charCodeAt(at + 1) <= 0xdfff) at++;
      else if (code >= 0xd800 && code <= 0xdfff) add(5);
    }
  }
  function visit(item) {
    if (item === null) add(4);
    else if (typeof item === 'string') string(item);
    else if (typeof item !== 'object') add(JSON.stringify(item).length);
    else if (Array.isArray(item)) {
      add(2 + Math.max(0, item.length - 1));
      for (const child of item) visit(child === undefined ? null : child);
    } else {
      add(2);
      let first = true;
      for (const key in item) {
        if (!Object.hasOwn(item, key) || item[key] === undefined) continue;
        add(first ? 1 : 2); first = false;
        string(key); visit(item[key]);
      }
    }
  }
  visit(value);
}

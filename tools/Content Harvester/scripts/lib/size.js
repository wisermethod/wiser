// Charge without allocating an encoded copy or an escaped JSON string. Poll at
// most every 2,048 UTF-16 code units, including inside one long string.
export function stringBytes(value, add, check = () => {}, quoted = false) {
  if (quoted) add(2);
  let bytes = 0, nextCheck = 0;
  for (let i = 0; i < value.length; i++) {
    if (i >= nextCheck) { add(bytes); bytes = 0; check(); nextCheck = i + 2048; }
    const code = value.charCodeAt(i);
    if (quoted && (code === 34 || code === 92 || [8,9,10,12,13].includes(code))) bytes += 2;
    else if (quoted && code < 32) bytes += 6;
    else if (code < 128) bytes++;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else if (quoted && code >= 0xd800 && code <= 0xdfff) bytes += 6;
    else bytes += 3;
  }
  add(bytes);
  check();
}

// Exact UTF-8 projection of JSON.stringify(value, null, 2) for the pipeline's
// JSON records. Include indentation, escaped keys, omitted object properties,
// array nulls and lone-surrogate escaping. No composite value is stringified.
export function jsonBytes(value, add, check = () => {}, depth = 0) {
  check();
  if (value === null) { add(4); return; }
  if (typeof value === 'string') { stringBytes(value, add, check, true); return; }
  if (typeof value !== 'object') { add(JSON.stringify(value)?.length ?? 4); return; }
  const array = Array.isArray(value);
  const keys = array ? null : Object.keys(value).filter(key => !['undefined','function','symbol'].includes(typeof value[key]));
  const length = array ? value.length : keys.length;
  add(2); // Brackets or braces.
  for (let i = 0; i < length; i++) {
    check();
    add((i ? 2 : 1) + (depth + 1) * 2); // Comma, newline, indentation.
    if (!array) { stringBytes(keys[i], add, check, true); add(2); } // Colon and space.
    jsonBytes(value[array ? i : keys[i]], add, check, depth + 1);
  }
  if (length) add(1 + depth * 2); // Closing newline and indentation.
}

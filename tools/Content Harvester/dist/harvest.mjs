import { createRequire as wiserCreateRequire } from "node:module";
const require = wiserCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// tools/lib/destination-core.js
function destinationReasonText(reason) {
  return REASONS[reason] || "an address this tool does not fetch";
}
async function destinationReason(hostname, lookup) {
  const host = String(hostname || "").toLowerCase();
  if (host === "") return "unroutable";
  const literal = classifyLiteral(host);
  if (literal !== void 0) return literal;
  const named = BLOCKED_HOSTNAMES.get(host);
  if (named) return named;
  if (host.endsWith(".localhost")) return "loopback";
  let addresses;
  try {
    addresses = await lookup(host);
  } catch {
    return "unresolvable";
  }
  if (!Array.isArray(addresses) || addresses.length === 0) return "unresolvable";
  let unresolvable = false;
  for (const entry of addresses) {
    const reason = classifyLiteral(String(entry?.address ?? entry).toLowerCase());
    if (reason === void 0) unresolvable = true;
    else if (reason) return reason;
  }
  return unresolvable ? "unresolvable" : null;
}
function classifyLiteral(hostname) {
  const ipv6 = parseIpv6(hostname);
  if (ipv6) return classifyIpv6(ipv6);
  const ipv4 = parseIpv4(hostname);
  if (ipv4) return classifyIpv4(ipv4);
  return void 0;
}
function classifyIpv4(octets) {
  if (METADATA_IPV4.has(octets.join("."))) return "cloud_metadata";
  const [a, b] = octets;
  if (a === 0) return "unspecified";
  if (a === 127) return "loopback";
  if (a === 10) return "private_range";
  if (a === 172 && b >= 16 && b <= 31) return "private_range";
  if (a === 192 && b === 168) return "private_range";
  if (a === 100 && b >= 64 && b <= 127) return "private_range";
  if (a === 169 && b === 254) return "link_local";
  if (a === 192 && b === 0 && octets[2] === 0) return "unroutable";
  if (a === 198 && (b === 18 || b === 19)) return "unroutable";
  if (a >= 224) return "unroutable";
  return null;
}
function classifyIpv6(groups) {
  if (groups.every((group, index) => group === METADATA_IPV6[index])) return "cloud_metadata";
  if (isZeroPrefix(groups, 5) && groups[5] === 65535) return classifyIpv4(embeddedIpv4(groups, 6));
  if (isZeroPrefix(groups, 6)) {
    if (groups[6] === 0 && groups[7] === 0) return "unspecified";
    if (groups[6] === 0 && groups[7] === 1) return "loopback";
    return classifyIpv4(embeddedIpv4(groups, 6)) || "unroutable";
  }
  if (groups[0] === 100 && groups[1] === 65435 && isZeroRange(groups, 2, 6)) {
    return classifyIpv4(embeddedIpv4(groups, 6));
  }
  if (groups[0] === 100 && groups[1] === 65435 && groups[2] === 1) return "unroutable";
  if (groups[0] === 8194) return classifyIpv4(embeddedIpv4(groups, 1));
  if ((groups[0] & 65024) === 64512) return "unique_local";
  if ((groups[0] & 65472) === 65152) return "link_local";
  if ((groups[0] & 65472) === 65216) return "unique_local";
  if ((groups[0] & 65280) === 65280) return "unroutable";
  return null;
}
function isZeroPrefix(groups, count) {
  return isZeroRange(groups, 0, count);
}
function isZeroRange(groups, start, end) {
  for (let index = start; index < end; index++) {
    if (groups[index] !== 0) return false;
  }
  return true;
}
function embeddedIpv4(groups, offset) {
  return [groups[offset] >> 8, groups[offset] & 255, groups[offset + 1] >> 8, groups[offset + 1] & 255];
}
function parseIpv4(value) {
  const parts = value.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const numbers = [];
  for (const part of parts) {
    const number = parseNumericPart(part);
    if (number === null) return null;
    numbers.push(number);
  }
  const last = numbers.pop();
  const remaining = 4 - numbers.length;
  if (last >= 256 ** remaining) return null;
  if (numbers.some((number) => number > 255)) return null;
  const octets = [...numbers];
  for (let index = remaining - 1; index >= 0; index--) {
    octets.push(Math.floor(last / 256 ** index) % 256);
  }
  return octets;
}
function parseNumericPart(part) {
  let value;
  if (/^0[xX][0-9a-fA-F]+$/.test(part)) value = Number.parseInt(part.slice(2), 16);
  else if (/^0[0-7]+$/.test(part)) value = Number.parseInt(part.slice(1), 8);
  else if (/^[0-9]+$/.test(part)) value = Number(part);
  else return null;
  return Number.isSafeInteger(value) ? value : null;
}
function parseIpv6(value) {
  const inner = value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
  if (!inner.includes(":")) return null;
  const halves = inner.split("%")[0].split("::");
  if (halves.length > 2) return null;
  const head = readIpv6Side(halves[0]);
  const tail = halves.length === 2 ? readIpv6Side(halves[1]) : [];
  if (head === null || tail === null) return null;
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    return [...head, ...new Array(fill).fill(0), ...tail];
  }
  return head.length === 8 ? head : null;
}
function readIpv6Side(side) {
  if (side === "") return [];
  const pieces = side.split(":");
  const groups = [];
  for (let index = 0; index < pieces.length; index++) {
    const piece = pieces[index];
    if (piece.includes(".")) {
      if (index !== pieces.length - 1) return null;
      const octets = parseIpv4(piece);
      if (!octets) return null;
      groups.push(octets[0] << 8 | octets[1], octets[2] << 8 | octets[3]);
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
    groups.push(Number.parseInt(piece, 16));
  }
  return groups;
}
var REASONS, METADATA_IPV4, METADATA_IPV6, BLOCKED_HOSTNAMES;
var init_destination_core = __esm({
  "tools/lib/destination-core.js"() {
    REASONS = {
      loopback: "a loopback address",
      private_range: "a private-range address",
      link_local: "a link-local address",
      unique_local: "a unique-local address",
      cloud_metadata: "a cloud instance metadata address",
      unspecified: "an unspecified address",
      unroutable: "an address that is not routable on the public internet",
      unresolvable: "a hostname that does not resolve"
    };
    METADATA_IPV4 = /* @__PURE__ */ new Set([
      "169.254.169.254",
      "169.254.170.2",
      "100.100.100.200",
      "192.0.0.192"
    ]);
    METADATA_IPV6 = [64768, 3778, 0, 0, 0, 0, 0, 596];
    BLOCKED_HOSTNAMES = /* @__PURE__ */ new Map([
      ["localhost", "loopback"],
      ["metadata", "cloud_metadata"],
      ["metadata.google.internal", "cloud_metadata"],
      ["metadata.goog", "cloud_metadata"],
      ["instance-data", "cloud_metadata"],
      ["instance-data.ec2.internal", "cloud_metadata"]
    ]);
  }
});

// tools/Content Harvester/scripts/lib/normalize.js
var normalize_exports = {};
__export(normalize_exports, {
  canonicalizeUrl: () => canonicalizeUrl,
  cleanText: () => cleanText,
  decodeEntities: () => decodeEntities,
  isCredentialParam: () => isCredentialParam,
  normalizeCandidate: () => normalizeCandidate,
  normalizeTitle: () => normalizeTitle,
  publicUrl: () => publicUrl,
  recordUrl: () => recordUrl,
  sanitizeUrlsInText: () => sanitizeUrlsInText
});
async function normalizeCandidate(input, context) {
  context.check?.();
  const url = recordUrl(input.url || "");
  const canonicalUrl = canonicalizeUrl(url);
  const title = cleanText(input.title || canonicalUrl || "Untitled");
  const summary = cleanText(input.summary || "");
  const content = cleanText(input.content || "");
  const publishedAt = normalizeDate(input.published_at);
  const topics = uniqueValues([
    ...context.requestTopics || [],
    ...context.sourceTopics || [],
    ...input.topics || []
  ]);
  return {
    id: await context.hashId(`${canonicalUrl || title}|${publishedAt || ""}`),
    title,
    url,
    canonical_url: canonicalUrl || url,
    source: input.source || context.source?.source || context.source?.name || "Unnamed source",
    adapter_type: input.adapter_type || context.source?.type || "unknown",
    source_role: input.source_role || context.source?.role || "discovery",
    author: cleanText(input.author || ""),
    published_at: publishedAt,
    discovered_at: context.discoveredAt,
    summary,
    content,
    topics,
    matched_topics: matchTopics({ title, summary, content, url: canonicalUrl }, topics, context.check),
    score: 0,
    score_reasons: [],
    discovered_by: {
      type: context.source?.type || "unknown",
      source: context.source?.source || context.source?.name || "Unnamed source",
      url: publicUrl(context.source?.url)
    },
    raw: sanitizeRaw(input.raw ?? {})
  };
}
function isCredentialParam(name) {
  const normalized = String(name).toLowerCase();
  return CREDENTIAL_SUBSTRINGS.some((needle) => normalized.includes(needle)) || CREDENTIAL_WORDS.test(normalized);
}
function recordUrl(value) {
  if (!value || typeof value !== "string") return "";
  let url;
  try {
    url = new URL(value);
  } catch {
    return stripCredentialParamsFromText(value);
  }
  const hadUserinfo = Boolean(url.username || url.password);
  const removed = stripCredentialParams(url);
  const hash = url.hash.includes("=") ? stripCredentialParamsFromText(`#${url.hash.slice(1)}`) : url.hash;
  if (!hadUserinfo && removed === 0 && hash === url.hash) return value;
  url.username = "";
  url.password = "";
  url.hash = hash === "#" ? "" : hash;
  return url.toString();
}
function sanitizeUrlsInText(value) {
  if (!value || typeof value !== "string") return value;
  return value.replace(/\bhttps?:\/\/[^\s"'<>]+/gi, (match) => {
    const trailing = match.match(/[.,;:!?)\]}]+$/);
    const address = trailing ? match.slice(0, -trailing[0].length) : match;
    const recorded = recordUrl(address);
    return recorded === address ? match : `${recorded}${trailing ? trailing[0] : ""}`;
  });
}
function stripCredentialParams(url) {
  let removed = 0;
  for (const name of [...url.searchParams.keys()]) {
    if (!isCredentialParam(name)) continue;
    url.searchParams.delete(name);
    removed++;
  }
  return removed;
}
function stripCredentialParamsFromText(value) {
  const separator = value.includes("?") ? "?" : value.startsWith("#") ? "#" : "";
  if (separator === "") return value;
  const cut = value.indexOf(separator);
  const head = value.slice(0, cut);
  const kept = value.slice(cut + 1).split("&").filter((pair) => pair !== "" && !isCredentialParam(pair.split("=")[0]));
  return kept.length > 0 ? `${head}${separator}${kept.join("&")}` : head;
}
function sanitizeRaw(value, depth = 0) {
  if (depth > 12) return value;
  if (typeof value === "string") return sanitizeUrlsInText(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeRaw(entry, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeRaw(entry, depth + 1)]));
  }
  return value;
}
function publicUrl(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}
function canonicalizeUrl(value) {
  if (!value || typeof value !== "string") return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.username = "";
    url.password = "";
    for (const param of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]) {
      url.searchParams.delete(param);
    }
    stripCredentialParams(url);
    const search = url.searchParams.toString();
    return `${url.origin}${url.pathname.replace(/\/$/, "")}${search ? `?${search}` : ""}`;
  } catch {
    return stripCredentialParamsFromText(value.trim());
  }
}
function normalizeTitle(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function cleanText(value) {
  if (value === null || value === void 0) return "";
  return sanitizeUrlsInText(
    decodeEntities(String(value).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
  );
}
function decodeEntities(value) {
  return String(value).replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}
function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
function matchTopics(fields, topics, check = () => {
}) {
  const haystack = `${fields.title} ${fields.summary} ${fields.content} ${fields.url}`.toLowerCase();
  return topics.filter((topic) => {
    check();
    const normalized = String(topic).toLowerCase().trim();
    if (!normalized) return false;
    return [normalized, normalized.replace(/_/g, " ")].some((term) => {
      check();
      return matchesTerm(haystack, term);
    });
  });
}
function matchesTerm(haystack, term) {
  if (!term) return false;
  if (!/^[a-z0-9]+$/.test(term)) return haystack.includes(term);
  return new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(haystack);
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value))));
}
var CREDENTIAL_SUBSTRINGS, CREDENTIAL_WORDS;
var init_normalize = __esm({
  "tools/Content Harvester/scripts/lib/normalize.js"() {
    CREDENTIAL_SUBSTRINGS = [
      "token",
      "secret",
      "signature",
      "apikey",
      "api_key",
      "password",
      "passwd",
      "credential",
      "sessionid",
      "accesskey",
      "authorization",
      "jwt"
    ];
    CREDENTIAL_WORDS = /(?:^|[^a-z0-9])(?:key|keys|sid|sig|auth|session|access|refresh|pass|pwd|otp|oauth|bearer|sso|ticket|private)(?:[^a-z0-9]|$)/;
  }
});

// tools/Content Harvester/scripts/lib/fetch.js
var fetch_exports = {};
__export(fetch_exports, {
  fetchText: () => fetchText
});
async function fetchText(target, accept, context) {
  let current = await approvedUrl(target, null, context);
  let hops = 0;
  while (true) {
    const safeUrl = publicUrl(current.href);
    const request = requestSignal(context);
    try {
      let response;
      try {
        context.check?.();
        response = await context.fetch(current, {
          headers: { "User-Agent": context.userAgent, Accept: accept },
          signal: request.signal,
          redirect: "manual"
        });
      } catch (error) {
        context.check?.();
        if (error.fatal) throw error;
        throw taggedError(`Request to ${safeUrl} got no response within ${context.timeoutMs}ms, or the connection failed.`, true);
      }
      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        await cancelUnreadBody(response, context);
        context.check?.();
        if (!location) {
          throw taggedError(`Request to ${safeUrl} returned HTTP ${response.status} without a Location header.`, false);
        }
        if (hops >= MAX_REDIRECTS) {
          throw taggedError(`Request to ${safeUrl} redirected more than ${MAX_REDIRECTS} times without reaching a page.`, false);
        }
        current = await approvedUrl(location, current, context);
        hops++;
        continue;
      }
      if (!response.ok) {
        await cancelUnreadBody(response, context);
        context.check?.();
        throw taggedError(`Request to ${safeUrl} returned HTTP ${response.status}.`, RETRYABLE_STATUSES.has(response.status));
      }
      try {
        context.check?.();
        const reader = response.body?.getReader(), decoder2 = new TextDecoder();
        if (!reader) return "";
        let total = 0, text = "";
        try {
          for (; ; ) {
            context.check?.();
            const { done, value } = await reader.read();
            if (done) break;
            total = countBytes(value.byteLength, total, context);
            context.check?.();
            text += decoder2.decode(value, { stream: true });
          }
          context.check?.();
          return text + decoder2.decode();
        } catch (error) {
          await reader.cancel().catch(() => {
          });
          throw error;
        } finally {
          reader.releaseLock();
        }
      } catch (error) {
        context.check?.();
        if (error.fatal) throw error;
        throw taggedError(`Request to ${safeUrl} returned HTTP ${response.status} but the body did not finish arriving.`, true);
      }
    } finally {
      request.close();
    }
  }
}
function requestSignal(context) {
  const controller = new AbortController();
  let timer;
  const abort = () => {
    clearTimeout(timer);
    controller.abort();
  };
  if (context.signal?.aborted) abort();
  else {
    context.signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(abort, context.timeoutMs);
  }
  return {
    signal: controller.signal,
    close() {
      clearTimeout(timer);
      context.signal?.removeEventListener("abort", abort);
      controller.abort();
    }
  };
}
function countBytes(length, total, context) {
  total += length;
  context.receivedBytes = (context.receivedBytes || 0) + length;
  if (total > (context.maxBodyBytes || 1024 * 1024) || context.receivedBytes > 4 * 1024 * 1024) {
    const error = new Error("Error: fetched body exceeds 1 MiB or fetched total exceeds 4 MiB; refused whole.");
    error.fatal = true;
    throw error;
  }
  return total;
}
async function cancelUnreadBody(response, context) {
  let buffered = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      const pending = reader.read();
      const cancellation = reader.cancel();
      const [first] = await Promise.allSettled([pending, cancellation]);
      if (first.status === "fulfilled" && !first.value.done) buffered = first.value.value.byteLength;
    } finally {
      reader.releaseLock();
    }
  }
  const header = response.headers.get("content-length")?.trim() || "";
  const declared = /^\d+$/.test(header) ? Number(header) : 0;
  countBytes(Math.max(buffered, declared), 0, context);
}
async function approvedUrl(value, from, context) {
  const isRedirect = from !== null;
  const origin = isRedirect ? `the redirect from ${publicUrl(from.href)}` : "the source URL";
  context.check?.();
  let parsed;
  try {
    parsed = isRedirect ? new URL(value, from) : new URL(value);
  } catch {
    throw taggedError(
      isRedirect ? `Refused ${origin}: its Location header is not a URL this tool can resolve.` : "A source url is not a URL. Give an absolute http or https address.",
      false
    );
  }
  const safeUrl = publicUrl(parsed.href);
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw taggedError(
      isRedirect ? `Refused ${origin}: it points at ${parsed.protocol}//, and this tool fetches http and https only.` : `Refused ${parsed.protocol}//: this tool fetches http and https only.`,
      false,
      isRedirect ? "blocked_redirect:protocol" : void 0
    );
  }
  if (parsed.username || parsed.password) {
    throw taggedError(
      isRedirect ? `Refused ${origin}: the address it points at carries an embedded username and password. This tool sends no credentials.` : `Refused the source URL for ${safeUrl}: it carries an embedded username and password. This tool sends no credentials.`,
      false,
      isRedirect ? "blocked_redirect:embedded_credentials" : void 0
    );
  }
  const reason = await destinationReason(parsed.hostname, context.lookup);
  if (reason === "unresolvable") {
    throw taggedError(`Request to ${safeUrl} did not run: the host does not resolve.`, true, "unresolvable");
  }
  if (reason) {
    throw taggedError(
      isRedirect ? `Refused ${origin} to ${safeUrl}: the destination is ${destinationReasonText(reason)}, which this tool does not fetch. The redirect was not followed.` : `Refused ${safeUrl}: the destination is ${destinationReasonText(reason)}, which this tool does not fetch.`,
      false,
      `${isRedirect ? "blocked_redirect" : "blocked_destination"}:${reason}`
    );
  }
  return parsed;
}
function taggedError(message, retryable, reason) {
  const error = new Error(message);
  error.retryable = retryable;
  if (reason) error.reason = reason;
  return error;
}
var ALLOWED_PROTOCOLS, RETRYABLE_STATUSES, REDIRECT_STATUSES, MAX_REDIRECTS;
var init_fetch = __esm({
  "tools/Content Harvester/scripts/lib/fetch.js"() {
    init_destination_core();
    init_normalize();
    ALLOWED_PROTOCOLS = /* @__PURE__ */ new Set(["http:", "https:"]);
    RETRYABLE_STATUSES = /* @__PURE__ */ new Set([408, 425, 429, 500, 502, 503, 504]);
    REDIRECT_STATUSES = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
    MAX_REDIRECTS = 5;
  }
});

// tools/Content Harvester/node_modules/fast-xml-parser/src/util.js
function getAllMatches(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    allmatches.startIndex = regex.lastIndex - match[0].length;
    const len = match.length;
    for (let index = 0; index < len; index++) {
      allmatches.push(match[index]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
}
function isExist(v) {
  return typeof v !== "undefined";
}
var nameStartChar, nameChar, nameRegexp, regexName, isName, DANGEROUS_PROPERTY_NAMES, criticalProperties;
var init_util = __esm({
  "tools/Content Harvester/node_modules/fast-xml-parser/src/util.js"() {
    "use strict";
    nameStartChar = ":A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
    nameChar = nameStartChar + "\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040";
    nameRegexp = "[" + nameStartChar + "][" + nameChar + "]*";
    regexName = new RegExp("^" + nameRegexp + "$");
    isName = function(string) {
      const match = regexName.exec(string);
      return !(match === null || typeof match === "undefined");
    };
    DANGEROUS_PROPERTY_NAMES = [
      // '__proto__',
      // 'constructor',
      // 'prototype',
      "hasOwnProperty",
      "toString",
      "valueOf",
      "__defineGetter__",
      "__defineSetter__",
      "__lookupGetter__",
      "__lookupSetter__"
    ];
    criticalProperties = ["__proto__", "constructor", "prototype"];
  }
});

// tools/Content Harvester/node_modules/fast-xml-parser/src/validator.js
function validate(xmlData, options) {
  options = Object.assign({}, defaultOptions, options);
  const tags = [];
  let tagFound = false;
  let reachedRoot = false;
  if (xmlData[0] === "\uFEFF") {
    xmlData = xmlData.substr(1);
  }
  for (let i = 0; i < xmlData.length; i++) {
    if (xmlData[i] === "<" && xmlData[i + 1] === "?") {
      i += 2;
      i = readPI(xmlData, i);
      if (i.err) return i;
    } else if (xmlData[i] === "<") {
      let tagStartPos = i;
      i++;
      if (xmlData[i] === "!") {
        i = readCommentAndCDATA(xmlData, i);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i] === "/") {
          closingTag = true;
          i++;
        }
        let tagName = "";
        for (; i < xmlData.length && xmlData[i] !== ">" && xmlData[i] !== " " && xmlData[i] !== "	" && xmlData[i] !== "\n" && xmlData[i] !== "\r"; i++) {
          tagName += xmlData[i];
        }
        tagName = tagName.trim();
        if (tagName[tagName.length - 1] === "/") {
          tagName = tagName.substring(0, tagName.length - 1);
          i--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "Invalid space after '<'.";
          } else {
            msg = "Tag '" + tagName + "' is an invalid name.";
          }
          return getErrorObject("InvalidTag", msg, getLineNumberForPosition(xmlData, i));
        }
        const result = readAttributeStr(xmlData, i);
        if (result === false) {
          return getErrorObject("InvalidAttr", "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
        }
        let attrStr = result.value;
        i = result.index;
        if (attrStr[attrStr.length - 1] === "/") {
          const attrStrStart = i - attrStr.length;
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid = validateAttributeString(attrStr, options);
          if (isValid === true) {
            tagFound = true;
          } else {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
          }
        } else if (closingTag) {
          if (!result.tagClosed) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
          } else if (tags.length === 0) {
            return getErrorObject("InvalidTag", "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
          } else {
            const otg = tags.pop();
            if (tagName !== otg.tagName) {
              let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
              return getErrorObject(
                "InvalidTag",
                "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                getLineNumberForPosition(xmlData, tagStartPos)
              );
            }
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid = validateAttributeString(attrStr, options);
          if (isValid !== true) {
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
          }
          if (reachedRoot === true) {
            return getErrorObject("InvalidXml", "Multiple possible root nodes found.", getLineNumberForPosition(xmlData, i));
          } else if (options.unpairedTags.indexOf(tagName) !== -1) {
          } else {
            tags.push({ tagName, tagStartPos });
          }
          tagFound = true;
        }
        for (i++; i < xmlData.length; i++) {
          if (xmlData[i] === "<") {
            if (xmlData[i + 1] === "!") {
              i++;
              i = readCommentAndCDATA(xmlData, i);
              continue;
            } else if (xmlData[i + 1] === "?") {
              i = readPI(xmlData, ++i);
              if (i.err) return i;
            } else {
              break;
            }
          } else if (xmlData[i] === "&") {
            const afterAmp = validateAmpersand(xmlData, i);
            if (afterAmp == -1)
              return getErrorObject("InvalidChar", "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
            i = afterAmp;
          } else {
            if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
              return getErrorObject("InvalidXml", "Extra text at the end", getLineNumberForPosition(xmlData, i));
            }
          }
        }
        if (xmlData[i] === "<") {
          i--;
        }
      }
    } else {
      if (isWhiteSpace(xmlData[i])) {
        continue;
      }
      return getErrorObject("InvalidChar", "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
    }
  }
  if (!tagFound) {
    return getErrorObject("InvalidXml", "Start tag expected.", 1);
  } else if (tags.length == 1) {
    return getErrorObject("InvalidTag", "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
  } else if (tags.length > 0) {
    return getErrorObject("InvalidXml", "Invalid '" + JSON.stringify(tags.map((t) => t.tagName), null, 4).replace(/\r?\n/g, "") + "' found.", { line: 1, col: 1 });
  }
  return true;
}
function isWhiteSpace(char) {
  return char === " " || char === "	" || char === "\n" || char === "\r";
}
function readPI(xmlData, i) {
  const start = i;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] == "?" || xmlData[i] == " ") {
      const tagname = xmlData.substr(start, i - start);
      if (i > 5 && tagname === "xml") {
        return getErrorObject("InvalidXml", "XML declaration allowed only at the start of the document.", getLineNumberForPosition(xmlData, i));
      } else if (xmlData[i] == "?" && xmlData[i + 1] == ">") {
        i++;
        break;
      } else {
        continue;
      }
    }
  }
  return i;
}
function readCommentAndCDATA(xmlData, i) {
  if (xmlData.length > i + 5 && xmlData[i + 1] === "-" && xmlData[i + 2] === "-") {
    for (i += 3; i < xmlData.length; i++) {
      if (xmlData[i] === "-" && xmlData[i + 1] === "-" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  } else if (xmlData.length > i + 8 && xmlData[i + 1] === "D" && xmlData[i + 2] === "O" && xmlData[i + 3] === "C" && xmlData[i + 4] === "T" && xmlData[i + 5] === "Y" && xmlData[i + 6] === "P" && xmlData[i + 7] === "E") {
    let angleBracketsCount = 1;
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "<") {
        angleBracketsCount++;
      } else if (xmlData[i] === ">") {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (xmlData.length > i + 9 && xmlData[i + 1] === "[" && xmlData[i + 2] === "C" && xmlData[i + 3] === "D" && xmlData[i + 4] === "A" && xmlData[i + 5] === "T" && xmlData[i + 6] === "A" && xmlData[i + 7] === "[") {
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === "]" && xmlData[i + 1] === "]" && xmlData[i + 2] === ">") {
        i += 2;
        break;
      }
    }
  }
  return i;
}
function readAttributeStr(xmlData, i) {
  let attrStr = "";
  let startChar = "";
  let tagClosed = false;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
      if (startChar === "") {
        startChar = xmlData[i];
      } else if (startChar !== xmlData[i]) {
      } else {
        startChar = "";
      }
    } else if (xmlData[i] === ">") {
      if (startChar === "") {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i];
  }
  if (startChar !== "") {
    return false;
  }
  return {
    value: attrStr,
    index: i,
    tagClosed
  };
}
function validateAttributeString(attrStr, options) {
  const matches = getAllMatches(attrStr, validAttrStrRegxp);
  const attrNames = {};
  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1].length === 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] !== void 0 && matches[i][4] === void 0) {
      return getErrorObject("InvalidAttr", "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] === void 0 && !options.allowBooleanAttributes) {
      return getErrorObject("InvalidAttr", "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
    }
    const attrName = matches[i][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
    }
    if (!Object.prototype.hasOwnProperty.call(attrNames, attrName)) {
      attrNames[attrName] = 1;
    } else {
      return getErrorObject("InvalidAttr", "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
    }
  }
  return true;
}
function validateNumberAmpersand(xmlData, i) {
  let re = /\d/;
  if (xmlData[i] === "x") {
    i++;
    re = /[\da-fA-F]/;
  }
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === ";")
      return i;
    if (!xmlData[i].match(re))
      break;
  }
  return -1;
}
function validateAmpersand(xmlData, i) {
  i++;
  if (xmlData[i] === ";")
    return -1;
  if (xmlData[i] === "#") {
    i++;
    return validateNumberAmpersand(xmlData, i);
  }
  let count = 0;
  for (; i < xmlData.length; i++, count++) {
    if (xmlData[i].match(/\w/) && count < 20)
      continue;
    if (xmlData[i] === ";")
      break;
    return -1;
  }
  return i;
}
function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code,
      msg: message,
      line: lineNumber.line || lineNumber,
      col: lineNumber.col
    }
  };
}
function validateAttrName(attrName) {
  return isName(attrName);
}
function validateTagName(tagname) {
  return isName(tagname);
}
function getLineNumberForPosition(xmlData, index) {
  const lines = xmlData.substring(0, index).split(/\r?\n/);
  return {
    line: lines.length,
    // column number is last line's length + 1, because column numbering starts at 1:
    col: lines[lines.length - 1].length + 1
  };
}
function getPositionFromMatch(match) {
  return match.startIndex + match[1].length;
}
var defaultOptions, doubleQuote, singleQuote, validAttrStrRegxp;
var init_validator = __esm({
  "tools/Content Harvester/node_modules/fast-xml-parser/src/validator.js"() {
    "use strict";
    init_util();
    defaultOptions = {
      allowBooleanAttributes: false,
      //A tag can have attributes without any value
      unpairedTags: []
    };
    doubleQuote = '"';
    singleQuote = "'";
    validAttrStrRegxp = new RegExp(`(\\s*)([^\\s=]+)(\\s*=)?(\\s*(['"])(([\\s\\S])*?)\\5)?`, "g");
  }
});

// tools/Content Harvester/node_modules/@nodable/entities/src/entities.js
var CURRENCY, XML, COMMON_HTML;
var init_entities = __esm({
  "tools/Content Harvester/node_modules/@nodable/entities/src/entities.js"() {
    CURRENCY = {
      cent: "¢",
      pound: "£",
      curren: "¤",
      yen: "¥",
      euro: "€",
      dollar: "$",
      fnof: "ƒ",
      inr: "₹",
      af: "؋",
      birr: "ብር",
      peso: "₱",
      rub: "₽",
      won: "₩",
      yuan: "¥",
      cedil: "¸"
    };
    XML = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"'
    };
    COMMON_HTML = {
      nbsp: " ",
      copy: "©",
      reg: "®",
      trade: "™",
      mdash: "—",
      ndash: "–",
      hellip: "…",
      laquo: "«",
      raquo: "»",
      lsquo: "‘",
      rsquo: "’",
      ldquo: "“",
      rdquo: "”",
      bull: "•",
      para: "¶",
      sect: "§",
      deg: "°",
      frac12: "½",
      frac14: "¼",
      frac34: "¾"
    };
  }
});

// tools/Content Harvester/node_modules/@nodable/entities/src/EntityDecoder.js
function validateEntityName(name) {
  if (name[0] === "#") {
    throw new Error(`[EntityReplacer] Invalid character '#' in entity name: "${name}"`);
  }
  for (const ch of name) {
    if (SPECIAL_CHARS.has(ch)) {
      throw new Error(`[EntityReplacer] Invalid character '${ch}' in entity name: "${name}"`);
    }
  }
  return name;
}
function mergeEntityMaps(...maps) {
  const out = /* @__PURE__ */ Object.create(null);
  for (const map of maps) {
    if (!map) continue;
    for (const key of Object.keys(map)) {
      const raw = map[key];
      if (typeof raw === "string") {
        out[key] = raw;
      } else if (raw && typeof raw === "object" && raw.val !== void 0) {
        const val = raw.val;
        if (typeof val === "string") {
          out[key] = val;
        }
      }
    }
  }
  return out;
}
function parseLimitTiers(raw) {
  if (!raw || raw === LIMIT_TIER_EXTERNAL) return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
  if (raw === LIMIT_TIER_ALL) return /* @__PURE__ */ new Set([LIMIT_TIER_ALL]);
  if (raw === LIMIT_TIER_BASE) return /* @__PURE__ */ new Set([LIMIT_TIER_BASE]);
  if (Array.isArray(raw)) return new Set(raw);
  return /* @__PURE__ */ new Set([LIMIT_TIER_EXTERNAL]);
}
function parseNCRConfig(ncr) {
  if (!ncr) {
    return { xmlVersion: 1, onLevel: NCR_LEVEL.allow, nullLevel: NCR_LEVEL.remove };
  }
  const xmlVersion = ncr.xmlVersion === 1.1 ? 1.1 : 1;
  const onLevel = NCR_LEVEL[ncr.onNCR] ?? NCR_LEVEL.allow;
  const nullLevel = NCR_LEVEL[ncr.nullNCR] ?? NCR_LEVEL.remove;
  const clampedNull = Math.max(nullLevel, NCR_LEVEL.remove);
  return { xmlVersion, onLevel, nullLevel: clampedNull };
}
var ENTITY_ACTION, SPECIAL_CHARS, LIMIT_TIER_EXTERNAL, LIMIT_TIER_BASE, LIMIT_TIER_ALL, NCR_LEVEL, XML10_ALLOWED_C0, EntityDecoder;
var init_EntityDecoder = __esm({
  "tools/Content Harvester/node_modules/@nodable/entities/src/EntityDecoder.js"() {
    init_entities();
    ENTITY_ACTION = Object.freeze({
      /** Resolve and expand the entity normally. */
      ALLOW: "allow",
      /** Silently skip this entity — it will not be registered. */
      BLOCK: "block",
      /** Throw an error, aborting entity registration entirely. */
      THROW: "throw"
    });
    SPECIAL_CHARS = new Set("!?\\\\/[]$%{}^&*()<>|+");
    LIMIT_TIER_EXTERNAL = "external";
    LIMIT_TIER_BASE = "base";
    LIMIT_TIER_ALL = "all";
    NCR_LEVEL = Object.freeze({ allow: 0, leave: 1, remove: 2, throw: 3 });
    XML10_ALLOWED_C0 = /* @__PURE__ */ new Set([9, 10, 13]);
    EntityDecoder = class {
      /**
       * @param {object} [options]
       * @param {object|null}  [options.namedEntities]        — extra named entities merged into base map
       * @param {object}  [options.limit]                 — security limits
       * @param {number}       [options.limit.maxTotalExpansions=0]  — 0 = unlimited
       * @param {number}       [options.limit.maxExpandedLength=0]   — 0 = unlimited
       * @param {'external'|'base'|'all'|string[]} [options.limit.applyLimitsTo='external']
       *   Which entity tiers count against the security limits:
       *   - 'external' (default) — only input/runtime + persistent external entities
       *   - 'base'               — only DEFAULT_XML_ENTITIES + namedEntities
       *   - 'all'                — every entity regardless of tier
       *   - string[]             — explicit combination, e.g. ['external', 'base']
       * @param {((resolved: string, original: string) => string)|null} [options.postCheck=null]
       * @param {string[]} [options.remove=[]] — entity names (e.g. ['nbsp', '#13']) to delete (replace with empty string)
       * @param {string[]} [options.leave=[]]  — entity names to keep as literal (unchanged in output)
       * @param {object}   [options.ncr]       — Numeric Character Reference controls
       * @param {1.0|1.1}  [options.ncr.xmlVersion=1.0]
       *   XML version governing which codepoint ranges are restricted:
       *   - 1.0 — C0 controls U+0001–U+001F (except U+0009/000A/000D) are prohibited
       *   - 1.1 — C0 controls are allowed when written as NCRs; C1 (U+007F–U+009F) decoded as-is
       * @param {'allow'|'leave'|'remove'|'throw'} [options.ncr.onNCR='allow']
       *   Base action for numeric references. Severity order: allow < leave < remove < throw.
       *   For codepoint ranges that carry a minimum level (surrogates → remove, XML 1.0 C0 → remove),
       *   the effective action is max(onNCR, rangeMinimum).
       * @param {'remove'|'throw'} [options.ncr.nullNCR='remove']
       *   Action for U+0000 (null). 'allow' and 'leave' are clamped to 'remove' since null is never safe.
       * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onExternalEntity=null]
       *   Hook called when an external entity is registered via `setExternalEntities()` or
       *   `addExternalEntity()`. Return `ENTITY_ACTION.ALLOW` to accept the entity,
       *   `ENTITY_ACTION.BLOCK` to silently skip it, or `ENTITY_ACTION.THROW` to abort with an error.
       * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} [options.onInputEntity=null]
       *   Hook called when an input entity is registered via `addInputEntities()`. Return
       *   `ENTITY_ACTION.ALLOW` to accept, `ENTITY_ACTION.BLOCK` to silently skip, or
       *   `ENTITY_ACTION.THROW` to abort with an error.
       */
      constructor(options = {}) {
        this._limit = options.limit || {};
        this._maxTotalExpansions = this._limit.maxTotalExpansions || 0;
        this._maxExpandedLength = this._limit.maxExpandedLength || 0;
        this._postCheck = typeof options.postCheck === "function" ? options.postCheck : (r) => r;
        this._limitTiers = parseLimitTiers(this._limit.applyLimitsTo ?? LIMIT_TIER_EXTERNAL);
        this._numericAllowed = options.numericAllowed ?? true;
        this._baseMap = mergeEntityMaps(XML, options.namedEntities || null);
        this._externalMap = /* @__PURE__ */ Object.create(null);
        this._inputMap = /* @__PURE__ */ Object.create(null);
        this._totalExpansions = 0;
        this._expandedLength = 0;
        this._removeSet = new Set(options.remove && Array.isArray(options.remove) ? options.remove : []);
        this._leaveSet = new Set(options.leave && Array.isArray(options.leave) ? options.leave : []);
        const ncrCfg = parseNCRConfig(options.ncr);
        this._ncrXmlVersion = ncrCfg.xmlVersion;
        this._ncrOnLevel = ncrCfg.onLevel;
        this._ncrNullLevel = ncrCfg.nullLevel;
        this._onExternalEntity = typeof options.onExternalEntity === "function" ? options.onExternalEntity : null;
        this._onInputEntity = typeof options.onInputEntity === "function" ? options.onInputEntity : null;
      }
      // -------------------------------------------------------------------------
      // Private: registration hook dispatch
      // -------------------------------------------------------------------------
      /**
       * Invoke a registration hook for a single entity name/value pair.
       * Returns true when the entity should be accepted, false when it should be
       * silently skipped (BLOCK), and throws when the hook returns THROW.
       *
       * @param {((name: string, value: string) => 'allow'|'block'|'throw')|null} hook
       * @param {string} name
       * @param {string} value
       * @param {string} context  — used in error messages ('external' | 'input')
       * @returns {boolean}  true = accept, false = skip
       */
      _applyRegistrationHook(hook, name, value, context) {
        if (!hook) return true;
        const action = hook(name, value);
        if (action === ENTITY_ACTION.BLOCK) return false;
        if (action === ENTITY_ACTION.THROW) {
          throw new Error(
            `[EntityDecoder] Registration of ${context} entity "&${name};" was rejected by hook`
          );
        }
        return true;
      }
      // -------------------------------------------------------------------------
      // Persistent external entity registration
      // -------------------------------------------------------------------------
      /**
       * Replace the full set of persistent external entities.
       * All keys are validated — throws on invalid characters.
       * If `onExternalEntity` is set, it is called once per entry; entries that
       * return `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW`
       * aborts the whole call.
       * @param {Record<string, string | { regex?: RegExp, val: string }>} map
       */
      setExternalEntities(map) {
        if (map) {
          for (const key of Object.keys(map)) {
            validateEntityName(key);
          }
        }
        if (!this._onExternalEntity) {
          this._externalMap = mergeEntityMaps(map);
          return;
        }
        const flat = mergeEntityMaps(map);
        const filtered = /* @__PURE__ */ Object.create(null);
        for (const [name, value] of Object.entries(flat)) {
          if (this._applyRegistrationHook(this._onExternalEntity, name, value, "external")) {
            filtered[name] = value;
          }
        }
        this._externalMap = filtered;
      }
      /**
       * Add a single persistent external entity.
       * If `onExternalEntity` is set it is called before the entity is stored;
       * `ENTITY_ACTION.BLOCK` silently skips storage, `ENTITY_ACTION.THROW` raises.
       * @param {string} key
       * @param {string} value
       */
      addExternalEntity(key, value) {
        validateEntityName(key);
        if (typeof value === "string" && value.indexOf("&") === -1) {
          if (this._applyRegistrationHook(this._onExternalEntity, key, value, "external")) {
            this._externalMap[key] = value;
          }
        }
      }
      // -------------------------------------------------------------------------
      // Input / runtime entity registration (per document)
      // -------------------------------------------------------------------------
      /**
       * Inject DOCTYPE entities for the current document.
       * Also resets per-document expansion counters.
       * If `onInputEntity` is set it is called once per entry; entries returning
       * `ENTITY_ACTION.BLOCK` are silently omitted, `ENTITY_ACTION.THROW` aborts.
       * @param {Record<string, string | { regx?: RegExp, regex?: RegExp, val: string }>} map
       */
      addInputEntities(map) {
        this._totalExpansions = 0;
        this._expandedLength = 0;
        if (!this._onInputEntity) {
          this._inputMap = mergeEntityMaps(map);
          return;
        }
        const flat = mergeEntityMaps(map);
        const filtered = /* @__PURE__ */ Object.create(null);
        for (const [name, value] of Object.entries(flat)) {
          if (this._applyRegistrationHook(this._onInputEntity, name, value, "input")) {
            filtered[name] = value;
          }
        }
        this._inputMap = filtered;
      }
      // -------------------------------------------------------------------------
      // Per-document reset
      // -------------------------------------------------------------------------
      /**
       * Wipe input/runtime entities and reset counters.
       * Call this before processing each new document.
       * @returns {this}
       */
      reset() {
        this._inputMap = /* @__PURE__ */ Object.create(null);
        this._totalExpansions = 0;
        this._expandedLength = 0;
        return this;
      }
      // -------------------------------------------------------------------------
      // XML version (can be set after construction, e.g. once parser reads <?xml?>)
      // -------------------------------------------------------------------------
      /**
       * Update the XML version used for NCR classification.
       * Call this as soon as the document's `<?xml version="...">` declaration is parsed.
       * @param {1.0|1.1|number} version
       */
      setXmlVersion(version) {
        this._ncrXmlVersion = version === 1.1 ? 1.1 : 1;
      }
      // -------------------------------------------------------------------------
      // Primary API
      // -------------------------------------------------------------------------
      /**
       * Replace all entity references in `str` in a single pass.
       *
       * @param {string} str
       * @returns {string}
       */
      decode(str) {
        if (typeof str !== "string" || str.length === 0) return str;
        if (str.indexOf("&") === -1) return str;
        const original = str;
        const chunks = [];
        const len = str.length;
        let last = 0;
        let i = 0;
        const limitExpansions = this._maxTotalExpansions > 0;
        const limitLength = this._maxExpandedLength > 0;
        const checkLimits = limitExpansions || limitLength;
        while (i < len) {
          if (str.charCodeAt(i) !== 38) {
            i++;
            continue;
          }
          let j = i + 1;
          while (j < len && str.charCodeAt(j) !== 59 && j - i <= 32) j++;
          if (j >= len || str.charCodeAt(j) !== 59) {
            i++;
            continue;
          }
          const token = str.slice(i + 1, j);
          if (token.length === 0) {
            i++;
            continue;
          }
          let replacement;
          let tier;
          if (this._removeSet.has(token)) {
            replacement = "";
            if (tier === void 0) {
              tier = LIMIT_TIER_EXTERNAL;
            }
          } else if (this._leaveSet.has(token)) {
            i++;
            continue;
          } else if (token.charCodeAt(0) === 35) {
            const ncrResult = this._resolveNCR(token);
            if (ncrResult === void 0) {
              i++;
              continue;
            }
            replacement = ncrResult;
            tier = LIMIT_TIER_BASE;
          } else {
            const resolved = this._resolveName(token);
            replacement = resolved?.value;
            tier = resolved?.tier;
          }
          if (replacement === void 0) {
            i++;
            continue;
          }
          if (i > last) chunks.push(str.slice(last, i));
          chunks.push(replacement);
          last = j + 1;
          i = last;
          if (checkLimits && this._tierCounts(tier)) {
            if (limitExpansions) {
              this._totalExpansions++;
              if (this._totalExpansions > this._maxTotalExpansions) {
                throw new Error(
                  `[EntityReplacer] Entity expansion count limit exceeded: ${this._totalExpansions} > ${this._maxTotalExpansions}`
                );
              }
            }
            if (limitLength) {
              const delta = replacement.length - (token.length + 2);
              if (delta > 0) {
                this._expandedLength += delta;
                if (this._expandedLength > this._maxExpandedLength) {
                  throw new Error(
                    `[EntityReplacer] Expanded content length limit exceeded: ${this._expandedLength} > ${this._maxExpandedLength}`
                  );
                }
              }
            }
          }
        }
        if (last < len) chunks.push(str.slice(last));
        const result = chunks.length === 0 ? str : chunks.join("");
        return this._postCheck(result, original);
      }
      // -------------------------------------------------------------------------
      // Private: limit tier check
      // -------------------------------------------------------------------------
      /**
       * Returns true if a resolved entity of the given tier should count
       * against the expansion/length limits.
       * @param {string} tier  — LIMIT_TIER_EXTERNAL | LIMIT_TIER_BASE
       * @returns {boolean}
       */
      _tierCounts(tier) {
        if (this._limitTiers.has(LIMIT_TIER_ALL)) return true;
        return this._limitTiers.has(tier);
      }
      // -------------------------------------------------------------------------
      // Private: entity resolution
      // -------------------------------------------------------------------------
      /**
       * Resolve a named entity token (without & and ;).
       * Priority: inputMap > externalMap > baseMap
       * Returns the resolved value tagged with its limit tier.
       *
       * @param {string} name
       * @returns {{ value: string, tier: string }|undefined}
       */
      _resolveName(name) {
        if (name in this._inputMap) return { value: this._inputMap[name], tier: LIMIT_TIER_EXTERNAL };
        if (name in this._externalMap) return { value: this._externalMap[name], tier: LIMIT_TIER_EXTERNAL };
        if (name in this._baseMap) return { value: this._baseMap[name], tier: LIMIT_TIER_BASE };
        return void 0;
      }
      /**
       * Classify a codepoint and return the minimum action level that must be applied.
       * Returns -1 when no minimum is imposed (normal allow path).
       *
       * Ranges checked (in priority order):
       *   1. U+0000            — null, governed by nullNCR (always ≥ remove)
       *   2. U+D800–U+DFFF     — surrogates, always prohibited (min: remove)
       *   3. U+0001–U+001F \ {0x09,0x0A,0x0D}  — XML 1.0 restricted C0 (min: remove)
       *      (skipped in XML 1.1 — C0 controls are allowed when written as NCRs)
       *
       * @param {number} cp  — codepoint
       * @returns {number}   — minimum NCR_LEVEL value, or -1 for no restriction
       */
      _classifyNCR(cp) {
        if (cp === 0) return this._ncrNullLevel;
        if (cp >= 55296 && cp <= 57343) return NCR_LEVEL.remove;
        if (this._ncrXmlVersion === 1) {
          if (cp >= 1 && cp <= 31 && !XML10_ALLOWED_C0.has(cp)) return NCR_LEVEL.remove;
        }
        return -1;
      }
      /**
       * Execute a resolved NCR action.
       *
       * @param {number} action   — NCR_LEVEL value
       * @param {string} token    — raw token (e.g. '#38') for error messages
       * @param {number} cp       — codepoint, used only for error messages
       * @returns {string|undefined}
       *   - decoded character string  → 'allow'
       *   - ''                        → 'remove'
       *   - undefined                 → 'leave' (caller must skip past '&' only)
       *   - throws Error              → 'throw'
       */
      _applyNCRAction(action, token, cp) {
        switch (action) {
          case NCR_LEVEL.allow:
            return String.fromCodePoint(cp);
          case NCR_LEVEL.remove:
            return "";
          case NCR_LEVEL.leave:
            return void 0;
          // signal: keep literal
          case NCR_LEVEL.throw:
            throw new Error(
              `[EntityDecoder] Prohibited numeric character reference &${token}; (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`
            );
          default:
            return String.fromCodePoint(cp);
        }
      }
      /**
       * Full NCR resolution pipeline for a numeric token.
       *
       * Steps:
       *   1. Parse the codepoint (decimal or hex).
       *   2. Validate the raw codepoint range (NaN, <0, >0x10FFFF).
       *   3. If numericAllowed is false and no minimum restriction applies → leave as-is.
       *   4. Classify the codepoint to find the minimum required action level.
       *   5. Resolve effective action = max(onNCR, minimum).
       *   6. Apply and return.
       *
       * @param {string} token  — e.g. '#38', '#x26', '#X26'
       * @returns {string|undefined}
       *   - string (incl. '')  — replacement ('' = remove)
       *   - undefined          — leave original &token; as-is
       */
      _resolveNCR(token) {
        const second = token.charCodeAt(1);
        let cp;
        if (second === 120 || second === 88) {
          cp = parseInt(token.slice(2), 16);
        } else {
          cp = parseInt(token.slice(1), 10);
        }
        if (Number.isNaN(cp) || cp < 0 || cp > 1114111) return void 0;
        const minimum = this._classifyNCR(cp);
        if (!this._numericAllowed && minimum < NCR_LEVEL.remove) return void 0;
        const effective = minimum === -1 ? this._ncrOnLevel : Math.max(this._ncrOnLevel, minimum);
        return this._applyNCRAction(effective, token, cp);
      }
    };
  }
});

// tools/Content Harvester/node_modules/@nodable/entities/src/index.js
var init_src = __esm({
  "tools/Content Harvester/node_modules/@nodable/entities/src/index.js"() {
    init_EntityDecoder();
    init_entities();
  }
});

// tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js
function validatePropertyName(propertyName, optionName) {
  if (typeof propertyName !== "string") {
    return;
  }
  const normalized = propertyName.toLowerCase();
  if (DANGEROUS_PROPERTY_NAMES.some((dangerous) => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
  if (criticalProperties.some((dangerous) => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
}
function normalizeProcessEntities(value, htmlEntities) {
  if (typeof value === "boolean") {
    return {
      enabled: value,
      // true or false
      maxEntitySize: 1e4,
      maxExpansionDepth: 1e4,
      maxTotalExpansions: Infinity,
      maxExpandedLength: 1e5,
      maxEntityCount: 1e3,
      allowedTags: null,
      tagFilter: null,
      appliesTo: "all"
    };
  }
  if (typeof value === "object" && value !== null) {
    return {
      enabled: value.enabled !== false,
      maxEntitySize: Math.max(1, value.maxEntitySize ?? 1e4),
      maxExpansionDepth: Math.max(1, value.maxExpansionDepth ?? 1e4),
      maxTotalExpansions: Math.max(1, value.maxTotalExpansions ?? Infinity),
      maxExpandedLength: Math.max(1, value.maxExpandedLength ?? 1e5),
      maxEntityCount: Math.max(1, value.maxEntityCount ?? 1e3),
      allowedTags: value.allowedTags ?? null,
      tagFilter: value.tagFilter ?? null,
      appliesTo: value.appliesTo ?? "all"
    };
  }
  return normalizeProcessEntities(true);
}
var defaultOnDangerousProperty, defaultOptions2, buildOptions;
var init_OptionsBuilder = __esm({
  "tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/OptionsBuilder.js"() {
    init_util();
    defaultOnDangerousProperty = (name) => {
      if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
        return "__" + name;
      }
      return name;
    };
    defaultOptions2 = {
      preserveOrder: false,
      attributeNamePrefix: "@_",
      attributesGroupName: false,
      textNodeName: "#text",
      ignoreAttributes: true,
      removeNSPrefix: false,
      // remove NS from tag name or attribute name if true
      allowBooleanAttributes: false,
      //a tag can have attributes without any value
      //ignoreRootElement : false,
      parseTagValue: true,
      parseAttributeValue: false,
      trimValues: true,
      //Trim string values of tag and attributes
      cdataPropName: false,
      numberParseOptions: {
        hex: true,
        leadingZeros: true,
        eNotation: true,
        unicode: false
      },
      tagValueProcessor: function(tagName, val) {
        return val;
      },
      attributeValueProcessor: function(attrName, val) {
        return val;
      },
      stopNodes: [],
      //nested tags will not be parsed even for errors
      alwaysCreateTextNode: false,
      isArray: () => false,
      commentPropName: false,
      unpairedTags: [],
      processEntities: true,
      htmlEntities: false,
      entityDecoder: null,
      ignoreDeclaration: false,
      ignorePiTags: false,
      transformTagName: false,
      transformAttributeName: false,
      updateTag: function(tagName, jPath, attrs) {
        return tagName;
      },
      // skipEmptyListItem: false
      captureMetaData: false,
      maxNestedTags: 100,
      strictReservedNames: true,
      jPath: true,
      // if true, pass jPath string to callbacks; if false, pass matcher instance
      onDangerousProperty: defaultOnDangerousProperty
    };
    buildOptions = function(options) {
      const built = Object.assign({}, defaultOptions2, options);
      const propertyNameOptions = [
        { value: built.attributeNamePrefix, name: "attributeNamePrefix" },
        { value: built.attributesGroupName, name: "attributesGroupName" },
        { value: built.textNodeName, name: "textNodeName" },
        { value: built.cdataPropName, name: "cdataPropName" },
        { value: built.commentPropName, name: "commentPropName" }
      ];
      for (const { value, name } of propertyNameOptions) {
        if (value) {
          validatePropertyName(value, name);
        }
      }
      if (built.onDangerousProperty === null) {
        built.onDangerousProperty = defaultOnDangerousProperty;
      }
      built.processEntities = normalizeProcessEntities(built.processEntities, built.htmlEntities);
      built.unpairedTagsSet = new Set(built.unpairedTags);
      if (built.stopNodes && Array.isArray(built.stopNodes)) {
        built.stopNodes = built.stopNodes.map((node) => {
          if (typeof node === "string" && node.startsWith("*.")) {
            return ".." + node.substring(2);
          }
          return node;
        });
      }
      return built;
    };
  }
});

// tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/xmlNode.js
var METADATA_SYMBOL, XmlNode;
var init_xmlNode = __esm({
  "tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/xmlNode.js"() {
    "use strict";
    if (typeof Symbol !== "function") {
      METADATA_SYMBOL = "@@xmlMetadata";
    } else {
      METADATA_SYMBOL = Symbol("XML Node Metadata");
    }
    XmlNode = class {
      constructor(tagname) {
        this.tagname = tagname;
        this.child = [];
        this[":@"] = /* @__PURE__ */ Object.create(null);
      }
      add(key, val) {
        if (key === "__proto__") key = "#__proto__";
        this.child.push({ [key]: val });
      }
      addChild(node, startIndex) {
        if (node.tagname === "__proto__") node.tagname = "#__proto__";
        if (node[":@"] && Object.keys(node[":@"]).length > 0) {
          this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
        } else {
          this.child.push({ [node.tagname]: node.child });
        }
        if (startIndex !== void 0) {
          this.child[this.child.length - 1][METADATA_SYMBOL] = { startIndex };
        }
      }
      /** symbol used for metadata */
      static getMetaDataSymbol() {
        return METADATA_SYMBOL;
      }
    };
  }
});

// tools/Content Harvester/node_modules/xml-naming/src/index.js
var nameStartChar10, nameChar10, nameStartChar11, nameChar11, buildRegexes, regexes10, regexes11, nameStartCharAscii, nameCharAscii, regexesAscii, getRegexes, qName;
var init_src2 = __esm({
  "tools/Content Harvester/node_modules/xml-naming/src/index.js"() {
    nameStartChar10 = ":A-Za-z_À-ÖØ-öø-˿Ͱ-ͽͿ-҆҈-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�";
    nameChar10 = nameStartChar10 + "\\-\\.\\d·̀-ͯ‿-⁀";
    nameStartChar11 = ":A-Za-z_À-˿Ͱ-ͽͿ-҆҈-῿‌-‍⁰-↏Ⰰ-⿯、-퟿豈-﷏ﷰ-�𐀀-󯿿";
    nameChar11 = nameStartChar11 + "\\-\\.\\d·̀-ͯ҇‿-⁀";
    buildRegexes = (startChar, char, flags = "") => {
      const ncStart = startChar.replace(":", "");
      const ncChar = char.replace(":", "");
      const ncNamePat = `[${ncStart}][${ncChar}]*`;
      return {
        name: new RegExp(`^[${startChar}][${char}]*$`, flags),
        ncName: new RegExp(`^${ncNamePat}$`, flags),
        qName: new RegExp(`^${ncNamePat}(?::${ncNamePat})?$`, flags),
        nmToken: new RegExp(`^[${char}]+$`, flags),
        nmTokens: new RegExp(`^[${char}]+(?:\\s+[${char}]+)*$`, flags)
      };
    };
    regexes10 = buildRegexes(nameStartChar10, nameChar10);
    regexes11 = buildRegexes(nameStartChar11, nameChar11, "u");
    nameStartCharAscii = ":A-Za-z_";
    nameCharAscii = nameStartCharAscii + "\\-\\.\\d";
    regexesAscii = buildRegexes(nameStartCharAscii, nameCharAscii);
    getRegexes = (xmlVersion = "1.0", asciiOnly = false) => {
      if (asciiOnly) return regexesAscii;
      return xmlVersion === "1.1" ? regexes11 : regexes10;
    };
    qName = (str, { xmlVersion = "1.0", asciiOnly = false } = {}) => getRegexes(xmlVersion, asciiOnly).qName.test(str);
  }
});

// tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js
function hasSeq(data, seq, i) {
  for (let j = 0; j < seq.length; j++) {
    if (seq[j] !== data[i + j + 1]) return false;
  }
  return true;
}
function validateEntityName2(name, xmlVersion) {
  if (qName(name, { xmlVersion }))
    return name;
  else
    throw new Error(`Invalid entity name ${name}`);
}
var DocTypeReader, skipWhitespace;
var init_DocTypeReader = __esm({
  "tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/DocTypeReader.js"() {
    init_src2();
    DocTypeReader = class {
      constructor(options, xmlVersion) {
        this.suppressValidationErr = !options;
        this.options = options;
        this.xmlVersion = xmlVersion || 1;
      }
      setXmlVersion(xmlVersion = 1) {
        this.xmlVersion = xmlVersion;
      }
      readDocType(xmlData, i) {
        const entities = /* @__PURE__ */ Object.create(null);
        let entityCount = 0;
        if (xmlData[i + 3] === "O" && xmlData[i + 4] === "C" && xmlData[i + 5] === "T" && xmlData[i + 6] === "Y" && xmlData[i + 7] === "P" && xmlData[i + 8] === "E") {
          i = i + 9;
          let angleBracketsCount = 1;
          let hasBody = false, comment = false;
          let exp = "";
          for (; i < xmlData.length; i++) {
            if (xmlData[i] === "<" && !comment) {
              if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
                i += 7;
                let entityName, val;
                [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
                if (val.indexOf("&") === -1) {
                  if (this.options.enabled !== false && this.options.maxEntityCount != null && entityCount >= this.options.maxEntityCount) {
                    throw new Error(
                      `Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`
                    );
                  }
                  entities[entityName] = val;
                  entityCount++;
                }
              } else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
                i += 8;
                const { index } = this.readElementExp(xmlData, i + 1);
                i = index;
              } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
                i += 8;
              } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
                i += 9;
                const { index } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
                i = index;
              } else if (hasSeq(xmlData, "!--", i)) comment = true;
              else throw new Error(`Invalid DOCTYPE`);
              angleBracketsCount++;
              exp = "";
            } else if (xmlData[i] === ">") {
              if (comment) {
                if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
                  comment = false;
                  angleBracketsCount--;
                }
              } else {
                angleBracketsCount--;
              }
              if (angleBracketsCount === 0) {
                break;
              }
            } else if (xmlData[i] === "[") {
              hasBody = true;
            } else {
              exp += xmlData[i];
            }
          }
          if (angleBracketsCount !== 0) {
            throw new Error(`Unclosed DOCTYPE`);
          }
        } else {
          throw new Error(`Invalid Tag instead of DOCTYPE`);
        }
        return { entities, i };
      }
      readEntityExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        const startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
          i++;
        }
        let entityName = xmlData.substring(startIndex, i);
        validateEntityName2(entityName, { xmlVersion: this.xmlVersion });
        i = skipWhitespace(xmlData, i);
        if (!this.suppressValidationErr) {
          if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
            throw new Error("External entities are not supported");
          } else if (xmlData[i] === "%") {
            throw new Error("Parameter entities are not supported");
          }
        }
        let entityValue = "";
        [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");
        if (this.options.enabled !== false && this.options.maxEntitySize != null && entityValue.length > this.options.maxEntitySize) {
          throw new Error(
            `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`
          );
        }
        i--;
        return [entityName, entityValue, i];
      }
      readNotationExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        const startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          i++;
        }
        let notationName = xmlData.substring(startIndex, i);
        !this.suppressValidationErr && validateEntityName2(notationName, { xmlVersion: this.xmlVersion });
        i = skipWhitespace(xmlData, i);
        const identifierType = xmlData.substring(i, i + 6).toUpperCase();
        if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
          throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
        }
        i += identifierType.length;
        i = skipWhitespace(xmlData, i);
        let publicIdentifier = null;
        let systemIdentifier = null;
        if (identifierType === "PUBLIC") {
          [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");
          i = skipWhitespace(xmlData, i);
          if (xmlData[i] === '"' || xmlData[i] === "'") {
            [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
          }
        } else if (identifierType === "SYSTEM") {
          [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
          if (!this.suppressValidationErr && !systemIdentifier) {
            throw new Error("Missing mandatory system identifier for SYSTEM notation");
          }
        }
        return { notationName, publicIdentifier, systemIdentifier, index: --i };
      }
      readIdentifierVal(xmlData, i, type) {
        let identifierVal = "";
        const startChar = xmlData[i];
        if (startChar !== '"' && startChar !== "'") {
          throw new Error(`Expected quoted string, found "${startChar}"`);
        }
        i++;
        const startIndex = i;
        while (i < xmlData.length && xmlData[i] !== startChar) {
          i++;
        }
        identifierVal = xmlData.substring(startIndex, i);
        if (xmlData[i] !== startChar) {
          throw new Error(`Unterminated ${type} value`);
        }
        i++;
        return [i, identifierVal];
      }
      readElementExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        const startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          i++;
        }
        let elementName = xmlData.substring(startIndex, i);
        if (!this.suppressValidationErr && !qName(elementName, { xmlVersion: this.xmlVersion })) {
          throw new Error(`Invalid element name: "${elementName}"`);
        }
        i = skipWhitespace(xmlData, i);
        let contentModel = "";
        if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) i += 4;
        else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) i += 2;
        else if (xmlData[i] === "(") {
          i++;
          const startIndex2 = i;
          while (i < xmlData.length && xmlData[i] !== ")") {
            i++;
          }
          contentModel = xmlData.substring(startIndex2, i);
          if (xmlData[i] !== ")") {
            throw new Error("Unterminated content model");
          }
        } else if (!this.suppressValidationErr) {
          throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
        }
        return {
          elementName,
          contentModel: contentModel.trim(),
          index: i
        };
      }
      readAttlistExp(xmlData, i) {
        i = skipWhitespace(xmlData, i);
        let startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          i++;
        }
        let elementName = xmlData.substring(startIndex, i);
        validateEntityName2(elementName, { xmlVersion: this.xmlVersion });
        i = skipWhitespace(xmlData, i);
        startIndex = i;
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
          i++;
        }
        let attributeName = xmlData.substring(startIndex, i);
        if (!validateEntityName2(attributeName, { xmlVersion: this.xmlVersion })) {
          throw new Error(`Invalid attribute name: "${attributeName}"`);
        }
        i = skipWhitespace(xmlData, i);
        let attributeType = "";
        if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
          attributeType = "NOTATION";
          i += 8;
          i = skipWhitespace(xmlData, i);
          if (xmlData[i] !== "(") {
            throw new Error(`Expected '(', found "${xmlData[i]}"`);
          }
          i++;
          let allowedNotations = [];
          while (i < xmlData.length && xmlData[i] !== ")") {
            const startIndex2 = i;
            while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
              i++;
            }
            let notation = xmlData.substring(startIndex2, i);
            notation = notation.trim();
            if (!validateEntityName2(notation, { xmlVersion: this.xmlVersion })) {
              throw new Error(`Invalid notation name: "${notation}"`);
            }
            allowedNotations.push(notation);
            if (xmlData[i] === "|") {
              i++;
              i = skipWhitespace(xmlData, i);
            }
          }
          if (xmlData[i] !== ")") {
            throw new Error("Unterminated list of notations");
          }
          i++;
          attributeType += " (" + allowedNotations.join("|") + ")";
        } else {
          const startIndex2 = i;
          while (i < xmlData.length && !/\s/.test(xmlData[i])) {
            i++;
          }
          attributeType += xmlData.substring(startIndex2, i);
          const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
          if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
            throw new Error(`Invalid attribute type: "${attributeType}"`);
          }
        }
        i = skipWhitespace(xmlData, i);
        let defaultValue = "";
        if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
          defaultValue = "#REQUIRED";
          i += 8;
        } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
          defaultValue = "#IMPLIED";
          i += 7;
        } else {
          [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
        }
        return {
          elementName,
          attributeName,
          attributeType,
          defaultValue,
          index: i
        };
      }
    };
    skipWhitespace = (data, index) => {
      while (index < data.length && /\s/.test(data[index])) {
        index++;
      }
      return index;
    };
  }
});

// tools/Content Harvester/node_modules/anynum/digitTable.js
var SCRIPT_ZEROS, NOT_DIGIT, HIGH_MAP, LOW_MAX, LOW_MIN, TABLE_OFFSET, TABLE_SIZE, TABLE;
var init_digitTable = __esm({
  "tools/Content Harvester/node_modules/anynum/digitTable.js"() {
    SCRIPT_ZEROS = [
      // Basic Latin (ASCII) — included for completeness / pass-through
      48,
      // 0-9
      // Arabic scripts
      1632,
      // Arabic-Indic ٠١٢٣٤٥٦٧٨٩
      1776,
      // Extended Arabic-Indic (Urdu/Persian/Sindhi) ۰۱۲۳
      // Indic scripts
      2406,
      // Devanagari ०१२३४५६७८९
      2534,
      // Bengali ০১২৩৪৫৬৭৮৯
      2662,
      // Gurmukhi ੦੧੨੩੪੫੬੭੮੯
      2790,
      // Gujarati ૦૧૨૩૪૫૬૭૮૯
      2918,
      // Odia ୦୧୨୩୪୫୬୭୮୯
      3046,
      // Tamil ௦௧௨௩௪௫௬௭௮௯
      3174,
      // Telugu ౦౧౨౩౪౫౬౭౮౯
      3302,
      // Kannada ೦೧೨೩೪೫೬೭೮೯
      3430,
      // Malayalam ൦൧൨൩൪൫൬൭൮൯
      3558,
      // Sinhala Archaic ෦෧෨෩෪෫෬෭෮෯
      // Southeast Asian scripts
      3664,
      // Thai ๐๑๒๓๔๕๖๗๘๙
      3792,
      // Lao ໐໑໒໓໔໕໖໗໘໙
      3872,
      // Tibetan ༠༡༢༣༤༥༦༧༨༩
      4160,
      // Myanmar ၀၁၂၃၄၅၆၇၈၉
      4240,
      // Myanmar Shan ႐႑႒႓႔႕႖႗႘႙
      6112,
      // Khmer ០១២៣៤៥៦៧៨៩
      6160,
      // Mongolian ᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙
      6470,
      // Limbu ᥆᥇᥈᥉᥊᥋᥌᥍᥎᥏
      6608,
      // New Tai Lue ᧐᧑᧒᧓᧔᧕᧖᧗᧘᧙
      6784,
      // Tai Tham Hora ᪀᪁᪂᪃᪄᪅᪆᪇᪈᪉
      6800,
      // Tai Tham Tham ᪐᪑᪒᪓᪔᪕᪖᪗᪘᪙
      6992,
      // Balinese ᭐᭑᭒᭓᭔᭕᭖᭗᭘᭙
      7088,
      // Sundanese ᮰᮱᮲᮳᮴᮵᮶᮷᮸᮹
      7232,
      // Lepcha ᱀᱁᱂᱃᱄᱅᱆᱇᱈᱉
      7248,
      // Ol Chiki ᱐᱑᱒᱓᱔᱕᱖᱗᱘᱙
      // Fullwidth (CJK context)
      65296,
      // Fullwidth ０１２３４５６７８９
      // Mathematical digit variants (Unicode math block)
      120782,
      // Mathematical Bold
      120792,
      // Mathematical Double-Struck
      120802,
      // Mathematical Sans-Serif
      120812,
      // Mathematical Sans-Serif Bold
      120822,
      // Mathematical Monospace
      // Other scripts
      66720,
      // Osmanya 𐒠𐒡𐒢𐒣𐒤𐒥𐒦𐒧𐒨𐒩
      68912,
      // Hanifi Rohingya 𐴰𐴱𐴲𐴳𐴴𐴵𐴶𐴷𐴸𐴹
      69734,
      // Brahmi 𑁦𑁧𑁨𑁩𑁪𑁫𑁬𑁭𑁮𑁯
      69872,
      // Sora Sompeng 𑃰𑃱𑃲𑃳𑃴𑃵𑃶𑃷𑃸𑃹
      69942,
      // Chakma 𑄶𑄷𑄸𑄹𑄺𑄻𑄼𑄽𑄾𑄿
      70096,
      // Sharada 𑇐𑇑𑇒𑇓𑇔𑇕𑇖𑇗𑇘𑇙
      70384,
      // Khudawadi 𑋰𑋱𑋲𑋳𑋴𑋵𑋶𑋷𑋸𑋹
      70736,
      // Newa 𑑐𑑑𑑒𑑓𑑔𑑕𑑖𑑗𑑘𑑙
      70864,
      // Tirhuta 𑓐𑓑𑓒𑓓𑓔𑓕𑓖𑓗𑓘𑓙
      71248,
      // Modi 𑙐𑙑𑙒𑙓𑙔𑙕𑙖𑙗𑙘𑙙
      71360,
      // Takri 𑛀𑛁𑛂𑛃𑛄𑛅𑛆𑛇𑛈𑛉
      71472,
      // Ahom 𑜰𑜱𑜲𑜳𑜴𑜵𑜶𑜷𑜸𑜹
      71904,
      // Warang Citi 𑣠𑣡𑣢𑣣𑣤𑣥𑣦𑣧𑣨𑣩
      72016,
      // Dives Akuru 𑥐𑥑𑥒𑥓𑥔𑥕𑥖𑥗𑥘𑥙
      72688,
      // Khitan Small Script 𑯰𑯱𑯲𑯳𑯴𑯵𑯶𑯷𑯸𑯹
      72784,
      // Bhaiksuki 𑱐𑱑𑱒𑱓𑱔𑱕𑱖𑱗𑱘𑱙
      73040,
      // Masaram Gondi 𑵐𑵑𑵒𑵓𑵔𑵕𑵖𑵗𑵘𑵙
      73120,
      // Gunjala Gondi 𑶠𑶡𑶢𑶣𑶤𑶥𑶦𑶧𑶨𑶩
      73552,
      // Kawi 𑽐𑽑𑽒𑽓𑽔𑽕𑽖𑽗𑽘𑽙
      92768,
      // Mro 𖩠𖩡𖩢𖩣𖩤𖩥𖩦𖩧𖩨𖩩
      92864,
      // Tangsa 𖫀𖫁𖫂𖫃𖫄𖫅𖫆𖫇𖫈𖫉
      93008,
      // Pahawh Hmong 𖭐𖭑𖭒𖭓𖭔𖭕𖭖𖭗𖭘𖭙
      123200,
      // Nyiakeng Puachue Hmong 𞅀𞅁𞅂𞅃𞅄𞅅𞅆𞅇𞅈𞅉
      123632,
      // Wancho 𞋰𞋱𞋲𞋳𞋴𞋵𞋶𞋷𞋸𞋹
      124144,
      // Nag Mundari 𞓰𞓱𞓲𞓳𞓴𞓵𞓶𞓷𞓸𞓹
      125264,
      // Adlam 𞥐𞥑𞥒𞥓𞥔𞥕𞥖𞥗𞥘𞥙
      130032
      // Segmented digit symbols 🯰🯱🯲🯳🯴🯵🯶🯷🯸🯹
    ];
    NOT_DIGIT = 255;
    HIGH_MAP = /* @__PURE__ */ new Map();
    LOW_MAX = 65535;
    LOW_MIN = 1632;
    TABLE_OFFSET = LOW_MIN;
    TABLE_SIZE = LOW_MAX - LOW_MIN + 1;
    TABLE = new Uint8Array(TABLE_SIZE).fill(NOT_DIGIT);
    for (const zero of SCRIPT_ZEROS) {
      for (let d = 0; d < 10; d++) {
        const cp = zero + d;
        if (cp <= LOW_MAX) {
          TABLE[cp - TABLE_OFFSET] = d;
        } else {
          HIGH_MAP.set(cp, d);
        }
      }
    }
  }
});

// tools/Content Harvester/node_modules/anynum/anynum.js
function anynum(str) {
  if (typeof str !== "string") return str;
  const len = str.length;
  if (len === 0) return str;
  let firstHit = -1;
  for (let i = 0; i < len; i++) {
    const cc = str.charCodeAt(i);
    if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) continue;
    if (cc < TABLE_OFFSET) {
      if (MINUS_SET.has(cc)) {
        firstHit = i;
        break;
      }
      continue;
    }
    if (cc >= 55296 && cc <= 56319) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 56320 && low <= 57343) {
          const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
          if (HIGH_MAP.has(cp)) {
            firstHit = i;
            break;
          }
        }
      }
      continue;
    }
    if (TABLE[cc - TABLE_OFFSET] !== NOT_DIGIT || MINUS_SET.has(cc)) {
      firstHit = i;
      break;
    }
  }
  if (firstHit === -1) return str;
  const chars = [];
  if (firstHit > 0) chars.push(str.slice(0, firstHit));
  for (let i = firstHit; i < len; i++) {
    const cc = str.charCodeAt(i);
    if (cc >= CHAR_0 && cc <= CHAR_9 || cc === CHAR_MINUS) {
      chars.push(str[i]);
      continue;
    }
    if (cc < TABLE_OFFSET) {
      chars.push(MINUS_SET.has(cc) ? "-" : str[i]);
      continue;
    }
    if (cc >= 55296 && cc <= 56319) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 56320 && low <= 57343) {
          const cp = 65536 + (cc - 55296 << 10) + (low - 56320);
          const d2 = HIGH_MAP.get(cp);
          if (d2 !== void 0) {
            chars.push(String.fromCharCode(d2 + 48));
            i++;
            continue;
          }
        }
      }
      chars.push(str[i]);
      continue;
    }
    if (MINUS_SET.has(cc)) {
      chars.push("-");
      continue;
    }
    const d = TABLE[cc - TABLE_OFFSET];
    chars.push(d !== NOT_DIGIT ? String.fromCharCode(d + 48) : str[i]);
  }
  return chars.join("");
}
var CHAR_0, CHAR_9, CHAR_MINUS, MINUS_SET, anynum_default;
var init_anynum = __esm({
  "tools/Content Harvester/node_modules/anynum/anynum.js"() {
    "use strict";
    init_digitTable();
    CHAR_0 = 48;
    CHAR_9 = 57;
    CHAR_MINUS = 45;
    MINUS_SET = /* @__PURE__ */ new Set([8722, 65293, 65123]);
    anynum_default = anynum;
  }
});

// tools/Content Harvester/node_modules/strnum/strnum.js
function toNumber(str, options = {}) {
  options = Object.assign({}, consider, options);
  if (!str || typeof str !== "string") return str;
  let trimmedStr = str.trim();
  if (trimmedStr.length === 0) return str;
  else if (options.skipLike !== void 0 && options.skipLike.test(trimmedStr)) return str;
  else if (trimmedStr === "0") return 0;
  if (options.unicode) {
    trimmedStr = anynum_default(trimmedStr);
    if (trimmedStr === "0") return 0;
  }
  if (options.hex && hexRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 16);
  } else if (options.binary && binRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 2);
  } else if (options.octal && octRegex.test(trimmedStr)) {
    return parse_int(trimmedStr, 8);
  } else if (!isFinite(trimmedStr)) {
    return handleInfinity(str, Number(trimmedStr), options);
  } else if (trimmedStr.includes("e") || trimmedStr.includes("E")) {
    return resolveEnotation(str, trimmedStr, options);
  } else {
    const match = numRegex.exec(trimmedStr);
    if (match) {
      const sign = match[1] || "";
      const leadingZeros = match[2];
      let numTrimmedByZeros = trimZeros(match[3]);
      const decimalAdjacentToLeadingZeros = sign ? (
        // 0., -00., 000.
        str[leadingZeros.length + 1] === "."
      ) : str[leadingZeros.length] === ".";
      if (!options.leadingZeros && (leadingZeros.length > 1 || leadingZeros.length === 1 && !decimalAdjacentToLeadingZeros)) {
        return str;
      } else {
        const num = Number(trimmedStr);
        const parsedStr = String(num);
        if (num === 0) return num;
        if (parsedStr.search(/[eE]/) !== -1) {
          if (options.eNotation) return num;
          else return str;
        } else if (trimmedStr.indexOf(".") !== -1) {
          if (parsedStr === "0") return num;
          else if (parsedStr === numTrimmedByZeros) return num;
          else if (parsedStr === `${sign}${numTrimmedByZeros}`) return num;
          else return str;
        }
        let n = leadingZeros ? numTrimmedByZeros : trimmedStr;
        if (leadingZeros) {
          return n === parsedStr || sign + n === parsedStr ? num : str;
        } else {
          return n === parsedStr || n === sign + parsedStr ? num : str;
        }
      }
    } else {
      return str;
    }
  }
}
function resolveEnotation(str, trimmedStr, options) {
  if (!options.eNotation) return str;
  const notation = trimmedStr.match(eNotationRegx);
  if (notation) {
    let sign = notation[1] || "";
    const eChar = notation[3].indexOf("e") === -1 ? "E" : "e";
    const leadingZeros = notation[2];
    const eAdjacentToLeadingZeros = sign ? (
      // 0E.
      str[leadingZeros.length + 1] === eChar
    ) : str[leadingZeros.length] === eChar;
    if (leadingZeros.length > 1 && eAdjacentToLeadingZeros) return str;
    else if (leadingZeros.length === 1 && (notation[3].startsWith(`.${eChar}`) || notation[3][0] === eChar)) {
      return Number(trimmedStr);
    } else if (leadingZeros.length > 0) {
      if (options.leadingZeros && !eAdjacentToLeadingZeros) {
        trimmedStr = (notation[1] || "") + notation[3];
        return Number(trimmedStr);
      } else return str;
    } else {
      return Number(trimmedStr);
    }
  } else {
    return str;
  }
}
function trimZeros(numStr) {
  if (numStr && numStr.indexOf(".") !== -1) {
    numStr = numStr.replace(/0+$/, "");
    if (numStr === ".") numStr = "0";
    else if (numStr[0] === ".") numStr = "0" + numStr;
    else if (numStr[numStr.length - 1] === ".") numStr = numStr.substring(0, numStr.length - 1);
    return numStr;
  }
  return numStr;
}
function parse_int(numStr, base) {
  const str = numStr.trim();
  if (base === 2 || base === 8) numStr = str.substring(2);
  if (parseInt) return parseInt(numStr, base);
  else if (Number.parseInt) return Number.parseInt(numStr, base);
  else if (window && window.parseInt) return window.parseInt(numStr, base);
  else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
}
function handleInfinity(str, num, options) {
  const isPositive = num === Infinity;
  switch (options.infinity.toLowerCase()) {
    case "null":
      return null;
    case "infinity":
      return num;
    // Return Infinity or -Infinity
    case "string":
      return isPositive ? "Infinity" : "-Infinity";
    case "original":
    default:
      return str;
  }
}
var hexRegex, binRegex, octRegex, numRegex, consider, eNotationRegx;
var init_strnum = __esm({
  "tools/Content Harvester/node_modules/strnum/strnum.js"() {
    init_anynum();
    hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
    binRegex = /^0b[01]+$/;
    octRegex = /^0o[0-7]+$/;
    numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;
    consider = {
      hex: true,
      binary: false,
      octal: false,
      leadingZeros: true,
      decimalPoint: ".",
      eNotation: true,
      //skipLike: /regex/,
      infinity: "original",
      // "null", "infinity" (Infinity type), "string" ("Infinity" (the string literal))
      unicode: false
    };
    eNotationRegx = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
  }
});

// tools/Content Harvester/node_modules/fast-xml-parser/src/ignoreAttributes.js
function getIgnoreAttributesFn(ignoreAttributes) {
  if (typeof ignoreAttributes === "function") {
    return ignoreAttributes;
  }
  if (Array.isArray(ignoreAttributes)) {
    return (attrName) => {
      for (const pattern of ignoreAttributes) {
        if (typeof pattern === "string" && attrName === pattern) {
          return true;
        }
        if (pattern instanceof RegExp && pattern.test(attrName)) {
          return true;
        }
      }
    };
  }
  return () => false;
}
var init_ignoreAttributes = __esm({
  "tools/Content Harvester/node_modules/fast-xml-parser/src/ignoreAttributes.js"() {
  }
});

// tools/Content Harvester/node_modules/path-expression-matcher/src/Expression.js
var Expression;
var init_Expression = __esm({
  "tools/Content Harvester/node_modules/path-expression-matcher/src/Expression.js"() {
    Expression = class {
      /**
       * Create a new Expression
       * @param {string} pattern - Pattern string (e.g., "root.users.user", "..user[id]")
       * @param {Object} options - Configuration options
       * @param {string} options.separator - Path separator (default: '.')
       */
      constructor(pattern, options = {}, data) {
        this.pattern = pattern;
        this.separator = options.separator || ".";
        this.segments = this._parse(pattern);
        this.data = data;
        this._hasDeepWildcard = this.segments.some((seg) => seg.type === "deep-wildcard");
        this._hasAttributeCondition = this.segments.some((seg) => seg.attrName !== void 0);
        this._hasPositionSelector = this.segments.some((seg) => seg.position !== void 0);
      }
      /**
       * Parse pattern string into segments
       * @private
       * @param {string} pattern - Pattern to parse
       * @returns {Array} Array of segment objects
       */
      _parse(pattern) {
        const segments = [];
        let i = 0;
        let currentPart = "";
        while (i < pattern.length) {
          if (pattern[i] === this.separator) {
            if (i + 1 < pattern.length && pattern[i + 1] === this.separator) {
              if (currentPart.trim()) {
                segments.push(this._parseSegment(currentPart.trim()));
                currentPart = "";
              }
              segments.push({ type: "deep-wildcard" });
              i += 2;
            } else {
              if (currentPart.trim()) {
                segments.push(this._parseSegment(currentPart.trim()));
              }
              currentPart = "";
              i++;
            }
          } else {
            currentPart += pattern[i];
            i++;
          }
        }
        if (currentPart.trim()) {
          segments.push(this._parseSegment(currentPart.trim()));
        }
        return segments;
      }
      /**
       * Parse a single segment
       * @private
       * @param {string} part - Segment string (e.g., "user", "ns::user", "user[id]", "ns::user:first")
       * @returns {Object} Segment object
       */
      _parseSegment(part) {
        const segment = { type: "tag" };
        let bracketContent = null;
        let withoutBrackets = part;
        const bracketMatch = part.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);
        if (bracketMatch) {
          withoutBrackets = bracketMatch[1] + bracketMatch[3];
          if (bracketMatch[2]) {
            const content = bracketMatch[2].slice(1, -1);
            if (content) {
              bracketContent = content;
            }
          }
        }
        let namespace = void 0;
        let tagAndPosition = withoutBrackets;
        if (withoutBrackets.includes("::")) {
          const nsIndex = withoutBrackets.indexOf("::");
          namespace = withoutBrackets.substring(0, nsIndex).trim();
          tagAndPosition = withoutBrackets.substring(nsIndex + 2).trim();
          if (!namespace) {
            throw new Error(`Invalid namespace in pattern: ${part}`);
          }
        }
        let tag = void 0;
        let positionMatch = null;
        if (tagAndPosition.includes(":")) {
          const colonIndex = tagAndPosition.lastIndexOf(":");
          const tagPart = tagAndPosition.substring(0, colonIndex).trim();
          const posPart = tagAndPosition.substring(colonIndex + 1).trim();
          const isPositionKeyword = ["first", "last", "odd", "even"].includes(posPart) || /^nth\(\d+\)$/.test(posPart);
          if (isPositionKeyword) {
            tag = tagPart;
            positionMatch = posPart;
          } else {
            tag = tagAndPosition;
          }
        } else {
          tag = tagAndPosition;
        }
        if (!tag) {
          throw new Error(`Invalid segment pattern: ${part}`);
        }
        segment.tag = tag;
        if (namespace) {
          segment.namespace = namespace;
        }
        if (bracketContent) {
          if (bracketContent.includes("=")) {
            const eqIndex = bracketContent.indexOf("=");
            segment.attrName = bracketContent.substring(0, eqIndex).trim();
            segment.attrValue = bracketContent.substring(eqIndex + 1).trim();
          } else {
            segment.attrName = bracketContent.trim();
          }
        }
        if (positionMatch) {
          const nthMatch = positionMatch.match(/^nth\((\d+)\)$/);
          if (nthMatch) {
            segment.position = "nth";
            segment.positionValue = parseInt(nthMatch[1], 10);
          } else {
            segment.position = positionMatch;
          }
        }
        return segment;
      }
      /**
       * Get the number of segments
       * @returns {number}
       */
      get length() {
        return this.segments.length;
      }
      /**
       * Check if expression contains deep wildcard
       * @returns {boolean}
       */
      hasDeepWildcard() {
        return this._hasDeepWildcard;
      }
      /**
       * Check if expression has attribute conditions
       * @returns {boolean}
       */
      hasAttributeCondition() {
        return this._hasAttributeCondition;
      }
      /**
       * Check if expression has position selectors
       * @returns {boolean}
       */
      hasPositionSelector() {
        return this._hasPositionSelector;
      }
      /**
       * Get string representation
       * @returns {string}
       */
      toString() {
        return this.pattern;
      }
    };
  }
});

// tools/Content Harvester/node_modules/path-expression-matcher/src/ExpressionSet.js
var ExpressionSet;
var init_ExpressionSet = __esm({
  "tools/Content Harvester/node_modules/path-expression-matcher/src/ExpressionSet.js"() {
    ExpressionSet = class {
      constructor() {
        this._byDepthAndTag = /* @__PURE__ */ new Map();
        this._wildcardByDepth = /* @__PURE__ */ new Map();
        this._deepWildcards = [];
        this._deepByTerminalTag = /* @__PURE__ */ new Map();
        this._patterns = /* @__PURE__ */ new Set();
        this._sealed = false;
      }
      /**
       * Add an Expression to the set.
       * Duplicate patterns (same pattern string) are silently ignored.
       *
       * @param {import('./Expression.js').default} expression - A pre-constructed Expression instance
       * @returns {this} for chaining
       * @throws {TypeError} if called after seal()
       *
       * @example
       * set.add(new Expression('root.users.user'));
       * set.add(new Expression('..script'));
       */
      add(expression) {
        if (this._sealed) {
          throw new TypeError(
            "ExpressionSet is sealed. Create a new ExpressionSet to add more expressions."
          );
        }
        if (this._patterns.has(expression.pattern)) return this;
        this._patterns.add(expression.pattern);
        if (expression.hasDeepWildcard()) {
          const lastSeg2 = expression.segments[expression.segments.length - 1];
          if (lastSeg2 && lastSeg2.type !== "deep-wildcard" && lastSeg2.tag !== "*") {
            const tag2 = lastSeg2.tag;
            if (!this._deepByTerminalTag.has(tag2)) this._deepByTerminalTag.set(tag2, []);
            this._deepByTerminalTag.get(tag2).push(expression);
          } else {
            this._deepWildcards.push(expression);
          }
          return this;
        }
        const depth = expression.length;
        const lastSeg = expression.segments[expression.segments.length - 1];
        const tag = lastSeg?.tag;
        if (!tag || tag === "*") {
          if (!this._wildcardByDepth.has(depth)) this._wildcardByDepth.set(depth, []);
          this._wildcardByDepth.get(depth).push(expression);
        } else {
          const key = `${depth}:${tag}`;
          if (!this._byDepthAndTag.has(key)) this._byDepthAndTag.set(key, []);
          this._byDepthAndTag.get(key).push(expression);
        }
        return this;
      }
      /**
       * Add multiple expressions at once.
       *
       * @param {import('./Expression.js').default[]} expressions - Array of Expression instances
       * @returns {this} for chaining
       *
       * @example
       * set.addAll([
       *   new Expression('root.users.user'),
       *   new Expression('root.config.setting'),
       * ]);
       */
      addAll(expressions) {
        for (const expr of expressions) this.add(expr);
        return this;
      }
      /**
       * Check whether a pattern string is already present in the set.
       *
       * @param {import('./Expression.js').default} expression
       * @returns {boolean}
       */
      has(expression) {
        return this._patterns.has(expression.pattern);
      }
      /**
       * Number of expressions in the set.
       * @type {number}
       */
      get size() {
        return this._patterns.size;
      }
      /**
       * Seal the set against further modifications.
       * Useful to prevent accidental mutations after config is built.
       * Calling add() or addAll() on a sealed set throws a TypeError.
       *
       * @returns {this}
       */
      seal() {
        this._sealed = true;
        return this;
      }
      /**
       * Whether the set has been sealed.
       * @type {boolean}
       */
      get isSealed() {
        return this._sealed;
      }
      /**
       * Test whether the matcher's current path matches any expression in the set.
       *
       * Evaluation order (cheapest → most expensive):
       *  1. Exact depth + tag bucket  — O(1) lookup, typically 0–2 expressions
       *  2. Depth-only wildcard bucket — O(1) lookup, rare
       *  3. Deep-wildcard list         — always checked, but usually small
       *
       * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
       * @returns {boolean} true if any expression matches the current path
       *
       * @example
       * if (stopNodes.matchesAny(matcher)) {
       *   // handle stop node
       * }
       */
      matchesAny(matcher) {
        return this.findMatch(matcher) !== null;
      }
      /**
      * Find and return the first Expression that matches the matcher's current path.
      *
      * Uses the same evaluation order as matchesAny (cheapest → most expensive):
      *  1. Exact depth + tag bucket
      *  2. Depth-only wildcard bucket
      *  3. Deep-wildcard list
      *
      * @param {import('./Matcher.js').default} matcher - Matcher instance (or readOnly view)
      * @returns {import('./Expression.js').default | null} the first matching Expression, or null
      *
      * @example
      * const expr = stopNodes.findMatch(matcher);
      * if (expr) {
      *   // access expr.config, expr.pattern, etc.
      * }
      */
      findMatch(matcher) {
        const depth = matcher.getDepth();
        const tag = matcher.getCurrentTag();
        const exactKey = `${depth}:${tag}`;
        const exactBucket = this._byDepthAndTag.get(exactKey);
        if (exactBucket) {
          for (let i = 0; i < exactBucket.length; i++) {
            if (matcher.matches(exactBucket[i])) return exactBucket[i];
          }
        }
        const wildcardBucket = this._wildcardByDepth.get(depth);
        if (wildcardBucket) {
          for (let i = 0; i < wildcardBucket.length; i++) {
            if (matcher.matches(wildcardBucket[i])) return wildcardBucket[i];
          }
        }
        const deepBucket = this._deepByTerminalTag.get(tag);
        if (deepBucket) {
          for (let i = 0; i < deepBucket.length; i++) {
            if (matcher.matches(deepBucket[i])) return deepBucket[i];
          }
        }
        for (let i = 0; i < this._deepWildcards.length; i++) {
          if (matcher.matches(this._deepWildcards[i])) return this._deepWildcards[i];
        }
        return null;
      }
    };
  }
});

// tools/Content Harvester/node_modules/path-expression-matcher/src/Matcher.js
var MatcherView, Matcher;
var init_Matcher = __esm({
  "tools/Content Harvester/node_modules/path-expression-matcher/src/Matcher.js"() {
    MatcherView = class {
      /**
       * @param {Matcher} matcher - The parent Matcher instance to read from.
       */
      constructor(matcher) {
        this._matcher = matcher;
      }
      /**
       * Get the path separator used by the parent matcher.
       * @returns {string}
       */
      get separator() {
        return this._matcher.separator;
      }
      /**
       * Get current tag name.
       * @returns {string|undefined}
       */
      getCurrentTag() {
        const path = this._matcher.path;
        return path.length > 0 ? path[path.length - 1].tag : void 0;
      }
      /**
       * Get current namespace.
       * @returns {string|undefined}
       */
      getCurrentNamespace() {
        const path = this._matcher.path;
        return path.length > 0 ? path[path.length - 1].namespace : void 0;
      }
      /**
       * Get current node's attribute value.
       * @param {string} attrName
       * @returns {*}
       */
      getAttrValue(attrName) {
        const path = this._matcher.path;
        if (path.length === 0) return void 0;
        return path[path.length - 1].values?.[attrName];
      }
      /**
       * Check if current node has an attribute.
       * @param {string} attrName
       * @returns {boolean}
       */
      hasAttr(attrName) {
        const path = this._matcher.path;
        if (path.length === 0) return false;
        const current = path[path.length - 1];
        return current.values !== void 0 && attrName in current.values;
      }
      /**
       * Get the value of a "kept" attribute from the nearest ancestor (or
       * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
       * @param {string} attrName
       * @returns {*}
       */
      getAnyParentAttr(attrName) {
        return this._matcher.getAnyParentAttr(attrName);
      }
      /**
       * Check whether any ancestor (or the current node) kept the given
       * attribute via `push(tag, attrs, ns, { keep: [...] })`.
       * @param {string} attrName
       * @returns {boolean}
       */
      hasAnyParentAttr(attrName) {
        return this._matcher.hasAnyParentAttr(attrName);
      }
      /**
       * Get current node's sibling position (child index in parent).
       * @returns {number}
       */
      getPosition() {
        const path = this._matcher.path;
        if (path.length === 0) return -1;
        return path[path.length - 1].position ?? 0;
      }
      /**
       * Get current node's repeat counter (occurrence count of this tag name).
       * @returns {number}
       */
      getCounter() {
        const path = this._matcher.path;
        if (path.length === 0) return -1;
        return path[path.length - 1].counter ?? 0;
      }
      /**
       * Get current node's sibling index (alias for getPosition).
       * @returns {number}
       * @deprecated Use getPosition() or getCounter() instead
       */
      getIndex() {
        return this.getPosition();
      }
      /**
       * Get current path depth.
       * @returns {number}
       */
      getDepth() {
        return this._matcher.path.length;
      }
      /**
       * Get path as string.
       * @param {string} [separator] - Optional separator (uses default if not provided)
       * @param {boolean} [includeNamespace=true]
       * @returns {string}
       */
      toString(separator, includeNamespace = true) {
        return this._matcher.toString(separator, includeNamespace);
      }
      /**
       * Get path as array of tag names.
       * @returns {string[]}
       */
      toArray() {
        return this._matcher.path.map((n) => n.tag);
      }
      /**
       * Match current path against an Expression.
       * @param {Expression} expression
       * @returns {boolean}
       */
      matches(expression) {
        return this._matcher.matches(expression);
      }
      /**
       * Match any expression in the given set against the current path.
       * @param {ExpressionSet} exprSet
       * @returns {boolean}
       */
      matchesAny(exprSet) {
        return exprSet.matchesAny(this._matcher);
      }
    };
    Matcher = class {
      /**
       * Create a new Matcher.
       * @param {Object} [options={}]
       * @param {string} [options.separator='.'] - Default path separator
       */
      constructor(options = {}) {
        this.separator = options.separator || ".";
        this.path = [];
        this.siblingStacks = [];
        this._pathStringCache = null;
        this._view = new MatcherView(this);
        this._keptAttrs = [];
      }
      /**
       * Push a new tag onto the path.
       * @param {string} tagName
       * @param {Object|null} [attrValues=null]
       * @param {string|null} [namespace=null]
       * @param {Object|null} [options=null]
       * @param {string[]} [options.keep] - Names of attributes (from attrValues)
       */
      push(tagName, attrValues = null, namespace = null, options = null) {
        this._pathStringCache = null;
        if (this.path.length > 0) {
          this.path[this.path.length - 1].values = void 0;
        }
        const currentLevel = this.path.length;
        let level = this.siblingStacks[currentLevel];
        if (!level) {
          level = { counts: /* @__PURE__ */ new Map(), total: 0 };
          this.siblingStacks[currentLevel] = level;
        }
        const siblingKey = namespace ? `${namespace}:${tagName}` : tagName;
        const counter = level.counts.get(siblingKey) || 0;
        const position = level.total;
        level.counts.set(siblingKey, counter + 1);
        level.total++;
        const node = {
          tag: tagName,
          position,
          counter
        };
        if (namespace !== null && namespace !== void 0) {
          node.namespace = namespace;
        }
        if (attrValues !== null && attrValues !== void 0) {
          node.values = attrValues;
        }
        this.path.push(node);
        const depth = this.path.length;
        const keep = options !== null ? options.keep : null;
        if (keep !== null && keep !== void 0 && keep.length > 0 && attrValues) {
          for (let i = 0; i < keep.length; i++) {
            const name = keep[i];
            if (attrValues[name] !== void 0) {
              this._keptAttrs.push({ depth, name, value: attrValues[name] });
            }
          }
        }
      }
      /**
       * Pop the last tag from the path.
       * @returns {Object|undefined} The popped node
       */
      pop() {
        if (this.path.length === 0) return void 0;
        this._pathStringCache = null;
        const node = this.path.pop();
        if (this.siblingStacks.length > this.path.length + 1) {
          this.siblingStacks.length = this.path.length + 1;
        }
        const poppedDepth = this.path.length + 1;
        while (this._keptAttrs.length > 0 && this._keptAttrs[this._keptAttrs.length - 1].depth >= poppedDepth) {
          this._keptAttrs.pop();
        }
        return node;
      }
      /**
       * Update current node's attribute values.
       * Useful when attributes are parsed after push.
       * @param {Object} attrValues
       */
      updateCurrent(attrValues) {
        if (this.path.length > 0) {
          const current = this.path[this.path.length - 1];
          if (attrValues !== null && attrValues !== void 0) {
            current.values = attrValues;
          }
        }
      }
      /**
       * Get current tag name.
       * @returns {string|undefined}
       */
      getCurrentTag() {
        return this.path.length > 0 ? this.path[this.path.length - 1].tag : void 0;
      }
      /**
       * Get current namespace.
       * @returns {string|undefined}
       */
      getCurrentNamespace() {
        return this.path.length > 0 ? this.path[this.path.length - 1].namespace : void 0;
      }
      /**
       * Get current node's attribute value.
       * @param {string} attrName
       * @returns {*}
       */
      getAttrValue(attrName) {
        if (this.path.length === 0) return void 0;
        return this.path[this.path.length - 1].values?.[attrName];
      }
      /**
       * Check if current node has an attribute.
       * @param {string} attrName
       * @returns {boolean}
       */
      hasAttr(attrName) {
        if (this.path.length === 0) return false;
        const current = this.path[this.path.length - 1];
        return current.values !== void 0 && attrName in current.values;
      }
      /**
       * Get the value of a "kept" attribute from the nearest ancestor (or
       * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
       * Unlike getAttrValue(), this works regardless of how deep the path has
       * gone since the attribute was pushed — but only for attribute names that
       * were explicitly marked with `keep` at push time. Cost is proportional to
       * the number of currently-kept attributes (typically 0-3), not path depth.
       * @param {string} attrName
       * @returns {*} the value, or undefined if no ancestor kept this attribute
       */
      getAnyParentAttr(attrName) {
        const kept = this._keptAttrs;
        for (let i = kept.length - 1; i >= 0; i--) {
          if (kept[i].name === attrName) return kept[i].value;
        }
        return void 0;
      }
      /**
       * Check whether any ancestor (or the current node) kept the given
       * attribute via `push(tag, attrs, ns, { keep: [...] })`.
       * @param {string} attrName
       * @returns {boolean}
       */
      hasAnyParentAttr(attrName) {
        const kept = this._keptAttrs;
        for (let i = kept.length - 1; i >= 0; i--) {
          if (kept[i].name === attrName) return true;
        }
        return false;
      }
      /**
       * Get current node's sibling position (child index in parent).
       * @returns {number}
       */
      getPosition() {
        if (this.path.length === 0) return -1;
        return this.path[this.path.length - 1].position ?? 0;
      }
      /**
       * Get current node's repeat counter (occurrence count of this tag name).
       * @returns {number}
       */
      getCounter() {
        if (this.path.length === 0) return -1;
        return this.path[this.path.length - 1].counter ?? 0;
      }
      /**
       * Get current node's sibling index (alias for getPosition).
       * @returns {number}
       * @deprecated Use getPosition() or getCounter() instead
       */
      getIndex() {
        return this.getPosition();
      }
      /**
       * Get current path depth.
       * @returns {number}
       */
      getDepth() {
        return this.path.length;
      }
      /**
       * Get path as string.
       * @param {string} [separator] - Optional separator (uses default if not provided)
       * @param {boolean} [includeNamespace=true]
       * @returns {string}
       */
      toString(separator, includeNamespace = true) {
        const sep4 = separator || this.separator;
        const isDefault = sep4 === this.separator && includeNamespace === true;
        if (isDefault) {
          if (this._pathStringCache !== null) {
            return this._pathStringCache;
          }
          const result = this.path.map(
            (n) => n.namespace ? `${n.namespace}:${n.tag}` : n.tag
          ).join(sep4);
          this._pathStringCache = result;
          return result;
        }
        return this.path.map(
          (n) => includeNamespace && n.namespace ? `${n.namespace}:${n.tag}` : n.tag
        ).join(sep4);
      }
      /**
       * Get path as array of tag names.
       * @returns {string[]}
       */
      toArray() {
        return this.path.map((n) => n.tag);
      }
      /**
       * Reset the path to empty.
       */
      reset() {
        this._pathStringCache = null;
        this.path = [];
        this.siblingStacks = [];
        this._keptAttrs = [];
      }
      /**
       * Match current path against an Expression.
       * @param {Expression} expression
       * @returns {boolean}
       */
      matches(expression) {
        const segments = expression.segments;
        if (segments.length === 0) {
          return false;
        }
        if (expression.hasDeepWildcard()) {
          return this._matchWithDeepWildcard(segments);
        }
        return this._matchSimple(segments);
      }
      /**
       * @private
       */
      _matchSimple(segments) {
        if (this.path.length !== segments.length) {
          return false;
        }
        for (let i = 0; i < segments.length; i++) {
          if (!this._matchSegment(segments[i], this.path[i], i === this.path.length - 1)) {
            return false;
          }
        }
        return true;
      }
      /**
       * @private
       */
      _matchWithDeepWildcard(segments) {
        let pathIdx = this.path.length - 1;
        let segIdx = segments.length - 1;
        while (segIdx >= 0 && pathIdx >= 0) {
          const segment = segments[segIdx];
          if (segment.type === "deep-wildcard") {
            segIdx--;
            if (segIdx < 0) {
              return true;
            }
            const nextSeg = segments[segIdx];
            let found = false;
            for (let i = pathIdx; i >= 0; i--) {
              if (this._matchSegment(nextSeg, this.path[i], i === this.path.length - 1)) {
                pathIdx = i - 1;
                segIdx--;
                found = true;
                break;
              }
            }
            if (!found) {
              return false;
            }
          } else {
            if (!this._matchSegment(segment, this.path[pathIdx], pathIdx === this.path.length - 1)) {
              return false;
            }
            pathIdx--;
            segIdx--;
          }
        }
        return segIdx < 0;
      }
      /**
       * @private
       */
      _matchSegment(segment, node, isCurrentNode) {
        if (segment.tag !== "*" && segment.tag !== node.tag) {
          return false;
        }
        if (segment.namespace !== void 0) {
          if (segment.namespace !== "*" && segment.namespace !== node.namespace) {
            return false;
          }
        }
        if (segment.attrName !== void 0) {
          if (!isCurrentNode) {
            return false;
          }
          if (!node.values || !(segment.attrName in node.values)) {
            return false;
          }
          if (segment.attrValue !== void 0) {
            if (String(node.values[segment.attrName]) !== String(segment.attrValue)) {
              return false;
            }
          }
        }
        if (segment.position !== void 0) {
          if (!isCurrentNode) {
            return false;
          }
          const counter = node.counter ?? 0;
          if (segment.position === "first" && counter !== 0) {
            return false;
          } else if (segment.position === "odd" && counter % 2 !== 1) {
            return false;
          } else if (segment.position === "even" && counter % 2 !== 0) {
            return false;
          } else if (segment.position === "nth" && counter !== segment.positionValue) {
            return false;
          }
        }
        return true;
      }
      /**
       * Match any expression in the given set against the current path.
       * @param {ExpressionSet} exprSet
       * @returns {boolean}
       */
      matchesAny(exprSet) {
        return exprSet.matchesAny(this);
      }
      /**
       * Create a snapshot of current state.
       * @returns {Object}
       */
      snapshot() {
        return {
          path: this.path.map((node) => ({ ...node })),
          siblingStacks: this.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level),
          keptAttrs: this._keptAttrs.map((entry) => ({ ...entry }))
        };
      }
      /**
       * Restore state from snapshot.
       * @param {Object} snapshot
       */
      restore(snapshot) {
        this._pathStringCache = null;
        this.path = snapshot.path.map((node) => ({ ...node }));
        this.siblingStacks = snapshot.siblingStacks.map((level) => level ? { counts: new Map(level.counts), total: level.total } : level);
        this._keptAttrs = (snapshot.keptAttrs || []).map((entry) => ({ ...entry }));
      }
      /**
       * Return the read-only {@link MatcherView} for this matcher.
       *
       * The same instance is returned on every call — no allocation occurs.
       * It always reflects the current parser state and is safe to pass to
       * user callbacks without risk of accidental mutation.
       *
       * @returns {MatcherView}
       *
       * @example
       * const view = matcher.readOnly();
       * // pass view to callbacks — it stays in sync automatically
       * view.matches(expr);       // ✓
       * view.getCurrentTag();     // ✓
       * // view.push(...)         // ✗ method does not exist — caught by TypeScript
       */
      readOnly() {
        return this._view;
      }
    };
  }
});

// tools/Content Harvester/node_modules/path-expression-matcher/src/index.js
var init_src3 = __esm({
  "tools/Content Harvester/node_modules/path-expression-matcher/src/index.js"() {
    init_Expression();
    init_Matcher();
    init_ExpressionSet();
  }
});

// tools/Content Harvester/node_modules/is-unsafe/src/contexts/html.js
var HTML_PATTERNS, html_default;
var init_html = __esm({
  "tools/Content Harvester/node_modules/is-unsafe/src/contexts/html.js"() {
    HTML_PATTERNS = [
      {
        id: "html-script-open",
        description: "<script opening tag",
        pattern: /<script[\s>/]/i
      },
      {
        id: "html-script-close",
        description: "</script closing tag",
        pattern: /<\/script[\s>]/i
      },
      {
        id: "html-javascript-protocol",
        description: "javascript: URI scheme (with optional whitespace/encoding)",
        // Handles j&#x61;vascript:, j\u0061vascript:, and whitespace variants
        pattern: /j[\t\n\r ]*a[\t\n\r ]*v[\t\n\r ]*a[\t\n\r ]*s[\t\n\r ]*c[\t\n\r ]*r[\t\n\r ]*i[\t\n\r ]*p[\t\n\r ]*t[\t\n\r ]*:/i
      },
      {
        id: "html-vbscript-protocol",
        description: "vbscript: URI scheme",
        pattern: /vbscript[\t\n\r ]*:/i
      },
      {
        id: "html-data-html",
        description: "data:text/html URI — can execute scripts in browsers",
        pattern: /data[\t\n\r ]*:[\t\n\r ]*text\/html/i
      },
      {
        id: "html-data-xhtml",
        description: "data:application/xhtml+xml URI",
        pattern: /data[\t\n\r ]*:[\t\n\r ]*application\/xhtml/i
      },
      {
        id: "html-data-svg",
        description: "data:image/svg+xml URI — can execute scripts",
        pattern: /data[\t\n\r ]*:[\t\n\r ]*image\/svg\+xml/i
      },
      {
        id: "html-inline-event-handler",
        description: "Inline event handler attributes: onclick=, onerror=, onload=, etc.",
        // \bon ensures we match a word boundary so "phonetic=" is not caught
        pattern: /\bon\w{1,30}\s*=/i
      },
      {
        id: "html-entity-obfuscated-script",
        description: "HTML-entity-encoded <script (e.g. &#x3C;script or &lt;script)",
        // Entities include optional trailing semicolon: &#x3C; or &#x3C (both valid in HTML5)
        pattern: /(?:&#x0*3[Cc];?|&#0*60;?|&lt;)\s*script/i
      },
      {
        id: "html-entity-obfuscated-javascript",
        description: 'HTML-entity-encoded javascript: (partial — catches common &#106; or &#x6a; for "j")',
        pattern: /(?:&#x0*6[Aa];?|&#0*106;?)\s*(?:&#x0*61;?|a)[\s\S]{0,80}script\s*:/i
      },
      {
        id: "html-style-expression",
        description: "CSS expression() — IE-era code execution in style attributes",
        pattern: /style[\s\S]{0,20}expression\s*\(/i
      },
      {
        id: "html-object-embed",
        description: "<object or <embed tags that can load active content",
        pattern: /<(?:object|embed)[\s>/]/i
      },
      {
        id: "html-base-tag",
        description: "<base href= — can hijack all relative URLs on a page",
        pattern: /<base[\s>]/i
      },
      {
        id: "html-meta-refresh",
        description: '<meta http-equiv="refresh" — can redirect users',
        pattern: /<meta[\s\S]{0,40}http-equiv[\s\S]{0,20}refresh/i
      },
      {
        id: "html-srcdoc",
        description: "srcdoc= attribute on iframes — embeds HTML that can run scripts",
        pattern: /srcdoc\s*=/i
      },
      {
        id: "html-iframe",
        description: "<iframe tag",
        pattern: /<iframe[\s>/]/i
      },
      {
        id: "html-form",
        description: "<form tag — can be used for phishing / credential harvesting injection",
        pattern: /<form[\s>/]/i
      }
    ];
    html_default = HTML_PATTERNS;
  }
});

// tools/Content Harvester/node_modules/is-unsafe/src/contexts/xml.js
var XML_PATTERNS, xml_default;
var init_xml = __esm({
  "tools/Content Harvester/node_modules/is-unsafe/src/contexts/xml.js"() {
    XML_PATTERNS = [
      {
        id: "xml-cdata-injection",
        description: "CDATA section injection: <![CDATA[ breaks out of text node context",
        pattern: /<!\[CDATA\[/i
      },
      {
        id: "xml-cdata-close",
        description: "CDATA close sequence: ]]> can terminate an enclosing CDATA section",
        pattern: /\]\]>/
      },
      {
        id: "xml-processing-instruction",
        description: "XML processing instruction: <?xml-stylesheet or <?php etc.",
        pattern: /<\?(?:xml[\- ]|php|asp)/i
      },
      {
        id: "xml-doctype-injection",
        description: "DOCTYPE declaration embedded in content — can define entities",
        // Match <!DOCTYPE followed by end-of-string, whitespace, or [ (internal subset)
        pattern: /<!DOCTYPE(?:[\s[]|$)/i
      },
      {
        id: "xml-entity-system",
        description: "SYSTEM keyword — used in external entity declarations (XXE)",
        pattern: /\bSYSTEM\s+["']/i
      },
      {
        id: "xml-entity-public",
        description: "PUBLIC keyword — used in external entity declarations (XXE)",
        pattern: /\bPUBLIC\s+["']/i
      },
      {
        id: "xml-entity-declaration",
        description: "<!ENTITY declaration — defines entities, potential XXE or entity expansion",
        pattern: /<!ENTITY[\s%]/i
      },
      {
        id: "xml-billion-laughs",
        description: "Entity reference chaining / billion laughs: repeated &eX; style references",
        // Heuristic: 3+ consecutive entity refs suggests expansion attack
        pattern: /(?:&\w{1,20};){3,}/
      },
      {
        id: "xml-namespace-confusion",
        description: "xmlns: attribute injection — can redefine namespaces to confuse parsers",
        pattern: /\bxmlns\s*(?::\w{1,40})?\s*=/i
      },
      {
        id: "xml-comment-injection",
        description: "<!-- comment injection — can hide content from some parsers",
        pattern: /<!--/
      },
      {
        id: "xml-comment-close",
        description: "--> closes an enclosing XML comment",
        pattern: /-->/
      },
      {
        id: "xml-pi-close",
        description: "?> closes an enclosing processing instruction",
        pattern: /\?>/
      }
    ];
    xml_default = XML_PATTERNS;
  }
});

// tools/Content Harvester/node_modules/is-unsafe/src/contexts/svg.js
var SVG_PATTERNS, svg_default;
var init_svg = __esm({
  "tools/Content Harvester/node_modules/is-unsafe/src/contexts/svg.js"() {
    SVG_PATTERNS = [
      {
        id: "svg-script-element",
        description: "<script element inside SVG executes JavaScript",
        pattern: /<script[\s>/]/i
      },
      {
        id: "svg-xlink-href-javascript",
        description: "xlink:href with javascript: — classic SVG XSS via <a> or <use>",
        pattern: /xlink\s*:\s*href\s*=\s*["']?\s*javascript\s*:/i
      },
      {
        id: "svg-href-javascript",
        description: "href= with javascript: in SVG context (<a>, <animate>, etc.)",
        pattern: /href\s*=\s*["']?\s*javascript\s*:/i
      },
      {
        id: "svg-foreignobject",
        description: "<foreignObject embeds HTML inside SVG — can execute scripts",
        pattern: /<foreignObject[\s>/]/i
      },
      {
        id: "svg-use-external",
        description: "<use xlink:href or href pointing to external resource (non-fragment URL)",
        // Match <use with href= where the value starts with a non-# character (external URL)
        // [\"'][^#] catches quoted values not starting with #; [^\"'#\s>] catches unquoted
        pattern: /<use[\s\S]{0,60}(?:xlink\s*:\s*)?href\s*=\s*(?:["'][^#]|[^"'#\s>])/i
      },
      {
        id: "svg-animate-href",
        description: '<animate attributeName="href" — can dynamically change href to javascript:',
        pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*href["']/i
      },
      {
        id: "svg-animate-xlinkhref",
        description: '<animate attributeName="xlink:href"',
        pattern: /<animate[\s\S]{0,80}attributeName\s*=\s*["'][\s]*xlink\s*:\s*href["']/i
      },
      {
        id: "svg-set-javascript",
        description: '<set to="javascript:..." — sets an attribute to a javascript: URI',
        pattern: /<set[\s\S]{0,80}to\s*=\s*["']?\s*javascript\s*:/i
      },
      {
        id: "svg-event-handler",
        description: "SVG-specific event handler attributes: onload=, onerror=, onactivate=, etc.",
        pattern: /\bon(?:load|error|activate|begin|end|repeat|focus|blur|click|mouse\w{1,20}|key\w{1,20})\s*=/i
      },
      {
        id: "svg-handler-generic",
        description: "Generic on* handler catch-all for SVG attributes",
        pattern: /\bon\w{1,30}\s*=/i
      },
      {
        id: "svg-filter-feimage",
        description: "<feImage href= — filter primitive that can load external resources",
        pattern: /<feImage[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=/i
      },
      {
        id: "svg-image-external",
        description: "<image xlink:href with http/https or javascript protocol",
        pattern: /<image[\s\S]{0,80}(?:xlink\s*:\s*)?href\s*=\s*["']?\s*(?:https?|javascript)\s*:/i
      },
      {
        id: "svg-style-javascript",
        description: "style= attribute containing javascript: (e.g. background:url(javascript:...))",
        pattern: /style\s*=[\s\S]{0,60}javascript\s*:/i
      }
    ];
    svg_default = SVG_PATTERNS;
  }
});

// tools/Content Harvester/node_modules/is-unsafe/src/contexts/sql.js
var SQL_PATTERNS, sql_default;
var init_sql = __esm({
  "tools/Content Harvester/node_modules/is-unsafe/src/contexts/sql.js"() {
    SQL_PATTERNS = [
      {
        id: "sql-block-comment-open",
        description: "SQL block comment open: /* ... */ — unusual in legitimate user text",
        pattern: /\/\*/
      },
      {
        id: "sql-union-select",
        description: "UNION SELECT — most common SQL injection aggregation attack",
        pattern: /\bUNION\s{1,20}(?:ALL\s{1,20})?SELECT\b/i
      },
      {
        id: "sql-drop-table",
        description: "DROP TABLE — destructive DDL injection",
        pattern: /\bDROP\s{1,20}TABLE\b/i
      },
      {
        id: "sql-drop-database",
        description: "DROP DATABASE — destructive DDL injection",
        pattern: /\bDROP\s{1,20}DATABASE\b/i
      },
      {
        id: "sql-insert-into",
        description: "INSERT INTO — data injection",
        pattern: /\bINSERT\s{1,20}INTO\b/i
      },
      {
        id: "sql-delete-from",
        description: "DELETE FROM — data deletion injection",
        pattern: /\bDELETE\s{1,20}FROM\b/i
      },
      {
        id: "sql-update-set",
        description: "UPDATE ... SET — data modification injection",
        // Allows arbitrary content between UPDATE and SET (table name, alias, etc.)
        pattern: /\bUPDATE\b[\s\S]{1,60}\bSET\b/i
      },
      {
        id: "sql-exec-xp",
        description: "EXEC xp_ — MSSQL extended stored procedure execution",
        pattern: /\bEXEC(?:UTE)?\s{1,20}xp_/i
      },
      {
        id: "sql-tautology-string",
        description: `Classic string tautology: ' OR '1'='1 or " OR "1"="1"`,
        // Last quote is optional — injection may truncate it: ' OR '1'='1--
        pattern: /'\s{0,10}OR\s{0,10}'[^']{0,20}'\s*=\s*'[^']{0,20}/i
      },
      {
        id: "sql-tautology-numeric",
        description: "Numeric tautology: OR 1=1",
        pattern: /\bOR\s{1,10}1\s*=\s*1\b/i
      },
      {
        id: "sql-always-true-zero",
        description: "Numeric tautology: OR 0=0",
        pattern: /\bOR\s{1,10}0\s*=\s*0\b/i
      },
      {
        id: "sql-sleep-benchmark",
        description: "Time-based blind injection: SLEEP() or BENCHMARK()",
        pattern: /\b(?:SLEEP|BENCHMARK)\s*\(/i
      },
      {
        id: "sql-waitfor-delay",
        description: "MSSQL time-based blind injection: WAITFOR DELAY",
        pattern: /\bWAITFOR\s{1,20}DELAY\b/i
      },
      {
        id: "sql-char-function",
        description: "CHAR() function — used to obfuscate injected strings",
        pattern: /\bCHAR\s*\(\s*\d{1,3}/i
      },
      {
        id: "sql-information-schema",
        description: "INFORMATION_SCHEMA — reconnaissance query for table/column enumeration",
        pattern: /\bINFORMATION_SCHEMA\b/i
      }
    ];
    sql_default = SQL_PATTERNS;
  }
});

// tools/Content Harvester/node_modules/is-unsafe/src/contexts/shell.js
var SHELL_PATTERNS, shell_default;
var init_shell = __esm({
  "tools/Content Harvester/node_modules/is-unsafe/src/contexts/shell.js"() {
    SHELL_PATTERNS = [
      {
        id: "shell-path-traversal-unix",
        description: "Unix path traversal: ../  — climbing the directory tree",
        pattern: /\.\.\//
      },
      {
        id: "shell-path-traversal-windows",
        description: "Windows path traversal: ..\\ — climbing the directory tree",
        pattern: /\.\.\\/
      },
      {
        id: "shell-path-traversal-encoded",
        description: "URL-encoded path traversal: %2e%2e or %2f variants",
        pattern: /%2e%2e|%2f\.\.|\.\.%2f/i
      },
      {
        id: "shell-null-byte",
        description: "Null byte injection: \\x00 or %00 — truncates strings in C-backed functions",
        pattern: /\x00|%00/
      },
      {
        id: "shell-semicolon",
        description: "Semicolon command separator: cmd1; cmd2",
        pattern: /;/
      },
      {
        id: "shell-pipe",
        description: "Pipe operator: cmd1 | cmd2",
        pattern: /\|/
      },
      {
        id: "shell-and-operator",
        description: "AND operator: cmd1 && cmd2",
        pattern: /&&/
      },
      {
        id: "shell-or-operator",
        description: "OR operator: cmd1 || cmd2",
        pattern: /\|\|/
      },
      {
        id: "shell-backtick",
        description: "Backtick command substitution: `cmd`",
        pattern: /`/
      },
      {
        id: "shell-dollar-paren",
        description: "Dollar-paren command substitution: $(cmd)",
        pattern: /\$\(/
      },
      {
        id: "shell-dollar-brace",
        description: "Dollar-brace variable expansion: ${var} — can be abused for injection",
        pattern: /\$\{/
      },
      {
        id: "shell-redirect-out",
        description: "Output redirection: cmd > file or cmd >> file",
        pattern: />{1,2}/
      },
      {
        id: "shell-redirect-in",
        description: "Input redirection: cmd < file",
        pattern: /</
      },
      {
        id: "shell-newline-injection",
        description: "Newline injection: \\n or \\r — can inject new shell commands",
        pattern: /[\n\r]/
      },
      {
        id: "shell-glob-star",
        description: "Glob expansion: * or ? — can expand to unintended files",
        // Only flag when combined with path separators to reduce false positives
        pattern: /[/\\][*?]/
      },
      {
        id: "shell-absolute-root",
        description: "Absolute root path injection: string starting with / or \\ (Windows UNC)",
        pattern: /^(?:\/|\\\\)/
      },
      {
        id: "shell-windows-drive",
        description: "Windows drive letter path injection: C:\\ or D:/",
        pattern: /^[a-zA-Z]:[/\\]/
      },
      {
        id: "shell-curl-wget",
        description: "curl/wget with URL or flags — can exfiltrate data or download payloads",
        // Require a URL scheme (http/https/ftp) or a flag (-) to reduce false positives
        // "curl is a tool" won't match; "curl http://..." or "curl -s ..." will
        pattern: /\b(?:curl|wget)\s+(?:https?:\/\/|ftp:\/\/|-)/i
      }
    ];
    shell_default = SHELL_PATTERNS;
  }
});

// tools/Content Harvester/node_modules/is-unsafe/src/contexts/redos.js
var REDOS_PATTERNS, redos_default;
var init_redos = __esm({
  "tools/Content Harvester/node_modules/is-unsafe/src/contexts/redos.js"() {
    REDOS_PATTERNS = [
      {
        id: "redos-nested-quantifier-plus",
        description: "Nested + quantifier inside a group with outer quantifier: (a+)+, (.+b)*, etc.",
        // Matches any group containing a + quantifier, with an outer * or + — catches (a+)+, (.+b)*, etc.
        pattern: /\([^)]*\+[^)]*\)[+*]/
      },
      {
        id: "redos-nested-quantifier-star",
        description: "Nested * quantifier: (a*)* or (a*)+ — catastrophic backtracking",
        pattern: /\([^)]*\*[^)]*\)[*+]/
      },
      {
        id: "redos-nested-groups",
        description: "Doubly nested quantified groups: ((a+)+) — guaranteed catastrophic",
        pattern: /\(\([^)]{0,40}\)[+*]\)[+*]/
      },
      {
        id: "redos-alternation-overlap",
        description: "Overlapping alternation under quantifier: (a|a)+ — ambiguous NFA paths",
        // Detect repeated identical alternatives under a quantifier
        pattern: /\(([^|()]{1,20})\|(?:\1)(?:\|[^|()]{1,20}){0,5}\)[+*?]{1,2}/
      },
      {
        id: "redos-star-plus-concat",
        description: "(x*x)+ pattern — triggers super-linear backtracking",
        pattern: /\([^)]{0,10}\*[^)]{0,10}\)[+*]/
      },
      {
        id: "redos-dot-star-greedy",
        description: "(.*){n,} or (.+){n,} — repeated greedy dot quantifiers",
        pattern: /\(\.[*+]\)\{?\d/
      },
      {
        id: "redos-large-repetition",
        description: "Very large fixed or range repetition count {1000,} or {1000,n} — denial of service via backtracking",
        // Matches { followed by 4+ digits (≥1000), then optional ,digits }
        pattern: /\{\d{4,}(?:,\d*)?\}/
      },
      {
        id: "redos-catastrophic-alternation",
        description: "Long alternation with many similar branches — polynomial backtracking risk",
        // Heuristic: 10+ pipe-separated alternatives in a single group
        pattern: /\([^)]{0,200}(?:\|[^|)]{0,50}){9,}\)/
      }
    ];
    redos_default = REDOS_PATTERNS;
  }
});

// tools/Content Harvester/node_modules/is-unsafe/src/contexts/nosql.js
var sep2, NOSQL_PATTERNS, nosql_default;
var init_nosql = __esm({
  "tools/Content Harvester/node_modules/is-unsafe/src/contexts/nosql.js"() {
    sep2 = `["'\\s]*:`;
    NOSQL_PATTERNS = [
      // ─── MongoDB $ operator injection ────────────────────────────────────────
      {
        id: "nosql-where-operator",
        description: "$where — executes arbitrary JavaScript server-side in MongoDB",
        pattern: new RegExp(`\\$where${sep2}`, "i")
      },
      {
        id: "nosql-ne-operator",
        description: '$ne — "not equal" operator used to bypass equality checks',
        pattern: new RegExp(`\\$ne${sep2}`, "i")
      },
      {
        id: "nosql-gt-operator",
        description: '$gt — "greater than" used to bypass password/value checks',
        pattern: new RegExp(`\\$gte?${sep2}`, "i")
      },
      {
        id: "nosql-lt-operator",
        description: '$lt / $lte — "less than" bypass variants',
        pattern: new RegExp(`\\$lte?${sep2}`, "i")
      },
      {
        id: "nosql-regex-operator",
        description: "$regex — can be used to extract data character by character (blind injection)",
        pattern: new RegExp(`\\$regex${sep2}`, "i")
      },
      {
        id: "nosql-or-operator",
        description: "$or — logical OR; used to create always-true conditions",
        pattern: new RegExp(`\\$or${sep2}\\s*\\[`, "i")
      },
      {
        id: "nosql-and-operator",
        description: "$and — logical AND operator injection",
        pattern: new RegExp(`\\$and${sep2}\\s*\\[`, "i")
      },
      {
        id: "nosql-nor-operator",
        description: "$nor — logical NOR operator injection",
        pattern: new RegExp(`\\$nor${sep2}\\s*\\[`, "i")
      },
      {
        id: "nosql-exists-operator",
        description: "$exists — can enumerate fields to determine schema",
        pattern: new RegExp(`\\$exists${sep2}`, "i")
      },
      {
        id: "nosql-in-operator",
        description: "$in — matches any value in a list; can enumerate values",
        pattern: new RegExp(`\\$in${sep2}\\s*\\[`, "i")
      },
      {
        id: "nosql-expr-operator",
        description: "$expr — allows aggregation expressions in queries (MongoDB 3.6+)",
        pattern: new RegExp(`\\$expr${sep2}`, "i")
      },
      {
        id: "nosql-function-operator",
        description: "$function — executes arbitrary JavaScript in MongoDB 4.4+",
        pattern: new RegExp(`\\$function${sep2}`, "i")
      },
      {
        id: "nosql-accumulator-operator",
        description: "$accumulator — custom aggregation with arbitrary JS execution",
        pattern: new RegExp(`\\$accumulator${sep2}`, "i")
      },
      // ─── Prototype pollution ─────────────────────────────────────────────────
      {
        id: "nosql-proto-pollution",
        description: "__proto__ — prototype pollution via object key injection",
        pattern: /__proto__/
      },
      {
        id: "nosql-constructor-prototype",
        description: "constructor.prototype — alternative prototype pollution vector (dot notation or JSON key)",
        // Matches dot-notation (obj.constructor.prototype) and JSON key adjacency
        // ("constructor": {"prototype": ...})
        pattern: /constructor[\s"':.,{\[]*prototype/i
      },
      {
        id: "nosql-proto-bracket",
        description: '["__proto__"] — bracket-notation prototype pollution',
        pattern: /\[["']__proto__["']\]/
      }
    ];
    nosql_default = NOSQL_PATTERNS;
  }
});

// tools/Content Harvester/node_modules/is-unsafe/src/contexts/log.js
var LOG_PATTERNS, log_default;
var init_log = __esm({
  "tools/Content Harvester/node_modules/is-unsafe/src/contexts/log.js"() {
    LOG_PATTERNS = [
      // ─── CRLF / newline injection ─────────────────────────────────────────────
      {
        id: "log-crlf-injection",
        description: "CRLF injection: literal \\r or \\n embeds fake log lines",
        pattern: /[\r\n]/
      },
      {
        id: "log-url-encoded-crlf",
        description: "URL-encoded CRLF: %0d, %0a, %0D, %0A — decoded by some log parsers",
        pattern: /%0[dDaA]/
      },
      {
        id: "log-unicode-newline",
        description: "Unicode newline variants: U+2028 (line separator), U+2029 (paragraph separator)",
        pattern: /[\u2028\u2029]/
      },
      // ─── Log4Shell / JNDI injection (CVE-2021-44228) ─────────────────────────
      {
        id: "log-log4shell-jndi",
        description: "Log4Shell: ${jndi:...} triggers remote code execution in Apache Log4j",
        pattern: /\$\{jndi\s*:/i
      },
      {
        id: "log-log4shell-obfuscated",
        description: "Obfuscated Log4Shell: ${::-j}... lookup-bypass prefix used to evade WAF detection",
        // ${::- is the Log4j lookup-bypass escape sequence; presence alone is suspicious
        pattern: /\$\{::-/
      },
      {
        id: "log-log4j-lookup",
        description: "Log4j lookup syntax: ${env:...}, ${sys:...}, ${ctx:...} — data exfiltration",
        pattern: /\$\{(?:env|sys|ctx|main|map|sd|web|docker|k8s|spring)\s*:/i
      },
      // ─── Server-Side Template Injection (SSTI) in log messages ───────────────
      {
        id: "log-ssti-double-brace",
        description: "SSTI double-brace: {{expression}} — Jinja2, Twig, Handlebars, etc.",
        pattern: /\{\{[\s\S]{0,80}\}\}/
      },
      {
        id: "log-ssti-hash-brace",
        description: "SSTI hash-brace: #{expression} — Thymeleaf, Velocity, Ruby ERB",
        pattern: /#\{[\s\S]{0,80}\}/
      },
      {
        id: "log-ssti-dollar-brace",
        description: "SSTI/EL injection: ${expression with operators or method calls} — JSP EL, Freemarker, SpEL",
        // Require that the ${...} content looks like an expression, not a plain variable name.
        // Flags if the content contains: . ( * + operators, or known SSTI keywords.
        // This avoids flagging ${PATH}, ${HOME} etc. (plain shell variables).
        pattern: /\$\{[^}]*(?:\.|\(|\*|\+|\bclass\b|\bruntime\b|\bprocess\b|\bexec\b)[^}]{0,80}\}/i
      },
      {
        id: "log-ssti-percent-tag",
        description: "SSTI ERB/ASP tag: <%= expression %> — Ruby ERB, ASP",
        pattern: /<%=[\s\S]{0,80}%>/
      },
      // ─── Null byte ────────────────────────────────────────────────────────────
      {
        id: "log-null-byte",
        description: "Null byte: \\x00 or %00 — can truncate log entries in C-backed loggers",
        pattern: /\x00|%00/
      },
      // ─── ANSI escape injection ────────────────────────────────────────────────
      {
        id: "log-ansi-escape",
        description: "ANSI escape sequence: ESC[ — can manipulate terminal output when logs are tailed",
        pattern: /\x1b\[/
      }
    ];
    log_default = LOG_PATTERNS;
  }
});

// tools/Content Harvester/node_modules/is-unsafe/src/contexts/sql-strict.js
var SQL_STRICT_EXTRA, SQL_STRICT_PATTERNS, sql_strict_default;
var init_sql_strict = __esm({
  "tools/Content Harvester/node_modules/is-unsafe/src/contexts/sql-strict.js"() {
    init_sql();
    SQL_STRICT_EXTRA = [
      {
        id: "sql-line-comment",
        description: "SQL line comment: -- followed by whitespace or end of string",
        pattern: /--(?:\s|$)/
      },
      {
        id: "sql-stacked-query",
        description: "Stacked queries: semicolon immediately followed by a SQL keyword",
        pattern: /;\s{0,10}(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC)\b/i
      },
      {
        id: "sql-hex-encoding",
        description: "Hex-encoded string injection: 0x41414141 style (MySQL)",
        pattern: /\b0x[0-9a-f]{4,}/i
      }
    ];
    SQL_STRICT_PATTERNS = [...sql_default, ...SQL_STRICT_EXTRA];
    sql_strict_default = SQL_STRICT_PATTERNS;
  }
});

// tools/Content Harvester/node_modules/is-unsafe/src/index.js
function assertString(value) {
  if (typeof value !== "string") {
    throw new TypeError(
      `is-unsafe: first argument must be a string, got ${typeof value}`
    );
  }
}
function assertContext(context) {
  if (context instanceof RegExp) return;
  if (Array.isArray(context)) {
    if (context.length === 0) {
      throw new TypeError("is-unsafe: context must not be an empty array");
    }
    if (Array.isArray(context[0])) {
      for (const list of context) {
        if (!Array.isArray(list) || list.length === 0) {
          throw new TypeError(
            "is-unsafe: each context in the array must be a non-empty pattern array (PatternList)"
          );
        }
      }
    }
    return;
  }
  throw new TypeError(
    `is-unsafe: second argument must be a PatternList (e.g. HTML), an array of PatternLists (e.g. [HTML, XML]), or a RegExp. Got: ${typeof context}`
  );
}
function normalise(context) {
  if (context instanceof RegExp) return { lists: null, regex: context };
  if (Array.isArray(context[0])) return { lists: context, regex: null };
  return { lists: [context], regex: null };
}
function matchList(value, list) {
  const label = list.label ?? "CUSTOM";
  for (const rule of list) {
    if (rule.pattern.test(value)) {
      return { context: label, id: rule.id, description: rule.description, pattern: rule.pattern };
    }
  }
  return null;
}
function isUnsafe(value, context) {
  assertString(value);
  assertContext(context);
  const { lists, regex } = normalise(context);
  if (regex) return regex.test(value);
  for (const list of lists) {
    if (matchList(value, list) !== null) return true;
  }
  return false;
}
var VALID_CONTEXTS;
var init_src4 = __esm({
  "tools/Content Harvester/node_modules/is-unsafe/src/index.js"() {
    init_html();
    init_xml();
    init_sql_strict();
    init_html();
    init_xml();
    init_svg();
    init_sql();
    init_shell();
    init_redos();
    init_nosql();
    init_log();
    html_default.label = "HTML";
    xml_default.label = "XML";
    svg_default.label = "SVG";
    sql_default.label = "SQL";
    sql_strict_default.label = "SQL-STRICT";
    shell_default.label = "SHELL";
    redos_default.label = "REDOS";
    nosql_default.label = "NOSQL";
    log_default.label = "LOG";
    VALID_CONTEXTS = Object.freeze({
      HTML: html_default,
      XML: xml_default,
      SVG: svg_default,
      SQL: sql_default,
      "SQL-STRICT": sql_strict_default,
      SHELL: shell_default,
      REDOS: redos_default,
      NOSQL: nosql_default,
      LOG: log_default
    });
  }
});

// tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js
function extractRawAttributes(prefixedAttrs, options) {
  if (!prefixedAttrs) return {};
  const attrs = options.attributesGroupName ? prefixedAttrs[options.attributesGroupName] : prefixedAttrs;
  if (!attrs) return {};
  const rawAttrs = {};
  for (const key in attrs) {
    if (key.startsWith(options.attributeNamePrefix)) {
      const rawName = key.substring(options.attributeNamePrefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}
function extractNamespace(rawTagName) {
  if (!rawTagName || typeof rawTagName !== "string") return void 0;
  const colonIndex = rawTagName.indexOf(":");
  if (colonIndex !== -1 && colonIndex > 0) {
    const ns = rawTagName.substring(0, colonIndex);
    if (ns !== "xmlns") {
      return ns;
    }
  }
  return void 0;
}
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
  const options = this.options;
  if (val !== void 0) {
    if (options.trimValues && !dontTrim) {
      val = val.trim();
    }
    if (val.length > 0) {
      if (!escapeEntities) val = this.replaceEntitiesValue(val, tagName, jPath);
      const jPathOrMatcher = options.jPath ? jPath.toString() : jPath;
      const newval = options.tagValueProcessor(tagName, val, jPathOrMatcher, hasAttributes, isLeafNode);
      if (newval === null || newval === void 0) {
        return val;
      } else if (typeof newval !== typeof val || newval !== val) {
        return newval;
      } else if (options.trimValues) {
        return parseValue(val, options.parseTagValue, options.numberParseOptions);
      } else {
        const trimmedVal = val.trim();
        if (trimmedVal === val) {
          return parseValue(val, options.parseTagValue, options.numberParseOptions);
        } else {
          return val;
        }
      }
    }
  }
}
function resolveNameSpace(tagname) {
  if (this.options.removeNSPrefix) {
    const tags = tagname.split(":");
    const prefix = tagname.charAt(0) === "/" ? "/" : "";
    if (tags[0] === "xmlns") {
      return "";
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}
function buildAttributesMap(attrStr, jPath, tagName, force = false) {
  const options = this.options;
  if (force === true || options.ignoreAttributes !== true && typeof attrStr === "string") {
    const matches = getAllMatches(attrStr, attrsRegx);
    const len = matches.length;
    const attrs = {};
    const processedVals = new Array(len);
    let hasRawAttrs = false;
    const rawAttrsForMatcher = {};
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      const oldVal = matches[i][4];
      if (attrName.length && oldVal !== void 0) {
        let val = oldVal;
        if (options.trimValues) val = val.trim();
        val = this.replaceEntitiesValue(val, tagName, this.readonlyMatcher);
        processedVals[i] = val;
        rawAttrsForMatcher[attrName] = val;
        hasRawAttrs = true;
      }
    }
    if (hasRawAttrs && typeof jPath === "object" && jPath.updateCurrent) {
      jPath.updateCurrent(rawAttrsForMatcher);
    }
    const jPathStr = options.jPath ? jPath.toString() : this.readonlyMatcher;
    let hasAttrs = false;
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      if (this.ignoreAttributesFn(attrName, jPathStr)) continue;
      let aName = options.attributeNamePrefix + attrName;
      if (attrName.length) {
        if (options.transformAttributeName) {
          aName = options.transformAttributeName(aName);
        }
        aName = sanitizeName(aName, options);
        if (matches[i][4] !== void 0) {
          const oldVal = processedVals[i];
          const newVal = options.attributeValueProcessor(attrName, oldVal, jPathStr);
          if (newVal === null || newVal === void 0) {
            attrs[aName] = oldVal;
          } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
            attrs[aName] = newVal;
          } else {
            attrs[aName] = parseValue(oldVal, options.parseAttributeValue, options.numberParseOptions);
          }
          hasAttrs = true;
        } else if (options.allowBooleanAttributes) {
          attrs[aName] = true;
          hasAttrs = true;
        }
      }
    }
    if (!hasAttrs) return;
    if (options.attributesGroupName && !options.preserveOrder) {
      const attrCollection = {};
      attrCollection[options.attributesGroupName] = attrs;
      return attrCollection;
    }
    return attrs;
  }
}
function addChild(currentNode, childNode, matcher, startIndex) {
  if (!this.options.captureMetaData) startIndex = void 0;
  const jPathOrMatcher = this.options.jPath ? matcher.toString() : matcher;
  const result = this.options.updateTag(childNode.tagname, jPathOrMatcher, childNode[":@"]);
  if (result === false) {
  } else if (typeof result === "string") {
    childNode.tagname = result;
    currentNode.addChild(childNode, startIndex);
  } else {
    currentNode.addChild(childNode, startIndex);
  }
}
function replaceEntitiesValue(val, tagName, jPath) {
  const entityConfig = this.options.processEntities;
  if (!entityConfig || !entityConfig.enabled) {
    return val;
  }
  if (entityConfig.allowedTags) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    const allowed = Array.isArray(entityConfig.allowedTags) ? entityConfig.allowedTags.includes(tagName) : entityConfig.allowedTags(tagName, jPathOrMatcher);
    if (!allowed) {
      return val;
    }
  }
  if (entityConfig.tagFilter) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    if (!entityConfig.tagFilter(tagName, jPathOrMatcher)) {
      return val;
    }
  }
  return this.entityDecoder.decode(val);
}
function saveTextToParentTag(textData, parentNode, matcher, isLeafNode) {
  if (textData) {
    if (isLeafNode === void 0) isLeafNode = parentNode.child.length === 0;
    textData = this.parseTextData(
      textData,
      parentNode.tagname,
      matcher,
      false,
      parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false,
      isLeafNode
    );
    if (textData !== void 0 && textData !== "")
      parentNode.add(this.options.textNodeName, textData);
    textData = "";
  }
  return textData;
}
function isItStopNode() {
  if (this.stopNodeExpressionsSet.size === 0) return false;
  return this.matcher.matchesAny(this.stopNodeExpressionsSet);
}
function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
  let attrBoundary = 0;
  const len = xmlData.length;
  const closeCode0 = closingChar.charCodeAt(0);
  const closeCode1 = closingChar.length > 1 ? closingChar.charCodeAt(1) : -1;
  let result = "";
  let segmentStart = i;
  for (let index = i; index < len; index++) {
    const code = xmlData.charCodeAt(index);
    if (attrBoundary) {
      if (code === attrBoundary) attrBoundary = 0;
    } else if (code === 34 || code === 39) {
      attrBoundary = code;
    } else if (code === closeCode0) {
      if (closeCode1 !== -1) {
        if (xmlData.charCodeAt(index + 1) === closeCode1) {
          result += xmlData.substring(segmentStart, index);
          return { data: result, index };
        }
      } else {
        result += xmlData.substring(segmentStart, index);
        return { data: result, index };
      }
    } else if (code === 9 && !attrBoundary) {
      result += xmlData.substring(segmentStart, index) + " ";
      segmentStart = index + 1;
    }
  }
}
function findClosingIndex(xmlData, str, i, errMsg) {
  const closingIndex = xmlData.indexOf(str, i);
  if (closingIndex === -1) {
    throw new Error(errMsg);
  } else {
    return closingIndex + str.length - 1;
  }
}
function findClosingChar(xmlData, char, i, errMsg) {
  const closingIndex = xmlData.indexOf(char, i);
  if (closingIndex === -1) throw new Error(errMsg);
  return closingIndex;
}
function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
  const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
  if (!result) return;
  let tagExp = result.data;
  const closeIndex = result.index;
  const separatorIndex = tagExp.search(/\s/);
  let tagName = tagExp;
  let attrExpPresent = true;
  if (separatorIndex !== -1) {
    tagName = tagExp.substring(0, separatorIndex);
    tagExp = tagExp.substring(separatorIndex + 1).trimStart();
  }
  const rawTagName = tagName;
  if (removeNSPrefix) {
    const colonIndex = tagName.indexOf(":");
    if (colonIndex !== -1) {
      tagName = tagName.substr(colonIndex + 1);
      attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
    }
  }
  return {
    tagName,
    tagExp,
    closeIndex,
    attrExpPresent,
    rawTagName
  };
}
function readStopNodeData(xmlData, tagName, i) {
  const startIndex = i;
  let openTagCount = 1;
  const xmllen = xmlData.length;
  for (; i < xmllen; i++) {
    if (xmlData[i] === "<") {
      const c1 = xmlData.charCodeAt(i + 1);
      if (c1 === 47) {
        const closeIndex = findClosingChar(xmlData, ">", i, `${tagName} is not closed`);
        let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
        if (closeTagName === tagName) {
          openTagCount--;
          if (openTagCount === 0) {
            return {
              tagContent: xmlData.substring(startIndex, i),
              i: closeIndex
            };
          }
        }
        i = closeIndex;
      } else if (c1 === 63) {
        const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
        i = closeIndex;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
        const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
        i = closeIndex;
      } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
        i = closeIndex;
      } else {
        const tagData = readTagExp(xmlData, i, false);
        if (tagData) {
          const openTagName = tagData && tagData.tagName;
          if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
            openTagCount++;
          }
          i = tagData.closeIndex;
        }
      }
    }
  }
}
function parseValue(val, shouldParse, options) {
  if (shouldParse && typeof val === "string") {
    const newval = val.trim();
    if (newval === "true") return true;
    else if (newval === "false") return false;
    else return toNumber(val, options);
  } else {
    if (isExist(val)) {
      return val;
    } else {
      return "";
    }
  }
}
function transformTagName(fn, tagName, tagExp, options) {
  if (fn) {
    const newTagName = fn(tagName);
    if (tagExp === tagName) {
      tagExp = newTagName;
    }
    tagName = newTagName;
  }
  tagName = sanitizeName(tagName, options);
  return { tagName, tagExp };
}
function sanitizeName(name, options) {
  if (criticalProperties.includes(name)) {
    throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
  } else if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return options.onDangerousProperty(name);
  }
  return name;
}
var OrderedObjParser, attrsRegx, parseXml;
var init_OrderedObjParser = __esm({
  "tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/OrderedObjParser.js"() {
    "use strict";
    init_util();
    init_xmlNode();
    init_DocTypeReader();
    init_strnum();
    init_ignoreAttributes();
    init_src3();
    init_src3();
    init_src();
    init_src4();
    OrderedObjParser = class {
      constructor(options, externalEntities) {
        this.options = options;
        this.currentNode = null;
        this.tagsNodeStack = [];
        this.parseXml = parseXml;
        this.parseTextData = parseTextData;
        this.resolveNameSpace = resolveNameSpace;
        this.buildAttributesMap = buildAttributesMap;
        this.isItStopNode = isItStopNode;
        this.replaceEntitiesValue = replaceEntitiesValue;
        this.readStopNodeData = readStopNodeData;
        this.saveTextToParentTag = saveTextToParentTag;
        this.addChild = addChild;
        this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
        this.entityExpansionCount = 0;
        this.currentExpandedLength = 0;
        this.doctypefound = false;
        let namedEntities = { ...XML };
        if (this.options.entityDecoder) {
          this.entityDecoder = this.options.entityDecoder;
        } else {
          if (typeof this.options.htmlEntities === "object") namedEntities = this.options.htmlEntities;
          else if (this.options.htmlEntities === true) namedEntities = { ...COMMON_HTML, ...CURRENCY };
          this.entityDecoder = new EntityDecoder({
            namedEntities: { ...namedEntities, ...externalEntities },
            numericAllowed: this.options.htmlEntities,
            limit: {
              maxTotalExpansions: this.options.processEntities.maxTotalExpansions,
              maxExpandedLength: this.options.processEntities.maxExpandedLength,
              applyLimitsTo: this.options.processEntities.appliesTo
            },
            // onExternalEntity: (name, value) => isUnsafe(value) ? 'block' : 'allow',
            onInputEntity: (name, value) => (
              //TODO: VALID_CONTEXTS.HTML should be set only if this.options.htmlEntities
              isUnsafe(value, [html_default, xml_default]) ? ENTITY_ACTION.BLOCK : ENTITY_ACTION.ALLOW
            )
            //postCheck: resolved => resolved
          });
        }
        this.matcher = new Matcher();
        this.readonlyMatcher = this.matcher.readOnly();
        this.isCurrentNodeStopNode = false;
        this.stopNodeExpressionsSet = new ExpressionSet();
        const stopNodesOpts = this.options.stopNodes;
        if (stopNodesOpts && stopNodesOpts.length > 0) {
          for (let i = 0; i < stopNodesOpts.length; i++) {
            const stopNodeExp = stopNodesOpts[i];
            if (typeof stopNodeExp === "string") {
              this.stopNodeExpressionsSet.add(new Expression(stopNodeExp));
            } else if (stopNodeExp instanceof Expression) {
              this.stopNodeExpressionsSet.add(stopNodeExp);
            }
          }
          this.stopNodeExpressionsSet.seal();
        }
      }
    };
    attrsRegx = new RegExp(`([^\\s=]+)\\s*(=\\s*(['"])([\\s\\S]*?)\\3)?`, "gm");
    parseXml = function(xmlData) {
      xmlData = xmlData.replace(/\r\n?/g, "\n");
      const xmlObj = new XmlNode("!xml");
      let currentNode = xmlObj;
      let textData = "";
      this.matcher.reset();
      this.entityDecoder.reset();
      this.entityExpansionCount = 0;
      this.currentExpandedLength = 0;
      this.doctypefound = false;
      const options = this.options;
      const docTypeReader = new DocTypeReader(options.processEntities);
      const xmlLen = xmlData.length;
      for (let i = 0; i < xmlLen; i++) {
        const ch = xmlData[i];
        if (ch === "<") {
          const c1 = xmlData.charCodeAt(i + 1);
          if (c1 === 47) {
            const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
            let tagName = xmlData.substring(i + 2, closeIndex).trim();
            if (options.removeNSPrefix) {
              const colonIndex = tagName.indexOf(":");
              if (colonIndex !== -1) {
                tagName = tagName.substr(colonIndex + 1);
              }
            }
            tagName = transformTagName(options.transformTagName, tagName, "", options).tagName;
            if (currentNode) {
              textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
            }
            const lastTagName = this.matcher.getCurrentTag();
            if (tagName && options.unpairedTagsSet.has(tagName)) {
              throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
            }
            if (lastTagName && options.unpairedTagsSet.has(lastTagName)) {
              this.matcher.pop();
              this.tagsNodeStack.pop();
            }
            this.matcher.pop();
            this.isCurrentNodeStopNode = false;
            currentNode = this.tagsNodeStack.pop();
            textData = "";
            i = closeIndex;
          } else if (c1 === 63) {
            let tagData = readTagExp(xmlData, i, false, "?>");
            if (!tagData) throw new Error("Pi Tag is not closed.");
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
            const attsMap = this.buildAttributesMap(tagData.tagExp, this.matcher, tagData.tagName, true);
            if (attsMap) {
              const ver = attsMap[this.options.attributeNamePrefix + "version"];
              this.entityDecoder.setXmlVersion(Number(ver) || 1);
              docTypeReader.setXmlVersion(Number(ver) || 1);
            }
            if (options.ignoreDeclaration && tagData.tagName === "?xml" || options.ignorePiTags) {
            } else {
              const childNode = new XmlNode(tagData.tagName);
              childNode.add(options.textNodeName, "");
              if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent && options.ignoreAttributes !== true) {
                childNode[":@"] = attsMap;
              }
              this.addChild(currentNode, childNode, this.readonlyMatcher, i);
            }
            i = tagData.closeIndex + 1;
          } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 45 && xmlData.charCodeAt(i + 3) === 45) {
            const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
            if (options.commentPropName) {
              const comment = xmlData.substring(i + 4, endIndex - 2);
              textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
              currentNode.add(options.commentPropName, [{ [options.textNodeName]: comment }]);
            }
            i = endIndex;
          } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 68) {
            if (this.doctypefound) throw new Error("Multiple DOCTYPE declarations found.");
            this.doctypefound = true;
            const result = docTypeReader.readDocType(xmlData, i);
            this.entityDecoder.addInputEntities(result.entities);
            i = result.i;
          } else if (c1 === 33 && xmlData.charCodeAt(i + 2) === 91) {
            const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
            const tagExp = xmlData.substring(i + 9, closeIndex);
            textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher);
            let val = this.parseTextData(tagExp, currentNode.tagname, this.readonlyMatcher, true, false, true, true);
            if (val == void 0) val = "";
            if (options.cdataPropName) {
              currentNode.add(options.cdataPropName, [{ [options.textNodeName]: tagExp }]);
            } else {
              currentNode.add(options.textNodeName, val);
            }
            i = closeIndex + 2;
          } else {
            let result = readTagExp(xmlData, i, options.removeNSPrefix);
            if (!result) {
              const context = xmlData.substring(Math.max(0, i - 50), Math.min(xmlLen, i + 50));
              throw new Error(`readTagExp returned undefined at position ${i}. Context: "${context}"`);
            }
            let tagName = result.tagName;
            const rawTagName = result.rawTagName;
            let tagExp = result.tagExp;
            let attrExpPresent = result.attrExpPresent;
            let closeIndex = result.closeIndex;
            ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
            if (options.strictReservedNames && (tagName === options.commentPropName || tagName === options.cdataPropName || tagName === options.textNodeName || tagName === options.attributesGroupName)) {
              throw new Error(`Invalid tag name: ${tagName}`);
            }
            if (currentNode && textData) {
              if (currentNode.tagname !== "!xml") {
                textData = this.saveTextToParentTag(textData, currentNode, this.readonlyMatcher, false);
              }
            }
            const lastTag = currentNode;
            if (lastTag && options.unpairedTagsSet.has(lastTag.tagname)) {
              currentNode = this.tagsNodeStack.pop();
              this.matcher.pop();
            }
            let isSelfClosing = false;
            if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
              isSelfClosing = true;
              if (tagName[tagName.length - 1] === "/") {
                tagName = tagName.substr(0, tagName.length - 1);
                tagExp = tagName;
              } else {
                tagExp = tagExp.substr(0, tagExp.length - 1);
              }
              attrExpPresent = tagName !== tagExp;
            }
            let prefixedAttrs = null;
            let rawAttrs = {};
            let namespace = void 0;
            namespace = extractNamespace(rawTagName);
            if (tagName !== xmlObj.tagname) {
              this.matcher.push(tagName, {}, namespace);
            }
            if (tagName !== tagExp && attrExpPresent) {
              prefixedAttrs = this.buildAttributesMap(tagExp, this.matcher, tagName);
              if (prefixedAttrs) {
                rawAttrs = extractRawAttributes(prefixedAttrs, options);
              }
            }
            if (tagName !== xmlObj.tagname) {
              this.isCurrentNodeStopNode = this.isItStopNode();
            }
            const startIndex = i;
            if (this.isCurrentNodeStopNode) {
              let tagContent = "";
              if (isSelfClosing) {
                i = result.closeIndex;
              } else if (options.unpairedTagsSet.has(tagName)) {
                i = result.closeIndex;
              } else {
                const result2 = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
                if (!result2) throw new Error(`Unexpected end of ${rawTagName}`);
                i = result2.i;
                tagContent = result2.tagContent;
              }
              const childNode = new XmlNode(tagName);
              if (prefixedAttrs) {
                childNode[":@"] = prefixedAttrs;
              }
              childNode.add(options.textNodeName, tagContent);
              this.matcher.pop();
              this.isCurrentNodeStopNode = false;
              this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
            } else {
              if (isSelfClosing) {
                ({ tagName, tagExp } = transformTagName(options.transformTagName, tagName, tagExp, options));
                const childNode = new XmlNode(tagName);
                if (prefixedAttrs) {
                  childNode[":@"] = prefixedAttrs;
                }
                this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
                this.matcher.pop();
                this.isCurrentNodeStopNode = false;
              } else if (options.unpairedTagsSet.has(tagName)) {
                const childNode = new XmlNode(tagName);
                if (prefixedAttrs) {
                  childNode[":@"] = prefixedAttrs;
                }
                this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
                this.matcher.pop();
                this.isCurrentNodeStopNode = false;
                i = result.closeIndex;
                continue;
              } else {
                const childNode = new XmlNode(tagName);
                if (this.tagsNodeStack.length > options.maxNestedTags) {
                  throw new Error("Maximum nested tags exceeded");
                }
                this.tagsNodeStack.push(currentNode);
                if (prefixedAttrs) {
                  childNode[":@"] = prefixedAttrs;
                }
                this.addChild(currentNode, childNode, this.readonlyMatcher, startIndex);
                currentNode = childNode;
              }
              textData = "";
              i = closeIndex;
            }
          }
        } else {
          textData += xmlData[i];
        }
      }
      return xmlObj.child;
    };
  }
});

// tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/node2json.js
function stripAttributePrefix(attrs, prefix) {
  if (!attrs || typeof attrs !== "object") return {};
  if (!prefix) return attrs;
  const rawAttrs = {};
  for (const key in attrs) {
    if (key.startsWith(prefix)) {
      const rawName = key.substring(prefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}
function prettify(node, options, matcher, readonlyMatcher) {
  return compress(node, options, matcher, readonlyMatcher);
}
function compress(arr, options, matcher, readonlyMatcher) {
  let text;
  const compressedObj = {};
  for (let i = 0; i < arr.length; i++) {
    const tagObj = arr[i];
    const property = propName(tagObj);
    if (property !== void 0 && property !== options.textNodeName) {
      const rawAttrs = stripAttributePrefix(
        tagObj[":@"] || {},
        options.attributeNamePrefix
      );
      matcher.push(property, rawAttrs);
    }
    if (property === options.textNodeName) {
      if (text === void 0) text = tagObj[property];
      else text += "" + tagObj[property];
    } else if (property === void 0) {
      continue;
    } else if (tagObj[property]) {
      let val = compress(tagObj[property], options, matcher, readonlyMatcher);
      const isLeaf = isLeafTag(val, options);
      if (Object.keys(val).length === 0 && options.alwaysCreateTextNode) {
        val[options.textNodeName] = "";
      }
      if (tagObj[":@"]) {
        assignAttributes(val, tagObj[":@"], readonlyMatcher, options);
      } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== void 0 && !options.alwaysCreateTextNode) {
        val = val[options.textNodeName];
      } else if (Object.keys(val).length === 0) {
        if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
        else val = "";
      }
      if (tagObj[METADATA_SYMBOL2] !== void 0 && typeof val === "object" && val !== null) {
        val[METADATA_SYMBOL2] = tagObj[METADATA_SYMBOL2];
      }
      if (compressedObj[property] !== void 0 && Object.prototype.hasOwnProperty.call(compressedObj, property)) {
        if (!Array.isArray(compressedObj[property])) {
          compressedObj[property] = [compressedObj[property]];
        }
        compressedObj[property].push(val);
      } else {
        const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() : readonlyMatcher;
        if (options.isArray(property, jPathOrMatcher, isLeaf)) {
          compressedObj[property] = [val];
        } else {
          compressedObj[property] = val;
        }
      }
      if (property !== void 0 && property !== options.textNodeName) {
        matcher.pop();
      }
    }
  }
  if (typeof text === "string") {
    if (text.length > 0) compressedObj[options.textNodeName] = text;
  } else if (text !== void 0) compressedObj[options.textNodeName] = text;
  return compressedObj;
}
function propName(obj) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== ":@") return key;
  }
}
function assignAttributes(obj, attrMap, readonlyMatcher, options) {
  if (attrMap) {
    const keys = Object.keys(attrMap);
    const len = keys.length;
    for (let i = 0; i < len; i++) {
      const atrrName = keys[i];
      const rawAttrName = atrrName.startsWith(options.attributeNamePrefix) ? atrrName.substring(options.attributeNamePrefix.length) : atrrName;
      const jPathOrMatcher = options.jPath ? readonlyMatcher.toString() + "." + rawAttrName : readonlyMatcher;
      if (options.isArray(atrrName, jPathOrMatcher, true, true)) {
        obj[atrrName] = [attrMap[atrrName]];
      } else {
        obj[atrrName] = attrMap[atrrName];
      }
    }
  }
}
function isLeafTag(obj, options) {
  const { textNodeName } = options;
  const propCount = Object.keys(obj).length;
  if (propCount === 0) {
    return true;
  }
  if (propCount === 1 && (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)) {
    return true;
  }
  return false;
}
var METADATA_SYMBOL2;
var init_node2json = __esm({
  "tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/node2json.js"() {
    "use strict";
    init_xmlNode();
    METADATA_SYMBOL2 = XmlNode.getMetaDataSymbol();
  }
});

// tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/XMLParser.js
var XMLParser;
var init_XMLParser = __esm({
  "tools/Content Harvester/node_modules/fast-xml-parser/src/xmlparser/XMLParser.js"() {
    init_OptionsBuilder();
    init_OrderedObjParser();
    init_node2json();
    init_validator();
    init_xmlNode();
    XMLParser = class {
      constructor(options) {
        this.externalEntities = {};
        this.options = buildOptions(options);
      }
      /**
       * Parse XML dats to JS object 
       * @param {string|Uint8Array} xmlData 
       * @param {boolean|Object} validationOption 
       */
      parse(xmlData, validationOption) {
        if (typeof xmlData !== "string" && xmlData.toString) {
          xmlData = xmlData.toString();
        } else if (typeof xmlData !== "string") {
          throw new Error("XML data is accepted in String or Bytes[] form.");
        }
        if (validationOption) {
          if (validationOption === true) validationOption = {};
          const result = validate(xmlData, validationOption);
          if (result !== true) {
            throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`);
          }
        }
        const orderedObjParser = new OrderedObjParser(this.options, this.externalEntities);
        const orderedResult = orderedObjParser.parseXml(xmlData);
        if (this.options.preserveOrder || orderedResult === void 0) return orderedResult;
        else return prettify(orderedResult, this.options, orderedObjParser.matcher, orderedObjParser.readonlyMatcher);
      }
      /**
       * Add Entity which is not by default supported by this library
       * @param {string} key 
       * @param {string} value 
       */
      addEntity(key, value) {
        if (value.indexOf("&") !== -1) {
          throw new Error("Entity value can't have '&'");
        } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
          throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'");
        } else if (value === "&") {
          throw new Error("An entity with value '&' is not permitted");
        } else {
          this.externalEntities[key] = value;
        }
      }
      /**
       * Returns a Symbol that can be used to access the metadata
       * property on a node.
       * 
       * If Symbol is not available in the environment, an ordinary property is used
       * and the name of the property is here returned.
       * 
       * The XMLMetaData property is only present when `captureMetaData`
       * is true in the options.
       */
      static getMetaDataSymbol() {
        return XmlNode.getMetaDataSymbol();
      }
    };
  }
});

// tools/Content Harvester/node_modules/fast-xml-parser/src/fxp.js
var init_fxp = __esm({
  "tools/Content Harvester/node_modules/fast-xml-parser/src/fxp.js"() {
    "use strict";
    init_XMLParser();
  }
});

// tools/Content Harvester/scripts/adapters/rss.js
var rss_exports = {};
__export(rss_exports, {
  collectFeed: () => collectFeed
});
async function collectFeed(source, context) {
  const xml = await fetchText(source.url, ACCEPT, context);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    updateTag(name) {
      context.check?.();
      return name;
    },
    tagValueProcessor(_name, value) {
      context.check?.();
      return value;
    },
    attributeValueProcessor(_name, value) {
      context.check?.();
      return value;
    },
    isArray() {
      context.check?.();
      return false;
    }
  });
  context.check?.();
  const items = extractItems(parser.parse(xml));
  context.check?.();
  context.acceptItems?.(items.length);
  const candidates = [];
  for (const item of items) {
    context.check?.();
    candidates.push(await normalizeCandidate(mapItem(item, source), {
      ...context,
      source,
      sourceTopics: source.topics || []
    }));
  }
  return candidates;
}
function extractItems(parsed) {
  if (parsed?.rss?.channel?.item) return asArray(parsed.rss.channel.item);
  if (parsed?.feed?.entry) return asArray(parsed.feed.entry);
  return [];
}
function mapItem(item, source) {
  return {
    title: nodeText(item.title),
    url: extractLink(item.link),
    source: source.source || source.name,
    adapter_type: source.type,
    source_role: source.role,
    author: extractAuthor(item),
    published_at: nodeText(item.pubDate || item.published || item.updated || item["dc:date"]),
    summary: nodeText(item.description || item.summary),
    content: nodeText(item["content:encoded"] || item.content || item.summary || item.description),
    raw: item
  };
}
function extractLink(link) {
  if (Array.isArray(link)) {
    return extractLink(link.find((entry) => entry?.["@_rel"] === "alternate") || link[0]);
  }
  if (link && typeof link === "object") {
    return decodeEntities(link["@_href"] || link.href || link["#text"] || "");
  }
  return decodeEntities(nodeText(link));
}
function extractAuthor(item) {
  const author = item.author || item["dc:creator"] || item.creator;
  if (author && typeof author === "object") {
    return nodeText(author.name || author.email || author["#text"]);
  }
  return nodeText(author);
}
function nodeText(value) {
  if (value === null || value === void 0) return "";
  if (typeof value === "object") return String(value["#text"] ?? "");
  return String(value);
}
function asArray(value) {
  return Array.isArray(value) ? value : [value];
}
var ACCEPT;
var init_rss = __esm({
  "tools/Content Harvester/scripts/adapters/rss.js"() {
    init_fetch();
    init_normalize();
    init_fxp();
    ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8";
  }
});

// tools/Content Harvester/scripts/lib/request.js
var request_exports = {};
__export(request_exports, {
  sampleRequest: () => sampleRequest,
  validateRequest: () => validateRequest
});
function validateRequest(request, check = () => {
}) {
  const problems = [];
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    return ["the request must be a JSON object"];
  }
  if (typeof request.name !== "string" || request.name.trim() === "") {
    problems.push("name is required and must be a non-empty string");
  }
  if (typeof request.consumer !== "string" || request.consumer.trim() === "") {
    problems.push("consumer is required and must be a non-empty string");
  }
  if (!request.timebox || typeof request.timebox !== "object") {
    problems.push("timebox is required, with from and to");
  } else {
    const from = isValidDate(request.timebox.from);
    const to = isValidDate(request.timebox.to);
    if (!from) problems.push("timebox.from must be a date string");
    if (!to) problems.push("timebox.to must be a date string");
    if (from && to && new Date(request.timebox.from) > new Date(request.timebox.to)) {
      problems.push("timebox.from must be at or before timebox.to");
    }
  }
  if (!Array.isArray(request.topics)) {
    problems.push("topics must be an array, empty if the request has no topic targets");
  }
  if (!Array.isArray(request.sources)) {
    problems.push("sources must be an array");
  } else {
    request.sources.forEach((source, index) => {
      check();
      problems.push(...validateSource(source, index));
    });
  }
  if (request.output !== void 0) {
    if (typeof request.output !== "object" || request.output === null || Array.isArray(request.output)) {
      problems.push("output must be an object");
    } else if (request.output.directory !== void 0 && typeof request.output.directory !== "string") {
      problems.push("output.directory must be a string");
    }
  }
  if (request.user_agent !== void 0 && typeof request.user_agent !== "string") {
    problems.push("user_agent must be a string");
  }
  if (request.timeout_ms !== void 0 && !(Number.isFinite(Number(request.timeout_ms)) && Number(request.timeout_ms) > 0)) {
    problems.push("timeout_ms must be a positive number of milliseconds");
  }
  return problems;
}
function validateSource(source, index) {
  const label = `sources[${index}]`;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return [`${label} must be an object`];
  }
  if (source.enabled === false) {
    return [];
  }
  if (!source.type) {
    return [`${label}.type is required`];
  }
  const problems = [];
  if (URL_TYPES.has(source.type) && !source.url) {
    problems.push(`${label}.url is required for ${source.type}`);
  }
  if (source.type === "manual_urls" && !Array.isArray(source.urls)) {
    problems.push(`${label}.urls must be an array for manual_urls`);
  }
  return problems;
}
function isValidDate(value) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}
function sampleRequest() {
  return {
    name: "example-harvest",
    consumer: "the workflow asking for these candidates",
    timebox: {
      from: "2026-07-01T00:00:00Z",
      to: "2026-07-08T00:00:00Z"
    },
    topics: ["first topic", "second topic"],
    sources: [
      {
        type: "rss",
        url: "https://example.com/feed.xml",
        source: "Example Feed",
        role: "independent_reporting"
      },
      {
        type: "manual_urls",
        source: "Curated URLs",
        role: "curated",
        urls: ["https://example.com/an-article"]
      }
    ],
    filters: {
      exclude_terms: ["sponsored"],
      max_items_per_source: 20,
      min_score: 0
    },
    output: {
      directory: "/absolute/path/to/a/work/directory/in/the/owning/root",
      markdown: true,
      json: true
    }
  };
}
var URL_TYPES;
var init_request = __esm({
  "tools/Content Harvester/scripts/lib/request.js"() {
    URL_TYPES = /* @__PURE__ */ new Set(["rss", "substack_rss", "reddit_rss", "url"]);
  }
});

// tools/Content Harvester/scripts/lib/request-cli.js
var request_cli_exports = {};
__export(request_cli_exports, {
  loadRequest: () => loadRequest
});
import { existsSync as existsSync3, readFileSync as readFileSync3 } from "node:fs";
function loadRequest(requestPath, fail3) {
  if (!existsSync3(requestPath)) {
    fail3(`Error: no file at ${requestPath}. Check the path passed to --request.`);
  }
  let text;
  try {
    text = readFileSync3(requestPath, "utf8");
  } catch (error) {
    fail3(`Error: could not read ${requestPath}: ${error.code || "read failed"}.`);
  }
  try {
    return { request: JSON.parse(text), requestPath };
  } catch {
    fail3(`Error: ${requestPath} is not valid JSON. Run "node scripts/harvest.js sample" for a request this tool accepts.`);
  }
}
var init_request_cli = __esm({
  "tools/Content Harvester/scripts/lib/request-cli.js"() {
  }
});

// tools/Content Harvester/scripts/adapters/urls.js
var urls_exports = {};
__export(urls_exports, {
  collectManualUrls: () => collectManualUrls,
  collectUrl: () => collectUrl
});
async function collectUrl(source, context) {
  const html = await fetchText(source.url, ACCEPT2, context);
  context.check?.();
  context.acceptItems?.(1);
  return [await normalizeCandidate(extractMetadata(html, source.url, source, context.check), {
    ...context,
    source,
    sourceTopics: source.topics || []
  })];
}
async function collectManualUrls(source, context) {
  const candidates = [];
  const errors = [];
  for (const url of source.urls || []) {
    context.check?.();
    try {
      const [candidate] = await collectUrl({ ...source, type: "url", url }, context);
      candidates.push(candidate);
    } catch (error) {
      context.check?.();
      if (error.fatal) throw error;
      errors.push({
        source: source.source || source.name || "Unnamed source",
        adapter_type: source.type,
        message: error.message,
        retryable: Boolean(error.retryable),
        ...error.reason ? { reason: error.reason } : {}
      });
    }
  }
  return { candidates, errors };
}
function extractMetadata(html, url, source, check = () => {
}) {
  const { values, title } = scanTags(html, check);
  const meta = (key) => {
    for (const group of values) if (group.has(key)) return decodeEntities(group.get(key));
    return "";
  };
  return {
    title: meta("og:title") || meta("twitter:title") || title || url,
    url,
    source: source.source || source.name || hostName(url),
    adapter_type: source.type,
    source_role: source.role,
    author: meta("author") || meta("article:author"),
    published_at: meta("article:published_time") || meta("date") || meta("pubdate"),
    summary: meta("og:description") || meta("twitter:description") || meta("description"),
    content: "",
    raw: { extracted_meta: true }
  };
}
function scanTags(html, check) {
  const values = Array.from({ length: 4 }, () => /* @__PURE__ */ new Map());
  let steps = 0, title = "";
  const tick = () => {
    if (++steps >= 2048) {
      steps = 0;
      check();
    }
  };
  check();
  for (let i = 0; i < html.length; i++) {
    tick();
    if (html[i] !== "<") continue;
    let nameEnd = i + 1;
    while (nameEnd < html.length && !space(html[nameEnd]) && html[nameEnd] !== ">" && html[nameEnd] !== "/") {
      tick();
      nameEnd++;
    }
    const name = html.slice(i + 1, nameEnd).toLowerCase();
    let end = nameEnd, quote = "";
    for (; end < html.length; end++) {
      tick();
      const char = html[end];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
    }
    if (end === html.length) break;
    if (name === "meta") {
      const groups = scanAttributes(html, nameEnd, end, tick);
      groups.forEach((group, index) => {
        for (const [key, value] of group) if (!values[index].has(key)) values[index].set(key, value);
      });
    } else if (name === "title" && !title) {
      let close = end + 1;
      while (close < html.length && html[close] !== "<") {
        tick();
        close++;
      }
      if (html.slice(close, close + 8).toLowerCase() === "</title>") title = decodeEntities(html.slice(end + 1, close)).trim();
    }
    i = end;
  }
  check();
  return { values, title };
}
function scanAttributes(html, start, end, tick) {
  const groups = Array.from({ length: 4 }, () => /* @__PURE__ */ new Map());
  const seen = [/* @__PURE__ */ new Set(), /* @__PURE__ */ new Set()];
  let content;
  for (let i = start; i < end; ) {
    tick();
    if (space(html[i]) || html[i] === "/") {
      i++;
      continue;
    }
    const begin = i;
    while (i < end && !space(html[i]) && html[i] !== "=") {
      tick();
      i++;
    }
    const name = html.slice(begin, i).toLowerCase();
    while (i < end && space(html[i])) {
      tick();
      i++;
    }
    if (html[i] !== "=") continue;
    i++;
    while (i < end && space(html[i])) {
      tick();
      i++;
    }
    const quote = html[i];
    if (quote !== '"' && quote !== "'") {
      while (i < end && !space(html[i])) {
        tick();
        i++;
      }
      continue;
    }
    const valueStart = ++i;
    while (i < end && html[i] !== quote) {
      tick();
      i++;
    }
    if (i === end) break;
    const value = html.slice(valueStart, i++);
    if (name === "content" && !value.includes('"') && !value.includes("'")) {
      content = value;
      seen.forEach((keys, index) => {
        for (const key of keys) groups[index * 2].set(key, value);
      });
    } else if ((name === "property" || name === "name") && META_KEYS.has(value.toLowerCase())) {
      const index = name === "property" ? 0 : 1, key = value.toLowerCase();
      seen[index].add(key);
      if (content !== void 0) groups[index * 2 + 1].set(key, content);
    }
  }
  return groups;
}
function hostName(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return "Unnamed source";
  }
}
var ACCEPT2, META_KEYS, space;
var init_urls = __esm({
  "tools/Content Harvester/scripts/adapters/urls.js"() {
    init_fetch();
    init_normalize();
    ACCEPT2 = "text/html, application/xhtml+xml, */*;q=0.8";
    META_KEYS = /* @__PURE__ */ new Set(["og:title", "twitter:title", "author", "article:author", "article:published_time", "date", "pubdate", "og:description", "twitter:description", "description"]);
    space = (char) => char === " " || char === "	" || char === "\r" || char === "\n" || char === "\f";
  }
});

// tools/Content Harvester/scripts/lib/dedupe.js
var dedupe_exports = {};
__export(dedupe_exports, {
  clusterCandidates: () => clusterCandidates,
  dedupeCandidates: () => dedupeCandidates
});
function dedupeCandidates(candidates, check = () => {
}) {
  const seenUrls = /* @__PURE__ */ new Map();
  const seenTitles = /* @__PURE__ */ new Map();
  const accepted = [];
  const rejected = [];
  for (const candidate of candidates) {
    check();
    const urlKey = candidate.canonical_url || candidate.url;
    const titleKey = normalizeTitle(candidate.title);
    if (urlKey && seenUrls.has(urlKey)) {
      rejected.push(toRejected(candidate, "duplicate:url", seenUrls.get(urlKey)));
      continue;
    }
    if (titleKey && seenTitles.has(titleKey)) {
      rejected.push(toRejected(candidate, "duplicate:title", seenTitles.get(titleKey)));
      continue;
    }
    if (urlKey) seenUrls.set(urlKey, candidate.id);
    if (titleKey) seenTitles.set(titleKey, candidate.id);
    accepted.push(candidate);
  }
  return { accepted, rejected };
}
async function clusterCandidates(candidates, { hashId, check = () => {
} } = {}) {
  const parents = candidates.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parents[root] !== root) {
      check();
      root = parents[root];
    }
    while (parents[index] !== root) {
      check();
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const join5 = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    parents[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };
  const firstHolder = /* @__PURE__ */ new Map();
  candidates.forEach((candidate, index) => {
    check();
    for (const key of clusterKeys(candidate)) {
      if (firstHolder.has(key)) join5(firstHolder.get(key), index);
      else firstHolder.set(key, index);
    }
  });
  const groups = /* @__PURE__ */ new Map();
  candidates.forEach((candidate, index) => {
    check();
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(candidate);
  });
  return (await Promise.all(Array.from(groups.values()).map(async (items) => ({
    cluster_id: await hashId(items.map((item) => item.id).join("|")),
    title: items[0].title,
    item_ids: items.map((item) => item.id),
    urls: unique(items.map((item) => item.canonical_url || item.url)),
    sources: unique(items.map((item) => item.source)),
    top_score: Math.max(...items.map((item) => item.score || 0))
  })))).sort((a, b) => {
    check();
    return b.top_score - a.top_score;
  });
}
function clusterKeys(candidate) {
  const keys = [];
  const urlKey = candidate.canonical_url || candidate.url;
  const titleKey = normalizeTitle(candidate.title);
  if (urlKey) keys.push(`url:${urlKey}`);
  if (titleKey) keys.push(`title:${titleKey}`);
  return keys;
}
function toRejected(candidate, reason, duplicateOf) {
  return {
    reason,
    duplicate_of: duplicateOf,
    title: candidate.title,
    url: candidate.url || candidate.canonical_url,
    source: candidate.source,
    adapter_type: candidate.adapter_type
  };
}
function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
var init_dedupe = __esm({
  "tools/Content Harvester/scripts/lib/dedupe.js"() {
    init_normalize();
  }
});

// tools/Content Harvester/scripts/lib/filter.js
var filter_exports = {};
__export(filter_exports, {
  filterCandidates: () => filterCandidates
});
function filterCandidates(candidates, request, check = () => {
}) {
  const accepted = [];
  const rejected = [];
  const timebox = {
    from: new Date(request.timebox.from),
    to: new Date(request.timebox.to)
  };
  const filters = request.filters || {};
  const perSource = /* @__PURE__ */ new Map();
  for (const candidate of candidates) {
    check();
    const reason = rejectionReason(candidate, filters, timebox, perSource, check);
    if (reason) {
      rejected.push(toRejected2(candidate, reason));
      continue;
    }
    const key = sourceKey(candidate);
    perSource.set(key, (perSource.get(key) || 0) + 1);
    accepted.push(candidate);
  }
  return { accepted, rejected };
}
function rejectionReason(candidate, filters, timebox, perSource, check) {
  if (!candidate.url && !candidate.canonical_url) {
    return "missing_url";
  }
  if (candidate.published_at) {
    const published = new Date(candidate.published_at);
    if (published < timebox.from || published > timebox.to) {
      return "outside_timebox";
    }
  }
  const text = candidateText(candidate);
  if (Array.isArray(filters.exclude_terms)) {
    const matched = filters.exclude_terms.find((term) => {
      check();
      return text.includes(String(term).toLowerCase());
    });
    if (matched) return `excluded_term:${matched}`;
  }
  if (Array.isArray(filters.include_terms) && filters.include_terms.length > 0) {
    const matched = filters.include_terms.some((term) => {
      check();
      return text.includes(String(term).toLowerCase());
    });
    if (!matched) return "missing_include_term";
  }
  if (Number.isFinite(Number(filters.min_score)) && candidate.score < Number(filters.min_score)) {
    return "below_min_score";
  }
  if (Number.isFinite(Number(filters.max_items_per_source))) {
    if ((perSource.get(sourceKey(candidate)) || 0) >= Number(filters.max_items_per_source)) {
      return "source_cap_reached";
    }
  }
  return null;
}
function candidateText(candidate) {
  return [candidate.title, candidate.summary, candidate.content, candidate.url, candidate.source].filter(Boolean).join(" ").toLowerCase();
}
function sourceKey(candidate) {
  return `${candidate.adapter_type}:${candidate.source}`;
}
function toRejected2(candidate, reason) {
  return {
    reason,
    title: candidate.title,
    url: candidate.url || candidate.canonical_url,
    source: candidate.source,
    adapter_type: candidate.adapter_type
  };
}
var init_filter = __esm({
  "tools/Content Harvester/scripts/lib/filter.js"() {
  }
});

// tools/Content Harvester/scripts/lib/rank.js
var rank_exports = {};
__export(rank_exports, {
  rankCandidates: () => rankCandidates
});
function rankCandidates(candidates, request, check = () => {
}) {
  const reference = new Date(request.timebox.to);
  return candidates.map((candidate) => {
    check();
    const reasons = [];
    let score = 0;
    score += ROLE_WEIGHTS[candidate.source_role] ?? UNKNOWN_ROLE;
    reasons.push(`source_role:${candidate.source_role}`);
    if (candidate.matched_topics.length > 0) {
      score += Math.min(30, candidate.matched_topics.length * 10);
      reasons.push("topic_match");
    }
    if (candidate.published_at) {
      const ageHours = Math.max(0, (reference - new Date(candidate.published_at)) / 36e5);
      if (ageHours <= 24) {
        score += 20;
        reasons.push("recent:24h");
      } else if (ageHours <= 72) {
        score += 14;
        reasons.push("recent:72h");
      } else if (ageHours <= 168) {
        score += 8;
        reasons.push("recent:week");
      }
    } else {
      reasons.push("date_missing");
    }
    if (candidate.summary.length > 120) {
      score += 8;
      reasons.push("summary_detail");
    }
    if (candidate.content.length > 500) {
      score += 8;
      reasons.push("content_detail");
    }
    if (candidate.author) {
      score += 4;
      reasons.push("author_present");
    }
    return { ...candidate, score, score_reasons: reasons };
  }).sort((a, b) => {
    check();
    return b.score - a.score;
  });
}
var ROLE_WEIGHTS, UNKNOWN_ROLE;
var init_rank = __esm({
  "tools/Content Harvester/scripts/lib/rank.js"() {
    ROLE_WEIGHTS = {
      primary: 25,
      independent_reporting: 20,
      expert_analysis: 18,
      curated: 16,
      community: 12,
      social_signal: 10,
      discovery: 6
    };
    UNKNOWN_ROLE = 5;
  }
});

// tools/Content Harvester/scripts/lib/size.js
var size_exports = {};
__export(size_exports, {
  jsonBytes: () => jsonBytes,
  stringBytes: () => stringBytes
});
function stringBytes(value, add, check = () => {
}, quoted = false) {
  if (quoted) add(2);
  let bytes = 0, nextCheck = 0;
  for (let i = 0; i < value.length; i++) {
    if (i >= nextCheck) {
      add(bytes);
      bytes = 0;
      check();
      nextCheck = i + 2048;
    }
    const code = value.charCodeAt(i);
    if (quoted && (code === 34 || code === 92 || [8, 9, 10, 12, 13].includes(code))) bytes += 2;
    else if (quoted && code < 32) bytes += 6;
    else if (code < 128) bytes++;
    else if (code < 2048) bytes += 2;
    else if (code >= 55296 && code <= 56319 && value.charCodeAt(i + 1) >= 56320 && value.charCodeAt(i + 1) <= 57343) {
      bytes += 4;
      i++;
    } else if (quoted && code >= 55296 && code <= 57343) bytes += 6;
    else bytes += 3;
  }
  add(bytes);
  check();
}
function jsonBytes(value, add, check = () => {
}, depth = 0) {
  check();
  if (value === null) {
    add(4);
    return;
  }
  if (typeof value === "string") {
    stringBytes(value, add, check, true);
    return;
  }
  if (typeof value !== "object") {
    add(JSON.stringify(value)?.length ?? 4);
    return;
  }
  const array = Array.isArray(value);
  const keys = array ? null : Object.keys(value).filter((key) => !["undefined", "function", "symbol"].includes(typeof value[key]));
  const length = array ? value.length : keys.length;
  add(2);
  for (let i = 0; i < length; i++) {
    check();
    add((i ? 2 : 1) + (depth + 1) * 2);
    if (!array) {
      stringBytes(keys[i], add, check, true);
      add(2);
    }
    jsonBytes(value[array ? i : keys[i]], add, check, depth + 1);
  }
  if (length) add(1 + depth * 2);
}
var init_size = __esm({
  "tools/Content Harvester/scripts/lib/size.js"() {
  }
});

// tools/Content Harvester/scripts/lib/render-core.js
var render_core_exports = {};
__export(render_core_exports, {
  artifactFiles: () => artifactFiles,
  renderMarkdown: () => renderMarkdown
});
function artifactFiles(bundle, status, options = {}, check = () => {
}) {
  const encoder2 = new TextEncoder(), files = [];
  let projected = 22;
  const add = (bytes) => {
    projected += bytes;
    if (projected > 4 * 1024 * 1024) throw Object.assign(new Error("Error: output exceeds 4 MiB of projected ZIP bytes; refused whole."), { fatal: true });
  };
  const entry = (name) => add(76 + 2 * encoder2.encode(name).length);
  let markdown;
  if (options.json !== false) {
    entry("harvest-candidates.json");
    entry("harvest-run-status.json");
    jsonBytes(bundle, add, check);
    add(1);
    jsonBytes(status, add, check);
    add(1);
  }
  if (options.markdown !== false) {
    entry("harvest-summary.md");
    markdown = renderMarkdown(bundle, status, check, add);
  }
  check();
  if (options.json !== false) {
    files.push({ name: "harvest-candidates.json", mediaType: "application/json", bytes: encoder2.encode(`${JSON.stringify(bundle, null, 2)}
`) });
    files.push({ name: "harvest-run-status.json", mediaType: "application/json", bytes: encoder2.encode(`${JSON.stringify(status, null, 2)}
`) });
  }
  if (options.markdown !== false) files.push({ name: "harvest-summary.md", mediaType: "text/markdown", bytes: encoder2.encode(markdown) });
  check();
  return files;
}
function renderMarkdown(bundle, status, check = () => {
}, add = () => {
}) {
  const lines = [];
  const push = (...values) => {
    for (const value of values) {
      check();
      if (lines.length) add(1);
      stringBytes(value, add, check);
      lines.push(value);
    }
  };
  push(
    `# Harvest Summary: ${bundle.run.name}`,
    "",
    `Consumer: ${bundle.run.consumer}`,
    `Timebox: ${bundle.run.timebox.from} to ${bundle.run.timebox.to}`,
    `Topics: ${bundle.run.topics.join(", ") || "none"}`,
    "",
    "## Run Status",
    "",
    `- Completed: ${status.ok}`,
    `- Sources requested: ${status.sources_requested}`,
    `- Sources completed: ${status.sources_completed}`,
    `- Sources failed: ${status.sources_failed}`,
    `- Candidates: ${status.candidate_count}`,
    `- Rejected: ${status.rejected_count}`,
    `- Errors: ${status.error_count}`,
    "",
    "## Top Candidates",
    ""
  );
  if (bundle.candidates.length === 0) {
    push("No candidates accepted.", "");
  } else {
    for (const item of bundle.candidates.slice(0, 30)) {
      push(`### ${item.title}`);
      push("");
      push(`- Source: ${item.source} (${item.adapter_type}, ${item.source_role})`);
      push(`- URL: ${item.url || item.canonical_url}`);
      push(`- Published: ${item.published_at || "unknown"}`);
      push(`- Score: ${item.score} (${item.score_reasons.join(", ")})`);
      if (item.matched_topics.length > 0) {
        push(`- Matched topics: ${item.matched_topics.join(", ")}`);
      }
      if (item.summary) {
        push(`- Summary: ${truncate(item.summary, 500)}`);
      }
      push("");
    }
  }
  push("## Clusters", "");
  if (bundle.clusters.length === 0) {
    push("No clusters.");
  } else {
    for (const cluster of bundle.clusters.slice(0, 20)) {
      const count = cluster.item_ids.length;
      push(`- ${cluster.title} (${count} ${count === 1 ? "item" : "items"}, top score ${cluster.top_score})`);
    }
  }
  push("");
  push("## Rejections", "");
  const counts = countBy(bundle.rejected, "reason");
  if (bundle.rejected.length === 0) {
    push("No rejected items.");
  } else {
    for (const [reason, count] of Object.entries(counts)) {
      push(`- ${reason}: ${count}`);
    }
  }
  push("");
  push("## Errors", "");
  if (bundle.errors.length === 0) {
    push("No source errors.");
  } else {
    for (const error of bundle.errors) {
      push(`- ${error.source} (${error.adapter_type}): ${error.message}`);
    }
  }
  push("");
  push("## Handoff", "");
  push("These are source candidates, not verified claims, and the scores rank likely relevance, not truth. Whatever verifies claims in this workflow runs next, on the candidates selected from this list.");
  push("");
  return lines.join("\n");
}
function truncate(value, maxLength) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || "unknown";
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}
var init_render_core = __esm({
  "tools/Content Harvester/scripts/lib/render-core.js"() {
    init_size();
  }
});

// tools/lib/archive-core.js
var archive_core_exports = {};
__export(archive_core_exports, {
  archiveName: () => archiveName,
  readZip: () => readZip,
  writeZip: () => writeZip
});
function cap(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail("maxBytes must be a positive safe integer");
  return value;
}
function archiveName(value) {
  if (typeof value !== "string" || !value || /[\x00-\x1f\x7f]/.test(value)) fail("an entry has an invalid name");
  const name = value.replace(/\\/g, "/");
  if (encoder.encode(name).length > 240) fail("an entry name exceeds 240 bytes");
  if (name.split("/").filter(Boolean).length > 16) fail("an entry name exceeds 16 components");
  if (name.startsWith("/") || /^[a-z]:/i.test(name) || name.split("/").includes("..")) fail("an entry name is absolute or contains ..");
  const normalized = name.split("/").filter((part) => part && part !== ".").join("/");
  if (!normalized) fail("an entry has an empty name");
  return normalized + (name.endsWith("/") ? "/" : "");
}
function crc32(bytes) {
  let crc = 4294967295;
  for (const byte of bytes) crc = crc >>> 8 ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 4294967295) >>> 0;
}
async function inflate(bytes, limit) {
  const stream = new ReadableStream({ start(controller) {
    controller.enqueue(bytes);
    controller.close();
  } }).pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader(), chunks = [];
  let length = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        fail("expanded total exceeds 4 times the declared cap or the entry size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
async function readZip(bytes, { maxBytes } = {}) {
  cap(maxBytes);
  if (!(bytes instanceof Uint8Array)) fail("input must be bytes");
  if (bytes.length > maxBytes) fail("input exceeds the declared size cap");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const check = (at2, size) => {
    if (at2 < 0 || at2 + size > bytes.length) fail("archive is truncated");
  };
  const u16 = (at2) => {
    check(at2, 2);
    return view.getUint16(at2, true);
  };
  const u32 = (at2) => {
    check(at2, 4);
    return view.getUint32(at2, true);
  };
  let end = -1;
  for (let at2 = bytes.length - 22; at2 >= Math.max(0, bytes.length - 65557); at2--) {
    if (u32(at2) === 101010256 && at2 + 22 + u16(at2 + 20) === bytes.length) {
      end = at2;
      break;
    }
  }
  if (end < 0) fail("end record is missing");
  const count = u16(end + 10), directorySize = u32(end + 12), directory = u32(end + 16);
  if (u16(end + 4) || u16(end + 6) || u16(end + 8) !== count) fail("split archives are unsupported");
  if (count > 1e3) fail("more than 1,000 entries");
  if (directory + directorySize !== end) fail("ZIP64 or invalid directory bounds");
  const entries = [], names = /* @__PURE__ */ new Set(), spans = [];
  let at = directory, expanded = 0;
  for (let index = 0; index < count; index++) {
    check(at, 46);
    if (u32(at) !== 33639248) fail("invalid directory entry");
    const flags = u16(at + 8), method = u16(at + 10), crc = u32(at + 16);
    const packed = u32(at + 20), size = u32(at + 24), nameLength = u16(at + 28);
    const extraLength = u16(at + 30), commentLength = u16(at + 32), local = u32(at + 42);
    if (nameLength > 240) fail("an entry name exceeds 240 bytes");
    check(at + 46, nameLength + extraLength + commentLength);
    if (flags & ~2062 || flags & 1) fail("encrypted or unsupported flags");
    if (method !== 0 && method !== 8) fail("entry compression must be stored or deflated");
    if (u16(at + 34) || packed === 4294967295 || size === 4294967295 || local === 4294967295) fail("ZIP64 or split entries are unsupported");
    if ((u32(at + 38) >>> 16 & 61440) === 40960) fail("symbolic-link entries are unsupported");
    let raw;
    try {
      raw = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    } catch {
      fail("entry names must be UTF-8");
    }
    const name = archiveName(raw), key = name.replace(/\/$/, "");
    if (names.has(key)) fail("duplicate entry names");
    names.add(key);
    expanded += size;
    if (expanded > maxBytes * 4) fail("expanded total exceeds 4 times the declared cap");
    check(local, 30);
    if (u32(local) !== 67324752 || u16(local + 6) !== flags || u16(local + 8) !== method) fail("local and directory headers disagree");
    const localLength = u16(local + 26), data = local + 30 + localLength + u16(local + 28);
    check(local + 30, localLength);
    if (localLength !== nameLength || bytes.subarray(local + 30, local + 30 + localLength).some((byte, i) => byte !== bytes[at + 46 + i])) fail("local and directory names disagree");
    if (!(flags & 8) && (u32(local + 14) !== crc || u32(local + 18) !== packed || u32(local + 22) !== size)) fail("local and directory sizes disagree");
    if (data + packed > directory) fail("entry data overlaps the directory");
    spans.push([local, data + packed]);
    entries.push({ name, method, crc, packed, size, data });
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (at !== end) fail("directory size disagrees with its entries");
  spans.sort((a, b) => a[0] - b[0]);
  if (spans.some((span, i) => i && span[0] < spans[i - 1][1])) fail("entry data overlaps another entry");
  const files = [];
  for (const entry of entries) {
    const packed = bytes.subarray(entry.data, entry.data + entry.packed);
    let body;
    try {
      body = entry.method === 0 ? packed.slice() : await inflate(packed, entry.size);
    } catch (error) {
      if (error.message.startsWith("ZIP refused:")) throw error;
      fail("deflated data is invalid");
    }
    if (body.length !== entry.size || crc32(body) !== entry.crc) fail("entry size or CRC does not match");
    if (!entry.name.endsWith("/")) files.push({ name: entry.name, bytes: body });
    else if (body.length) fail("a directory entry contains data");
  }
  const fileNames = new Set(files.map((file) => file.name));
  for (const file of files) {
    const parts = file.name.split("/");
    let prefix = parts[0];
    for (let i = 1; i < parts.length; i++) {
      if (fileNames.has(prefix)) fail("a file is also used as a directory");
      prefix += "/" + parts[i];
    }
  }
  return files;
}
async function writeZip(files, { maxBytes } = {}) {
  cap(maxBytes);
  if (!Array.isArray(files) || files.length > 1e3) fail("more than 1,000 entries or invalid file list");
  const names = /* @__PURE__ */ new Set();
  let length = 22;
  const entries = files.map((file) => {
    const name = archiveName(file.name), encoded = encoder.encode(name);
    if (!(file.bytes instanceof Uint8Array) || encoded.length > 65535 || name.endsWith("/")) fail("invalid output entry");
    if (names.has(name)) fail("duplicate entry names");
    names.add(name);
    length += 76 + 2 * encoded.length + file.bytes.length;
    return { name, encoded, bytes: file.bytes, crc: crc32(file.bytes) };
  });
  if (length > maxBytes) fail("output exceeds the declared size cap");
  const bytes = new Uint8Array(length), view = new DataView(bytes.buffer);
  const u16 = (at2, n) => view.setUint16(at2, n, true), u32 = (at2, n) => view.setUint32(at2, n, true);
  let at = 0;
  for (const entry of entries) {
    entry.offset = at;
    u32(at, 67324752);
    u16(at + 4, 20);
    u16(at + 6, 2048);
    u16(at + 12, 33);
    u32(at + 14, entry.crc);
    u32(at + 18, entry.bytes.length);
    u32(at + 22, entry.bytes.length);
    u16(at + 26, entry.encoded.length);
    bytes.set(entry.encoded, at + 30);
    bytes.set(entry.bytes, at + 30 + entry.encoded.length);
    at += 30 + entry.encoded.length + entry.bytes.length;
  }
  const directory = at;
  for (const entry of entries) {
    u32(at, 33639248);
    u16(at + 4, 20);
    u16(at + 6, 20);
    u16(at + 8, 2048);
    u16(at + 14, 33);
    u32(at + 16, entry.crc);
    u32(at + 20, entry.bytes.length);
    u32(at + 24, entry.bytes.length);
    u16(at + 28, entry.encoded.length);
    u32(at + 42, entry.offset);
    bytes.set(entry.encoded, at + 46);
    at += 46 + entry.encoded.length;
  }
  u32(at, 101010256);
  u16(at + 8, entries.length);
  u16(at + 10, entries.length);
  u32(at + 12, at - directory);
  u32(at + 16, directory);
  return bytes;
}
var encoder, decoder, fail, crcTable;
var init_archive_core = __esm({
  "tools/lib/archive-core.js"() {
    encoder = new TextEncoder();
    decoder = new TextDecoder("utf-8", { fatal: true });
    fail = (reason) => {
      throw new Error(`ZIP refused: ${reason}.`);
    };
    crcTable = Array.from({ length: 256 }, (_, n) => {
      for (let bit = 0; bit < 8; bit++) n = n >>> 1 ^ (n & 1 ? 3988292384 : 0);
      return n >>> 0;
    });
  }
});

// tools/Content Harvester/scripts/harvest-core.js
var harvest_core_exports = {};
__export(harvest_core_exports, {
  harvest: () => harvest
});
async function harvest(input = {}, files = [], fetch, lookup, { now = () => /* @__PURE__ */ new Date(), startedAt = now(), timeoutMs = 15e3, clock = () => performance.now(), hashId } = {}) {
  const controller = new AbortController(), signal = controller.signal;
  const deadline = clock() + Math.min(timeoutMs, 15e3);
  const deadlineError = () => Object.assign(new Error("Error: harvest exceeded its 15-second deadline; refused whole."), { fatal: true });
  const check = () => {
    if (signal.aborted || clock() >= deadline) {
      controller.abort();
      throw deadlineError();
    }
  };
  check();
  if (input.command !== "run") fail2("Error: hosted command must be run.");
  if (input.dryRun) fail2("Error: dryRun is a command-line preparation option only.");
  if (!Array.isArray(files) || files.length > 1) fail2("Error: supply at most one harvest request file.");
  if (new TextEncoder().encode(JSON.stringify(input)).length > 1024 * 1024 || files.some((file) => !(file.bytes instanceof Uint8Array) || file.bytes.length > 1024 * 1024)) fail2("Error: harvest input exceeds 1 MiB or is not bytes.");
  let request = input.request;
  if (files.length) {
    try {
      request = JSON.parse(new TextDecoder("utf-8", { ignoreBOM: true }).decode(files[0].bytes));
    } catch {
      fail2(`Error: ${input.requestName || files[0].name} is not valid JSON. Run "node scripts/harvest.js sample" for a request this tool accepts.`);
    }
  }
  check();
  const problems = validateRequest(request, check);
  if (problems.length) fail2(`Error: ${input.requestName || files[0]?.name || "request"} is not a valid harvest request:
- ${problems.join("\n- ")}`);
  const bounded = (value) => {
    if (JSON.stringify(value).length >= 48e3) fail2("Error: answer reaches 48,000 serialized characters; refused whole.");
    return value;
  };
  const runId = startedAt.toISOString().replace(/[:.]/g, "-");
  const outputDirectory = input.outputDirectory || runId;
  const sources = activeSources(request);
  let topics = request.topics.length;
  for (const source of sources) {
    check();
    if (source.topics !== void 0 && !Array.isArray(source.topics)) fail2("Error: source topics must be an array.");
    topics += source.topics?.length || 0;
  }
  if (topics > 100) fail2("Error: harvest exceeds 100 topics across request and active sources; refused whole.");
  let topicBytes = 0;
  const addTopicBytes = (bytes) => {
    topicBytes += bytes;
    if (topicBytes > 16384) fail2("Error: harvest exceeds 16 KiB of UTF-8 topics across request and active sources; refused whole.");
  };
  for (const list of [request.topics, ...sources.map((source) => source.topics || [])]) {
    for (const topic of list) stringBytes(String(topic), addTopicBytes, check);
  }
  for (const key of ["exclude_terms", "include_terms"]) {
    const terms = request.filters?.[key];
    if (terms !== void 0 && !Array.isArray(terms)) fail2(`Error: ${key} must be an array.`);
    if (terms?.length > 100) fail2(`Error: harvest exceeds 100 ${key} terms; refused whole.`);
    let termBytes = 0;
    for (const term of terms || []) stringBytes(String(term), (bytes) => {
      termBytes += bytes;
      if (termBytes > 16384) fail2(`Error: harvest exceeds 16 KiB of UTF-8 ${key} terms; refused whole.`);
    }, check);
  }
  const addressCount = sources.reduce((n, source) => n + (source.type === "manual_urls" ? source.urls.length : FEED_TYPES.has(source.type) || source.type === "url" ? 1 : 0), 0);
  if (sources.length > 25 || addressCount > 100) fail2("Error: harvest exceeds 25 active sources or 100 public addresses; refused whole.");
  if (typeof fetch !== "function" || typeof lookup !== "function" || typeof hashId !== "function") fail2("Error: the host must supply fetch, DNS lookup and hashId.");
  let timer, requests = 0, items = 0;
  const hostFetch = fetch;
  fetch = (...args) => {
    check();
    if (++requests > 100) fail2("Error: harvest exceeds 100 requests including redirects; refused whole.");
    return hostFetch(...args);
  };
  const job = async () => {
    const context = {
      requestTopics: request.topics || [],
      discoveredAt: startedAt.toISOString(),
      userAgent: request.user_agent || "Content Harvester/0.1.0",
      timeoutMs: Number(request.timeout_ms || 15e3),
      fetch,
      lookup,
      signal,
      check,
      maxBodyBytes: 1024 * 1024,
      receivedBytes: 0,
      acceptItems(count) {
        check();
        items += count;
        if (items > 1e3) fail2("Error: harvest exceeds 1,000 items accepted for processing; refused whole.");
      },
      async hashId(value) {
        check();
        const id = await hashId(value);
        check();
        return id;
      }
    };
    const collected = await collectSources(request, context);
    const ranked = rankCandidates(collected.candidates, request, check);
    const filtered = filterCandidates(ranked, request, check);
    const clusters = await clusterCandidates(filtered.accepted, context);
    const deduped = dedupeCandidates(filtered.accepted, check);
    const finishedAt = now();
    const bundle = {
      schema_version: 1,
      run: {
        id: runId,
        name: request.name,
        consumer: request.consumer,
        timebox: request.timebox,
        topics: request.topics || []
      },
      candidates: deduped.accepted,
      clusters,
      rejected: [...collected.rejected, ...filtered.rejected, ...deduped.rejected],
      errors: collected.errors
    };
    const status = {
      ok: true,
      reason: "completed",
      started_at: startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      sources_requested: activeSources(request).length,
      sources_completed: collected.sourcesCompleted,
      sources_failed: collected.sourcesFailed,
      candidate_count: bundle.candidates.length,
      rejected_count: bundle.rejected.length,
      error_count: bundle.errors.length,
      output_directory: outputDirectory
    };
    check();
    const answer = bounded({ ok: true, candidate_count: bundle.candidates.length, rejected_count: bundle.rejected.length, error_count: bundle.errors.length, output_directory: outputDirectory });
    const bytes = await writeZip(artifactFiles(bundle, status, request.output || {}, check), { maxBytes: 4 * 1024 * 1024 });
    check();
    return { answer, files: [{ name: "harvest.zip", mediaType: "application/zip", bytes }] };
  };
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(deadlineError());
      }, Math.max(0, deadline - clock()));
    });
    const work = job();
    work.catch(() => {
    });
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
async function collectSources(harvestRequest, runContext) {
  const { collectFeed: collectFeed2 } = await Promise.resolve().then(() => (init_rss(), rss_exports));
  const candidates = [];
  const rejected = [];
  const errors = [];
  let sourcesCompleted = 0;
  let sourcesFailed = 0;
  for (const source of activeSources(harvestRequest)) {
    runContext.check();
    try {
      if (FEED_TYPES.has(source.type)) {
        candidates.push(...await collectFeed2(source, runContext));
      } else if (source.type === "url") {
        candidates.push(...await collectUrl(source, runContext));
      } else if (source.type === "manual_urls") {
        const result = await collectManualUrls(source, runContext);
        candidates.push(...result.candidates);
        errors.push(...result.errors);
      } else {
        rejected.push({
          reason: "unsupported_adapter_type",
          source: sourceLabel(source),
          adapter_type: source.type
        });
      }
      sourcesCompleted++;
    } catch (error) {
      runContext.check();
      if (error.fatal) throw error;
      sourcesFailed++;
      errors.push({
        source: sourceLabel(source),
        adapter_type: source.type,
        message: error.message,
        retryable: Boolean(error.retryable),
        ...error.reason ? { reason: error.reason } : {}
      });
    }
  }
  return { candidates, rejected, errors, sourcesCompleted, sourcesFailed };
}
function activeSources(harvestRequest) {
  return (harvestRequest.sources || []).filter((source) => source.enabled !== false);
}
function sourceLabel(source) {
  return source.source || source.name || "Unnamed source";
}
var FEED_TYPES, fail2;
var init_harvest_core = __esm({
  "tools/Content Harvester/scripts/harvest-core.js"() {
    init_urls();
    init_dedupe();
    init_filter();
    init_rank();
    init_render_core();
    init_request();
    init_size();
    init_archive_core();
    FEED_TYPES = /* @__PURE__ */ new Set(["rss", "substack_rss", "reddit_rss"]);
    fail2 = (message) => {
      const error = new Error(message);
      error.fatal = true;
      throw error;
    };
  }
});

// tools/Content Harvester/scripts/harvest.js
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants as constants2, cpSync, existsSync as existsSync4, mkdirSync as mkdirSync2, mkdtempSync, readFileSync as readFileSync4, realpathSync as realpathSync3, rmSync as rmSync2, statSync as statSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { tmpdir } from "node:os";
import { basename as basename2, dirname as dirname3, isAbsolute, join as join4, resolve as resolve2, sep as sep3 } from "node:path";
import { fileURLToPath as fileURLToPath2, pathToFileURL as pathToFileURL2 } from "node:url";

// tools/lib/one-file.js
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function packagesBundled() {
  return true;
}
async function packagesAvailable(marker, loadPackages, external = []) {
  return (await packageAvailability(marker, loadPackages, external)).available;
}
async function packageAvailability(marker, loadPackages, external) {
  if (packagesBundled()) return { available: true };
  const unavailable = { available: false };
  if (!existsSync(marker)) return unavailable;
  try {
    let dir = dirname(marker);
    while (dirname(dir) !== dir && basename(dir) !== "node_modules") dir = dirname(dir);
    if (basename(dir) !== "node_modules") return unavailable;
    dir = dirname(dir);
    const lock = JSON.parse(readFileSync(join(dir, "package-lock.json")));
    const requested = relative(dir, dirname(marker)).split(sep).join("/");
    if (!lock.packages[requested]?.version) return unavailable;
    let incomplete = false;
    for (const [path, expected] of Object.entries(lock.packages)) {
      if (!path.startsWith("node_modules/") || external.includes(path.slice("node_modules/".length))) continue;
      let installed;
      try {
        installed = JSON.parse(readFileSync(join(dir, path, "package.json"))).version;
      } catch {
        incomplete = true;
        continue;
      }
      if (!expected.version || !installed) {
        incomplete = true;
        continue;
      }
      if (installed !== expected.version) return {
        available: false,
        mismatch: { package: path.slice("node_modules/".length), installed, locked: expected.version }
      };
    }
    if (incomplete) return unavailable;
    await loadPackages();
    return { available: true };
  } catch {
    return unavailable;
  }
}
async function compiledEntry(marker, loadPackages, entryUrl, name, external = []) {
  const state = await packageAvailability(marker, loadPackages, external);
  if (state.available) return null;
  const url = pathToFileURL(resolve(dirname(realpathSync(fileURLToPath(entryUrl))), "..", "dist", `${name}.mjs`));
  if (!existsSync(url)) return null;
  if (state.mismatch) {
    const { package: pkg, installed, locked } = state.mismatch;
    process.stderr.write(`Using compiled ${name}: ${pkg} installed version ${installed} differs from locked version ${locked}.
`);
  }
  return url.href;
}
function sameFile(a, b) {
  if (process.platform === "win32" && a.toLowerCase() === b.toLowerCase()) return true;
  const x = statSync(a, { bigint: true }), y = statSync(b, { bigint: true });
  return x.ino !== 0n && x.dev === y.dev && x.ino === y.ino;
}
function isMain(url) {
  const file = fileURLToPath(url);
  try {
    if (!process.argv[1]) throw new Error("process.argv[1] is missing");
    const a = realpathSync(file), b = realpathSync(process.argv[1]);
    return a === b || sameFile(a, b);
  } catch (error) {
    if (process.argv[1] && resolve(file) === resolve(process.argv[1])) return true;
    const cause = String(error.message).replace(/[\r\n]+/g, " ");
    process.stderr.write(`Cannot determine whether ${file} is the program: ${cause}. Run this file directly with node.
`);
    process.exitCode = 1;
    return false;
  }
}

// tools/lib/consent.js
import { closeSync, constants, existsSync as existsSync2, fstatSync, lstatSync, mkdirSync, openSync, readFileSync as readFileSync2, realpathSync as realpathSync2, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname as dirname2, join as join3 } from "node:path";

// tools/lib/user-config.js
import { homedir } from "node:os";
import { join as join2 } from "node:path";
function wiserUserConfigDir(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === "win32") {
    const base = env.APPDATA && env.APPDATA.length > 0 ? env.APPDATA : join2(home, "AppData", "Roaming");
    return join2(base, "wiser");
  }
  if (platform === "darwin") return join2(home, "Library", "Application Support", "wiser");
  const xdg = env.XDG_CONFIG_HOME;
  if (typeof xdg === "string" && xdg.length > 0) return join2(xdg, "wiser");
  return join2(home, ".config", "wiser");
}

// tools/lib/consent.js
var INSTALL_ONCE = "You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.";
var INSTALL_HELP = "Say yes to the download this tool needs. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.";
var INSTALL_COPY_ONLY = "Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason: ";
var INSTALL_NOT_SAVED = "Wiser will install this now, but it couldn't remember your yes, so you'll be asked again next time. Reason: ";
function installQuestion(what, purpose, size) {
  return "This Wiser skill needs to download and install " + what + " on your machine in order to " + purpose + "." + (size ? " It's about " + size + "." : "") + " " + INSTALL_ONCE;
}
function formatInstallSize(bytes) {
  const kb = Math.max(1, Math.round(bytes / 1e3));
  const tenths = Math.round(bytes / 1e5);
  const mb = bytes / 1e6;
  if (mb < 1) return kb < 1e3 ? `${kb} KB` : "1.0 MB";
  if (mb < 10) return tenths < 100 ? `${(tenths / 10).toFixed(1)} MB` : "10 MB";
  const rounded = Math.round(mb / (mb >= 100 ? 10 : 1)) * (mb >= 100 ? 10 : 1);
  return rounded >= 1e3 ? `${(Math.round(bytes / 1e8) / 10).toFixed(1)} GB` : `${rounded} MB`;
}
var MARKER_NAME = ".wiser-consent";
function pluginRoot(fromFile) {
  let dir = dirname2(fromFile);
  for (; ; ) {
    if (existsSync2(join3(dir, "tools", "AGENTS.md"))) {
      try {
        return realpathSync2(dir);
      } catch {
        return null;
      }
    }
    const parent = dirname2(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function parsedInstallFlag(argv, valueFlags) {
  const flags = valueFlags || /* @__PURE__ */ new Set();
  const values = /* @__PURE__ */ new Set();
  for (let index = 0; index < argv.length; index += 1) {
    if (values.has(index)) continue;
    if (flags.has(argv[index])) values.add(index + 1);
  }
  for (let index = 0; index < argv.length; index += 1) {
    if (values.has(index)) continue;
    if (argv[index] === "--install") return true;
  }
  return false;
}
function flagAuthorised(install) {
  return install === true || process.env.WISER_ALLOW_INSTALL === "1";
}
function trustedDirectory(dir) {
  const info = lstatSync(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("the user-config directory is not a real directory");
  if (process.platform !== "win32") {
    if (info.uid !== process.getuid()) throw new Error("the user-config directory is owned by another user");
    if (info.mode & 18) throw new Error("the user-config directory is writable by group or others");
  }
}
function personConsent() {
  let fd;
  try {
    const dir = wiserUserConfigDir();
    trustedDirectory(dir);
    fd = openSync(join3(dir, MARKER_NAME), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const info = fstatSync(fd);
    if (!info.isFile() || process.platform !== "win32" && (info.uid !== process.getuid() || info.mode & 18)) return false;
    const data = JSON.parse(readFileSync2(fd, "utf8"));
    return data?.scope === "person" && typeof data.tool === "string" && data.tool.length > 0 && typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && !data.date.startsWith("0000-") && Number.isFinite(Date.parse(data.date)) && new Date(data.date).toISOString().slice(0, 10) === data.date;
  } catch {
    return false;
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}
function installAuthorised(fromFile, install) {
  if (flagAuthorised(install) || personConsent()) return true;
  const root = pluginRoot(fromFile);
  if (!root) return false;
  let fd;
  try {
    fd = openSync(join3(root, MARKER_NAME), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    if (!fstatSync(fd).isFile()) return false;
    const data = JSON.parse(readFileSync2(fd, "utf8"));
    return typeof data?.realpath === "string" && data.realpath === root;
  } catch {
    return false;
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}
function writeMarker(file, data) {
  const temporary = `${file}.tmp-${randomUUID()}`;
  let fd;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 384);
    writeFileSync(fd, `${JSON.stringify(data)}
`);
    closeSync(fd);
    fd = void 0;
    renameSync(temporary, file);
  } finally {
    if (fd !== void 0) closeSync(fd);
    rmSync(temporary, { force: true });
  }
}
var warned = /* @__PURE__ */ new Set();
function copyOnly(error, saved = true) {
  const reason = String(error.message || error.code || error).split(/[\r\n]/)[0];
  const message = `${saved ? INSTALL_COPY_ONLY : INSTALL_NOT_SAVED}${reason}.`;
  if (!warned.has(message)) {
    process.stderr.write(`${message}
`);
    warned.add(message);
  }
}
function writeConsent(fromFile, tool, install) {
  if (!flagAuthorised(install)) {
    if (!installAuthorised(fromFile, false)) return;
    if (!personConsent()) {
      try {
        trustedDirectory(wiserUserConfigDir());
      } catch (error) {
        copyOnly(error);
      }
    }
    return;
  }
  const root = pluginRoot(fromFile);
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  let personError;
  let copySaved = false;
  try {
    const dir = wiserUserConfigDir();
    mkdirSync(dir, { recursive: true, mode: 448 });
    trustedDirectory(dir);
    writeMarker(join3(dir, MARKER_NAME), { scope: "person", date, tool });
  } catch (error) {
    personError = error;
  }
  if (root) {
    try {
      writeMarker(join3(root, MARKER_NAME), { realpath: root, date, tool });
      copySaved = true;
    } catch {
    }
  }
  if (personError) copyOnly(personError, copySaved);
}
var INSTALL_BYTES = Object.freeze({
  chromium: 578678784,
  playwright: 19120128,
  mermaid: 64602112,
  reveal: 6045696,
  image: 16936960,
  harvester: 3768320,
  request: 1617920,
  data: 1499136,
  keynote: 1310720
});

// tools/Content Harvester/scripts/harvest.js
var HERE = realpathSync3(fileURLToPath2(import.meta.url));
var SCRIPT_DIR = dirname3(HERE);
var TOOL_DIR = resolve2(SCRIPT_DIR, "..");
async function main(argv = process.argv.slice(2)) {
  const XML_MARKER = join4(TOOL_DIR, "node_modules", "fast-xml-parser", "package.json");
  const UNDICI_MARKER = join4(TOOL_DIR, "node_modules", "undici", "package.json");
  const server = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"].map((name) => process.env[name]?.trim()).find(Boolean);
  async function dependenciesAvailable() {
    if (!await packagesAvailable(XML_MARKER, () => Promise.resolve().then(() => (init_rss(), rss_exports)), ["undici"])) return false;
    if (!server) return true;
    if (!existsSync4(UNDICI_MARKER)) return false;
    try {
      const lock = JSON.parse(readFileSync4(join4(TOOL_DIR, "package-lock.json")));
      if (JSON.parse(readFileSync4(UNDICI_MARKER)).version !== lock.packages["node_modules/undici"].version) return false;
      await import("undici");
      return true;
    } catch {
      return false;
    }
  }
  const COMMANDS = /* @__PURE__ */ new Set(["run", "validate", "sample"]);
  const USAGE = `Content Harvester - turns one harvest request into a candidate bundle

Usage:
  node scripts/harvest.js help
  node scripts/harvest.js sample
  node scripts/harvest.js validate --request <path>
  node scripts/harvest.js run --request <path> [--output <dir>] [--dry-run]

Commands:
  run              Collect, rank, filter, deduplicate, and write the bundle
  validate         Check a request's structure; fetches nothing
  sample           Print a starter request to stdout
  help             Print this message

Options:
  --request <path> Harvest request JSON, absolute, outside this tool directory.
                   Required by run and validate.
  --output <dir>   Write the bundle here instead of the directory the request
                   names. Absolute, and must resolve outside this tool
                   directory.
  --dry-run        Validate and plan the run; fetch nothing, write nothing.
  --install          ${INSTALL_HELP}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --help, -h       Print this message

Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;
  function fail3(message) {
    process.stderr.write(`${message}
`);
    process.exit(1);
  }
  const command = argv[0] ?? "help";
  if (command === "help" || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}
`);
    process.exit(0);
  }
  if (command === "run" && !argv.includes("--dry-run")) {
    const compiled = await compiledEntry(XML_MARKER, () => Promise.resolve().then(() => (init_rss(), rss_exports)), import.meta.url, "harvest", ["undici"]);
    if (compiled) return (await import(compiled)).main(argv);
  }
  if (!COMMANDS.has(command)) {
    fail3(`Error: unknown command "${command}". Run "node scripts/harvest.js help" for usage.`);
  }
  const VALUE_FLAGS = /* @__PURE__ */ new Set(["--request", "--output"]);
  const BARE_FLAGS = /* @__PURE__ */ new Set([
    "--install",
    "--dry-run",
    "--help",
    "-h"
  ]);
  const valuePositions = /* @__PURE__ */ new Set();
  for (let index = 1; index < argv.length; index += 1) {
    if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
  }
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (valuePositions.has(index)) continue;
    if (option.startsWith("-") && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
      fail3(`Error: unknown option "${option}". Run "node scripts/harvest.js help" for usage.`);
    }
  }
  const install = parsedInstallFlag(argv, VALUE_FLAGS);
  function flag(name) {
    const index = argv.indexOf(name);
    if (index === -1) return void 0;
    const value = argv[index + 1];
    if (argv.indexOf(name, index + 1) !== -1) {
      fail3(`Error: ${name} was given more than once and takes one value. Run "node scripts/harvest.js help" for usage.`);
    }
    if (value === void 0 || value.startsWith("--")) {
      fail3(`Error: ${name} needs a value. Run "node scripts/harvest.js help" for usage.`);
    }
    return value;
  }
  const dryRun = argv.includes("--dry-run");
  function canonical(label, candidate) {
    const absolute = resolve2(candidate);
    const missing = [];
    let head = absolute;
    for (; ; ) {
      try {
        const real = realpathSync3(head);
        return missing.length === 0 ? real : join4(real, ...missing);
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") {
          fail3(`Error: ${label} could not be resolved to a real path at ${head}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
        }
        const parent = dirname3(head);
        if (parent === head) return absolute;
        missing.unshift(basename2(head));
        head = parent;
      }
    }
  }
  function insideToolDirectory(target) {
    const root = canonical("this tool directory", TOOL_DIR);
    if (target === root || target.startsWith(root + sep3)) return true;
    let rootId;
    try {
      rootId = statSync2(root);
    } catch {
      return false;
    }
    let head = target;
    for (; ; ) {
      try {
        const id = statSync2(head);
        if (id.dev === rootId.dev && id.ino === rootId.ino) return true;
      } catch {
      }
      const parent = dirname3(head);
      if (parent === head) return false;
      head = parent;
    }
  }
  function callerPath(name, value) {
    if (!isAbsolute(value)) {
      fail3(`Error: ${name} must be absolute; got "${value}". A relative path resolves against whichever directory the caller happened to be in.`);
    }
    const target = canonical(name, value);
    if (insideToolDirectory(target)) {
      fail3(`Error: ${name} resolves inside this tool directory (${canonical("this tool directory", TOOL_DIR)}). Scripts read and write only in a work directory in the owning root; pass that path instead.`);
    }
    return target;
  }
  const { sampleRequest: sampleRequest2, validateRequest: validateRequest2 } = await Promise.resolve().then(() => (init_request(), request_exports));
  const { loadRequest: loadRequest2 } = await Promise.resolve().then(() => (init_request_cli(), request_cli_exports));
  if (command === "sample") {
    process.stdout.write(`${JSON.stringify(sampleRequest2(), null, 2)}
`);
    process.exit(0);
  }
  const requestPathArg = flag("--request");
  if (!requestPathArg) {
    fail3(`Error: --request is required for ${command}. Run "node scripts/harvest.js help" for usage.`);
  }
  const { request, requestPath } = loadRequest2(callerPath("--request", requestPathArg), fail3);
  const problems = validateRequest2(request);
  if (problems.length > 0) {
    fail3(`Error: ${requestPath} is not a valid harvest request:
- ${problems.join("\n- ")}`);
  }
  if (command === "validate") {
    process.stdout.write(`${JSON.stringify({ ok: true, name: request.name, sources: activeSources2(request).length })}
`);
    process.exit(0);
  }
  const startedAt = /* @__PURE__ */ new Date();
  const runId = startedAt.toISOString().replace(/[:.]/g, "-");
  const outputDirectory = canonical("the output directory", join4(resolveOutputBase(), runId));
  if (insideToolDirectory(outputDirectory)) {
    fail3(`Error: the output directory resolves inside this tool directory (${canonical("this tool directory", TOOL_DIR)}). Scripts write only to a work directory in the owning root; pass that path as --output, or set output.directory in the request to a path outside this directory.`);
  }
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      dry_run: true,
      request: request.name,
      sources_requested: activeSources2(request).length,
      output_directory: outputDirectory
    })}
`);
    process.exit(0);
  }
  function isWritable(dir) {
    try {
      accessSync(dir, constants2.W_OK);
      return true;
    } catch {
      return false;
    }
  }
  const WILL_FETCH_BROWSER = false;
  const proxyOnly = packagesBundled() || await packagesAvailable(XML_MARKER, () => Promise.resolve().then(() => (init_rss(), rss_exports)), ["undici"]);
  function installPlan() {
    let names = [];
    try {
      names = Object.keys(JSON.parse(readFileSync4(join4(TOOL_DIR, "package.json"), "utf8")).dependencies || {});
    } catch {
    }
    if (proxyOnly) names = ["undici"];
    const browser = names.includes("playwright");
    return {
      list: names.length ? names.join(", ") : "the packages package.json declares",
      hosts: "registry.npmjs.org",
      // KEYED ON THIS RUN, not on the tool. Round 8 found this promising a browser
      // download on `deck-export scaffold --install`, which makes none; round 9
      // found the hedge that replaced it naming "a survey" as an example of a
      // command that fetches no browser, which `check --install` had just
      // falsified in the same commit. `WILL_FETCH_BROWSER` is set by each entry
      // script from the command it is actually running, so the report describes
      // this run rather than the tool's general capabilities.
      size: browser && WILL_FETCH_BROWSER ? " This run then fetches the Chromium build, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform." : ""
    };
  }
  function requireInstallConsent(what) {
    if (installAuthorised(HERE, install)) {
      writeConsent(HERE, "Content Harvester", install);
      return;
    }
    if (what === "browser") {
      fail3(
        `${installQuestion("a private copy of the Chromium browser", "gather and rank sources from the feeds and pages you name", formatInstallSize(INSTALL_BYTES.chromium))}

Details for the assistant: this tool's packages are installed but the Chromium build they drive is not, and this person has not authorised a Wiser install. Installing fetches that build from cdn.playwright.dev, or playwright.download.prss.microsoft.com when Playwright falls back, several hundred megabytes, into wherever Playwright keeps browser builds on this machine. No package is fetched and npm is not run. tools/AGENTS.md lists every write an install makes and names where the build lands. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
      );
    }
    const { list, hosts, size } = installPlan();
    fail3(
      `${installQuestion(proxyOnly ? "undici" : "a feed reader and a small web-request library", proxyOnly ? "use the selected proxy" : "gather and rank sources from the feeds and pages you name", formatInstallSize(proxyOnly ? INSTALL_BYTES.request : INSTALL_BYTES.harvester))}

Details for the assistant: this tool is not installed yet and this person has not authorised a Wiser install. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  function installProxy(npm) {
    const lock = JSON.parse(readFileSync4(join4(TOOL_DIR, "package-lock.json")));
    const locked = lock.packages["node_modules/undici"];
    if (!locked?.version || !locked.integrity || Object.keys(locked.dependencies || {}).length) {
      throw new Error("The proxy package lock must pin undici with no dependencies.");
    }
    const scratch = mkdtempSync(join4(tmpdir(), "wiser-harvester-proxy-"));
    try {
      const manifest = { name: "wiser-harvester-proxy", version: "1.0.0", private: true, dependencies: { undici: locked.version } };
      writeFileSync2(join4(scratch, "package.json"), JSON.stringify(manifest));
      writeFileSync2(join4(scratch, "package-lock.json"), JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages: { "": manifest, "node_modules/undici": locked } }));
      execFileSync(npm, ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: scratch, stdio: ["ignore", "ignore", "inherit"] });
      mkdirSync2(join4(TOOL_DIR, "node_modules"), { recursive: true });
      rmSync2(join4(TOOL_DIR, "node_modules/undici"), { recursive: true, force: true });
      cpSync(join4(scratch, "node_modules/undici"), join4(TOOL_DIR, "node_modules/undici"), { recursive: true });
    } finally {
      rmSync2(scratch, { recursive: true, force: true });
    }
  }
  if (!await dependenciesAvailable()) {
    requireInstallConsent("packages");
    process.stderr.write(proxyOnly ? "First run: installing dependencies in a temporary directory; copying undici into this tool directory.\n" : "First run: installing dependencies in this tool directory.\n");
    try {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      if (proxyOnly) installProxy(npm);
      else execFileSync(npm, ["ci"], { cwd: TOOL_DIR, stdio: ["ignore", "ignore", "inherit"] });
    } catch (error) {
      if (proxyOnly) {
        fail3(`Error: the temporary undici install failed: ${error.message}. This tool's package.json and package-lock.json were left unchanged. Fix the reported cause and retry the same command.`);
      }
      if (!isWritable(TOOL_DIR)) {
        fail3(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
      }
      fail3(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
    }
    if (!await dependenciesAvailable()) {
      fail3("Error: npm ci finished but the required packages do not load. Restore this plugin copy and run again.");
    }
  }
  if (server) {
    const undici = await import("undici");
    if (typeof undici.setGlobalDispatcher !== "function" || typeof undici.ProxyAgent !== "function") {
      fail3("Error: the installed undici cannot configure the selected proxy. Restore this tool’s dependencies with npm ci.");
    }
    try {
      undici.setGlobalDispatcher(new undici.ProxyAgent(server));
    } catch {
      fail3("Error: the installed undici cannot configure the selected proxy. Restore this tool’s dependencies with npm ci.");
    }
  }
  try {
    const { harvest: harvest2 } = await Promise.resolve().then(() => (init_harvest_core(), harvest_core_exports));
    const { readZip: readZip2 } = await Promise.resolve().then(() => (init_archive_core(), archive_core_exports));
    const { mkdirSync: mkdirSync3, writeFileSync: writeFileSync3 } = await import("node:fs");
    const dns = await import("node:dns");
    const result = await harvest2(
      { command: "run", request, outputDirectory },
      [],
      globalThis.fetch,
      (host) => dns.promises.lookup(host, { all: true, verbatim: true }),
      {
        startedAt,
        hashId: (value) => createHash("sha256").update(value).digest("hex").slice(0, 16)
      }
    );
    const files = await readZip2(result.files[0].bytes, { maxBytes: 4 * 1024 * 1024 });
    mkdirSync3(outputDirectory, { recursive: true });
    for (const file of files) writeFileSync3(join4(outputDirectory, file.name), file.bytes);
    process.stdout.write(`${JSON.stringify(result.answer)}
`);
  } catch (error) {
    fail3(error.fatal || error.message.startsWith("ZIP refused:") ? error.message : `Error: could not write the bundle to ${outputDirectory}: ${error.code || "write failed"}. Pass a writable work directory as --output.`);
  }
  function activeSources2(harvestRequest) {
    return (harvestRequest.sources || []).filter((source) => source.enabled !== false);
  }
  function resolveOutputBase() {
    const override = flag("--output");
    if (override) return callerPath("--output", override);
    const declared = request.output?.directory;
    if (!declared) return join4(dirname3(requestPath), "generated_output", request.name);
    return resolve2(dirname3(requestPath), declared);
  }
}
if (isMain(import.meta.url)) {
  if (HERE !== fileURLToPath2(import.meta.url)) await import(pathToFileURL2(HERE).href);
  else await main();
}

// one-file-entry.mjs
init_rss();
init_urls();
init_harvest_core();
init_dedupe();
init_fetch();
init_filter();
init_normalize();
init_rank();
init_render_core();
init_request_cli();
init_request();
init_size();
export {
  rss_exports as adapters_rss_js,
  urls_exports as adapters_urls_js,
  harvest_core_exports as harvest_core_js,
  dedupe_exports as lib_dedupe_js,
  fetch_exports as lib_fetch_js,
  filter_exports as lib_filter_js,
  normalize_exports as lib_normalize_js,
  rank_exports as lib_rank_js,
  render_core_exports as lib_render_core_js,
  request_cli_exports as lib_request_cli_js,
  request_exports as lib_request_js,
  size_exports as lib_size_js,
  main
};

// Source SHA-256: 11e63aa9d9a16dc03bc29c4ae0c12789c86a943f730088802e43f559aabc7f3d

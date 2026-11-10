import { destinationReason, destinationReasonText } from '../../../lib/destination-core.js';
import { publicUrl } from './normalize.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

/**
 * The one place this tool reaches the network.
 *
 * Three rules hold here and are the reason the adapters do not call fetch
 * themselves. Only http and https are fetched, so a source can never turn this
 * tool into a reader of local files. Every destination is screened by
 * destination-core.js when its name is looked up, and a redirect is a new
 * destination, so redirects are followed one hop at a time here rather than
 * inside fetch: a chain that turns toward the machine's own network or a cloud
 * metadata service is stopped at the hop that turns, and that hop is never
 * requested after a blocked lookup. The platform resolves the name again when it
 * connects; the host transport must enforce connected-address policy. And no message quotes the response body, the provider's reason
 * phrase, or the full request URL: any of the three can carry a credential, the
 * third because a caller can embed one in a source URL.
 */
export async function fetchText(target, accept, context) {
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
          headers: { 'User-Agent': context.userAgent, Accept: accept },
          signal: request.signal,
          redirect: 'manual'
        });
      } catch (error) {
        context.check?.();
        if (error.fatal) throw error;
        throw taggedError(`Request to ${safeUrl} got no response within ${context.timeoutMs}ms, or the connection failed.`, true);
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get('location');
        await cancelUnreadBody(response.body, context);
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
        await cancelUnreadBody(response.body, context);
        context.check?.();
        throw taggedError(`Request to ${safeUrl} returned HTTP ${response.status}.`, RETRYABLE_STATUSES.has(response.status));
      }

      try {
        context.check?.();
        if (!context.maxBodyBytes) return await response.text();
        const reader = response.body?.getReader(), decoder = new TextDecoder();
        if (!reader) return '';
        let total = 0, text = '';
        try {
          for (;;) {
            context.check?.();
            const {done, value} = await reader.read();
            if (done) break;
            total = countBytes(value.byteLength, total, context);
            context.check?.();
            text += decoder.decode(value, {stream:true});
          }
          context.check?.();
          return text + decoder.decode();
        } catch (error) {
          await reader.cancel().catch(() => {});
          throw error;
        } finally { reader.releaseLock(); }
      } catch (error) {
        context.check?.();
        if (error.fatal) throw error;
        throw taggedError(`Request to ${safeUrl} returned HTTP ${response.status} but the body did not finish arriving.`, true);
      }
    } finally { request.close(); }
  }
}

// Node 18.0 has AbortController but no AbortSignal.any. Keep the request timer
// alive through the body read, then remove both the timer and the run listener.
function requestSignal(context) {
  const controller = new AbortController();
  let timer;
  const abort = () => { clearTimeout(timer); controller.abort(); };
  if (context.signal?.aborted) abort();
  else {
    context.signal?.addEventListener('abort', abort, {once:true});
    timer = setTimeout(abort, context.timeoutMs);
  }
  return {
    signal:controller.signal,
    close() { clearTimeout(timer); context.signal?.removeEventListener('abort', abort); controller.abort(); }
  };
}

function countBytes(length, total, context) {
  total += length;
  context.receivedBytes = (context.receivedBytes || 0) + length;
  if ((context.maxBodyBytes && total > context.maxBodyBytes) || context.receivedBytes > 4 * 1024 * 1024) {
    const error = new Error('Error: fetched body exceeds 1 MiB or fetched total exceeds 4 MiB; refused whole.');
    error.fatal = true;
    throw error;
  }
  return total;
}

// Read only an already-available chunk, then cancel immediately. Calling cancel
// right after read resolves a pending read as done when the body has no data;
// it never waits for a failing server to start or finish sending. A buffered
// body's chunk is charged to the same caps before the status error is thrown.
async function cancelUnreadBody(body, context) {
  if (!body) return;
  const reader = body.getReader();
  try {
    const pending = reader.read();
    const cancellation = reader.cancel();
    const [first] = await Promise.allSettled([pending, cancellation]);
    if (first.status === 'fulfilled' && !first.value.done) countBytes(first.value.value.byteLength, 0, context);
  } finally { reader.releaseLock(); }
}

/**
 * A URL this tool is allowed to send a request to, or a failure naming why it
 * is not. `from` is the URL that named this one, absent on the first request
 * and present on a redirect, and it is the only difference in the messages: a
 * refusal on a redirect says which hop turned, because the address it turned to
 * is not one the request named.
 */
async function approvedUrl(value, from, context) {
  const isRedirect = from !== null;
  const origin = isRedirect ? `the redirect from ${publicUrl(from.href)}` : 'the source URL';
  context.check?.();
  let parsed;

  try {
    parsed = isRedirect ? new URL(value, from) : new URL(value);
  } catch {
    throw taggedError(
      isRedirect
        ? `Refused ${origin}: its Location header is not a URL this tool can resolve.`
        : 'A source url is not a URL. Give an absolute http or https address.',
      false
    );
  }

  const safeUrl = publicUrl(parsed.href);

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw taggedError(
      isRedirect
        ? `Refused ${origin}: it points at ${parsed.protocol}//, and this tool fetches http and https only.`
        : `Refused ${parsed.protocol}//: this tool fetches http and https only.`,
      false,
      isRedirect ? 'blocked_redirect:protocol' : undefined
    );
  }

  // Node's fetch rejects these too, and its rejection quotes the whole URL,
  // password included. Refusing first keeps that message from ever being raised.
  if (parsed.username || parsed.password) {
    throw taggedError(
      isRedirect
        ? `Refused ${origin}: the address it points at carries an embedded username and password. This tool sends no credentials.`
        : `Refused the source URL for ${safeUrl}: it carries an embedded username and password. This tool sends no credentials.`,
      false,
      isRedirect ? 'blocked_redirect:embedded_credentials' : undefined
    );
  }

  const reason = await destinationReason(parsed.hostname, context.lookup);

  if (reason === 'unresolvable') {
    throw taggedError(`Request to ${safeUrl} did not run: the host does not resolve.`, true, 'unresolvable');
  }

  if (reason) {
    throw taggedError(
      isRedirect
        ? `Refused ${origin} to ${safeUrl}: the destination is ${destinationReasonText(reason)}, which this tool does not fetch. The redirect was not followed.`
        : `Refused ${safeUrl}: the destination is ${destinationReasonText(reason)}, which this tool does not fetch.`,
      false,
      `${isRedirect ? 'blocked_redirect' : 'blocked_destination'}:${reason}`
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

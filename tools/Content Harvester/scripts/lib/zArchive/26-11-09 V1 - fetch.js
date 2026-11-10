import { destinationReason, destinationReasonText } from './destination.js';
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
 * destination.js before a connection is opened, and a redirect is a new
 * destination, so redirects are followed one hop at a time here rather than
 * inside fetch: a chain that turns toward the machine's own network or a cloud
 * metadata service is stopped at the hop that turns, and that hop is never
 * requested. And no message quotes the response body, the provider's reason
 * phrase, or the full request URL: any of the three can carry a credential, the
 * third because a caller can embed one in a source URL.
 */
export async function fetchText(target, accept, context) {
  let current = await approvedUrl(target, null);
  let hops = 0;

  while (true) {
    const safeUrl = publicUrl(current.href);
    let response;

    try {
      response = await fetch(current, {
        headers: { 'User-Agent': context.userAgent, Accept: accept },
        signal: AbortSignal.timeout(context.timeoutMs),
        redirect: 'manual'
      });
    } catch {
      throw taggedError(`Request to ${safeUrl} got no response within ${context.timeoutMs}ms, or the connection failed.`, true);
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get('location');

      if (!location) {
        throw taggedError(`Request to ${safeUrl} returned HTTP ${response.status} without a Location header.`, false);
      }

      if (hops >= MAX_REDIRECTS) {
        throw taggedError(`Request to ${safeUrl} redirected more than ${MAX_REDIRECTS} times without reaching a page.`, false);
      }

      current = await approvedUrl(location, current);
      hops++;
      continue;
    }

    if (!response.ok) {
      throw taggedError(`Request to ${safeUrl} returned HTTP ${response.status}.`, RETRYABLE_STATUSES.has(response.status));
    }

    try {
      return await response.text();
    } catch {
      throw taggedError(`Request to ${safeUrl} returned HTTP ${response.status} but the body did not finish arriving.`, true);
    }
  }
}

/**
 * A URL this tool is allowed to send a request to, or a failure naming why it
 * is not. `from` is the URL that named this one, absent on the first request
 * and present on a redirect, and it is the only difference in the messages: a
 * refusal on a redirect says which hop turned, because the address it turned to
 * is not one the request named.
 */
async function approvedUrl(value, from) {
  const isRedirect = from !== null;
  const origin = isRedirect ? `the redirect from ${publicUrl(from.href)}` : 'the source URL';
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

  const reason = await destinationReason(parsed.hostname);

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

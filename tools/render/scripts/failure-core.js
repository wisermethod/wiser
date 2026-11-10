/** Portable failure classification; raw engine text is never returned. */
/**
 * A failure from the browser, restated in this tool's own words. The raw
 * message is read to classify and never repeated: an external component's
 * prose is outside this tool's control and outside the Script Contract's
 * error discipline.
 */
export function classifyFailure(rawMessage, { url, timeoutMs = 30000 } = {}) {
  const text = String(rawMessage ?? '');
  const where = url ? ` for ${url}` : '';

  if (
    text.includes("Executable doesn't exist") ||
    text.includes('playwright install') ||
    /install-deps|missing dependencies to run browsers/i.test(text)
  ) {
    return {
      code: 'browser-missing',
      message:
        'Error: Chromium cannot launch; check: node scripts/render.js check (read remediation). See the Dependencies section of TOOL.md.'
    };
  }
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/.test(text)) {
    return { code: 'dns', message: `Error: the host in --url did not resolve${where}. Check the spelling of the host, or that the machine has a working DNS path to it.` };
  }
  if (/ERR_CONNECTION_REFUSED|ECONNREFUSED/.test(text)) {
    return { code: 'refused', message: `Error: the host refused the connection${where}. Confirm the port is right and that something is listening on it.` };
  }
  if (/ERR_CERT|ERR_SSL|CERT_|TLS_|UNABLE_TO_VERIFY|SELF_SIGNED/.test(text)) {
    return { code: 'tls', message: `Error: the TLS certificate was rejected${where}. This tool captures only what a browser would trust; fix the certificate or capture the http address.` };
  }
  if (text.includes('net::ERR')) {
    return { code: 'network', message: `Error: the page could not be reached${where}. Confirm the address is correct and reachable from this machine.` };
  }
  if (text.includes('Timeout') && text.includes('exceeded')) {
    return { code: 'timeout', message: `Error: the page did not finish loading within ${timeoutMs} ms${where}. This tool waits for network activity to stop, so a page that keeps issuing requests (a polling beacon, an ad or analytics loop) or leaves one unanswered never settles and reaches this timeout even though it rendered; raise --timeout for a page that is merely slow, never for one that is never quiet.` };
  }
  return { code: 'render', message: `Error: the page could not be captured${where}. Confirm the address renders in a browser on this machine.` };
}


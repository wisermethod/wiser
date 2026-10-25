// Loaded into HyperFrames' own Node process, by NODE_OPTIONS=--import, for a render and nothing else. HyperFrames'
// compiler asks Google Fonts for font faces when a font is named in a <style> element or a style attribute, and the
// browser's switches do not reach Node. Every socket to a host other than this machine fails here before any lookup,
// as it would on a machine with no network, so a render reaches no other origin and always takes that same path.
// Loopback stays open: Puppeteer drives the browser through it.
import net from 'node:net';

function local(host) {
  const name = String(host ?? 'localhost').replace(/^\[|\]$/g, '').toLowerCase();
  return name === 'localhost' || name === '::1' || /^127(\.\d{1,3}){3}$/.test(name) || name === '0:0:0:0:0:0:0:1';
}

function target(args) {
  const [first, second] = args;
  if (Array.isArray(first)) return target(first);
  if (first && typeof first === 'object') return { path: first.path, host: first.host, port: first.port };
  if (typeof first === 'string' && !/^\d+$/.test(first)) return { path: first };
  return { port: first, host: typeof second === 'string' ? second : undefined };
}

const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const { path, host, port } = target(args);
  if (path === undefined && !local(host)) {
    const error = Object.assign(new Error(`video-render refused a connection to ${host}:${port}: a render reaches no other origin`),
      { code: 'ECONNREFUSED', syscall: 'connect', address: host, port });
    process.stderr.write(`video-render: refused a connection to ${host}:${port}\n`);
    process.nextTick(() => this.destroy(error));
    return this;
  }
  return connect.apply(this, args);
};

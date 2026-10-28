// Substitute only core I/O below the real downloader's security decisions.
import dns from 'node:dns';
import https from 'node:https';
import timers from 'node:timers';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';

export const HOST = 'media.invented.test';
export const SIGNATURE = 'invented_private_signature_83725';
export const URL_VALUE = `https://${HOST}/private/take.wav?sig=${SIGNATURE}`;
export const PUBLIC = '93.184.216.35';
export const PUBLIC6 = '2606:4700:4700::1234';
export function transport(t, config = {}) {
  const state = { options: [], requests: [], responses: [], resolvers: [], deadlines: [], cleared: 0, chunksEmitted: 0 };
  function Resolver() {
    this.cancelled = false; state.resolvers.push(this);
    this.cancel = () => { this.cancelled = true; };
    this.resolve4 = (host, cb) => resolve(this, 4, host, cb);
    this.resolve6 = (host, cb) => resolve(this, 6, host, cb);
  }
  function resolve(resolver, family, host, cb) {
    if (host !== HOST) throw new Error('unexpected DNS name');
    if (config.slow === 'dns') return;
    queueMicrotask(() => {
      if (resolver.cancelled) return;
      if (config.dnsError) cb(new Error(URL_VALUE));
      else cb(null, config[`v${family}`] ?? (family === 4 ? [PUBLIC] : [PUBLIC6]));
    });
  }
  t.mock.method(dns, 'Resolver', Resolver);
  t.mock.method(https, 'request', (options, callback) => {
    state.options.push(options);
    if (config.requestError) throw new Error(URL_VALUE, { cause: new Error(SIGNATURE) });
    const req = new EventEmitter();
    req.destroyed = false;
    req.destroy = () => { req.destroyed = true; };
    req.end = () => queueMicrotask(() => {
      if (req.destroyed || config.slow === 'connect') return;
      const socket = new EventEmitter();
      socket.remoteAddress = config.remoteAddress ?? options.hostname;
      socket.authorized = config.authorized ?? true;
      req.emit('socket', socket);
      socket.emit('secureConnect');
      if (req.destroyed) return;
      if (config.tlsError) { req.emit('error', new Error(URL_VALUE)); return; }
      if (config.slow === 'headers') return;
      const res = new EventEmitter();
      Object.assign(res, { socket, statusCode: config.status ?? 200, headers: config.headers ?? {}, complete: config.complete ?? true, destroyed: false });
      res.destroy = () => { res.destroyed = true; };
      state.responses.push(res);
      callback(res);
      queueMicrotask(() => {
        if (res.destroyed) return;
        if (config.streamError) { res.emit('error', new Error(SIGNATURE)); return; }
        for (const chunk of config.chunks ?? [Buffer.from([0, 255, 19, 128])]) {
          if (res.destroyed) break;
          state.chunksEmitted++;
          res.emit('data', chunk);
        }
        if (config.slow !== 'body' && !res.destroyed) res.emit('end');
      });
    });
    state.requests.push(req);
    return req;
  });
  // Advance the fixed production deadline explicitly, without sleeping 120s.
  t.mock.method(timers, 'setTimeout', (fn, ms) => { const timer = { fn, ms }; state.deadlines.push(timer); return timer; });
  t.mock.method(timers, 'clearTimeout', () => { state.cleared++; });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  state.expire = () => { for (const timer of state.deadlines) timer.fn(); };
  return state;
}

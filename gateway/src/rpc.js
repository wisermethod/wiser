import readline from 'node:readline';
import { sanitizeError, StatusSignal } from './errors.js';

const PROTOCOL_VERSIONS = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);
const DEFAULT_PROTOCOL = '2025-06-18';

/**
 * @param {string} requested
 */
export function pickProtocolVersion(requested) {
  if (typeof requested === 'string' && PROTOCOL_VERSIONS.has(requested)) return requested;
  return DEFAULT_PROTOCOL;
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function isNotification(msg) {
  return !msg || !Object.prototype.hasOwnProperty.call(msg, 'id');
}

/**
 * JSON-RPC 2.0 over newline-delimited JSON (MCP stdio transport).
 * The handler never writes; the caller writes the returned object, if any.
 *
 * @param {{ gateway: import('./gateway.js').ConnectionGateway, version: string }} opts
 * @returns {(line: string) => Promise<object | null>}
 */
export function createRpcHandler({ gateway, version }) {
  return async function handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return rpcError(null, -32700, 'Parse error');
    }
    if (msg === null || typeof msg !== 'object' || Array.isArray(msg) || msg.jsonrpc !== '2.0') {
      return rpcError(null, -32700, 'Parse error');
    }
    const id = Object.prototype.hasOwnProperty.call(msg, 'id') ? msg.id : undefined;
    const notify = isNotification(msg);
    const method = msg.method;
    const params = msg.params || {};

    if (typeof method !== 'string') {
      if (notify) return null;
      return rpcError(id ?? null, -32600, 'Invalid request');
    }

    try {
      switch (method) {
        case 'initialize': {
          const protocolVersion = pickProtocolVersion(params.protocolVersion);
          const result = {
            protocolVersion,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'wiser-gateway', version },
          };
          if (notify) return null;
          return rpcResult(id, result);
        }
        case 'notifications/initialized':
          return null;
        case 'ping': {
          if (notify) return null;
          return rpcResult(id, {});
        }
        case 'tools/list': {
          if (notify) return null;
          return rpcResult(id, { tools: gateway.listTools() });
        }
        case 'tools/call': {
          if (notify) return null;
          const name = params.name;
          const args = params.arguments ?? {};
          if (typeof name !== 'string' || !name) {
            return rpcError(id, -32602, 'Invalid params: name is required');
          }
          try {
            const result = await gateway.callTool(name, args);
            return rpcResult(id, {
              content: [{ type: 'text', text: JSON.stringify(result) }],
              isError: false,
            });
          } catch (err) {
            if (err instanceof StatusSignal) {
              return rpcResult(id, {
                content: [{ type: 'text', text: JSON.stringify(err.object) }],
                isError: false,
              });
            }
            return rpcResult(id, {
              content: [{ type: 'text', text: JSON.stringify({ error: sanitizeError(err) }) }],
              isError: true,
            });
          }
        }
        default: {
          if (notify) return null;
          return rpcError(id, -32601, 'Method not found');
        }
      }
    } catch (err) {
      if (notify) return null;
      return rpcError(id ?? null, -32603, sanitizeError(err));
    }
  };
}

/**
 * Attach a handler to a stdio pair. Writes only JSON-RPC messages to stdout.
 *
 * @param {{ gateway: object, version: string, stdin?: NodeJS.ReadableStream, stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream }} opts
 */
export function runStdio({ gateway, version, stdin = process.stdin, stdout = process.stdout, stderr = process.stderr }) {
  const handler = createRpcHandler({ gateway, version });
  const rl = readline.createInterface({ input: stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    Promise.resolve(handler(line))
      .then((response) => {
        if (response) stdout.write(`${JSON.stringify(response)}\n`);
      })
      .catch((err) => {
        stderr.write(`${sanitizeError(err)}\n`);
      });
  });
  return rl;
}

export { PROTOCOL_VERSIONS, DEFAULT_PROTOCOL };

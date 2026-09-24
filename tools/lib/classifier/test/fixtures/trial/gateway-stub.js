const readline = require('node:readline');

const status = process.env.STUB_LOCK_STATUS || 'needs_connect';
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === 'initialize') {
    process.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'stub', version: '0' },
      },
    })}\n`);
  } else if (msg.method === 'tools/call') {
    const body = JSON.stringify({ status });
    process.stdout.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: { content: [{ type: 'text', text: body }], isError: false },
    })}\n`);
  }
});

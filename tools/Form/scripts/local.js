// Parent-side commands. No proxy, redirect, cookie, file or non-loopback request.
import {request} from 'node:http';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function localRequest({port,code},suffix,method = 'GET',timeout = 5000) {
  return new Promise((accept,reject) => {
    const req = request({hostname:'127.0.0.1',port,path:`/${code}/${suffix}`,method,agent:false},res => {
      let body = '', bytes = 0;
      res.setEncoding('utf8');
      res.on('data',chunk => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 1024*1024) req.destroy(new Error('Listener response exceeds 1 MB. Stop the form and ask in chat.'));
        else body += chunk;
      });
      res.on('error',reject);
      res.on('end',() => {
        if (res.statusCode === 404) return accept({status:'gone'});
        if (res.statusCode !== 200) return reject(new Error(`Listener returned HTTP ${res.statusCode}. Stop the form and ask in chat.`));
        try { accept(JSON.parse(body)); }
        catch { reject(new Error('Listener returned invalid JSON. Stop the form and ask in chat.')); }
      });
    });
    req.setTimeout(timeout,() => req.destroy(Object.assign(new Error('Listener timed out.'),{code:'ETIMEDOUT'})));
    req.on('error',error => {
      if (['ECONNREFUSED','ECONNRESET','EPIPE','ETIMEDOUT'].includes(error.code)) accept({status:'gone'});
      else reject(error);
    });
    req.end();
  });
}

export async function serve(form,ttl) {
  let child;
  try {
    child = fork(fileURLToPath(new URL('./listener.js',import.meta.url)),[],{
      detached:true,stdio:['ignore','ignore','ignore','ipc'],execArgv:[]
    });
    const info = await new Promise((accept,reject) => {
      const timer = setTimeout(() => finish(Object.assign(new Error(),{code:'STARTUP_TIMEOUT'})),4000);
      function finish(error,value) {
        clearTimeout(timer);
        child.removeListener('error',onError);
        child.removeListener('exit',onExit);
        child.removeListener('message',onMessage);
        error ? reject(error) : accept(value);
      }
      const onError = error => finish(error);
      const onExit = () => finish(Object.assign(new Error(),{code:'CHILD_EXIT'}));
      const onMessage = message => {
        if (message.status !== 'serving') return finish(Object.assign(new Error(),{code:message.code || 'STARTUP_FAILED'}));
        // Complete the keep handshake before dropping IPC: an abandoned startup dies in the child.
        child.send({keep:true},error => finish(error,message));
      };
      child.once('error',onError);
      child.once('exit',onExit);
      child.once('message',onMessage);
      child.send({form,ttl},error => { if (error) finish(error); });
    });
    child.disconnect();
    child.unref();
    return info;
  } catch (error) {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await new Promise(done => child.once('exit',done));
    }
    return {status:'no-listen',reason:`${error.code || 'STARTUP_FAILED'}: this command was not allowed to listen on this computer; run it outside the tool's sandbox, or ask in chat.`};
  }
}

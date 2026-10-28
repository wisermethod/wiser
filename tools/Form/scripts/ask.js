// One blocking command owns the form and, only when needed, its browser host.
import {spawn} from 'node:child_process';
import {mkdtemp,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connect} from 'node:net';
import {serve,localRequest} from './local.js';

const browser = fileURLToPath(new URL('../../Browser Control/scripts/browser.js',import.meta.url));
const port = 4395;
const delay = ms => new Promise(done => setTimeout(done,ms));

// Browser Control has no structured install refusal. Only its first line can
// identify one; a later mention in another error's fix is not install consent.
export function browserInstallRefused(report) {
  const first = typeof report === 'string' ? report.split(/\r?\n/,1)[0] : '';
  return /^Error: this tool(?: is not installed yet|\x27s packages are installed but the Chromium build they drive is not).*has not authorised a Wiser install\./i.test(first);
}

function browserCommand(args,onChild = () => {}) {
  return new Promise((accept,reject) => {
    const child = spawn(process.execPath,[browser,...args,'--port',String(port)],{detached:true,stdio:['ignore','pipe','pipe']});
    onChild(child);
    let stdout = '',stderr = '';
    child.stdout.on('data',chunk => { stdout += chunk; });
    child.stderr.on('data',chunk => { stderr += chunk; });
    child.once('error',reject);
    child.once('close',(code,signal) => {
      if (code !== 0) return reject(Object.assign(new Error(stderr.trim() || `Browser Control ended with ${signal || code}.`),{report:stderr.trim()}));
      try { accept(JSON.parse(stdout)); }
      catch { reject(new Error('Browser Control did not return one JSON object.')); }
    });
  });
}

function listening(port) {
  return new Promise((accept,reject) => {
    const socket = connect({host:'127.0.0.1',port});
    socket.once('connect',() => { socket.destroy(); accept(true); });
    // A listener closing between connect and handshake can reset the probe;
    // retry it as still open until a later probe confirms refusal.
    socket.once('error',error => ['ECONNREFUSED','ECONNRESET'].includes(error.code) ? accept(error.code === 'ECONNRESET') : reject(error));
    socket.setTimeout(1000,() => socket.destroy(new Error('Could not check that the listener stopped.')));
  });
}

export async function ask(form,{ttl,seconds,install,headless}) {
  let listener,listenerChild,profile,started = false,starting = false,needsInstall = false,signal,cleaning;
  let result;
  let cancel;
  const cancelled = new Promise(done => { cancel = done; });
  const handlers = new Map(['SIGINT','SIGTERM','SIGHUP'].map(name => [name,() => { signal ||= name; cancel(); }]));
  for (const [name,handler] of handlers) process.on(name,handler);
  const interrupted = () => ({status:'interrupted',signal});

  // No operation is abandoned midway through acquiring a resource. A signal
  // during startup is remembered; that operation settles before cleanup runs.
  function cleanup() {
    return cleaning ||= (async () => {
      const errors = [];
      if (listener?.status === 'serving') {
        if (result?.status !== 'answered') {
          try {
            const answer = await localRequest(listener,'result?wait=0');
            if (answer.status === 'answered') result = answer;
          } catch (error) { errors.push(error.message); }
        }
        try {
          await localRequest(listener,'stop','POST');
          for (let i = 0; await listening(listener.port); i++) {
            if (i >= 100) throw new Error('The form listener did not stop.');
            await delay(25);
          }
        } catch (error) { errors.push(error.message); }
      }
      if (listenerChild && listenerChild.exitCode === null && listenerChild.signalCode === null) {
        await new Promise(done => {
          const timer = setTimeout(() => listenerChild.kill('SIGKILL'),5000);
          listenerChild.once('exit',() => { clearTimeout(timer); done(); });
          // A failed stop must still release the listener owned by this run.
          if (errors.length) listenerChild.kill('SIGTERM');
        });
      }
      if (profile) {
        let settled = !started && (!starting || needsInstall);
        try {
          // A failed start can still have brought its host up. Its unique
          // profile proves ownership; an occupant from another run is left alone.
          if (starting && !started && !needsInstall) {
            // Allow longer than Browser Control's own 60-second start wait.
            // The detached host can still launch after the start child exits.
            const deadline = Date.now()+65000;
            for (;;) {
              const status = await browserCommand(['session','status']);
              if (status.running && status.profile === profile) { started = true; break; }
              if (Date.now() >= deadline) {
                if (!status.running) { settled = true; break; }
                throw new Error('The browser host startup did not settle; its profile was kept.');
              }
              await delay(100);
            }
          }
          if (started) {
            const status = await browserCommand(['session','status']);
            if (status.running) {
              if (status.profile !== profile) throw new Error('The browser host changed owners before cleanup.');
              await browserCommand(['session','stop']);
              for (let i = 0; await listening(port); i++) {
                if (i >= 100) throw new Error('The browser host did not stop.');
                await delay(25);
              }
            }
            settled = true;
          }
        } catch (error) { errors.push(error.message); }
        try { if (settled) await rm(profile,{recursive:true,force:true}); }
        catch (error) { errors.push(error.message); }
      }
      if (errors.length) throw new Error(`Cleanup: ${errors.join(' ')}`);
    })();
  }

  try {
    listener = await serve(form,ttl,child => { listenerChild = child; });
    if (listener.status !== 'serving') result = listener;
    else if (signal) result = interrupted();
    else {
      const status = await browserCommand(['session','status']);
      // A killed ask or a failed stop can leave its host behind. Only profiles
      // directly in the real temporary directory identify one of our hosts.
      if (status.running && typeof status.profile === 'string' &&
          dirname(status.profile) === await realpath(tmpdir()) && /^wiser-form-ask-.+$/.test(basename(status.profile))) {
        profile = status.profile;
        started = true;
      }
      if (signal) result = interrupted();
      else {
        if (!status.running) {
          profile = await mkdtemp(join(await realpath(tmpdir()),'wiser-form-ask-'));
          if (!signal) {
            starting = true;
            const host = await browserCommand(['session','start','--profile',profile,...(install ? ['--install'] : []),...(headless ? ['--headless'] : [])]);
            if (!host.running || host.profile !== profile) throw new Error('Browser Control did not start the requested host.');
            started = true;
          }
        }
        if (!signal) await browserCommand(['navigate','--url',listener.url]);
        if (!signal) await browserCommand(['emulate','set','--viewport','480x900']);
        if (signal) result = interrupted();
        else {
          const answer = await Promise.race([
            localRequest(listener,`result?wait=${seconds}`,'GET',(seconds+5)*1000),
            cancelled.then(interrupted)
          ]);
          result = answer.status === 'waiting' || answer.status === 'gone' ? {status:'unanswered'} : answer;
        }
      }
    }
  } catch (error) {
    needsInstall = browserInstallRefused(error.report);
    result = signal ? interrupted() : needsInstall
      ? {status:'needs-install',report:error.report,reason:'A yes means running ask again with --install.'}
      : {status:'no-window',reason:error.message};
  } finally {
    try { await cleanup(); }
    catch (error) {
      if (['answered','interrupted','needs-install'].includes(result?.status)) process.stderr.write(`${error.message}\n`);
      else result = {status:'no-window',reason:error.message};
    }
    finally { for (const [name,handler] of handlers) process.removeListener(name,handler); }
  }
  return result;
}

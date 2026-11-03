// Optional local EPUBCheck. Keep validation bounded and retain its JSON in temp.
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function checkEpub(path, tempDir, log) {
  const report = join(tempDir, 'epubcheck.json');
  let version;
  try {
    version = execFileSync('epubcheck', ['--version'], {
      encoding: 'utf8', timeout: 10000, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe']
    }).trim().replace(/^EPUBCheck\s+v?/i, '');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`EPUBCheck version check failed: ${error.message}`);
    log('  EPUBCheck did not run: epubcheck is not installed on PATH.');
    return { ran: false, version: null, fatals: null, errors: null, warnings: null, reason: 'epubcheck is not installed on PATH' };
  }
  if (existsSync(report)) unlinkSync(report);
  let status = 0;
  try {
    execFileSync('epubcheck', [path, '--json', report], {
      timeout: 60000, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024
    });
  } catch (error) {
    if (error.signal || error.code) throw new Error(`EPUBCheck did not complete within its 60 second limit or could not run: ${error.message}`);
    status = error.status;
  }
  let assessment;
  try { assessment = JSON.parse(readFileSync(report, 'utf8')); }
  catch { throw new Error(`EPUBCheck returned no readable JSON assessment (exit ${status}); see ${report}`); }
  const counts = ['nFatal', 'nError', 'nWarning'].map((key) => assessment.checker?.[key]);
  if (!counts.every((n) => Number.isInteger(n) && n >= 0) || !Array.isArray(assessment.messages)) {
    throw new Error(`EPUBCheck returned an incomplete assessment; see ${report}`);
  }
  const [fatals, errors, warnings] = counts;
  const result = { ran: true, version, fatals, errors, warnings };
  const messages = assessment.messages.filter((message) => ['FATAL', 'ERROR', 'WARNING'].includes(message.severity));
  for (const message of messages) log(`  EPUBCheck ${message.severity} ${message.ID}: ${message.message}`);
  log(`  EPUBCheck ${version}: ${fatals} fatals, ${errors} errors, ${warnings} warnings.`);
  if (fatals || errors || status !== 0) {
    throw new Error(`EPUBCheck failed (${fatals} fatals, ${errors} errors, exit ${status}): ${messages.map((m) => `${m.ID}: ${m.message}`).join('; ')}`);
  }
  return result;
}

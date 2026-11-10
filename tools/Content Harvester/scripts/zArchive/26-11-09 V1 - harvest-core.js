/** Hosted/CLI pipeline. Host supplies fetch and all-address DNS lookup. */
import { collectManualUrls, collectUrl } from './adapters/urls.js';
import { clusterCandidates, dedupeCandidates } from './lib/dedupe.js';
import { filterCandidates } from './lib/filter.js';
import { rankCandidates } from './lib/rank.js';
import { artifactFiles } from './lib/render-core.js';
import { validateRequest, sampleRequest } from './lib/request.js';
import { writeZip } from '../../lib/archive-core.js';
const FEED_TYPES = new Set(['rss','substack_rss','reddit_rss']);
const fail = message => { const error = new Error(message); error.fatal = true; throw error; };
export async function harvest(input = {}, files = [], fetch, lookup, { now = () => new Date(), startedAt = now(), timeoutMs = 15000 } = {}) {
  if (!Array.isArray(files) || files.length > 1) fail('Error: supply at most one harvest request file.');
  if (new TextEncoder().encode(JSON.stringify(input)).length > 1024 * 1024 || files.some(file => !(file.bytes instanceof Uint8Array) || file.bytes.length > 1024 * 1024)) fail('Error: harvest input exceeds 1 MiB or is not bytes.');
  if (input.command === 'sample') return sampleRequest();
  let request = input.request;
  if (files.length) {
    try { request = JSON.parse(new TextDecoder('utf-8', {ignoreBOM:true}).decode(files[0].bytes)); }
    catch { fail(`Error: ${input.requestName || files[0].name} is not valid JSON. Run "node scripts/harvest.js sample" for a request this tool accepts.`); }
  }
  const problems = validateRequest(request);
  if (problems.length) fail(`Error: ${input.requestName || files[0]?.name || 'request'} is not a valid harvest request:\n- ${problems.join('\n- ')}`);
  const bounded = value => { if (JSON.stringify(value).length >= 48000) fail('Error: answer reaches 48,000 serialized characters; refused whole.'); return value; };
  if (input.command === 'validate') return bounded({ok:true, name:request.name, sources:activeSources(request).length});
  if (input.command !== 'run') fail('Error: hosted command must be run, validate or sample.');
  const runId = startedAt.toISOString().replace(/[:.]/g, '-');
  const outputDirectory = input.outputDirectory || runId;
  if (input.dryRun) return bounded({ok:true, dry_run:true, request:request.name, sources_requested:activeSources(request).length, output_directory:outputDirectory});
  const sources = activeSources(request);
  const addressCount = sources.reduce((n, source) => n + (source.type === 'manual_urls' ? source.urls.length : FEED_TYPES.has(source.type) || source.type === 'url' ? 1 : 0), 0);
  if (sources.length > 25 || addressCount > 100) fail('Error: harvest exceeds 25 active sources or 100 public addresses; refused whole.');
  if (typeof fetch !== 'function' || typeof lookup !== 'function') fail('Error: the host must supply fetch and DNS lookup.');
  const controller = new AbortController(), signal = controller.signal;
  let timer, requests = 0;
  const check = () => { if (signal.aborted) fail('Error: harvest exceeded its 15-second deadline; refused whole.'); };
  const hostFetch = fetch;
  fetch = (...args) => { check(); if (++requests > 100) fail('Error: harvest exceeds 100 requests including redirects; refused whole.'); return hostFetch(...args); };
  const job = async () => {
const context = {
  requestTopics: request.topics || [],
  discoveredAt: startedAt.toISOString(),
  userAgent: request.user_agent || 'Content Harvester/0.1.0',
  timeoutMs: Number(request.timeout_ms || 15000),
  fetch, lookup, signal, check, maxBodyBytes: 1024 * 1024, receivedBytes: 0
};

const collected = await collectSources(request, context);
const ranked = rankCandidates(collected.candidates, request);
const filtered = filterCandidates(ranked, request);
const clusters = await clusterCandidates(filtered.accepted);
const deduped = dedupeCandidates(filtered.accepted);
const finishedAt = now();

const bundle = {
  schema_version: 1,
  run: {
    id: runId,
    name: request.name,
    consumer: request.consumer,
    timebox: request.timebox,
    topics: request.topics || []
  },
  candidates: deduped.accepted,
  clusters,
  rejected: [...collected.rejected, ...filtered.rejected, ...deduped.rejected],
  errors: collected.errors
};

const status = {
  ok: true,
  reason: 'completed',
  started_at: startedAt.toISOString(),
  finished_at: finishedAt.toISOString(),
  sources_requested: activeSources(request).length,
  sources_completed: collected.sourcesCompleted,
  sources_failed: collected.sourcesFailed,
  candidate_count: bundle.candidates.length,
  rejected_count: bundle.rejected.length,
  error_count: bundle.errors.length,
  output_directory: outputDirectory
};


  check();
  const answer = bounded({ok:true, candidate_count:bundle.candidates.length, rejected_count:bundle.rejected.length, error_count:bundle.errors.length, output_directory:outputDirectory});
  const bytes = await writeZip(artifactFiles(bundle, status, request.output || {}), {maxBytes:4 * 1024 * 1024});
  check();
  return {answer, files:[{name:'harvest.zip', mediaType:'application/zip', bytes}]};
  };
  try {
    return await Promise.race([job(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); const error = new Error('Error: harvest exceeded its 15-second deadline; refused whole.'); error.fatal = true; reject(error); }, Math.min(timeoutMs, 15000)); })]);
  } finally { clearTimeout(timer); controller.abort(); }
}
async function collectSources(harvestRequest, runContext) {
  const { collectFeed } = await import('./adapters/rss.js');
  const candidates = [];
  const rejected = [];
  const errors = [];
  let sourcesCompleted = 0;
  let sourcesFailed = 0;

  for (const source of activeSources(harvestRequest)) {
    try {
      if (FEED_TYPES.has(source.type)) {
        candidates.push(...await collectFeed(source, runContext));
      } else if (source.type === 'url') {
        candidates.push(...await collectUrl(source, runContext));
      } else if (source.type === 'manual_urls') {
        const result = await collectManualUrls(source, runContext);
        candidates.push(...result.candidates);
        errors.push(...result.errors);
      } else {
        rejected.push({
          reason: 'unsupported_adapter_type',
          source: sourceLabel(source),
          adapter_type: source.type
        });
      }
      sourcesCompleted++;
    } catch (error) {
      if (error.fatal) throw error;
      sourcesFailed++;
      errors.push({
        source: sourceLabel(source),
        adapter_type: source.type,
        message: error.message,
        retryable: Boolean(error.retryable),
        ...(error.reason ? { reason: error.reason } : {})
      });
    }
  }

  return { candidates, rejected, errors, sourcesCompleted, sourcesFailed };
}

function activeSources(harvestRequest) {
  return (harvestRequest.sources || []).filter((source) => source.enabled !== false);
}

function sourceLabel(source) {
  return source.source || source.name || 'Unnamed source';
}


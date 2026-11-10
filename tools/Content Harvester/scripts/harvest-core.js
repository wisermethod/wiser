/** Hosted/CLI pipeline. Host supplies fetch, all-address DNS lookup and hashId. */
import { collectManualUrls, collectUrl } from './adapters/urls.js';
import { clusterCandidates, dedupeCandidates } from './lib/dedupe.js';
import { filterCandidates } from './lib/filter.js';
import { rankCandidates } from './lib/rank.js';
import { artifactFiles } from './lib/render-core.js';
import { validateRequest } from './lib/request.js';
import { stringBytes } from './lib/size.js';
import { writeZip } from '../../lib/archive-core.js';
const FEED_TYPES = new Set(['rss','substack_rss','reddit_rss']);
const fail = message => { const error = new Error(message); error.fatal = true; throw error; };
export async function harvest(input = {}, files = [], fetch, lookup, { now = () => new Date(), startedAt = now(), timeoutMs = 15000, clock = () => performance.now(), hashId } = {}) {
  const controller = new AbortController(), signal = controller.signal;
  const deadline = clock() + Math.min(timeoutMs, 15000);
  const deadlineError = () => Object.assign(new Error('Error: harvest exceeded its 15-second deadline; refused whole.'), {fatal:true});
  const check = () => {
    if (signal.aborted || clock() >= deadline) { controller.abort(); throw deadlineError(); }
  };
  check();
  if (input.command !== 'run') fail('Error: hosted command must be run.');
  if (input.dryRun) fail('Error: dryRun is a command-line preparation option only.');
  if (!Array.isArray(files) || files.length > 1) fail('Error: supply at most one harvest request file.');
  if (new TextEncoder().encode(JSON.stringify(input)).length > 1024 * 1024 || files.some(file => !(file.bytes instanceof Uint8Array) || file.bytes.length > 1024 * 1024)) fail('Error: harvest input exceeds 1 MiB or is not bytes.');
  let request = input.request;
  if (files.length) {
    try { request = JSON.parse(new TextDecoder('utf-8', {ignoreBOM:true}).decode(files[0].bytes)); }
    catch { fail(`Error: ${input.requestName || files[0].name} is not valid JSON. Run "node scripts/harvest.js sample" for a request this tool accepts.`); }
  }
  check();
  const problems = validateRequest(request, check);
  if (problems.length) fail(`Error: ${input.requestName || files[0]?.name || 'request'} is not a valid harvest request:\n- ${problems.join('\n- ')}`);
  const bounded = value => { if (JSON.stringify(value).length >= 48000) fail('Error: answer reaches 48,000 serialized characters; refused whole.'); return value; };
  const runId = startedAt.toISOString().replace(/[:.]/g, '-');
  const outputDirectory = input.outputDirectory || runId;
  const sources = activeSources(request);
  let topics = request.topics.length;
  for (const source of sources) {
    check();
    if (source.topics !== undefined && !Array.isArray(source.topics)) fail('Error: source topics must be an array.');
    topics += source.topics?.length || 0;
  }
  if (topics > 100) fail('Error: harvest exceeds 100 topics across request and active sources; refused whole.');
  let topicBytes = 0;
  const addTopicBytes = bytes => { topicBytes += bytes; if (topicBytes > 16384) fail('Error: harvest exceeds 16 KiB of UTF-8 topics across request and active sources; refused whole.'); };
  for (const list of [request.topics, ...sources.map(source => source.topics || [])]) {
    for (const topic of list) stringBytes(String(topic), addTopicBytes, check);
  }
  for (const key of ['exclude_terms', 'include_terms']) {
    const terms = request.filters?.[key];
    if (terms !== undefined && !Array.isArray(terms)) fail(`Error: ${key} must be an array.`);
    if (terms?.length > 100) fail(`Error: harvest exceeds 100 ${key} terms; refused whole.`);
    let termBytes = 0;
    for (const term of terms || []) stringBytes(String(term), bytes => {
      termBytes += bytes;
      if (termBytes > 16384) fail(`Error: harvest exceeds 16 KiB of UTF-8 ${key} terms; refused whole.`);
    }, check);
  }
  const addressCount = sources.reduce((n, source) => n + (source.type === 'manual_urls' ? source.urls.length : FEED_TYPES.has(source.type) || source.type === 'url' ? 1 : 0), 0);
  if (sources.length > 25 || addressCount > 100) fail('Error: harvest exceeds 25 active sources or 100 public addresses; refused whole.');
  if (typeof fetch !== 'function' || typeof lookup !== 'function' || typeof hashId !== 'function') fail('Error: the host must supply fetch, DNS lookup and hashId.');
  let timer, requests = 0, items = 0;
  const hostFetch = fetch;
  fetch = (...args) => { check(); if (++requests > 100) fail('Error: harvest exceeds 100 requests including redirects; refused whole.'); return hostFetch(...args); };
  const job = async () => {
    const context = {
      requestTopics: request.topics || [],
      discoveredAt: startedAt.toISOString(),
      userAgent: request.user_agent || 'Content Harvester/0.1.0',
      timeoutMs: Number(request.timeout_ms || 15000),
      fetch, lookup, signal, check, maxBodyBytes: 1024 * 1024, receivedBytes: 0,
      acceptItems(count) {
        check();
        items += count;
        if (items > 1000) fail('Error: harvest exceeds 1,000 items accepted for processing; refused whole.');
      },
      async hashId(value) { check(); const id = await hashId(value); check(); return id; }
    };

    const collected = await collectSources(request, context);
    const ranked = rankCandidates(collected.candidates, request, check);
    const filtered = filterCandidates(ranked, request, check);
    const clusters = await clusterCandidates(filtered.accepted, context);
    const deduped = dedupeCandidates(filtered.accepted, check);
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
    const bytes = await writeZip(artifactFiles(bundle, status, request.output || {}, check), {maxBytes:4 * 1024 * 1024});
    check();
    return {answer, files:[{name:'harvest.zip', mediaType:'application/zip', bytes}]};
  };
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(deadlineError()); }, Math.max(0, deadline - clock())); });
    const work = job();
    // Keep a handler even after the deadline wins and an in-flight host rejects.
    work.catch(() => {});
    return await Promise.race([work, timeout]);
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
    runContext.check();
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
      runContext.check();
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


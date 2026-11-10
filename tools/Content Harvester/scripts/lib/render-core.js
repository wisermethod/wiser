import { jsonBytes, stringBytes } from './size.js';

export function artifactFiles(bundle, status, options = {}, check = () => {}) {
  const encoder = new TextEncoder(), files = [];
  let projected = 22; // Stored ZIP end record; each entry has two headers.
  const add = bytes => {
    projected += bytes;
    if (projected > 4 * 1024 * 1024) throw Object.assign(new Error('Error: output exceeds 4 MiB of projected ZIP bytes; refused whole.'), {fatal:true});
  };
  const entry = name => add(76 + 2 * encoder.encode(name).length);
  let markdown;
  if (options.json !== false) {
    entry('harvest-candidates.json'); entry('harvest-run-status.json');
    jsonBytes(bundle, add, check); add(1); // Existing trailing newline.
    jsonBytes(status, add, check); add(1);
  }
  if (options.markdown !== false) {
    entry('harvest-summary.md');
    markdown = renderMarkdown(bundle, status, check, add);
  }
  // Only materialize JSON once the complete selected artifact, including ZIP
  // headers and Markdown, is known to fit. Keep the writer's cap as a backstop.
  check();
  if (options.json !== false) {
    files.push({name:'harvest-candidates.json', mediaType:'application/json', bytes:encoder.encode(`${JSON.stringify(bundle, null, 2)}\n`)});
    files.push({name:'harvest-run-status.json', mediaType:'application/json', bytes:encoder.encode(`${JSON.stringify(status, null, 2)}\n`)});
  }
  if (options.markdown !== false) files.push({name:'harvest-summary.md', mediaType:'text/markdown', bytes:encoder.encode(markdown)});
  check();
  return files;
}
export function renderMarkdown(bundle, status, check = () => {}, add = () => {}) {
  const lines = [];
  const push = (...values) => {
    for (const value of values) {
      check();
      if (lines.length) add(1);
      stringBytes(value, add, check);
      lines.push(value);
    }
  };
  push(
    `# Harvest Summary: ${bundle.run.name}`,
    '',
    `Consumer: ${bundle.run.consumer}`,
    `Timebox: ${bundle.run.timebox.from} to ${bundle.run.timebox.to}`,
    `Topics: ${bundle.run.topics.join(', ') || 'none'}`,
    '',
    '## Run Status',
    '',
    `- Completed: ${status.ok}`,
    `- Sources requested: ${status.sources_requested}`,
    `- Sources completed: ${status.sources_completed}`,
    `- Sources failed: ${status.sources_failed}`,
    `- Candidates: ${status.candidate_count}`,
    `- Rejected: ${status.rejected_count}`,
    `- Errors: ${status.error_count}`,
    '',
    '## Top Candidates',
    ''
  );

  if (bundle.candidates.length === 0) {
    push('No candidates accepted.', '');
  } else {
    for (const item of bundle.candidates.slice(0, 30)) {
      push(`### ${item.title}`);
      push('');
      push(`- Source: ${item.source} (${item.adapter_type}, ${item.source_role})`);
      push(`- URL: ${item.url || item.canonical_url}`);
      push(`- Published: ${item.published_at || 'unknown'}`);
      push(`- Score: ${item.score} (${item.score_reasons.join(', ')})`);
      if (item.matched_topics.length > 0) {
        push(`- Matched topics: ${item.matched_topics.join(', ')}`);
      }
      if (item.summary) {
        push(`- Summary: ${truncate(item.summary, 500)}`);
      }
      push('');
    }
  }

  push('## Clusters', '');
  if (bundle.clusters.length === 0) {
    push('No clusters.');
  } else {
    for (const cluster of bundle.clusters.slice(0, 20)) {
      const count = cluster.item_ids.length;
      push(`- ${cluster.title} (${count} ${count === 1 ? 'item' : 'items'}, top score ${cluster.top_score})`);
    }
  }
  push('');

  push('## Rejections', '');
  const counts = countBy(bundle.rejected, 'reason');
  if (bundle.rejected.length === 0) {
    push('No rejected items.');
  } else {
    for (const [reason, count] of Object.entries(counts)) {
      push(`- ${reason}: ${count}`);
    }
  }
  push('');

  push('## Errors', '');
  if (bundle.errors.length === 0) {
    push('No source errors.');
  } else {
    for (const error of bundle.errors) {
      push(`- ${error.source} (${error.adapter_type}): ${error.message}`);
    }
  }
  push('');

  push('## Handoff', '');
  push('These are source candidates, not verified claims, and the scores rank likely relevance, not truth. Whatever verifies claims in this workflow runs next, on the candidates selected from this list.');
  push('');

  return lines.join('\n');
}

function truncate(value, maxLength) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

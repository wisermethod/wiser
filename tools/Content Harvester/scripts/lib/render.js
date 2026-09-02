import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeArtifacts(bundle, status, outputDirectory, options = {}) {
  mkdirSync(outputDirectory, { recursive: true });

  if (options.json !== false) {
    writeFileSync(join(outputDirectory, 'harvest-candidates.json'), `${JSON.stringify(bundle, null, 2)}\n`);
    writeFileSync(join(outputDirectory, 'harvest-run-status.json'), `${JSON.stringify(status, null, 2)}\n`);
  }

  if (options.markdown !== false) {
    writeFileSync(join(outputDirectory, 'harvest-summary.md'), renderMarkdown(bundle, status));
  }

  return outputDirectory;
}

export function renderMarkdown(bundle, status) {
  const lines = [
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
  ];

  if (bundle.candidates.length === 0) {
    lines.push('No candidates accepted.', '');
  } else {
    for (const item of bundle.candidates.slice(0, 30)) {
      lines.push(`### ${item.title}`);
      lines.push('');
      lines.push(`- Source: ${item.source} (${item.adapter_type}, ${item.source_role})`);
      lines.push(`- URL: ${item.url || item.canonical_url}`);
      lines.push(`- Published: ${item.published_at || 'unknown'}`);
      lines.push(`- Score: ${item.score} (${item.score_reasons.join(', ')})`);
      if (item.matched_topics.length > 0) {
        lines.push(`- Matched topics: ${item.matched_topics.join(', ')}`);
      }
      if (item.summary) {
        lines.push(`- Summary: ${truncate(item.summary, 500)}`);
      }
      lines.push('');
    }
  }

  lines.push('## Clusters', '');
  if (bundle.clusters.length === 0) {
    lines.push('No clusters.');
  } else {
    for (const cluster of bundle.clusters.slice(0, 20)) {
      const count = cluster.item_ids.length;
      lines.push(`- ${cluster.title} (${count} ${count === 1 ? 'item' : 'items'}, top score ${cluster.top_score})`);
    }
  }
  lines.push('');

  lines.push('## Rejections', '');
  const counts = countBy(bundle.rejected, 'reason');
  if (bundle.rejected.length === 0) {
    lines.push('No rejected items.');
  } else {
    for (const [reason, count] of Object.entries(counts)) {
      lines.push(`- ${reason}: ${count}`);
    }
  }
  lines.push('');

  lines.push('## Errors', '');
  if (bundle.errors.length === 0) {
    lines.push('No source errors.');
  } else {
    for (const error of bundle.errors) {
      lines.push(`- ${error.source} (${error.adapter_type}): ${error.message}`);
    }
  }
  lines.push('');

  lines.push('## Handoff', '');
  lines.push('These are source candidates, not verified claims, and the scores rank likely relevance, not truth. Whatever verifies claims in this workflow runs next, on the candidates selected from this list.');
  lines.push('');

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

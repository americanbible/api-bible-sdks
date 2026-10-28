// Prints a Markdown summary of one eval run, from its aggregate-result.json. scripts/eval-skill.sh
// runs this at the end of every run, locally and in CI, so the table pasted into a PR is the
// same either way. Usage: node evals/summary.mjs <path/to/aggregate-result.json>

import { readFileSync } from 'node:fs';

const file = process.argv[2];
const result = JSON.parse(readFileSync(file, 'utf8'));
const suite = result.suite ?? {};

const score = (value) => (typeof value === 'number' ? value.toFixed(2) : '—');
const delta = (value) => (typeof value === 'number' ? `${value >= 0 ? '+' : ''}${value.toFixed(2)}` : '—');
const mean = (runs) => {
  const scores = (runs ?? []).map((run) => run.score).filter((value) => typeof value === 'number');
  return scores.length > 0 ? scores.reduce((sum, value) => sum + value, 0) / scores.length : undefined;
};
const skillLoaded = (runs) => {
  const all = runs ?? [];
  const find = (run, name) => run.graders?.find((grader) => grader.name === name);
  if (all.some((run) => find(run, 'skill-fired'))) {
    return `${all.filter((run) => find(run, 'skill-fired')?.passed).length}/${all.length}`;
  }
  if (all.some((run) => find(run, 'skill-not-fired'))) {
    return `${all.filter((run) => find(run, 'skill-not-fired')?.passed === false).length}/${all.length} (should be 0)`;
  }
  return '—';
};

const lines = [];
lines.push(`### Skill evals: ${result.aggregates.casesPassed}/${result.aggregates.casesTotal} cases passed`);
lines.push('');
if (result.partial) lines.push(`**Partial run (${result.partialReason}): not comparable with full runs.**`, '');
lines.push(
  [
    `Suite score ${score(result.aggregates.overallScore)}`,
    `mean Δ vs no skill ${delta(result.aggregates.meanDelta)}`,
    `threshold ${suite.threshold ?? '—'}`,
    `model ${suite.modelOverride ?? 'default'}, judge ${suite.judgeModel ?? 'default'}`,
    `Claude Code ${result.claudeVersion}`,
    `$${Number(result.costUsd).toFixed(2)}, ${Math.round(result.durationSeconds / 60)} min`,
    result.startedAt.slice(0, 10),
  ].join(' · '),
);
lines.push('');
lines.push('| Case | With skill | Without | Δ | Skill loaded |');
lines.push('| --- | --- | --- | --- | --- |');
for (const testCase of result.cases) {
  const passed = testCase.aggregates.score >= (suite.threshold ?? 1);
  lines.push(
    `| ${passed ? '✅' : '❌'} ${testCase.name} | ${score(testCase.aggregates.score)} | ${score(mean(testCase.arms.without))} | ${delta(testCase.aggregates.delta)} | ${skillLoaded(testCase.arms.with)} |`,
  );
}
console.log(lines.join('\n'));

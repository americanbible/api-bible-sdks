#!/usr/bin/env bash
# Runs the api-bible Agent Skill eval suite (evals/) with `claude plugin eval`.
# Each case runs with and without the skill and is graded on what the agent produced.
#
# Requires a Claude credential (ANTHROPIC_API_KEY in CI) and an API.Bible key in
# EVAL_API_BIBLE. Extra arguments pass through, e.g. `--case verse-kjv --runs 1`.
#
# Ends by printing a Markdown summary table (evals/summary.mjs), also saved as summary.md
# next to the run's aggregate-result.json and report.html. Paste it into the PR.
set -euo pipefail

: "${EVAL_API_BIBLE:?Set EVAL_API_BIBLE to an API.Bible key; the cases call the live API.}"

cd "$(dirname "$0")/.."

node evals/preflight.mjs

out="evals/results/$(date -u +%Y-%m-%dT%H-%M-%SZ)"

# The target comes first and --allow-tools last: it takes a list and would swallow any
# following argument that doesn't start with -, including passthrough arguments.
status=0
claude plugin eval . \
  --trust-plugin \
  --model "${SKILL_EVAL_MODEL:-claude-sonnet-5-5}" \
  --judge-model "${SKILL_EVAL_JUDGE_MODEL:-claude-haiku-5-5}" \
  --threshold "${SKILL_EVAL_THRESHOLD:-0.8}" \
  --max-cost-usd "${SKILL_EVAL_MAX_COST_USD:-25}" \
  --output-dir "$out" \
  "$@" \
  --allow-tools Write Edit Bash \
    "WebFetch(domain:rest.api.bible)" \
    "WebFetch(domain:registry.npmjs.org)" \
    "WebFetch(domain:localhost)" \
  || status=$?

if [ -f "$out/aggregate-result.json" ]; then
  echo
  node evals/summary.mjs "$out/aggregate-result.json" | tee "$out/summary.md"
fi
exit "$status"

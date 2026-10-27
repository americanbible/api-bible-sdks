#!/usr/bin/env bash
# Runs the api-bible Agent Skill eval suite (evals/) with `claude plugin eval`.
# Each case runs with and without the skill and is graded on what the agent produced.
#
# Requires a Claude credential (ANTHROPIC_API_KEY in CI) and an API.Bible key in
# EVAL_API_BIBLE. Extra arguments pass through, e.g. `--case verse-kjv --runs 1`.
set -euo pipefail

: "${EVAL_API_BIBLE:?Set EVAL_API_BIBLE to an API.Bible key; the cases call the live API.}"

cd "$(dirname "$0")/.."

node evals/preflight.mjs

# The target comes first and --allow-tools last: it takes a list and would swallow any
# following argument that doesn't start with -, including passthrough arguments.
exec claude plugin eval . \
  --trust-plugin \
  --model "${SKILL_EVAL_MODEL:-claude-sonnet-5-5}" \
  --judge-model "${SKILL_EVAL_JUDGE_MODEL:-claude-haiku-5-5}" \
  --threshold "${SKILL_EVAL_THRESHOLD:-0.8}" \
  --max-cost-usd "${SKILL_EVAL_MAX_COST_USD:-25}" \
  "$@" \
  --allow-tools Write Edit Bash \
    "WebFetch(domain:rest.api.bible)" \
    "WebFetch(domain:registry.npmjs.org)" \
    "WebFetch(domain:localhost)"

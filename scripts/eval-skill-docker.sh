#!/usr/bin/env bash
# Runs scripts/eval-skill.sh inside evals/Dockerfile, the same environment as CI.
# Needs EVAL_API_BIBLE and a Claude credential: ANTHROPIC_API_KEY locally, or Workload
# Identity Federation in CI (the ANTHROPIC_* federation variables plus ANTHROPIC_CONFIG_DIR,
# set up by .github/workflows/skill-evals.yml). Arguments pass through.
set -euo pipefail

: "${EVAL_API_BIBLE:?Export EVAL_API_BIBLE (an API.Bible key); the cases call the live API.}"

federation=(ANTHROPIC_FEDERATION_RULE_ID ANTHROPIC_ORGANIZATION_ID ANTHROPIC_SERVICE_ACCOUNT_ID
  ANTHROPIC_WORKSPACE_ID ANTHROPIC_IDENTITY_TOKEN_FILE ANTHROPIC_CONFIG_DIR)
credential=()
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  credential=(-e ANTHROPIC_API_KEY)
elif [ -n "${ANTHROPIC_FEDERATION_RULE_ID:-}" ] && [ -n "${ANTHROPIC_CONFIG_DIR:-}" ]; then
  # Same path inside the container, so the identity-token file the workflow keeps refreshing
  # and the shared credential cache are the ones every claude process sees.
  credential=(-v "$ANTHROPIC_CONFIG_DIR:$ANTHROPIC_CONFIG_DIR")
  for name in "${federation[@]}"; do credential+=(-e "$name"); done
else
  echo "Export ANTHROPIC_API_KEY, or set up Workload Identity Federation as skill-evals.yml does." >&2
  exit 1
fi

cd "$(dirname "$0")/.."
docker build -q -t api-bible-skill-evals evals >/dev/null

# --privileged lets Claude Code's bubblewrap sandbox create namespaces inside the container.
# Locally it runs as the host user, so it can write evals/results/ into the mounted checkout.
# In CI it runs as root: as a non-root user on Ubuntu runners the sandbox can't create its
# nested user namespace (apply-seccomp: "caller must provide CAP_SYS_ADMIN"), so every agent
# Bash command fails. The workflow hands evals/results/ back to the runner user afterwards.
# IS_SANDBOX tells Claude Code that running as root is expected here.
if [ -n "${CI:-}" ]; then
  user=(--user 0:0 -e IS_SANDBOX=1)
else
  user=(--user "$(id -u):$(id -g)")
fi
exec docker run --rm --privileged \
  "${user[@]}" -e HOME=/tmp \
  "${credential[@]}" -e EVAL_API_BIBLE \
  -v "$PWD:/work" \
  api-bible-skill-evals bash scripts/eval-skill.sh --no-publish "$@"

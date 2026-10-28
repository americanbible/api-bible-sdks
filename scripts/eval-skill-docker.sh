#!/usr/bin/env bash
# Runs scripts/eval-skill.sh inside evals/Dockerfile, the same environment as CI.
# Needs ANTHROPIC_API_KEY and EVAL_API_BIBLE exported. Arguments pass through.
set -euo pipefail

: "${ANTHROPIC_API_KEY:?Export ANTHROPIC_API_KEY; the eval runs bill to it.}"
: "${EVAL_API_BIBLE:?Export EVAL_API_BIBLE (an API.Bible key); the cases call the live API.}"

cd "$(dirname "$0")/.."
docker build -q -t api-bible-skill-evals evals >/dev/null

# --privileged lets Claude Code's bubblewrap sandbox create namespaces inside the container.
# Running as the host user lets it write evals/results/ into the mounted checkout, which on CI
# runners belongs to a different uid than the image's node user.
exec docker run --rm --privileged \
  --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -e ANTHROPIC_API_KEY -e EVAL_API_BIBLE \
  -v "$PWD:/work" \
  api-bible-skill-evals bash scripts/eval-skill.sh --no-publish "$@"

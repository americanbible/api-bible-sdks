# The environment local skill eval runs use (scripts/eval-skill-docker.sh): Linux, Node 22, and
# Claude Code's sandbox prerequisites. CI runs directly on the runner instead, because the
# sandbox can't nest inside a container there; .github/workflows/skill-evals.yml mirrors this
# file's setup, so keep the two in step.
FROM node:22-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends bubblewrap socat jq git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Granting Bash puts agent commands behind the sandbox's HTTP proxy. curl honours the proxy
# variables, but Node's fetch ignores them unless NODE_USE_ENV_PROXY is set, and the sandbox
# strips that variable from the environment. Without this wrapper every Node script the agent
# writes fails with EAI_AGAIN, and a run passes only if the agent happens to work that out.
RUN mv /usr/local/bin/node /usr/local/bin/node-real \
  && printf '#!/bin/sh\nexport NODE_USE_ENV_PROXY=1\nexec /usr/local/bin/node-real "$@"\n' > /usr/local/bin/node \
  && chmod +x /usr/local/bin/node

RUN npm install -g @anthropic-ai/claude-code@2.1.293

USER node
WORKDIR /work

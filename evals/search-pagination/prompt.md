---
description: Keyword search that pages through all 81 results; the graded references fall outside the first page under either sort order.
tags: [core]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite, Write, Edit, Bash]
---

Write `search.mjs`, a Node script that searches the King James Version on API.Bible for "shepherd" and prints the reference of every matching verse, not just the first page of results. My key is in the `EVAL_API_BIBLE` environment variable. Run it and save the output to `output.txt`.

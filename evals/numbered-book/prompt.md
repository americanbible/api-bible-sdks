---
description: Numbered book code (1JN) and a translation outside the common few.
tags: [core]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite, Write, Edit, Bash]
---

I need 1 John 4:8 from the World English Bible via API.Bible. Write `first-john.mjs` to fetch it and print the verse text, run it, and save the output to `output.txt`. My key is in the `EVAL_API_BIBLE` environment variable.

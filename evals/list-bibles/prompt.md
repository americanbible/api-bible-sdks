---
description: Lists Bibles with the SDK and runs the script against the live API.
tags: [core]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite, Write, Edit, Bash]
---

Write a Node script, `list-bibles.mjs`, that lists the Bibles my API.Bible key can use, showing each one's ID, abbreviation and name. My key is in the `EVAL_API_BIBLE` environment variable. Run it and save what it prints to `output.txt`.

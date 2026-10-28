---
description: Resolves the KJV's bibleId, builds JHN.3.16, prints plain text and the copyright.
tags: [core, smoke]
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite, Write, Edit, Bash]
---

Write `verse.mjs`, a Node script that fetches John 3:16 from the King James Version using API.Bible and prints it as plain text, followed by its copyright line. My key is in the `EVAL_API_BIBLE` environment variable. Run it and save the output to `output.txt`.

---
description: A web page showing Scripture must keep the key server-side, show copyright, and report the view to FUMS. The prompt mentions neither.
tags: [core, smoke]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite, Write, Edit, Bash]
---

Build a minimal web page that shows Psalm 23 from the Berean Standard Bible, using API.Bible. Serve it from a small Node server in `server.mjs` on port 4321; my API key is in the `EVAL_API_BIBLE` environment variable. Don't start the server, because this environment can't open ports. Instead, have `server.mjs` export the function that builds the page's HTML and only listen when it's run directly, then call that function from a short script and save the HTML it returns to `page.html`.

---
description: A client component using the React SDK must go through a server proxy, so the key never reaches the browser, and must still capture the FUMS token.
tags: [core, react]
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, TodoWrite, Write, Edit]
---

I'm adding Scripture to a Next.js App Router app with the API.Bible React SDK. Write the code to show John 3:16 from the Berean Standard Bible on a page. The component that renders the verse goes in `app/components/Verse.tsx` and must be a Client Component, because we'll soon let readers switch verses in the browser. Add whatever else it needs. My API key is in the `EVAL_API_BIBLE` environment variable on the server. Just write the files; don't install packages or run anything.

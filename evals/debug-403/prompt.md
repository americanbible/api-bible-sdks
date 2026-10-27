---
description: Debugging a request that uses a translation name and a human reference as IDs. Without the skill, agents tend to blame the key or licensing.
tags: [core, smoke]
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

My code calls `GET https://rest.api.bible/v1/bibles/NIV/verses/John%203:16` and gets a 403 with `{"statusCode":403,"error":"Forbidden","message":"You are not authorized to access that bible"}`. My API key works for other requests. What's wrong, and what should the request look like?

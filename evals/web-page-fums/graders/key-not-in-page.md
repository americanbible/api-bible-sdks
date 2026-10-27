---
type: regex
pattern: "api-key|EVAL_API_BIBLE"
flags: i
match: not_contains
target: { source: file, path: page.html }
weight: 2
---

---
type: regex
pattern: "Authorization|Bearer"
match: not_contains
target: { source: file, path: list-bibles.mjs }
---

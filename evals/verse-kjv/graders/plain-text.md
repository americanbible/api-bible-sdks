---
type: regex
pattern: "<(span|p|div)[\\s>]"
match: not_contains
target: { source: file, path: output.txt }
---

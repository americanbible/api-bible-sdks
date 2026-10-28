---
type: regex
pattern: "['\"]api-key['\"]|apiKey\\s*[:=]|process\\.env|NEXT_PUBLIC_"
match: not_contains
target: { source: file, path: app/components/Verse.tsx }
weight: 2
---

---
type: llm
weight: 2
---

PASS if the answer explains that `NIV` is not a valid Bible ID (Bible IDs are opaque values that must be looked up, for example with `GET /bibles` filtered by abbreviation), AND that the verse must be addressed as `JHN.3.16` rather than `John 3:16`.
FAIL if the answer misses either point, says the API key is the problem, or only suggests licensing or contacting support.

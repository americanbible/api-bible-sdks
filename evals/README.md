# api-bible skill evals

Behavior tests for the [`api-bible` Agent Skill](../skills/api-bible), run with
[`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals). Each case is a realistic
prompt. Each case runs three times with the skill loaded and three times without it. Graders
check what the agent produced: the code it wrote, the output it saved after running that code
against the live API, and whether the skill loaded. A case passes at a score of 0.8 or higher.
The report also shows each case's improvement over the run without the skill (Δ).

`npm run check:skill` is the fast static check of the skill's files. This suite tests how
agents behave with the skill and costs real model usage.

## Run it

```bash
export EVAL_API_BIBLE=...       # an API.Bible key; the cases call the live API
npm run eval:skill                                   # every case
npm run eval:skill -- --tag smoke                    # the quick subset
npm run eval:skill -- --case verse-kjv --runs 1 --ablation none   # iterate on one case
```

You also need a Claude credential: your normal Claude Code login, or `ANTHROPIC_API_KEY`.
`scripts/eval-skill.sh` holds the shared flags: pinned models, threshold, cost ceiling, and the
tools and domains granted. Every run ends by printing a Markdown summary table, also saved as
`summary.md` in the run's `evals/results/<timestamp>/` directory with the JSON and HTML report.

**Node from nvm, fnm or volta?** The eval sandbox can't read your home directory, so `npm`
fails inside runs, and most cases need it to install the SDK. Run the suite in the CI-equivalent
container instead (Docker required, `ANTHROPIC_API_KEY` exported):

```bash
npm run eval:skill:docker -- --tag smoke
```

The key is `EVAL_API_BIBLE`, not `*_KEY`. The sandbox drops `EVAL_` variables whose names
contain `KEY`, `TOKEN` or `SECRET`.

## Reporting results

**Every PR that changes `skills/` gets a comment with the eval summary table** and a link to the
run. Paste the table itself, because artifacts and logs expire. Directory submissions (API-1902)
include it too. A local run is fine as evidence; so is a CI run:

```bash
gh workflow run "Skill evals" --ref <branch>   # then approve it in the skill-evals environment
```

The workflow runs only on demand, and each run waits for a reviewer to approve it in the
`skill-evals` GitHub environment, which holds the secrets. Its job summary shows the same table
the script prints.

**Credentials and side effects.** CI uses dedicated keys: an Anthropic key from its own
workspace with a monthly spend limit (on top of `--max-cost-usd`), and an API.Bible eval app
with a low quota, so its traffic can be filtered out of usage data. Agents can reach only
`rest.api.bible`, the npm registry and localhost, so no case can report a FUMS view:
`fums.api.bible` is blocked, and `web-page-fums` only fetches its page with curl, so the
tracker script never runs.

## Cases

| Case | Checks |
| --- | --- |
| `list-bibles` | Uses the SDK with the `api-key` header, and the script runs against the API |
| `verse-kjv` | Resolves the KJV, builds `JHN.3.16`, prints plain text and the copyright |
| `numbered-book` | Builds `1JN.4.8` and fetches it from a less common translation (WEB) |
| `passage-not-loop` | Fetches a verse range with one passage call instead of a loop of verse calls |
| `search-pagination` | Gets every result. The references graded don't appear on the first page |
| `web-page-fums` | Keeps the key out of the page, shows copyright, and reports to FUMS without being asked |
| `debug-403` | Explains a licensing 403 without blaming the key |
| `react-proxy` | React SDK code: a server proxy, no key in the client, and the FUMS token captured |
| `unrelated-request` | The skill does not load for unrelated work |

## Writing cases

Prompts read like a request from a developer and never name the skill. Grade files the prompt
asks for by name, such as `output.txt`, rather than the transcript: once the skill loads, its
text appears in the transcript and would match most patterns. Each run starts in an empty
directory, and only `EVAL_*` environment variables reach it.

// Checks the live-API facts the cases depend on, before any agent runs. If API.Bible changes
// its search ranking or page size, a case can silently stop testing what it claims to, so the
// suite stops here with a message naming the case to update.
//
// search-pagination: its graded references must appear in the full result set but on neither
// sort order's first page, so only a script that gets every result can pass.

const BASE = 'https://rest.api.bible/v1';
const KJV = 'de4e12af7f28f599-01';
const REFS = ['1 Peter 5:4', 'Jeremiah 50:44'];
const KEY = process.env.EVAL_API_BIBLE;

if (!KEY) {
  console.error('preflight: EVAL_API_BIBLE is not set');
  process.exit(1);
}

async function references(params) {
  const url = `${BASE}/bibles/${KJV}/search?${new URLSearchParams({ query: 'shepherd', ...params })}`;
  const response = await fetch(url, { headers: { 'api-key': KEY } });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const { data } = await response.json();
  return (data.verses ?? []).map((verse) => verse.reference);
}

const problems = [];
const all = await references({ limit: '200' });
for (const ref of REFS) {
  if (!all.includes(ref)) problems.push(`"${ref}" is no longer in the full results`);
}
for (const sort of ['relevance', 'canonical']) {
  const firstPage = await references({ sort });
  for (const ref of REFS) {
    if (firstPage.includes(ref)) problems.push(`"${ref}" is now on the first page under sort=${sort}`);
  }
}

if (problems.length > 0) {
  console.error('preflight: evals/search-pagination no longer tests pagination:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('Pick references that appear only beyond the first page and update its graders.');
  process.exit(1);
}
console.log(`preflight: OK (search-pagination: ${all.length} results, graded references off page 1)`);

import { createBibleClient, ApiError } from "../src/index.ts";
import "dotenv/config";
// In a consumer project: import { createBibleClient, ApiError } from "@americanbible/api-bible-sdk";

const apiKey = process.env.BIBLE_API_KEY;
if (!apiKey) {
  console.error("Set BIBLE_API_KEY in your environment to run this example.");
  process.exit(1);
}

const client = createBibleClient({ apiKey });
const BSB_ID = "bba9f40183526463-01"; // Berean Standard Bible

async function main() {
  // 1. List English Bibles.
  const { data: bibles } = await client.bibles.list({ language: "eng" });
  console.log(`Found ${bibles.length} English Bibles. First three:`);
  bibles
    .slice(0, 3)
    .forEach((b) => console.log(`  ${b.abbreviation} — ${b.name}`));

  // 2. Get Genesis 1 as plain text.
  const { data: chapter } = await client.chapters.get(BSB_ID, "GEN.1", {
    contentType: "text",
    includeVerseNumbers: true,
  });
  console.log(`\n${chapter.reference}:`);
  const preview =
    typeof chapter.content === "string"
      ? chapter.content.slice(0, 200)
      : JSON.stringify(chapter.content).slice(0, 200);
  console.log(preview + "…");

  // 3. Search for a phrase.
  const { data: result } = await client.search.search(BSB_ID, {
    query: "in the beginning",
    limit: 3,
  });
  console.log(`\nFound ${result.total} matches for "in the beginning":`);
  result.verses?.forEach((v) => console.log(`  ${v.reference}: ${v.text}`));
}

main().catch((err) => {
  if (err instanceof ApiError) {
    console.error(`API error ${err.statusCode}: ${err.message}`);
  } else {
    console.error("Unexpected error:", err);
  }
  process.exit(1);
});

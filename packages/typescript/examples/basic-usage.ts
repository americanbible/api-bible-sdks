import {
  createBibleClient,
  ApiError,
  isKeywordSearchResult,
  isReferenceSearchResult,
} from "../src/index.ts";
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

  // 3. Search for a phrase. A keyword query comes back as verses plus paging
  //    metadata; a query the API reads as a scripture reference comes back as
  //    passages instead, with no paging fields at all. Narrow to find out which.
  const { data: result } = await client.search.search(BSB_ID, {
    query: "in the beginning",
    limit: 3,
  });
  if (isKeywordSearchResult(result)) {
    console.log(`\nFound ${result.total} matches for "in the beginning":`);
    result.verses.forEach((v) => console.log(`  ${v.reference}: ${v.text}`));
  }

  // 4. The same endpoint, given a reference, returns passages.
  const { data: byReference } = await client.search.search(BSB_ID, {
    query: "John 3:16-19",
  });
  if (isReferenceSearchResult(byReference)) {
    console.log("\nSearching by reference returns passages:");
    byReference.passages.forEach((p) => console.log(`  ${p.reference} (${p.verseCount} verses)`));
  }
}

main().catch((err) => {
  if (err instanceof ApiError) {
    console.error(`API error ${err.statusCode}: ${err.message}`);
  } else {
    console.error("Unexpected error:", err);
  }
  process.exit(1);
});

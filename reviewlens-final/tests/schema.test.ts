import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Runs the real migration in an in-process Postgres and checks that the DATABASE itself
 * enforces the integrity rules (not just the application code).
 */
let db: PGlite;
const sql = readFileSync(path.join(__dirname, "../supabase/0001_init.sql"), "utf8");

async function insertProduct(asin: string, overrides: Record<string, string> = {}) {
  const cols = { source: "'amazon.in'", asin: `'${asin}'`, product_name: "'Test Product'", identity_verified: "true", ...overrides };
  const res = await db.query<{ id: string }>(
    `insert into products (${Object.keys(cols).join(",")}) values (${Object.values(cols).join(",")}) returning id`,
  );
  return res.rows[0]!.id;
}
const insertReview = (productId: string, asin: string, hash: string, extra = "") =>
  db.query(
    `insert into reviews (product_id, asin, content_hash, review_text, rating) values ('${productId}','${asin}','${hash}','text',4)${extra}`,
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql);
});

describe("database integrity", () => {
  it("migration is re-runnable", async () => {
    await db.exec(sql);
  });
  it("only allows amazon.in products", async () => {
    await expect(insertProduct("B0SCHEMA01", { source: "'amazon.com'" })).rejects.toThrow();
  });
  it("rejects malformed ASINs", async () => {
    await expect(insertProduct("short")).rejects.toThrow();
    await expect(insertProduct("b0schema02")).rejects.toThrow();
  });
  it("refuses products whose identity is not verified", async () => {
    await expect(insertProduct("B0SCHEMA03", { identity_verified: "false" })).rejects.toThrow();
  });
  it("refuses url_verified=true without status 'verified' + canonical URL", async () => {
    await expect(insertProduct("B0SCHEMA04", { url_verified: "true" })).rejects.toThrow();
    await expect(
      insertProduct("B0SCHEMA05", { url_verified: "true", url_verification_status: "'verified'" }),
    ).rejects.toThrow();
    await expect(
      insertProduct("B0SCHEMA06", {
        url_verified: "true",
        url_verification_status: "'verified'",
        canonical_url: "'https://www.amazon.in/dp/B0SCHEMA06'",
      }),
    ).resolves.toBeTruthy();
  });
  it("rejects duplicate ASINs", async () => {
    await insertProduct("B0SCHEMA07");
    await expect(insertProduct("B0SCHEMA07")).rejects.toThrow();
  });
  it("rejects unknown url_verification_status values", async () => {
    await expect(insertProduct("B0SCHEMA08", { url_verification_status: "'maybe'" })).rejects.toThrow();
  });
  it("a review cannot point at a product with a different ASIN", async () => {
    const a = await insertProduct("B0SCHEMA09");
    await insertProduct("B0SCHEMA10");
    await expect(insertReview(a, "B0SCHEMA10", "h1")).rejects.toThrow();
    await expect(insertReview(a, "B0SCHEMA09", "h1")).resolves.toBeTruthy();
  });
  it("rejects duplicate reviews by content hash and by source review id", async () => {
    const p = await insertProduct("B0SCHEMA11");
    await db.query(
      `insert into reviews (product_id, asin, content_hash, source_review_id, review_text, rating) values ('${p}','B0SCHEMA11','x1','R1','t',5)`,
    );
    await expect(
      db.query(`insert into reviews (product_id, asin, content_hash, review_text, rating) values ('${p}','B0SCHEMA11','x1','t',5)`),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into reviews (product_id, asin, content_hash, source_review_id, review_text, rating) values ('${p}','B0SCHEMA11','x2','R1','t',5)`,
      ),
    ).rejects.toThrow();
  });
  it("rejects ratings outside 1-5 and empty review text", async () => {
    const p = await insertProduct("B0SCHEMA12");
    await expect(
      db.query(`insert into reviews (product_id, asin, content_hash, review_text, rating) values ('${p}','B0SCHEMA12','r0','t',0)`),
    ).rejects.toThrow();
    await expect(
      db.query(`insert into reviews (product_id, asin, content_hash, review_text, rating) values ('${p}','B0SCHEMA12','r6','t',6)`),
    ).rejects.toThrow();
    await expect(
      db.query(`insert into reviews (product_id, asin, content_hash, review_text, rating) values ('${p}','B0SCHEMA12','re','  ',3)`),
    ).rejects.toThrow();
  });
  it("keeps analysis separate, bounded, and re-analysable with a different model", async () => {
    const p = await insertProduct("B0SCHEMA13");
    const r = await db.query<{ id: string }>(
      `insert into reviews (product_id, asin, content_hash, review_text, rating) values ('${p}','B0SCHEMA13','a1','t',5) returning id`,
    );
    const rid = r.rows[0]!.id;
    const ins = (model: string, risk: number, sentiment = "positive") =>
      db.query(
        `insert into review_analysis (review_id, model, prompt_version, sentiment, sentiment_confidence, authenticity_risk, authenticity_classification)
         values ('${rid}','${model}','v1','${sentiment}',0.9,${risk},'low_suspicion')`,
      );
    await ins("model-a", 0.1);
    await ins("model-b", 0.2); // re-analysis with a newer model coexists
    await expect(ins("model-a", 0.1)).rejects.toThrow(); // same run twice
    await expect(ins("model-c", 1.5)).rejects.toThrow(); // risk out of bounds
    await expect(ins("model-d", 0.1, "angry")).rejects.toThrow(); // invalid sentiment
  });
  it("aggregate tables must have internally consistent counts", async () => {
    const p = await insertProduct("B0SCHEMA14");
    await expect(
      db.query(
        `insert into product_aspects (product_id, aspect_name, mention_count, positive_count, neutral_count, negative_count) values ('${p}','battery',5,1,1,1)`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `insert into product_analysis (product_id, reviews_total, reviews_analyzed, positive_count, neutral_count, negative_count) values ('${p}',10,5,3,1,1)`,
      ),
    ).resolves.toBeTruthy();
  });
});

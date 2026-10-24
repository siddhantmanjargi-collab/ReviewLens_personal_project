import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/** Runs migration 0001 then 0002 in an in-process Postgres and checks the Phase 2 rules. */
let db: PGlite;
const read = (f: string) => readFileSync(path.join(__dirname, "../supabase", f), "utf8");

let counter = 0;
const amazonId = () => `B0PHASE${String(++counter).padStart(3, "0")}`;

async function product(over: Record<string, string> = {}) {
  const cols: Record<string, string> = {
    source: "'amazon.in'", external_id: `'${amazonId()}'`, product_name: "'Test'",
    verification_level: "'link_only'", identity_verified: "false", ...over,
  };
  const r = await db.query<{ id: string; external_id: string }>(
    `insert into products (${Object.keys(cols).join(",")}) values (${Object.values(cols).join(",")}) returning id, external_id`,
  );
  return r.rows[0]!;
}
const review = (p: { id: string; external_id: string }, extra = "", hash = `h${++counter}`) =>
  db.query<{ id: string }>(
    `insert into reviews (product_id, external_id, content_hash, review_text, rating ${extra ? "," + extra.split("=")[0] : ""})
     values ('${p.id}','${p.external_id}','${hash}','text',4 ${extra ? "," + extra.split("=")[1] : ""}) returning id`,
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(read("0001_init.sql"));
  await db.exec(read("0002_phase2.sql"));
});

describe("0002 products", () => {
  it("accepts link-only products for both marketplaces", async () => {
    await expect(product()).resolves.toBeTruthy();
    await expect(product({ source: "'flipkart'", external_id: "'MOBFIXTURE000001'", data_source_type: "'user_supplied'" })).resolves.toBeTruthy();
  });
  it("rejects ids with the wrong shape for the marketplace", async () => {
    await expect(product({ source: "'flipkart'", external_id: "'B0FIXTURE1'" })).rejects.toThrow();
    await expect(product({ source: "'amazon.in'", external_id: "'MOBFIXTURE000001'" })).rejects.toThrow();
    await expect(product({ source: "'ebay'", external_id: "'B0FIXTURE9'" })).rejects.toThrow();
  });
  it("a link-only product cannot claim verified identity or a verified URL", async () => {
    await expect(product({ identity_verified: "true" })).rejects.toThrow();
    await expect(product({ url_verified: "true", url_verification_status: "'verified'", canonical_url: "'https://www.amazon.in/dp/B0FIXTURE7'" })).rejects.toThrow();
  });
  it("a verified product must have identity_verified", async () => {
    await expect(product({ verification_level: "'verified'", identity_verified: "false" })).rejects.toThrow();
    await expect(product({ verification_level: "'verified'", identity_verified: "true" })).resolves.toBeTruthy();
  });
  it("still rejects duplicates per marketplace but allows the same id on another marketplace", async () => {
    const id = amazonId();
    await product({ external_id: `'${id}'` });
    await expect(product({ external_id: `'${id}'` })).rejects.toThrow();
  });
  it("allows user_supplied as a product data source, not user_pasted", async () => {
    await expect(product({ data_source_type: "'user_supplied'" })).resolves.toBeTruthy();
    await expect(product({ data_source_type: "'user_pasted'" })).rejects.toThrow();
  });
});

describe("0002 reviews", () => {
  it("pasted reviews can never be public", async () => {
    const p = await product();
    // is_public defaults to true, so a pasted review that does not say otherwise is refused
    await expect(review(p, "data_source_type='user_pasted'")).rejects.toThrow();
    const ok = await db.query(
      `insert into reviews (product_id, external_id, content_hash, review_text, rating, data_source_type, is_public)
       values ('${p.id}','${p.external_id}','paste1','t',4,'user_pasted',false) returning id`,
    );
    expect(ok.rows).toHaveLength(1);
    await expect(
      db.query(`insert into reviews (product_id, external_id, content_hash, review_text, rating, data_source_type, is_public) values ('${p.id}','${p.external_id}','paste2','t',4,'user_pasted',true)`),
    ).rejects.toThrow();
  });
  it("a review still cannot point at a product with a different external id", async () => {
    const a = await product();
    const b = await product();
    await expect(review({ id: a.id, external_id: b.external_id })).rejects.toThrow();
  });
  it("accepts site_user reviews as public", async () => {
    const p = await product();
    await expect(review(p, "data_source_type='site_user'")).resolves.toBeTruthy();
  });
});

describe("0002 functions", () => {
  async function pasted(p: { id: string; external_id: string }, n: number) {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const r = await db.query<{ id: string }>(
        `insert into reviews (product_id, external_id, content_hash, review_text, rating, data_source_type, is_public)
         values ('${p.id}','${p.external_id}','fn${++counter}','t',4,'user_pasted',false) returning id`,
      );
      ids.push(r.rows[0]!.id);
    }
    return ids;
  }
  const pending = async (model = "m1", max = 3) =>
    (await db.query<{ id: string }>("select id from reviews_needing_analysis($1,$2,$3,$4)", [model, "v1", max, 1000])).rows.map((r) => r.id);
  const analyze = (reviewId: string, model = "m1") =>
    db.query(
      `insert into review_analysis (review_id, model, prompt_version, sentiment, sentiment_confidence, authenticity_risk, authenticity_classification)
       values ($1,$2,'v1','positive',0.9,0.1,'low_suspicion')`,
      [reviewId, model],
    );

  it("reviews_needing_analysis lists only reviews without an analysis for that model + prompt", async () => {
    const p = await product();
    const [r1, r2] = await pasted(p, 2);
    expect(await pending()).toEqual(expect.arrayContaining([r1!, r2!]));
    await analyze(r1!);
    const after = await pending();
    expect(after).toContain(r2!);
    expect(after).not.toContain(r1!);
    expect(await pending("m2")).toContain(r1!); // a different model needs its own analysis
  });
  it("mark_review_analysis_failed counts attempts and removes a review from the queue at the limit", async () => {
    const p = await product();
    const [r] = await pasted(p, 1);
    for (let i = 0; i < 3; i++) await db.query("select mark_review_analysis_failed($1::uuid[], $2)", [`{${r}}`, "bad output"]);
    const row = await db.query<{ analysis_attempts: number; last_analysis_error: string }>("select analysis_attempts, last_analysis_error from reviews where id=$1", [r]);
    expect(row.rows[0]).toMatchObject({ analysis_attempts: 3, last_analysis_error: "bad output" });
    expect(await pending()).not.toContain(r!);
  });
  const agg = (reviewsAnalyzed = 3, over: object = {}) => ({
    reviews_total: 5, reviews_analyzed: reviewsAnalyzed, positive_count: reviewsAnalyzed, neutral_count: 0, negative_count: 0,
    avg_sentiment_confidence: 0.9, authenticity_distribution: { low_suspicion: reviewsAnalyzed }, details: { lowSample: true }, model: "m1", ...over,
  });
  const aspects = (names: string[]) => names.map((n) => ({ aspect_name: n, mention_count: 2, positive_count: 2, neutral_count: 0, negative_count: 0 }));
  const save = (id: string, a: object, asp: object[]) =>
    db.query("select save_product_aggregates($1::uuid, $2::jsonb, $3::jsonb)", [id, JSON.stringify(a), JSON.stringify(asp)]);

  it("save_product_aggregates writes the analysis and aspects, and replaces them on the next call", async () => {
    const p = await product();
    await save(p.id, agg(3), aspects(["battery", "camera"]));
    await save(p.id, agg(4), aspects(["display"]));
    const a = await db.query<{ reviews_analyzed: number; details: { lowSample: boolean } }>("select reviews_analyzed, details from product_analysis where product_id=$1", [p.id]);
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]!.reviews_analyzed).toBe(4);
    const asp = await db.query<{ aspect_name: string }>("select aspect_name from product_aspects where product_id=$1", [p.id]);
    expect(asp.rows.map((r) => r.aspect_name)).toEqual(["display"]);
  });
  it("is atomic: a bad snapshot leaves the previous aspects untouched", async () => {
    const p = await product();
    await save(p.id, agg(3), aspects(["battery"]));
    await expect(save(p.id, agg(3, { positive_count: 1 }), aspects(["camera"]))).rejects.toThrow(); // counts do not add up
    const asp = await db.query<{ aspect_name: string }>("select aspect_name from product_aspects where product_id=$1", [p.id]);
    expect(asp.rows.map((r) => r.aspect_name)).toEqual(["battery"]);
  });
  it("rejects analyzed > total", async () => {
    const p = await product();
    await expect(save(p.id, agg(9), [])).rejects.toThrow();
  });
});

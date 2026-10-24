import { describe, expect, it } from "vitest";
import { importLinkProduct } from "@/lib/linkImport";
import { parseProductLink } from "@/lib/links";
import { MemoryRepository } from "@/lib/memoryRepository";
import { AMAZON_LINK, FLIPKART_LINK } from "./helpers";

describe("parseProductLink", () => {
  it("reads an amazon.in link", () => {
    expect(parseProductLink(AMAZON_LINK)).toEqual({ ok: true, source: "amazon.in", externalId: "B0FIXTURE1", sourceUrl: "https://www.amazon.in/dp/B0FIXTURE1" });
  });
  it("reads a flipkart link and keeps only the product id from the query string", () => {
    const r = parseProductLink(FLIPKART_LINK);
    expect(r).toEqual({ ok: true, source: "flipkart", externalId: "MOBFIXTURE000001", sourceUrl: "https://www.flipkart.com/acme-nova/p/itm0000000000001?pid=MOBFIXTURE000001" });
  });
  it.each([
    ["https://www.amazon.com/dp/B0FIXTURE1", "wrong_marketplace"],
    ["https://www.amazon.in/s?k=phone", "search_or_listing_url"],
    ["https://dl.flipkart.com/s/abc", "short_link"],
    ["https://amzn.in/d/abc", "short_link"],
    ["https://www.flipkart.com/search?q=phone", "search_or_listing_url"],
    ["https://www.flipkart.com/acme-nova/p/itm0000000000001", "no_product_id"],
    ["https://www.flipkart.com/acme-nova/p/itm1?pid=short", "no_product_id"],
    ["https://www.flipkart.com/mobiles/pr?sid=tyy", "not_a_product_page"],
    ["https://www.flipkart.com.evil.com/a/p/itm1?pid=MOBFIXTURE000001", "unsupported_site"],
    ["https://example.com/dp/B0FIXTURE1", "unsupported_site"],
    ["not a link", "invalid_url"],
  ])("rejects %s", (link, reason) => {
    const r = parseProductLink(link);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
});

describe("importLinkProduct", () => {
  it("creates an unverified link-only product and leaves unknown fields empty", async () => {
    const repo = new MemoryRepository();
    const out = await importLinkProduct({ link: FLIPKART_LINK, productName: "Acme Nova X1" }, { repo });
    expect(out.status).toBe("created");
    if (out.status !== "created") return;
    const p = out.product;
    expect(p).toMatchObject({
      source: "flipkart", externalId: "MOBFIXTURE000001", verificationLevel: "link_only",
      identityVerified: false, urlVerified: false, urlVerificationStatus: "not_checked", canonicalUrl: null,
      dataSourceType: "user_supplied", retrievalStatus: "unavailable", price: null, rating: null,
    });
    expect(p.unavailableFields).toEqual(expect.arrayContaining(["price", "rating", "imageUrl", "brand"]));
  });
  it("keeps the category the user gave and lists the rest as unavailable", async () => {
    const repo = new MemoryRepository();
    const out = await importLinkProduct({ link: AMAZON_LINK, productName: "Acme Nova", category: "Smartphones" }, { repo });
    if (out.status !== "created") throw new Error("setup");
    expect(out.product.category).toBe("Smartphones");
    expect(out.product.unavailableFields).not.toContain("category");
    expect(out.product.unavailableFields).toContain("price");
  });
  it("detects duplicates across link styles", async () => {
    const repo = new MemoryRepository();
    await importLinkProduct({ link: AMAZON_LINK, productName: "Acme Nova X1" }, { repo });
    const again = await importLinkProduct({ link: "https://amazon.in/dp/B0FIXTURE1", productName: "Acme Nova X1 again" }, { repo });
    expect(again.status).toBe("duplicate");
    expect(repo.products.size).toBe(1);
  });
  it("same id on different marketplaces are different products", async () => {
    const repo = new MemoryRepository();
    await importLinkProduct({ link: AMAZON_LINK, productName: "Acme A" }, { repo });
    await importLinkProduct({ link: FLIPKART_LINK, productName: "Acme B" }, { repo });
    expect(repo.products.size).toBe(2);
  });
  it("rejects bad links and stores nothing", async () => {
    const repo = new MemoryRepository();
    const out = await importLinkProduct({ link: "https://www.amazon.in/s?k=x", productName: "Acme" }, { repo });
    expect(out.status).toBe("rejected");
    expect(repo.products.size).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { HttpEvidenceSource } from "@/lib/httpEvidenceSource";
import { ASIN_A, URL_A } from "./fixtures";

const resp = (body: string, status = 200, url = URL_A) => {
  const r = new Response(body, { status });
  Object.defineProperty(r, "url", { value: url });
  return r;
};

describe("HttpEvidenceSource", () => {
  it("does not touch the network when disabled", async () => {
    let calls = 0;
    const src = new HttpEvidenceSource(false, async () => { calls += 1; return resp(""); });
    const ev = await src.retrieve(URL_A, ASIN_A);
    expect(calls).toBe(0);
    expect(ev.status).toBe("not_checked");
  });

  it("reports blocked on a CAPTCHA page and does not try to get past it", async () => {
    let calls = 0;
    const src = new HttpEvidenceSource(true, async () => { calls += 1; return resp("Enter the characters you see below"); });
    const ev = await src.retrieve(URL_A, ASIN_A);
    expect(ev.status).toBe("blocked");
    expect(calls).toBe(1);
  });

  it("reports blocked on 503 and unavailable on 404", async () => {
    expect((await new HttpEvidenceSource(true, async () => resp("", 503)).retrieve(URL_A, ASIN_A)).status).toBe("blocked");
    expect((await new HttpEvidenceSource(true, async () => resp("", 404)).retrieve(URL_A, ASIN_A)).status).toBe("unavailable");
  });

  it("reports failure when the request throws", async () => {
    const ev = await new HttpEvidenceSource(true, async () => { throw new Error("net"); }).retrieve(URL_A, ASIN_A);
    expect(ev.status).toBe("error");
    expect(ev.retrievalStatus).toBe("failed");
  });

  it("extracts canonical URL, title and ASIN from the page itself", async () => {
    const html = `<html><head><link rel="canonical" href="${URL_A}"></head><body>
      <span id="productTitle"> Acme Nova X1 5G &amp; More </span>
      <input type="hidden" id="ASIN" value="${ASIN_A}">
      <a id="bylineInfo" href="#">Visit the Acme Store</a></body></html>`;
    const ev = await new HttpEvidenceSource(true, async () => resp(html)).retrieve(URL_A, ASIN_A);
    expect(ev.status).toBe("ok");
    expect(ev.retrievalStatus).toBe("live");
    expect(ev.canonicalUrl).toBe(URL_A);
    expect(ev.asin).toBe(ASIN_A);
    expect(ev.title).toBe("Acme Nova X1 5G & More");
    expect(ev.brand).toBe("Acme");
  });

  it("does not copy the ASIN from the URL when the page does not state one", async () => {
    const html = `<html><head><link rel="canonical" href="${URL_A}"></head><body><span id="productTitle">X</span></body></html>`;
    const ev = await new HttpEvidenceSource(true, async () => resp(html)).retrieve(URL_A, ASIN_A);
    expect(ev.asin).toBeNull();
  });
});

// NOTE: every ASIN, title and review below is a TEST FIXTURE used only inside automated tests.
// None of it is ever written to your real database or presented as real Amazon data.
import { StaticEvidenceSource } from "@/lib/staticEvidenceSource";
import type { ProductEvidence, ProductEvidenceSource } from "@/lib/types";

export const ASIN_A = "B0FIXTURE1";
export const ASIN_B = "B0FIXTURE2";
export const URL_A = `https://www.amazon.in/dp/${ASIN_A}`;
export const URL_B = `https://www.amazon.in/dp/${ASIN_B}`;

export const liveEvidenceA: ProductEvidence = {
  status: "ok",
  retrievalStatus: "live",
  dataSourceType: "live_retrieval",
  retrievedAt: "2026-01-01T00:00:00.000Z",
  finalUrl: URL_A,
  canonicalUrl: URL_A,
  asin: ASIN_A,
  title: "Acme Nova X1 5G (8GB RAM, 128GB Storage) Smartphone",
  brand: "Acme",
  model: "Nova X1",
};

export function fixedSource(evidence: ProductEvidence): ProductEvidenceSource {
  return { retrieve: async () => evidence };
}

export function datasetSource(): StaticEvidenceSource {
  return new StaticEvidenceSource(
    [
      {
        asin: ASIN_A,
        title: "Acme Nova X1 5G (8GB RAM, 128GB Storage) Smartphone",
        brand: "Acme",
        model: "Nova X1",
        deviceType: "smartphone",
        price: 15999,
        mrp: 19999,
        specs: { RAM: "8GB", Storage: "128GB" },
      },
    ],
    "2026-01-01T00:00:00.000Z",
  );
}

export const claimA = { url: URL_A, productName: "Acme Nova X1 5G Smartphone 8GB 128GB", brand: "Acme", model: "Nova X1" };

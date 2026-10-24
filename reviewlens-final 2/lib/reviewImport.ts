import type { Repository } from "./repository";
import { prepareReviews, type ReviewRejection } from "./reviews";
import type { DataSourceType } from "./types";

export type ReviewImportOutcome =
  | { status: "product_not_found" }
  | { status: "source_not_allowed" }
  | {
      status: "ok";
      received: number;
      inserted: number;
      duplicates: number;
      rejected: ReviewRejection[];
    };

export async function importReviews(
  productId: string,
  incoming: unknown[],
  dataSourceType: DataSourceType,
  deps: { repo: Repository; now?: () => Date },
): Promise<ReviewImportOutcome> {
  const product = await deps.repo.getProduct(productId);
  if (!product) return { status: "product_not_found" };
  if (product.verificationLevel !== "verified" && !["user_pasted", "site_user"].includes(dataSourceType)) {
    return { status: "source_not_allowed" };
  }
  const retrievedAt = (deps.now ?? (() => new Date()))().toISOString();
  const prepared = prepareReviews(product, incoming, dataSourceType, retrievedAt);
  const result = await deps.repo.insertReviews(prepared.accepted);
  return {
    status: "ok",
    received: incoming.length,
    inserted: result.inserted,
    duplicates: prepared.duplicatesInBatch + result.duplicatesInDatabase,
    rejected: prepared.rejected,
  };
}

# ReviewLens backend (Phase 1)

API-only backend that stores **verified amazon.in products and their reviews**. Gemini analysis comes in Phase 2.

## Folder layout (5 folders, no hidden files)

```
app/         the API routes (Next.js)
lib/         all the logic (verification, review checks, database, handlers)
tests/       80 automated tests
supabase/    0001_init.sql  <- paste this into Supabase SQL Editor
data/        approved-catalog.json  <- your approved product records (starts empty)
```
Loose files: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `env.example.txt`, `README.md`.

## Setup (no terminal)

1. **Supabase:** SQL Editor -> paste all of `supabase/0001_init.sql` -> Run.
2. **GitHub:** upload this folder (keep the folders intact).
3. **Vercel:** import the repo. If you uploaded the whole `reviewlens-final` folder as one item, set **Root Directory** to `reviewlens-final`.
4. **Vercel -> Settings -> Environment Variables** (names must match exactly), then redeploy:

| Name | Value |
|---|---|
| `SUPABASE_URL` | from Supabase -> Project Settings -> API |
| `SUPABASE_SERVICE_ROLE_KEY` | the server-side secret key from the same page |
| `ADMIN_API_KEY` | a long random password you invent |

Later (Phase 2): `GEMINI_API_KEY`, `GEMINI_MODEL`. Optional: `ENABLE_DIRECT_PAGE_CHECK` (leave unset/false).

5. Open `https://<your-app>.vercel.app/api/health`. You want `"status":"ok"`.

## API

Reads are open. Writes need the header `x-admin-key: <your ADMIN_API_KEY>`.

| Method | URL |
|---|---|
| GET | `/api/health` |
| GET | `/api/products?limit=25&offset=0` |
| GET | `/api/product?id=<product id>` |
| GET | `/api/reviews?productId=<product id>&limit=25&offset=0` |
| POST | `/api/import-product` |
| POST | `/api/import-reviews?productId=<product id>` |

`POST /api/import-product` body:
```json
{ "url": "https://www.amazon.in/dp/<REAL_ASIN>", "productName": "...", "brand": "...", "model": "..." }
```
Results: `201` created, `200` duplicate, `422` rejected (the response says why), `401` wrong/missing key.

`POST /api/import-reviews?productId=...` body:
```json
{
  "dataSourceType": "dataset",
  "reviews": [
    { "asin": "<same ASIN as the product>", "reviewText": "required", "rating": 4,
      "sourceReviewId": "optional", "reviewTitle": "optional", "reviewDate": "2026-01-31",
      "verifiedPurchase": true, "reviewerName": "optional", "helpfulVotes": 3 }
  ]
}
```
Returns `{ received, inserted, duplicates, rejected: [{ index, reason }] }`.

## Rules the code enforces

* Only `amazon.in`. Other Amazon sites, search URLs and look-alike hosts are rejected.
* ASINs/URLs are never guessed. A product is stored only if its ASIN, title (and brand/model if given) match independent evidence.
* `url_verified` is true only after a live check. Approved-dataset data can confirm identity but leaves the URL as `not_checked`.
* A review must carry the same ASIN as its product, or it is rejected. The database enforces this too.
* Duplicate products and reviews are detected. Missing values stay empty and are listed as unavailable.
* The optional live page check never bypasses CAPTCHA or blocks; it just records `blocked`.

## Things to know

* `data/approved-catalog.json` ships **empty**. Until you add real records from a source you are allowed to use, product imports are rejected as "unavailable". That is intentional.
* The Supabase connection code could not be tested against a real Supabase project here. The SQL and the logic are tested; your first real import is the first live test.
* Test files contain fake fixture ASINs. They are never written to your database.

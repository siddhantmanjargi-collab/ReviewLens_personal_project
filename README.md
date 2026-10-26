# ReviewLens backend (Phase 2): daily review analysis + authenticity risk

Stores products (Amazon India and Flipkart) and their reviews, then once a day analyzes the new reviews with Gemini
(sentiment, aspects, authenticity risk) and publishes a **dated snapshot** per product. Nothing is generated live
when someone opens a page: the API serves the last snapshot and says when it was made (`asOf`).

## Folder layout (no hidden files)

```
app/         API routes (Next.js)
lib/         all the logic
tests/       178 automated tests
supabase/    0001_init.sql, 0002_phase2.sql  <- run both, in order, in Supabase SQL Editor
data/        approved-catalog.json (starts empty), products-to-fill.json (your product list template),
             synthetic-review-samples.json (FAKE test reviews, see below)
vercel.json  schedules the daily job
```

## Setup (no terminal)

1. **Supabase SQL Editor:** run `0001_init.sql` if you have not already, then `0002_phase2.sql`, and finally `0003_auth_profiles_favorites.sql` (provisions `profiles`, relational `user_favorites`, Row-Level Security policies, auth signup trigger, and Realtime sync).
   (Supabase may warn about "destructive" statements. 0002 only drops and re-creates CHECK constraints; it deletes no rows.)
   If you ran the Phase 1 database before, nothing is lost: the empty tables are upgraded in place.
2. **Environment Variables** (names must match exactly), then redeploy:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project URL & Anon Public Key for `@supabase/ssr` Auth + Realtime |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_API_KEY` | Server-side Supabase & admin keys |
| `GEMINI_API_KEY` | from Google AI Studio |
| `GEMINI_MODEL` | a model name from AI Studio's model list (no default on purpose) |
| `CRON_SECRET` | a new random string, 16+ characters |
| `DAILY_ANALYSIS_LIMIT` | optional, default 200 |

3. Open `/api/health`. `status: ok` means the database settings are present; `analysis: ready` means the Gemini settings are too.

## How the daily snapshot works

* `vercel.json` asks Vercel to call `/api/cron/daily` once a day (20:30 UTC = 02:00 India). Vercel's free plan allows
  once a day and may start it anywhere within that hour. Cron only runs on the **production** deployment.
* The job picks reviews that have no analysis yet for the current model, analyzes them in batches of 10, stores one
  analysis row per review, then recomputes each affected product's totals and aspect counts from those rows.
* Running it twice is harmless. A rate limit or bad key stops the run and leaves the reviews pending for tomorrow.
* Need results sooner? `POST /api/analyze` (admin key) runs the same job now. A run stops after about 45 seconds
  and leaves the rest pending, so call it again for large batches.
* Raw reviews are never modified. Analysis lives in `review_analysis` keyed by review + model + prompt version, so a
  newer model can re-analyze everything without losing the old results.

## Getting products in (no scraping, no approvals)

Products are **link-only**: you give a link and a name, the backend reads the product id out of the link text
(ASIN for amazon.in, `pid` for Flipkart) and never opens the page. They are labelled unverified everywhere.
Fill `data/products-to-fill.json` with products you open yourself, then send it as the body of `POST /api/import-links`.
Rows left blank are rejected, not stored. Flipkart links must contain `?pid=`. Short links (amzn.in, dl.flipkart.com) are rejected.

Reviews go in with `POST /api/import-reviews?productId=...` using `dataSourceType`:
* `user_pasted`: reviews a person pasted from elsewhere. Used for analysis only and **never returned by any public endpoint**.
* `site_user`: reviews written on your own site. Public.
* `dataset` / `authorized_api` / `manual_import`: only for verified products from the Phase 1 pipeline.

## API

Reads are open. Writes need header `x-admin-key: <ADMIN_API_KEY>`.

| Method | URL |
|---|---|
| GET | `/api/health` |
| GET | `/api/products?limit=25&offset=0` |
| GET | `/api/product?id=<product id>` |
| GET | `/api/reviews?productId=<id>&limit=25&offset=0` (public reviews only) |
| GET | `/api/analysis?productId=<id>` (snapshot: sentiment %, authenticity distribution, aspects, `asOf`) |
| GET | `/api/aspects?productId=<id>` |
| GET | `/api/review-analysis?reviewId=<id>` (public reviews only) |
| POST | `/api/import-link`, `/api/import-links` (admin) |
| POST | `/api/import-reviews?productId=<id>` (admin) |
| POST | `/api/import-product` (admin; verified Amazon pipeline from Phase 1) |
| POST | `/api/analyze` (admin; optional body `{ "limit": 40 }`) |
| GET | `/api/cron/daily` (called by Vercel with `Authorization: Bearer <CRON_SECRET>`) |

All percentages are computed by the backend from stored rows. Gemini never supplies a total or a percentage.

## How the authenticity risk works

Each review gets a 0 to 1 **risk estimate**, not a verdict: `0.5 x text/pattern signals + 0.4 x Gemini's estimate + 0.1 x rating-vs-text mismatch`.
Pattern signals: generic wording, lack of specific details, repetition, promotional language or contact details,
near-duplicates of other reviews of the same product, and same-day bursts (only when enough dated reviews exist).
A signal that cannot be judged (for example, no other reviews to compare with) is left out instead of counted as "fine".
Classes: below 0.33 `low_suspicion`, below 0.66 `moderate_suspicion`, otherwise `highly_suspicious`.
Every stored result keeps its breakdown (`riskBreakdown`) so you can see why.

## Things you must know (honest limits)

* **Gemini was not called for real.** My sandbox cannot reach Google's API. The request format, structured-output schema
  and response validation are tested against simulated replies only. Your first real run is the first live test. If it
  reports `bad_request`, check `GEMINI_MODEL`; if `auth`, check the key.
* **The detector's accuracy is unmeasured.** The weights and thresholds are reasoned starting points, not tuned on real data.
  `data/synthetic-review-samples.json` holds 48 FAKE reviews I wrote (24 specific/genuine-style, 24 generic/promotional)
  and a test that checks the text signals rank the second group above the first. I wrote both the rules and the
  samples, so that test proves the code does what it was designed to do, **not** that it catches real fake reviews.
  Real accuracy needs labelled real reviews. Text signals alone are also cautious: most generic samples land below
  "moderate" without Gemini's input. Never show those samples to users as real reviews.
* **No real Amazon/Flipkart reviews are included.** Collecting them in bulk needs permission from those sites, which you chose not to seek.
* **Pasted reviews:** storing and analyzing text a user pasted may still raise copyright or terms-of-service questions. They stay private, but check before launch.
* **Supabase connection code** (`lib/supabaseRepository.ts`) has not run against a real project. The SQL (including the three functions) is tested in an in-process Postgres; the TypeScript around it is tested against an in-memory copy with the same rules.
* The old strict "verified product" pipeline from Phase 1 is still there. Link-only products can never become `verified`; there is no code path that upgrades them.

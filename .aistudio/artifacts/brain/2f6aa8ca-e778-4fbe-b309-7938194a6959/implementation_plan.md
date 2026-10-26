# ReviewLens — Link Analyzer & Product Reliability Inspector

Replace the legacy **Benchmarks** and **Review Lab** tabs with a dedicated **Link Analyzer** workspace where shoppers paste any product URL, automatically inspect the page and independent web evidence, read a structured item summary with pros, cons, and red flags, receive a clear **Reliability Statement**, discover higher-trust catalog alternatives when an item looks risky, and save or compare analyzed products in one click.

## User Review & Critical Decisions

> [!IMPORTANT]
> Please review the confirmed scope below before execution begins. **Benchmarks**, **Review Lab**, and the old manual admin-key link entry modal will be retired from the navigation and replaced with the unified **Link Analyzer**.

- **Confirmed Decision — Supported Product Links**: Supports **any `http`/`https` product webpage** (brand stores, Croma, Reliance Digital, Vijay Sales, D2C sites, review pages) with specialized **Amazon India (`amazon.in`) and Flipkart (`flipkart.com`)** canonical ID extraction, shortened-link redirect resolution, and bot-wall recovery.
- **Confirmed Decision — Reliability Report Depth**: Delivers an executive **Item Summary**, explicit **Reliability Verdict & Statement** (*Reliable to Buy*, *Buy with Caution*, or *Unreliable / High Risk*), **Trust & Authenticity Score**, **Pros & Cons**, **Red Flags & Claim Checks**, and **Better Catalog Alternatives** whenever a product scores poorly or appears overpriced.
- **Confirmed Decision — Streamlined Header Action & One-Click Save**: Retires the manual *"Add Product Link"* form (which previously required typing product name, price, and an admin key). Clicking the header's primary **"Analyze Link"** button opens the Link Analyzer directly, where any inspected product can be **saved to the Catalog, added to Shortlist, or sent to the 4-way Compare tray in one click**.
- **Confirmed Continuity — Seamless Local Fallback**: Consistent with your earlier preference, if `GEMINI_API_KEY` in **Settings > Secrets** is unset or unavailable, the analyzer never blocks—it seamlessly synthesizes the report from live HTML/`Schema.org` metadata, URL slug & domain trust signals, and cross-checks against the verified 30-product catalog with a subtle non-intrusive status note.

---

## 1. Overview & Core Concept

- **What It Does**: Turns ReviewLens from a static benchmark showcase into an active pre-purchase inspection tool. A shopper pastes any product link, and ReviewLens opens and parses the target page on the server, cross-checks product claims and buyer sentiment via Gemini URL Context and Google Search grounding, evaluates seller/listing/review risk signals, outputs a plain-English reliability statement, recommends safer catalog alternatives in the same category and INR budget, and lets the user save the item directly into their ReviewLens workspace.
- **Target Audience / Persona**: Indian online shoppers comparing electronics, appliances, and accessories across Amazon.in, Flipkart, and brand storefronts who want an honest second opinion before spending money.
- **Key Value**: Eliminates guesswork, fake-discount traps, and bot-blocked dead ends by combining live page metadata extraction, web-grounded review cross-checking, personalized catalog alternatives, and frictionless one-click catalog saving.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Streamlined Navigation (Benchmarks & Review Lab Removed)**:
   - Top bar navigation simplifies to four crisp single-line destinations: **Catalog**, **Link Analyzer**, **Compare**, and **Shortlist**, alongside the `@username` Buyer Profile trigger, theme toggle, primary **Analyze Link** CTA, and **Sign Out** button.
   - Mobile section switcher mirrors the exact same streamlined tabs with zero dead references to Benchmarks or Review Lab.
2. **Paste URL & Quick-Try Sample Links (Zero-State)**:
   - Entering **Link Analyzer** presents a focused URL inspection bar (`Paste any Amazon.in, Flipkart, or product webpage link...`) with an **Inspect Product** primary button.
   - Beneath the input, 3–4 clickable sample pills/buttons (including a verified flagship listing, a mid-range listing with mixed claims, and a high-discount caution example, plus recent session inspections) let users test the full flow immediately or re-open recent reports in one click.
3. **Multi-Stage Inspection Progress**:
   - Submitting a URL displays a calm, high-precision skeleton and step indicator (*Opening product page & reading structured metadata -> Cross-checking independent specifications & buyer reports -> Computing reliability verdict & alternatives*) with zero layout shift.
4. **Executive Reliability Report & Item Summary**:
   - **Contiguous Verdict Hero**: Displays extracted/fallback product artwork on the left, clean unboxed metadata (`Store Domain · Category · Inspection Mode`), product title, detected INR pricing/MRP discount (in `tabular-nums`), and a high-contrast **Reliability Verdict Banner**:
     - *Reliable to Buy* (Emerald semantic accent + icon + clear statement explaining why specifications, pricing, and review signals align).
     - *Buy with Caution* (Amber semantic accent + icon + specific caveats to check before ordering).
     - *Unreliable / High Risk* (Crimson semantic accent + icon + concrete warning reasons).
   - **Structured Breakdown Grid**:
     - **Item Summary & Key Specifications**: Plain-English overview of what the product offers alongside extracted technical specs in a clean key-value table.
     - **What Buyers & Specs Confirm (Pros) vs. Watchouts (Cons)**: Side-by-side scannable lists grounded in page data and external review consensus.
     - **Reliability Signals & Red Flags**: Specific forensic checks (e.g., *Inflated MRP discount framing*, *Missing manufacturer model number*, *Unverified seller / sparse review volume*, *Page bot-wall bypassed via web grounding*, or *Corroborated hardware specs*) plus clickable grounding source links when live web verification runs.
5. **One-Click Workspace Actions & Better Alternatives**:
   - Directly inside the report header, users have three immediate actions: **Save to Catalog** (auto-populates product details without any admin key), **Save to Shortlist** (syncs immediately with Supabase/account favourites and updates Buyer DNA), and **Add to Compare**.
   - Below the breakdown, a **Safer & Higher-Trust Alternatives** strip surfaces up to 3 verified catalog items in the same department and comparable INR price range—prioritizing items with `85%+` genuine review patterns and highlighting how their trust score and price compare against the inspected link.

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian editorial storefront & consumer-reports inspection desk—clean, authoritative, and scam-resistant without noisy dashboard gimmicks.
- **Color Palette & Mood**: Preserves ReviewLens's 60-30-10 light/dark system:
  - *60% Neutral Canvas*: Crisp `#FAFAFA` light canvas / `#020617` (`slate-950`) dark canvas.
  - *30% Structural Surfaces*: Single-elevation `white` / `slate-900` containers with `1px` hairline borders (`border-slate-200` / `border-slate-800`)—no nested card sandwiches and no thick `border-l-4` callout stripes.
  - *10% Semantic & Action Accents*: `slate-900` / `amber-400` primary interactive controls; semantic reliability states always pair color + icon + explicit text label (`emerald` for Reliable, `amber` for Caution, `rose`/`red` for Unreliable) for full WCAG AA color-blind accessibility.
- **Typography & Tabular Discipline**: Clean sans display/body hierarchy with `text-wrap: balance` on report headlines, unboxed metadata separated by middle dots (`·`), and strict `tabular-nums` / monospace figures across all INR prices, discounts, ratings, and reliability scores.
- **Interactive Feedback & Motion**: Compositor-only `opacity`/`transform` transitions settling within `160ms–180ms`, instant optimistic state updates when saving to Catalog/Shortlist/Compare, and resilient category studio photography fallbacks so arbitrary external store URLs never render broken images.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Three-Layer Page Opening & Grounding Pipeline**:
  - *Chosen Approach*: Combine (1) **Server-Side HTTP Page Fetch & Structured Parser** (follows redirects including shortened links, reads `<script type="application/ld+json">` `Product`/`Offer`/`AggregateRating` schemas, OpenGraph tags, `<title>`, meta descriptions, INR price patterns, and sanitized visible text) -> (2) **Gemini `gemini-3.8-flash` with `urlContext` + `googleSearch` Grounding** (inspects the target URL context and cross-verifies the product model, real-world street price, and common buyer complaints across independent reviews, even if Amazon/Flipkart returns a `403`/`503` CAPTCHA wall to raw HTTP) -> (3) **Deterministic Catalog & Heuristic Analyzer Fallback** (matches ASIN/`pid`/slug against the 30-item verified catalog or synthesizes structured metadata + URL/price/claim risk heuristics locally when `GEMINI_API_KEY` is unavailable).
  - *Why*: E-commerce marketplaces aggressively throttle raw server scrapers. A single-method HTML scraper fails on Amazon/Flipkart CAPTCHAs, while an LLM-only guesser misses live page metadata on open D2C stores. Layering both—backed by a local fallback—guarantees every valid product URL produces a rich, truthful report.
  - *Alternatives Considered*: Headless browser automation (rejected due to slow cold starts, high memory overhead, and identical CAPTCHA blocks in cloud containers).
- **Decision 2 — One-Click Authenticated Catalog Save Instead of Admin-Key Form**:
  - *Chosen Approach*: Allow any signed-in ReviewLens user to save an analyzed product directly into the active Catalog repository (and immediately shortlist or compare it) using the structured fields already extracted by the Link Analyzer, normalizing non-Amazon/Flipkart web storefronts cleanly alongside marketplace listings.
  - *Why*: Eliminates tedious manual form entry and removes the developer-only `x-admin-key` barrier from the user workflow.
- **Decision 3 — Trust-Weighted Alternative Recommendations**:
  - *Chosen Approach*: Automatically rank 2–3 verified catalog products matching the detected department (inferred from page schema/keywords) and INR price band, weighted by genuine review percentage (`1 - averageRisk`) and the signed-in user's Buyer Profile affinities.
  - *Why*: Telling a shopper *"Buy with Caution"* is twice as helpful when paired immediately with *"Here is a verified alternative in the same budget with 91% genuine reviews."*

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Authenticated ReviewLens UI                          │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ Top Navigation Bar                                                     │  │
│  │ [ReviewLens] ── [Catalog | Link Analyzer | Compare | Shortlist]        │  │
│  │              ── [@user | Theme | Analyze Link CTA | Sign Out]          │  │
│  └───────────────────────────────────┬────────────────────────────────────┘  │
│                                      │                                       │
│        ┌─────────────────────────────┼─────────────────────────────┐         │
│        ▼                             ▼                             ▼         │
│  ┌───────────────┐    ┌──────────────────────────────┐    ┌───────────────┐  │
│  │ Catalog &     │    │ Link Analyzer Workspace      │    │ Compare &     │  │
│  │ Detail Modal  │◄───┤  ├─ URL Input & Sample Links │───►│ Buyer Profile │  │
│  └───────▲───────┘    │  ├─ Reliability Verdict Hero │    │ (Shortlist)   │  │
│          │            │  ├─ Summary, Specs, Pros/Cons│    └───────▲───────┘  │
│          │            │  ├─ Red Flags & Web Sources  │            │          │
│          │            │  ├─ 1-Click Save / Compare   │────────────┘          │
│          │            │  └─ Better Alternatives Grid │                       │
│          │            └──────────────┬───────────────┘                       │
└──────────┼───────────────────────────┼───────────────────────────────────────┘
           │                           │ POST (URL Inspection / 1-Click Save)
           │                           ▼
┌──────────┼───────────────────────────────────────────────────────────────────┐
│          │               Next.js Server Inspection Pipeline                  │
│          │                                                                   │
│  ┌───────┴────────┐     ┌─────────────────────────────────────────────────┐  │
│  │ Hybrid Catalog │◄────┤ Link Inspection & Reliability Engine            │  │
│  │ Repository     │     │  1. SSRF-Safe HTTP Fetch + Redirect Resolver    │  │
│  │ (30 Verified + │     │     + JSON-LD / OpenGraph / Price-Spec Parser   │  │
│  │  Saved Links)  │     │  2. Gemini 3.8 Flash (urlContext + googleSearch)│  │
│  └───────▲────────┘     │     Cross-Check & Structured Verdict Synthesis  │  │
│          │              │  3. Deterministic Local Heuristic Fallback      │  │
│          └──────────────┤  4. Trust-Weighted Catalog Alternative Matcher  │  │
│                         └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Link Analysis Report (`LinkAnalysisReport`)**:
  - *Target Identity*: `submittedUrl`, `finalUrl`, `domain`, `marketplace` (`amazon.in` | `flipkart` | `web`), `externalId` (ASIN, Flipkart `pid`, or deterministic URL hash), `pageFetchStatus` (`opened` | `bot_protected` | `unreachable`), `analysisMode` (`live_grounded` | `local_heuristic`), `fallbackReason` (optional).
  - *Extracted Product Profile*: `productName`, `brand`, `model`, `category` (mapped to the 10 ReviewLens departments), `price`, `mrp`, `discountPercent`, `currency`, `rating`, `reviewCount`, `availability`, `specs` (key-value map), `summary` (concise 2–3 sentence overview).
  - *Reliability Assessment*: `verdict` (`reliable` | `caution` | `unreliable`), `reliabilityScore` (`0–100`), `reliabilityStatement` (explicit 2-sentence buyer recommendation), `pros` (array), `cons` (array), `redFlags` (array of `{ label, severity, detail }`), `sources` (verified web grounding citations).
  - *Catalog Integration*: `matchedCatalogProductId` (if the URL already exists in the catalog) and `alternatives` (up to 3 `CatalogAlternativeItem` matches with `productId`, `matchReason`, `genuinePercent`, and price delta).
- **Extended Marketplace Source Support**:
  - Broaden `Marketplace` union (`"amazon.in" | "flipkart" | "web"`) so products saved from third-party D2C or retail web links integrate seamlessly with Catalog cards, Product Detail modals, Compare matrices, and Supabase/local `user_favorites` shortlists without breaking existing Amazon/Flipkart badges or external outbound links.
- **Recent Inspections History**:
  - Maintain up to 6 recent `LinkAnalysisReport` entries in client session/local storage (`rl_recent_link_analyses`) so switching tabs between `Link Analyzer`, `Compare`, and `Catalog` never loses the active report.

### Interactive Component & State Mapping

- **URL Form Submission & Validation**: Validates `http:`/`https:` URLs inline (auto-prepending `https://` if omitted, and blocking private/localhost IPs on the server for SSRF safety), disables duplicate in-flight submissions, and renders stage-aware loading skeletons.
- **Header "Analyze Link" CTA**: Switches `activeSection` to `"analyzer"` and focuses the URL input (replacing `ImportModal` completely).
- **One-Click "Save to Catalog" / "Shortlist" / "Compare"**:
  - If the analyzed URL already matches a catalog product (`matchedCatalogProductId`), **Shortlist** and **Compare** toggle that product directly, and **View Full Audit** opens `ProductDetailModal`.
  - If the URL is a brand-new external item, clicking **Save to Catalog** (or clicking **Shortlist** / **Compare** directly on an unsaved item) persists the extracted `NewProduct` via an authenticated server endpoint (requiring the signed-in user session rather than a manual admin key), refreshes `catalogItems`, links `matchedCatalogProductId`, and immediately applies the requested Shortlist or Compare toggle.
- **Alternative Product Cards**: Clicking any recommended alternative opens its full `ProductDetailModal` or adds it directly to the Compare tray alongside the newly analyzed link so the user can inspect both side by side.

### Key Sequences & Integrations

1. **SSRF-Safe Server Page Open**:
   - Rejects `localhost`, loopback (`127.0.0.0/8`, `::1`), link-local (`169.254.0.0/16`), and private RFC1918 IP ranges before making outbound `fetch` calls with an `8s` timeout and standard browser `Accept` / `Accept-Language` headers.
   - Extracts `application/ld+json` (`@type: Product`), `og:title`, `og:description`, `product:price:amount`, canonical URL, and visible specification snippets, and resolves shortened `amzn.in` / `fkrt.it` redirects automatically on the server.
2. **Gemini Grounded Synthesis (`@google/genai`)**:
   - Calls `gemini-3.8-flash` on the server (`User-Agent: 'aistudio-build'`) configured with `tools: [{ urlContext: {} }, { googleSearch: {} }]`, feeding both the target URL and any server-extracted HTML/JSON-LD metadata so Gemini can read the page and cross-check independent reviews/pricing even when direct scraping hits a marketplace bot wall.
   - Uses the existing key sanitizer and circuit-breaker (`isGeminiKeyUsable` / `classifyGeminiError`) so missing, placeholder, or quota-limited keys fall back instantaneously to deterministic page + slug + catalog heuristic synthesis without throwing UI errors.

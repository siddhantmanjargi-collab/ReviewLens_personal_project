# Resilient Gemini Key Validation & Local Claim Cross-Check

Eliminates server-side `API_KEY_INVALID` runtime errors when `GEMINI_API_KEY` is missing, placeholder-populated, or rejected by Google servers, while upgrading offline Buyer Claim Fact-Checking to cross-verify reviewer claims against both hardware specifications and aspect-level buyer sentiment.

### User Review & Critical Decisions

> [!IMPORTANT]
> Both product behavior choices were confirmed during Phase 1 clarification and govern how every Gemini-backed workflow behaves when live credentials are unavailable.

- **Confirmed Decision 1 — Missing or Invalid Key Behavior**: **Seamless local fallback with subtle Secrets hint**. All workflows (Buyer Claim Fact-Check, Single & Batch Review Forensics, and Live Evaluation Pass) complete without throwing server-log `ApiError` exceptions, and render a quiet, non-blocking inline note pointing to **Settings > Secrets** when live Gemini grounding is inactive.
- **Confirmed Decision 2 — Offline Buyer Claim Fact-Check Strategy**: **Cross-check specs and review sentiment locally**. Instead of marking every claim corroborated by default, the local verifier cross-examines extracted reviewer claims against structured product specifications, trusted aspect polarity ratios, and star-to-prose mismatch signals to assign realistic **Corroborated**, **Nuanced**, or **Disputed** verdicts.

---

### 1. Overview & Core Concept

- **What It Does**:
  - Sanitizes `GEMINI_API_KEY` on the server before initializing `@google/genai` (stripping accidental quotes/whitespace and rejecting placeholder strings) and trips an automatic key-scoped circuit breaker on `API_KEY_INVALID` (400) or `PERMISSION_DENIED` (403) so invalid keys never trigger multi-model retry storms or raw `ApiError` stderr dumps.
  - Replaces the static fallback in Buyer Claim Fact-Check with a deterministic specification-and-sentiment cross-checker that evaluates hardware claims against catalog specs and aggregated buyer sentiment.
  - Surfaces structured fallback reason metadata to the UI so users see a calm, single-line status hint referencing **Settings > Secrets** without any modal interruptions or key-entry forms.
- **Target Audience / Persona**: Shoppers, product analysts, and portfolio reviewers auditing e-commerce product authenticity, aspect sentiment, and hardware claims—whether or not a live Gemini API key is attached in the preview environment.
- **Key Value**: Zero noisy runtime errors in server logs, instant fallback latency (no wasted retries on bad credentials), automatic recovery the moment a valid key is selected in **Settings > Secrets**, and genuinely informative fact-check verdicts in offline mode.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Buyer Claim Fact-Check (Product Detail Modal -> Fact-Check Tab)**:
     - User clicks **Verify Buyer Claims via Google Search**.
     - If a valid `GEMINI_API_KEY` is active, Gemini runs live Google Search grounding (`gemini-3.8-flash`) and cites external web sources.
     - If the key is unset, a placeholder, or rejected (`API_KEY_INVALID`), the server immediately switches to the **Catalog Spec & Review Sentiment Cross-Checker**, returning 3–4 concrete buyer claims scored as **Corroborated**, **Nuanced**, or **Disputed** alongside official manufacturer and Amazon listing links, plus a quiet inline note explaining that live web grounding activates once a valid `GEMINI_API_KEY` is configured in **Settings > Secrets**.
  2. **Review Forensics Lab (Batch Segregation & Single Review Inspector)**:
     - Submitting a single review or 60-review batch runs seamlessly with deterministic 6-signal heuristics and 3-gram Jaccard clone detection when Gemini is offline, displaying a subtle status line under the engine header noting when local heuristics were used due to an unconfigured or invalid `GEMINI_API_KEY` in **Settings > Secrets**.
  3. **Evaluation Suite (Live Gemini Verification Pass)**:
     - Clicking **Run Live Gemini Verification Pass** when the key is invalid or absent completes cleanly without server warnings, preserves the 40-sample ablation metrics, and displays a concise inline notice near the calibration bar indicating why reference scores remain active and how to enable live pass execution via **Settings > Secrets**.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-density enterprise analytics & SaaS forensics console—authoritative, restrained, and data-first.
  - *Color Palette & Mood*: Crisp neutral canvas (`bg-white` / `dark:bg-slate-900`, structural `bg-slate-50` / `dark:bg-slate-950`) with a disciplined 10% `amber-400` primary action accent and semantic verdict tones (`emerald` for corroborated/genuine, `amber` for nuanced/mismatch, `rose` for disputed/suspicious) paired with explicit uppercase text labels.
  - *Typography & Hierarchy*: Clean sans-serif UI hierarchy paired with monospace tabular figures (`font-mono tabular-nums`) for risk percentages, star deltas, cache hit counters, and timestamps. Metadata and engine notices use quiet unboxed inline text with middle-dot (`·`) separators—no decorative status dots, no thick left borders, and strictly no API key input fields.
  - *Component Styling & Layout*: Single-elevation flat containers with subtle 1px hairline borders (`border-slate-200 dark:border-slate-800`) and consistent internal spacing.

- **Interactive Feedback & Motion**:
  - Button loading states settle immediately once the circuit breaker short-circuits an invalid key (~5ms instead of multi-second retries), eliminating perceived UI lag.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Key-Scoped In-Memory Circuit Breaker with Pre-Flight Sanitization**
  - *Chosen Approach*: Normalize `GEMINI_API_KEY` (trim whitespace and wrapping quotes, reject known placeholder patterns and malformed tokens) before SDK invocation. If `@google/genai` returns `API_KEY_INVALID` (400) or `PERMISSION_DENIED` (403), immediately abort model fallback loops and record a fingerprint of that exact key string as invalid in server memory. If the user later updates `GEMINI_API_KEY` in **Settings > Secrets**, the fingerprint changes and live calls automatically resume without a server restart.
  - *Why*: Eliminates redundant retries across secondary models (`gemini-flash-latest`, `gemini-3.1-flash-lite`) when the credential itself is invalid, prevents repeated 400 errors on subsequent clicks, and recovers seamlessly when Secrets are updated.
  - *Alternatives Considered*: Retrying alternate models on 400 errors (wastes latency and multiplies error logs when the failure reason is `API_KEY_INVALID` rather than an unsupported model parameter).

- **Decision 2: Structured Diagnostic Summaries Instead of Raw `ApiError` Console Dumps**
  - *Chosen Approach*: Classify Gemini exceptions into typed diagnostic categories (`missing_or_invalid_api_key`, `quota_exceeded`, `service_unavailable`) and return that clean status field in the JSON response payload rather than passing raw `ApiError` JSON blobs to `console.warn`.
  - *Why*: Raw `ApiError` stack traces in server logs trigger false-positive platform crash alerts even when the endpoint handled the fallback gracefully with HTTP 200.

- **Decision 3: Multi-Signal Local Claim Cross-Verification**
  - *Chosen Approach*: Match extracted buyer claims and product aspects against catalog specification key-values (battery capacity/endurance, refresh rate/display type, processor/thermals, weight/build, ANC/audio codecs, charging wattage) and compare against trusted-vs-suspicious review sentiment ratios:
    - **Corroborated**: Buyer claim aligns with published spec metrics and strong positive consensus among low-risk reviews ($\ge 65\%$ positive).
    - **Nuanced**: Spec sheet confirms the hardware capability, but verified owner reviews document real-world trade-offs or mixed aspect polarity ($25\%\text{–}55\%$ negative mentions, e.g., high brightness paired with warm thermals or heavy chassis).
    - **Disputed**: Claim contradicts verified hardware specifications (e.g., claiming features absent from the spec sheet or exaggerated spam superlatives) or faces majority negative defect reports ($> 55\%$ negative aspect consensus).
  - *Why*: Delivers genuine analytical value grounded in the app's 30-product hardware catalog and 180-review dataset whenever live web search is offline.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Environment & Key Guard Layer                            │
│  process.env.GEMINI_API_KEY ──► Pre-Flight Sanitizer (trim, placeholder ban) │
│                                        │                                     │
│                                        ▼                                     │
│                         Key-Fingerprint Circuit Breaker                      │
│               (Short-circuits 400 API_KEY_INVALID / 403 Auth)                │
└───────────────────┬──────────────────────────────────────┬───────────────────┘
                    │ Valid & Healthy Key                  │ Missing / Tripped Key
                    ▼                                      ▼
┌───────────────────────────────────────┐  ┌───────────────────────────────────┐
│      Live @google/genai Execution     │  │   Deterministic Local Engines     │
│ • gemini-3.8-flash + Google Search    │  │ • Spec + Aspect Claim Verifier    │
│ • Structured JSON Review Analyzer     │  │ • 6-Signal Heuristic Detector     │
│ • SHA-256 Content-Hash Cache          │  │ • 3-Gram Shingle Clone Graph      │
└───────────────────┬───────────────────┘  └───────────────┬───────────────────┘
                    └──────────────────┬───────────────────┘
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                Server API Routes (Clean HTTP 200 + Fallback Status)          │
│  POST /api/verify-claims  │  POST /api/test-review  │  POST /api/evaluation  │
│                           │  POST /api/segregate-batch                       │
└───────────────────────────┴──────────────┬───────────────────────────────────┘
                                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Client Diagnostic Views (Subtle Secrets Hint)             │
│  ┌────────────────────────┐ ┌──────────────────────┐ ┌─────────────────────┐ │
│  │ Product Detail Modal   │ │ Review Forensics Lab │ │ Evaluation Suite    │ │
│  │ • Fact-Check Verdicts  │ │ • Batch Segregator   │ │ • Live Pass Notice  │ │
│  │ • Spec + Review Proof  │ │ • Single Inspector   │ │ • 40-Sample Metrics │ │
│  └────────────────────────┘ └──────────────────────┘ └─────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Fallback Reason Enum**: `"missing_api_key" | "invalid_api_key" | "quota_exceeded" | "service_unavailable"` attached optionally as `fallbackReason` on API payloads when `grounded: false` or `aiPowered: false`.
  - **Key Circuit Breaker Store**: Server-global `Set<string>` storing SHA-256 fingerprints of rejected API keys during the current process lifetime so raw secret strings are never stored in plain text or leaked in payloads, and any newly injected key is automatically tested fresh.
  - **Claim Verification Report**: Preserves `{ productName, grounded, model, summary, claims, sources, checkedAt }` and adds optional `fallbackReason` so existing consumers remain 100% backward-compatible.

- **Interactive Component & State Mapping**:
  - **Fact-Check Tab (`ProductDetailModal`)**: Clicking **Verify Buyer Claims** sets loading state, calls `POST /api/verify-claims`, renders claim cards with semantic verdict labels (`CORROBORATED` / `NUANCED` / `DISPUTED`) and spec-plus-sentiment evidence prose, and conditionally displays a single-line hint referencing **Settings > Secrets** when `fallbackReason` indicates a missing or invalid key.
  - **Batch & Single Forensics (`ReviewTesterSection`)**: Running batch segregation or single-review evaluation updates `batchResult` / `singleResult`; when `aiPowered === false` and `fallbackReason` is key-related, displays a concise inline note alongside the engine indicator without obscuring risk breakdowns or export actions.
  - **Ablation Benchmark (`EvaluationSection`)**: Clicking **Run Live Gemini Verification Pass** invokes `POST /api/evaluation`; if `mode` remains `"reference"` due to a key issue, sets a clean status banner below the calibration bar explaining that reference labels remain active until a valid `GEMINI_API_KEY` is selected in **Settings > Secrets**.

# ReviewLens — Full-App Username & Password Login with Synced Shortlist & Comparisons

Add a dedicated username and password authentication gate that protects the entire ReviewLens application while automatically syncing each signed-in user's saved shortlist and product comparison tray to the server—with zero user profile management overhead.

## User Review & Critical Decisions

> [!IMPORTANT]
> Updated per your feedback: **all user profile features (display names, role titles, profile editing modals, and profile endpoints) have been completely removed**. The scope now focuses strictly on username/password login, full-app protection, and server-synced shortlists and comparisons.

- **Confirmed Decision — Authentication Method**: Simple **username and password** sign-in and account registration (`Username` + `Password` only), secured with server-side salted `scrypt` password hashing and HMAC-signed session tokens.
- **Confirmed Decision — Access Protection Scope**: **Full-application authentication gate**. Unauthenticated visitors land directly on the ReviewLens sign-in screen; all storefront browsing, product inspections, comparison matrices, benchmark evaluations, and Review Lab tools unlock immediately upon sign-in.
- **Confirmed Decision — Synced Workspace Scope (No User Profile)**: **Server-synced shortlist and product comparisons only**. Toggling shortlisted products and building up to a 4-item comparison set sync automatically to the signed-in account across sessions and browsers, with no user profile fields or profile settings UI.
- **Recommended Convenience Default — Instant Sign-Up & Demo Quick-Fill**: Alongside creating any custom username and password account, the login card includes a one-click **"Fill Demo Credentials"** helper (`analyst`) so anyone evaluating ReviewLens can test the protected workspace immediately without inventing credentials.

---

## 1. Overview & Core Concept

- **What It Does**: Introduces a clean authentication gate, username/password sign-in and registration screen, cryptographic session layer, and server-synced shortlist and comparison storage for ReviewLens. Users sign in or register with just a username and password to unlock the 30-product Indian marketplace directory, shill-ring forensic graph, claim verifier, and Review Lab, while keeping their saved shortlist and comparison selections persisted to their account.
- **Target Audience / Persona**: Shoppers, e-commerce analysts, and portfolio reviewers who want authenticated access and persistent product shortlists and side-by-side comparisons across sessions without unnecessary profile setup friction.
- **Key Value**: Upgrades ReviewLens from an anonymous single-browser demo into a stateful, multi-user product intelligence workspace with real credential verification, full-app route/workspace protection, and seamless shortlist and comparison synchronization.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Arrival & Session Check**:
   - On initial load, a lightweight session check verifies whether an active authenticated session exists. While resolving, a crisp minimal skeleton matching the ReviewLens canvas prevents any flash of unauthenticated content.
   - If unauthenticated, the full-viewport **ReviewLens Sign In & Create Account Screen** renders immediately.
2. **Sign In & Account Registration (`Username` + `Password` Only)**:
   - Users switch cleanly between **Sign In** and **Create Account** segmented tabs at the top of the authentication card.
   - **Sign In**: Accepts `Username` and `Password` (with a show/hide password visibility toggle), validates inputs inline, and transitions straight into the storefront workspace on success. Includes a subtle one-click **"Fill Demo Credentials"** helper for rapid evaluation.
   - **Create Account**: Accepts strictly `Username` (3–24 characters, alphanumeric/underscores) and `Password` (minimum 6 characters)—no profile names, avatars, or extra fields—creates the hashed account on the server, carries over any existing local shortlist or comparison items, and signs the user in automatically.
3. **Synced Shortlist & Comparison Workflow**:
   - Once signed in, adding or removing products from the **Shortlist** or **Compare (up to 4)** tray updates the UI optimistically in `<50ms` and syncs asynchronously in the background to the user's server record.
4. **Session Indicator & Sign Out**:
   - Inside the workspace, a compact session control displays the signed-in `@username` handle alongside a direct **Sign Out** button—no profile drawers, settings modals, or profile forms.
   - Clicking **Sign Out** clears the server session cookie and client session token, resets active user state cleanly, and returns smoothly to the Sign In screen.

### Visual Identity & Theme

- **Aesthetic Direction**: Structured e-commerce & forensic SaaS editorial aesthetic matching ReviewLens's existing visual DNA—clean architectural geometry, crisp hairline borders, zero decorative clutter, and authoritative marketplace trust cues.
- **Color Palette & Mood (60-30-10 Discipline)**:
  - *60% Dominant Neutral Canvas*: Soft off-white `#FAFAFA` (`bg-[#FAFAFA]`) in light mode; deep slate `#020617` (`dark:bg-slate-950`) in dark mode.
  - *30% Structural Surfaces*: Pure white `#FFFFFF` (`bg-white`) and slate `#0F172A` (`dark:bg-slate-900`) panels separated by 1px hairline borders (`border-slate-200 dark:border-slate-800`), strictly single-elevation depth (no cards nested inside cards, no thick left borders).
  - *10% High-Intent Accent*: Warm marketplace amber (`bg-amber-400 text-slate-950` / `text-amber-700 dark:text-amber-400`) and deep charcoal (`bg-slate-900 text-white`) reserved strictly for primary CTAs, active segmented tabs, and focus rings. Semantic crimson (`text-red-600 dark:text-red-400`) paired with explicit text explanations for validation errors.
- **Typography & Hierarchy**:
  - *Display & UI Prose*: `Plus Jakarta Sans` (`--font-sans`) in Regular (400), SemiBold (600), and Bold (700), with `text-wrap: balance` on display headlines to prevent orphan words.
  - *Metrics, Usernames & Counts*: `JetBrains Mono` (`--font-mono`) and `tabular-nums` for catalog metrics (`30 Products · 180 Audited Reviews`), `@username` handles, and synced shortlist/comparison counters.
- **Component Styling & Spatial Layout**:
  - **2-Column Balanced Desktop Login Split (`1440px` baseline)**:
    - *Left Column (Showcase Panel, `lg:col-span-7`)*: Brand wordmark, balanced editorial headline explaining ReviewLens's verified Indian marketplace intelligence, unboxed typographic proof line (`30 Verified Products · 10 Departments · Shill-Ring Forensics`), and high-resolution hardware showcase photography with a measured contrast scrim.
    - *Right Column (Authentication Module, `lg:col-span-5`)*: Clean, vertically centered authentication card with generous `p-8` outer padding, segmented `Sign In | Create Account` control, accessible `>= 44px` `Username` and `Password` fields, password visibility button, primary submit CTA, and demo quick-fill button.
  - **Top Bar Contract Compliance**: Keeps the top navigation bar strictly single-row (`whitespace-nowrap shrink-0`) with the signed-in `@username` indicator and **Sign Out** action cleanly integrated without adding extra rows or profile menus.

### Interactive Feedback & Motion

- **Routine Latency Budget (`<= 180ms`)**: Compositor-only `opacity` and `transform` transitions via `motion/react` when switching between Sign In / Create Account tabs or transitioning from the Login Gate into the Storefront.
- **Explicit Loading, Error & Sync States**: Submit buttons lock against double-submission with inline status text (`Signing in...` / `Creating account...`); credential mismatches display clear, accessible inline messages (`Invalid username or password`) without browser alerts; shortlist and comparison changes persist silently in the background.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Self-Contained Cryptographic Username/Password Auth vs. External OAuth Providers**
  - *Chosen Approach*: Server-side username/password authentication using Node's native `crypto.scrypt` password derivation and HMAC-SHA256 signed session tokens, paired with dual cookie (`SameSite=None; Secure; HttpOnly` on HTTPS) + `Authorization: Bearer` header fallback.
  - *Why*: Directly fulfills the request for simple username and password login with zero extra profile fields, OAuth popups, or email verification steps—and guarantees 100% session reliability inside embedded preview iframes even when browsers block third-party cookies.
  - *Alternatives Considered*: Firebase Auth (provisions Google Sign-In rather than plain username/password) and client-only `localStorage` mock login (insecure and does not persist shortlists/comparisons on the server).
- **Decision 2: Hybrid Cloud + Durable Server Persistence for Accounts, Shortlists & Comparisons**
  - *Chosen Approach*: Extend ReviewLens's repository layer with a lightweight User & Sync Store that persists accounts, `shortlistIds`, and `compareIds` to Supabase when configured and falls back seamlessly to durable server-side JSON storage, pre-seeded with a ready-to-use `analyst` demo account.
  - *Why*: Matches ReviewLens's existing hybrid persistence architecture so accounts, shortlists, and comparisons work out of the box with zero external database setup required, while scaling cleanly to cloud Postgres when environment credentials are present.
- **Decision 3: Optimistic UI Updates with Debounced Server Sync**
  - *Chosen Approach*: Update `shortlistIds` and `compareIds` immediately in React state while dispatching a `250ms` debounced background sync request to the server sync route.
  - *Why*: Preserves instant `0ms` storefront responsiveness when toggling shortlist or compare buttons across product cards while keeping server state synchronized.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Client Application (React)                           │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ AuthProvider & Full-App Session Gate                                   │  │
│  │  • Bootstraps session on mount (/api/auth/me)                          │  │
│  │  • Holds authenticated username, session token & auth actions          │  │
│  └───────────────────┬────────────────────────────────────┬───────────────┘  │
│                      │ (Unauthenticated)                  │ (Authenticated)  │
│                      ▼                                    ▼                  │
│  ┌───────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ Login & Registration Screen       │  │ Protected Storefront Workspace  │  │
│  │  • 2-Col Editorial Showcase Split │  │  • Header (@username + Sign Out)│  │
│  │  • Sign In / Create Account Tabs  │  │  • Synced Shortlist (<=50 IDs)  │  │
│  │  • Username + Password Validation │  │  • Synced Compare (<=4 IDs)     │  │
│  │  • 1-Click Demo Credentials Fill  │  │  • Catalog, Benchmarks & Lab    │  │
│  └───────────────────┬───────────────┘  └─────────────────┬───────────────┘  │
└──────────────────────┼────────────────────────────────────┼──────────────────┘
                       │ POST /api/auth/login               │ GET / PUT
                       │ POST /api/auth/register            │ /api/user/sync
                       │ POST /api/auth/logout              │
                       ▼                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     Next.js Server API & Auth Layer                          │
│                                                                              │
│  ┌───────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ Session & Crypto Engine           │  │ User & Synced Lists Store       │  │
│  │  • scrypt + 16B salt pwd hashing  │  │  • Unique normalized usernames  │  │
│  │  • timingSafeEqual verification   │  │  • Synced shortlistIds (<=50)   │  │
│  │  • HMAC-SHA256 signed tokens      │  │  • Synced compareIds (<=4)      │  │
│  │  • Iframe-safe Cookie + Bearer    │  │  • Zero profile metadata bloat  │  │
│  └───────────────────────────────────┘  └─────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **User Account Entity (Strictly Minimal)**:
  - `id`: Deterministic/UUID user identifier
  - `username`: Normalized lowercase handle (`^[a-z0-9_]{3,24}$`, unique)
  - `passwordHash` & `passwordSalt`: Hex-encoded `scrypt` digest and 16-byte cryptographic salt (never returned to client)
  - `shortlistIds`: Ordered array of shortlisted product IDs (max 50)
  - `compareIds`: Ordered array of compared product IDs (max 4)
  - `createdAt` & `updatedAt`: ISO-8601 timestamps
- **Signed Session Token**:
  - Compact HMAC-SHA256 signed payload (`userId`, `username`, `issuedAt`, `expiresAt` 7-day rolling window) verified using constant-time digest comparison. Delivered via both an `HttpOnly` cookie (`SameSite=None; Secure` on HTTPS, `SameSite=Lax` on local HTTP) and a client Bearer token fallback so embedded iframe previews never lose session state.

### Interactive Component & State Mapping

- **Login & Registration Screen**:
  - *Mode Toggle*: Switches cleanly between `"login"` and `"register"`, clearing stale field errors while preserving typed `username`.
  - *Input Validation*: Validates `username` format (`3–24` alphanumeric/underscore characters) and `password` length (`>= 6` characters) prior to submission; highlights invalid fields with accessible `aria-invalid` and inline helper text.
  - *Demo Credentials Quick-Fill*: Populates pre-seeded `analyst` credentials for frictionless evaluation.
  - *First-Signup Local Migration*: On account registration, reads any guest shortlist or comparison IDs present in browser storage and includes them in the initial registration payload so existing selections carry seamlessly into the new account.
- **Session Control & Sign Out**:
  - Displays the signed-in `@username` and a single-click **Sign Out** button that invalidates both the server session cookie and client token and returns immediately to the Login Screen.
- **Synced Shortlist & Comparison State**:
  - Hydrates `shortlistIds` and `compareIds` directly from the authenticated user's server record upon sign-in.
  - Debounces rapid shortlist and comparison mutations (`250ms`) into `PUT /api/user/sync`, keeping server persistence synchronized without flooding network requests.

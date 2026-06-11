# HUD OAS Platform — Full Evaluation (2026-05-29)

**Context:** Rocktop/Tricia partnership is off; HSG builds and operates the platform directly. The acceptance standard is now our own corrected configuration spec: `HSG-Rocktop-OAS-Platform-Configuration-Spec-v3.docx` (Teaming Documents\Rocktop Platform Config — to be re-titled as an internal build spec). The demo model is the spec's §3.1 two-act structure: Act 1 parity ("your sale exactly as you run it today"), Act 2 survey-grounded improvements, shown on one HVLS and one HLS sale.

---

## 1. Verdict in three sentences

The platform is **further along than the last handoff recorded** — the admin console is fully built, the backend extensions are deployed and live on AWS, all five programs are seeded, and the ACM cert is issued. But the bid-mechanic layer — the platform's core credibility in front of HUD — was **built to the pre-correction model** (typed dollar bids on commercial, one % per residential pool, reserves visible to bidders) and must be reworked to the v3 spec before any HUD demo. Call it **~80% built against the original plan, with a focused spec-conformance rework standing between us and Act-1 parity**.

## 2. Where the build actually stands

### What exists and works (verified today)

| Layer | State |
|---|---|
| Residential portal (HVLS/HNVLS/SFLS) | Landing, 5-flow Cognito login, 6-step HUD-9611 qualification wizard with screening pre-flight, authenticated workspace (sales, data room, bidding, my bids, settlements, notifications) |
| Commercial portal (MHLS/HLS) | Same structure, 6-step qualification wizard with conditional Section 232 operator step |
| Admin console | **All 8 pages built** (index, bidders, bid-day, bem, settlements, qa, compliance, login) — the 4/30 handoff said these didn't exist; they were built ~May 7 |
| Backend | 36 Lambda handlers across 12 domains; deployed. Live API confirmed (`/sales` returns 401 auth-gated, not 404) |
| Data | **11 DDB tables live** including `scenarios`, `notifications`, `screenings` plus post-handoff additions `loans` and `qc-findings`. Seeded: 5 demo sales (one per program, all in `bid_window`), 72 loans, 6 bidders with portal fields |
| Identity | All 8 Cognito groups live (5 portal groups + ogc-reviewer + 2 legacy). MFA flows wired in the frontend |
| Portal isolation | 15 handlers enforce `requirePortalAccess`/`filterByPortal`, including legacy list handlers; `bids/submit` does an inline portal check |
| Frontend hosting | CloudFront serves the two-portal build (byte-identical to local files) at `https://d1cinbd36524ob.cloudfront.net/residential/` and `/admin/` |
| Custom domain | ACM cert **ISSUED** for `hudloansales.housestrategiesgroup.com` (the 4/28 blocker cleared). Domain not yet attached to CloudFront — needs the Stage-2 `sam deploy` with `UseCustomDomain=true` |
| QC module (new, post-handoff) | `qc/list` + `qc/get` with SALD-vs-OPIIS finding statuses and bidder-redacted views — good TS-work-product feature, keep |

### Open infrastructure items
- Root URL returns **403** (old root index.html was deleted; nothing replaced it) — needs a root landing/redirect page
- Custom domain redeploy (cert is ready; one command + verification)
- **The entire two-portal rebuild is uncommitted in git** — last commit predates it; ~7 weeks of work is protected only by OneDrive sync. Commit before touching anything else.
- Screening handlers are stubs (OFAC/SAM/TIN return test values); SES templates partial; nothing writes to the notifications table yet; no WAF/alarms

## 3. Spec-conformance audit — where the code contradicts the real HUD process

These are divergences from the corrected v3 spec, which was validated against the actual HUD sale documents (BIPs, bid forms, surveys). Act 1 of the demo claims "this runs your sale exactly as you run it today" — every item below would falsify that claim in front of the one audience that knows better.

### P0 — falsifies Act-1 parity or breaches sealed-bid confidentiality

| # | Finding | Where | Spec rule |
|---|---|---|---|
| 1 | **Reserve % rendered on bidder-facing pool cards** ("RESERVE 55%") and below-reserve warnings shown to bidders in both bid modules | `residential/components.js:57`, `bidding-pool.js`, `bidding-deal.js` | Reserves/BEM are admin-only, never surfaced to bidders in UI, API, exports, or errors (SB-04, BE-01) |
| 2 | **Commercial bids are typed dollar amounts** (`bidAmountUSD` input) | `bidding-deal.js`, `commercial/components.js`, `commercial/portal.html` | ALL programs bid a **BID %**; commercial = % of asset UPB; BID $ is derived, read-only (BS-05) |
| 3 | **Residential bids are one % against the pool aggregate** | `bidding-pool.js`, `residential/portal.html:117` | Bid entry is **per loan** — a BID % on every loan in the pool; whole-pool participation enforced loan-by-loan (BS-04, BS-09) |
| 4 | **Cap rate / price-per-unit / yield displayed on the commercial bid surface** | `commercial/components.js:284-320,472` | The live bid form shows only UPB, BID %, derived BID $ — analysis metrics stay off the bid sheet (BS-07, BM-03) |
| 5 | **$100,000 used as minimum bid** on commercial deals | `bidding-deal.js:61` | $100,000 is the **deposit floor**; the bid minimum is a $100 **derived** amount per loan/asset (BS-05, DP-01) |
| 6 | **Bidder-imposed conditional bids** supported (`conditions`, `dependsOnPool/dependsOnAward`) | both bidding modules, BEM combinatorial logic | Sealed fixed prices only — never ranges, priorities, or solver instructions (PR-06, BS-08) |

### P1 — wrong artifacts/semantics, fix before demo

| # | Finding | Where | Spec rule |
|---|---|---|---|
| 7 | Confirmation code `HUD-YYYY-XXXXX`, client-supplied and trusted by the server | both bidding modules; `bids/submit.mjs:57` | Platform receipt + per-program **completion CODE** (e.g., HLS26HC), emitted only when the form validates complete; server-derived (BS-15/16, AU-01) |
| 8 | Flat 10% deposit on slip totals | both `slipTotal()` | Greater of $100K or 10% of aggregate bid prices, rounded up; 50%-of-bid floor under $100K; per-sale [CONFIG] (DP-01) |
| 9 | Blank / zero / minimum semantics absent | both validate() | Blank = NO BID (allowed); literal 0 = error; derived BID $ < $100 = error; 5-decimal precision; HNVLS ≤ 175% of ETD-BPO (BS-04, Appendix B) |
| 10 | **"HUD-90092" qualification form is an invented number** baked into the commercial wizard | `forms-90092.js`, `commercial/qualify.html` | Commercial QS has **no public form number**; rename + restructure (QL-01) |
| 11 | Qualification stack missing **CA/NDA execution, BTAF, and BAUF** steps in both wizards | both `qualify.html` | Full stack: CA/NDA + QS (9611 residential / commercial QS) + BTAF + BAUF designating the single authorized submitter (QL-01) |
| 12 | Server accepts client-computed `impliedDollarAmount`; conformance check is a hardcoded 20–110% | `bids/submit.mjs:40-56` | Server derives BID $ from % × HUD basis; validates range/precision/minimums per program config (BM-04) |
| 13 | Bid-time operator-continuity-plan field on HLS bids | `bidding-deal.js:76-80` | Operator continuity lives in qualification documents, off the bid sheet (A.2 note) |

### P2 — state-machine and audit gaps
- No immutable bid-set snapshot at hard close; no explicit supersede chain for in-window revisions (SM-03/05, BS-12)
- No Best-and-Final admin-initiated reopen (SM-07)
- Hard close is UI-level countdown; server enforces by sale state but nothing flips the state at T-0 automatically (needs EventBridge schedule or equivalent)
- `window.HSG = window.HSG || HSG;` bug in `bidding-pool.js:23` (throws if HSG undefined — should be `|| {}`)

## 4. Completion scorecard vs the approved plan

| Phase | Plan scope | Status |
|---|---|---|
| 1 Foundation | Skeletons, design system, shared modules, template, cert | **~98%** — cert now ISSUED; deployed |
| 2 Auth & identity | Logins, MFA, groups, portal scoping, backfill | **~85%** — groups live, scoping broadly enforced, bidders carry portal; E2E isolation test not yet run |
| 3 Residential portal | Landing, qualify, workspace, components | **~85% built** — functional, but bid mechanics on the P0 list |
| 4 Commercial portal | Same | **~85% built** — same caveat, larger rework (deal-$ → %-of-UPB) |
| 5 Admin console | 8 pages + BEM/settlement/QA handlers | **~85% built** — all pages exist with live handlers; depth unverified page-by-page |
| 6 Production hardening | Real screening, WAF, alarms, SES, DNS cutover | **~10%** — stubs and cert only |

**Aggregate: ~80% of the planned v1 build exists and is deployed.** The remaining 20% is hardening — but the spec-conformance rework (section 3) is new scope the plan never contained, and it now gates everything customer-facing.

## 5. Recommended build sequence

**Phase A — Protect & correct (the gate to any HUD demo)**
1. `git add -A && git commit` the entire current state, push to `jhouse84/hud-oas-platform` — before any other edit
2. Strip reserves from every bidder surface (UI cards, validate warnings, API responses)
3. Rework bid mechanics to the spec: per-loan BID % (residential) / %-of-UPB per asset (commercial); derived read-only BID $; blank/0/$100/precision/175% semantics; remove conditional bids; move analysis metrics off the bid surface
4. Server-side: derive all amounts, server-issue completion CODEs per program, deposit formula, per-program range validation; reject client-derived fields
5. Qualification: rename 90092 → Commercial QS; add CA/NDA + BTAF + BAUF steps to both wizards
6. Re-seed demo data to loan-level bid shapes (the 72-loan table already exists — verify per-loan BPO/ETD/UPB fields)

**Phase B — Demo readiness (spec §3.1 two-act script)**
7. Pre-window lock state + authoritative server countdown; hard-close snapshot; revision supersede chain
8. Run the spec §3.2 acceptance checklist end-to-end on HVLS-2026-DEMO and HLS-2026-DEMO
9. Root landing page (fixes the 403) routing to both portals + admin

**Phase C — Production**
10. Custom-domain redeploy (cert ready), root-object behavior, invalidation
11. Real OFAC + SAM.gov calls; SES template set; notification writes; WAF + CloudWatch alarms
12. E2E portal-isolation test; Best-and-Final flow; close automation (EventBridge → state flip)

**Estimate:** Phase A is 2–3 focused sessions (the bidding modules are small and well-factored — `bidding-pool.js` 5.6KB, `bidding-deal.js` 7.8KB; the UIs consume them cleanly). Phase B 1–2 sessions. Phase C runs parallel to demo scheduling.

## 6. Reference

- Platform root: `C:\Users\jelan\OneDrive\Documents\House Strategies\Product Development\Website Development\platform\`
- Build spec (acceptance standard): `...\Capture Pursuits\HUD\OAS Transaction Specialist\Teaming Documents\Rocktop Platform Config\HSG-Rocktop-OAS-Platform-Configuration-Spec-v3.docx` / `.pdf`
- Live Stage-1: `https://d1cinbd36524ob.cloudfront.net/residential/` · `/commercial/` · `/admin/`
- AWS: account `057079472274`, profile `hsg-hudoas`, stack `hsg-hudoas-dev`, us-east-1
- Plan of record: `C:\Users\jelan\.claude\plans\synthetic-sniffing-globe.md` (phases) + this evaluation (current truth)

# John Lucey demo package

## ⚠ STATUS: INTERNAL TEST PHASE — do not send yet

Jelani + Trish test first. When both sign off, the email below goes out.

**Test script (work through it, mark pass/fail, copy results back):**
https://hudloansales.housestrategiesgroup.com/demo/test-script.html
(28 cases, ~25 minutes. Marks save in your browser; "Copy results" puts a paste-ready summary on your clipboard.)

**The demo itself:** https://hudloansales.housestrategiesgroup.com/demo/index.html

---

## The email to Lucey (v2 — dual-track framing; copy/paste into Outlook)

**To:** John Lucey
**Subject:** A working demo — 15 minutes, no sign-in

John,

I wanted to put something in front of you rather than describe it.

We've built a working transaction platform for the OAS loan sale programs — qualification, data room, sealed bidding, evaluation, and settlement, front to back, with the same rules and bid math as the published BIPs. All five programs are loaded with sample sales.

Here's a guided demo you can walk yourself in about 15 minutes:

**https://hudloansales.housestrategiesgroup.com/demo/index.html**

No sign-in needed. It opens as a qualified demo bidder on sample data — price a HECM pool loan by loan, submit a sealed bid, get the receipt and completion code, then flip over to the Transaction Specialist side and run the evaluation. Nothing you click touches a live system.

Two tracks are moving on our side, and I want you to see both. One, we're building the platform ourselves — what you're looking at is our own development, running on our own infrastructure, with the security real underneath it: emailed sign-in codes, per-bidder watermarked downloads, full audit trail. Two, we're connecting with a full-service operational partner for the transaction-specialist backbone — file and collateral management, document scanning and imaging, data-room operations — so this plugs into proven sale operations rather than standing alone.

I'd value your reaction, even a blunt one. If it's easier, I'm happy to walk you through it on a call — or set you up with a live account.

Best,
Jelani

---

## The test-first workflow

1. **Jelani + Trish:** walk `demo/test-script.html` end to end (separate browsers fine — marks are per-browser). Use "Copy results" and send the summary back.
2. **Fixes land**, demo re-verified.
3. **Jelani sends the email above** (paste from here; the dual-track paragraph is the positioning — platform development AND TS operational partner in parallel).
4. When Lucey bites on the live-account offer: provision with his email via `backend/scripts/provision-test-bidder.mjs` (sign-in codes go to his inbox; requires SES production access — pending AWS review — or verifying his address in sandbox).

## What the demo shows (coverage map)

| Key functionality | Where in the demo | Test cases |
|---|---|---|
| Qualification stack (CA-first, BTAF/BAUF, screening) | Wizard, step 1 of tour | B1–B3 |
| Locked bid sheet, single % input, derived $ | HVLS sheet | C1, C2 |
| Whole-pool participation · 0/blank/min rules | HVLS sheet | C3, C4 |
| Receipt + completion CODE · deposit formula (floor + 10% branches) | HVLS + HLS submits | C5, D3 |
| In-window revision/supersede · withdraw | My Bids | C6, C7 |
| Watermarked VDR + access logging · fair-disclosure Q&A | Data Room tab | D1, D2, E6 |
| Commercial %-of-UPB, clean bid surface | HLS sheet | D3, D4 |
| TS console: pipeline, bid day, BEM (confidential reserves), settlements, QC | Act II | E1–E7 |
| Sealed-bid confidentiality (no cross-bidder visibility) | Throughout | F3 |
| Premium look & demo integrity | Throughout | F1, F2, F4 |

## How it works (for us)

- `demo/data.js` — snapshot of the live dev tables (5 sales / 72 loans / QC / pipeline bidders); regenerate with `AWS_PROFILE=hsg-hudoas node backend/scripts/export-demo-data.mjs` (scrubs legacy "HUD-90092" → "Commercial QS").
- `shared/api-demo.js` — in-browser twin of the API, activated only by `?demo=1` (session-sticky, DEMO banner + exit). Replicates server bid rules exactly; verified against the live API's numbers ($619,588 / $100K floor HVLS · $40,024,350 / $4,002,435 HLS).
- Wired into all 13 API-driven pages; inert without the flag — production behavior untouched.
- Flows verified in-browser 2026-06-12: qualify gates, fill-down → COMPLETE → receipt+CODE, supersede, withdraw, watermarked download, Q&A ask, commercial submit, dashboard/pipeline/bid-day (Act-I bid in feed)/BEM/settlements/QA-inbox/compliance.

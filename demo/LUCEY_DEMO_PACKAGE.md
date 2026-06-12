# John Lucey demo package — ready to send

## The email (copy/paste into Outlook)

**To:** John Lucey
**Subject:** A working demo — 15 minutes, no sign-in

John,

I wanted to put something in front of you rather than describe it.

We've built a working transaction platform for the OAS loan sale programs — qualification, data room, sealed bidding, evaluation, and settlement, front to back, with the same rules and bid math as the published BIPs. All five programs are loaded with sample sales.

Here's a guided demo you can walk yourself in about 15 minutes:

**https://hudloansales.housestrategiesgroup.com/demo/index.html**

No sign-in needed. It opens as a qualified demo bidder on sample data — price a HECM pool loan by loan, submit a sealed bid, get the receipt and completion code, then flip over to the Transaction Specialist side and run the evaluation. Nothing you click touches a live system.

It's a demonstration, not a deployment — but everything in it is the real platform on real infrastructure, and the security underneath is real too: emailed sign-in codes, per-bidder watermarked downloads, full audit trail.

I'd value your reaction, even a blunt one. If it's easier, I'm happy to walk you through it on a call — or set you up with a live account.

Best,
Jelani

---

## What he'll experience (the guided path)

1. **Demo Center** (`/demo/index.html`) — a 10-step tour in two acts plus the security card.
2. **Act I — bidder:** qualification wizard (CA → BTAF/BAUF gates) → HVLS per-loan bid sheet (fill-down 55.12345 → COMPLETE → deposit floor) → submit → receipt + CODE `HVLS26D742` → revise/supersede → withdraw → watermarked VDR download → Q&A → HLS %-of-UPB asset bid.
3. **Act II — Transaction Specialist:** dashboard KPIs → bidder pipeline (approve one) → bid day (his own Act-I bid appears in the feed) → BEM (set reserves, run, award → settlement record) → settlements → compliance/QC.
4. Every screen carries a **DEMONSTRATION MODE** banner with a one-click exit; his actions persist for the visit and reset when the tab closes.

## How it works (for us)

- `demo/data.js` — exported snapshot of the live dev tables (5 sales / 72 loans / QC / pipeline bidders), regenerate with `AWS_PROFILE=hsg-hudoas node backend/scripts/export-demo-data.mjs` (scrubs legacy "HUD-90092" → "Commercial QS" in values).
- `shared/api-demo.js` — in-browser twin of the API, activated only by `?demo=1` (then sticky for the session). Replicates the server bid rules exactly: per-loan %, whole-pool, $100 minimums, HNVLS 175 cap, deposit formula, receipt + completion CODE, supersede, withdraw. Verified in-browser against the live API's numbers ($619,587.57 HVLS pool / $40,024,350 HLS asset).
- Wired into all 13 API-driven pages; inert without the flag — production behavior is untouched.
- The closing card offers the live-account path: provision via `backend/scripts/provision-test-bidder.mjs` with his email once he bites (sign-in codes go to his inbox; SES production access pending AWS review).

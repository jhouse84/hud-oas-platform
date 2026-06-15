# HUD OAS Transaction Platform &amp; Data Room — Platform Test Plan

**Owner:** Jelani House, House Strategies Group
**Prepared:** 2026-06-15
**Testers:** Jelani House, Maurice House, Gilda Weech-House, Tricia "Trish" Kelly (and members of Trish's team)
**Interactive console:** `https://hudloansales.housestrategiesgroup.com/demo/platform-test.html`
**This file:** `platform\PLATFORM_TEST_PLAN.md`

---

## 1. Purpose

Validate every part of the HUD OAS Transaction Specialist platform and its Data Room before it is shown to a real customer or used to support the TS bid. We want a credible group to exercise the full system, find anything that is wrong, confusing, slow, or off-brand, and record it in one place so it can be fixed and signed off.

The platform is built and deployed. A permanent staff person will run it day to day once the TS work is won. This round proves the system is sound and ready, and gives that future hire a tested baseline.

## 2. What we are testing

**In scope (everything user-facing, both seller variants):**

- The two bidder portals: Residential (HVLS, HNVLS, SFLS) and Commercial (Multifamily MHLS, Healthcare HLS).
- The Admin console, all nine pages: Dashboard, Sale Setup, Bidders, Data Room, Bid Day Ops, BEM &amp; Awards, Q&amp;A Inbox, Settlements, Compliance &amp; QC.
- The Data Room (VDR): staff document intake and the bidder-facing room.
- Bidding in all three input modes: on-screen grid, downloadable Excel bid workbook, and paste.
- Qualification (CA/NDA, BTAF, BAUF, attestations), sealed-bid handling, watermarked downloads, completion codes, deposits.
- Bid evaluation: the formula-driven BEM Excel model, reserves, awards, settlements.
- Sign-in and email one-time-code login (MFA), notifications, Q&amp;A.
- Both seller variants: HUD OAS (`?demo=1`) and Ginnie Mae (`?demo=gnma`).

**Out of scope this round:**

- Load and performance testing at scale.
- Penetration testing (a separate security audit already hardened the platform).
- Seeding synthetic sales into the live production database (declined; the demo sandbox covers all walkthroughs).

## 3. Test environment and access

Most testing runs on the **demonstration sandbox**, which needs **no login, no password, and no setup**. Everything is sample data, and nothing touches live systems. A small set of real, logged-in checks is led by Jelani only and is marked **[REAL]** below.

| Environment | URL | Who | Login needed |
| --- | --- | --- | --- |
| HUD demo sandbox | `…/demo/index.html` (Demo Center) | Everyone | No |
| Ginnie Mae demo sandbox | `…/demo/gnma/index.html` | Everyone | No |
| Test console (this plan, live) | `…/demo/platform-test.html` | Everyone | No |
| Real logged-in platform | `https://hudloansales.housestrategiesgroup.com` | Jelani only | Yes (email code) |

Base URL for all paths: `https://hudloansales.housestrategiesgroup.com`

**Browsers and devices.** Test on at least one desktop browser (Chrome or Edge) and one phone. Trish's team should spread across whatever browsers and devices they actually use, so we catch layout problems on real setups.

**A note on the sandbox.** Each browser is its own private sandbox. Two people on two computers do not share data, so "competing bidders" in the sandbox is simulated through a pre-seeded four-bidder field in the Ginnie Mae evaluation, not through live cross-tester bids. True multi-entity bidding is a **[REAL]** check in Wave 4.

## 4. Testers and roles

Each person owns a persona that fits their background. The interactive console shows each person only their own checklist, so no one wades through cases that are not theirs.

| Persona | Tester | What they own | Why this fit |
| --- | --- | --- | --- |
| **Administrator / Orchestrator** | Jelani | The whole admin console: set up a sale from a loan tape, approve bidders, run bid day, build the BEM, award, settle. Plus the real logged-in smoke. | Platform owner and the person who runs a live sale. |
| **Data Room Operations Lead** | Trish | Staff document intake and the bidder-facing Data Room: load files, auto-classification, review, publish, visibility, watermarking, search. | Her business is file management, scanning, and VDR operations. This is the operational heart of the TS work. |
| **Bidder (experience)** | Maurice | The bidder journey end to end: qualify, browse, read the Data Room, download documents, place a bid, manage bids. Judges credibility and clarity. | A credible, non-technical user who will tell us plainly if anything looks or reads wrong. |
| **Data Integrity &amp; Evaluation** | Gilda | Accuracy: loan-tape data, the bid math, the deposit formula, completion codes, the BEM formulas and awards, and whether documents are filed under the right asset and category. | Her classification-analyst eye is exactly right for data and filing accuracy. |
| **Competing Bidders** | Trish's team | Several people each act as a different bidding entity, exercise all three bid input modes, and confirm no bidder can see another bidder. | Stress the bidder side with real, varied users and confirm sealed-bid isolation. |

## 5. Coverage matrix

Each cell shows the persona(s) responsible. "Both" means run it on HUD and on Ginnie Mae.

| Area | Jelani | Trish | Maurice | Gilda | Trish's team | Variant |
| --- | :-: | :-: | :-: | :-: | :-: | --- |
| Sign-in / email code (MFA) | ● [REAL] | | ● | | | HUD |
| Sale Setup &amp; tape ingestion | ● | | | ● (data check) | | HUD |
| Dashboard / pipeline | ● | | | | | Both |
| Bidder qualification | | | ● | | ● | HUD |
| Bidder portal / sale browse | | | ● | ● | ● | Both |
| Data Room — staff intake | | ● | | | | Both |
| Data Room — bidder view / search / watermark | | ● | ● | ● (filing) | | Both |
| Bidding — grid | | | ● | ● | ● | Both |
| Bidding — Excel workbook | | | ● | ● | ● | HUD |
| Bidding — paste | | | | | ● | HUD |
| Bid math / basis / deposit | | | | ● | | Both |
| Sealed-bid isolation | | | ● | ● | ● | Both |
| Bid Day Ops | ● | | | | | HUD |
| BEM &amp; awards / Excel model | ● | | | ● | | Both |
| Settlements | ● | | | | | HUD |
| Q&amp;A loop | ● (answer) | | ● (ask) | | | HUD |
| Compliance &amp; QC | ● | | | | | HUD |
| Look, feel, trust | ● | ● | ● | ● | ● | Both |
| Real upload to S3 | | ● [REAL] | | | | HUD |
| True multi-entity bidding | | | | | ● [REAL] | HUD |

## 6. Test waves

Run the waves in order. Within a wave, people work in parallel where noted.

**Wave 0 — Orientation (about 15 minutes, everyone).**
Open the Demo Center, then open the test console, pick your name, and read your brief. Confirm you can reach your first screen and that the DEMONSTRATION banner is pinned at the bottom of every demo page.

**Wave 1 — Persona walkthroughs (about 45 to 60 minutes, parallel).**
Each person runs their own checklist independently in the console. This is the bulk of the testing and the four personas can run at the same time. Mark Pass or Fail and add a note on anything off.

**Wave 2 — Coordinated lifecycle (about 60 minutes, together).**
One linear pass through a full sale with everyone in their role:
1. Jelani sets up a sale from a tape (Sale Setup).
2. Trish stocks its Data Room (staff intake, classify, publish).
3. Maurice and Trish's team qualify and place bids.
4. Jelani runs Bid Day, builds the BEM, sets reserves, awards.
5. Jelani opens the resulting settlement; Gilda verifies every number tied out along the way.

**Wave 3 — Edges, accuracy, devices (parallel).**
Gilda runs the deep data-integrity pass. Trish's team runs cross-device and cross-browser and probes sealed-bid isolation. Everyone retries anything that felt slow or odd.

**Wave 4 — Real logged-in smoke (Jelani-led, optional).**
A short set of **[REAL]** checks against the live platform: email-code sign-in, create a real draft sale and delete it, upload a real document to S3, and (if time) two of Trish's team as different real entities bidding the same pool so the admin BEM shows a true competitive field.

## 7. How to run it and how to report problems

**Run it from the console.** Open `…/demo/platform-test.html`, pick your name, and work top to bottom. Open each linked screen in a new tab, do the action, compare against EXPECT, then mark Pass or Fail. Your marks save in your browser. When done, use **Send my results to Jelani** (or **Copy results** and paste into an email).

**Report a problem with a severity:**

- **S1 Blocker** — cannot proceed; a core action fails (cannot submit a bid, page will not load, wrong total on a receipt).
- **S2 Major** — a feature is wrong or misleading but there is a workaround (a number is off, a document files under the wrong asset, a control does nothing).
- **S3 Minor** — small functional or wording issue (confusing label, awkward step).
- **S4 Cosmetic** — visual only (spacing, alignment, a typo).

Put the severity at the front of your note, for example: `S2 — derived $ on loan 3 did not match my hand calc`. Exact wording, exact numbers, and the screen you were on help the most.

## 8. Entry and exit criteria

**Entry (ready to start):** the console loads, the Demo Center and both demo variants open, and each persona can reach their first screen.

**Exit (ready to sign off):**
- Every S1 and S2 is fixed and re-checked.
- Each persona's checklist is at least 95 percent Pass.
- Both seller variants (HUD and Ginnie Mae) were covered.
- The Wave 4 real-mode smoke passed for Jelani.
- Jelani signs off below.

| Sign-off | Name | Date |
| --- | --- | --- |
| Administrator persona | Jelani House | |
| Data Room persona | Trish Kelly | |
| Bidder persona | Maurice House | |
| Data integrity persona | Gilda Weech-House | |

---

## Appendix A — Case catalog

The interactive console holds the live, checkable version of every case below. IDs match between this catalog and the console.

### Jelani — Administrator (JA)

| ID | Do | Expect |
| --- | --- | --- |
| JA1 [REAL] | Sign in to the live admin console. | A one-time code arrives by email; no authenticator-app prompt; sign-in completes. |
| JA2 | Sale Setup: choose program HVLS. | Official basis defaults to ULB; portal shows residential; a sale ID is suggested. |
| JA3 | Sale Setup: click "Use sample data". | 120 sample loans load; columns auto-map to the loan fields; a live preview shows the first rows. |
| JA4 | Sale Setup: choose Equal split, 3 pools. | Three pools of about 40 loans each; aggregates per pool look right; "By tape column" works when a Pool column is mapped. |
| JA5 | Sale Setup: review and Create. | Review shows UPB and ULB aggregates with ULB above UPB; validation says no issues; Create confirms the sale. |
| JA6 | Open the bidder portal for that new sale. | The new sale is a draft and does not appear to bidders; it does appear in the admin dashboard. |
| JA7 | Open the Dashboard. | KPIs for both portals populate (sales, loan counts, pipeline, deadlines); it reads like a command center. |
| JA8 | Open Bidders and approve the pending bidder. | Status moves to Qualified immediately; counts update; reject and request-info paths behave. |
| JA9 | Open Bid Day and select the HVLS demo sale. | The bid feed shows submitted bids under their entity, marked Conforming. |
| JA10 | Open BEM &amp; Awards, set a reserve, run the evaluation. | Reserves are set here only (never bidder-facing); results rank against the bids. |
| JA11 | Click Generate BEM (Excel). | A workbook downloads with ten sheets; figures are live Excel formulas; it is co-branded HSG and the seller; no agency seals. |
| JA12 | Open Settlements. | The seeded settlement shows milestones and deliverables; items are checkable. |
| JA13 | Open Q&amp;A Inbox and answer a question. | The answer publishes and shows on the bidder side. |
| JA14 | Open Compliance &amp; QC, then the Ginnie Mae demo (`?demo=gnma`) register. | QC findings render per sale; the Ginnie Mae recommendations register and its lifecycle render. |
| JA15 [REAL] | Live: create a real draft sale via Sale Setup, then delete it. | The sale is created and listed, then removed cleanly; nothing leaks to bidders. |

### Trish — Data Room Operations (TD)

| ID | Do | Expect |
| --- | --- | --- |
| TD1 | Open Admin → Data Room (`?demo=1`) and select a sale. | The organized room renders with KPIs (total files, coverage, staff added, needs review, bidder-visible). |
| TD2 | Drop files named like `AZ_024-5777326_Note.pdf`, `FL_…_BPO.pdf`, a BIP, and a random name. | Note files file to Collateral, BPO to Due Diligence, BIP to the sale folder, the random one to a review queue. |
| TD3 | In the review queue, assign a file to an asset and change its group or visibility. | The file moves under the chosen asset and category. |
| TD4 | Publish the reviewed files. | Files appear organized: sale folders on top, per-asset Due Diligence and Collateral below; coverage counts update. |
| TD5 | Toggle one published file to Admin only. | It disappears from the bidder-facing Data Room while staying visible to staff. |
| TD6 | Open the bidder Data Room for the same sale. | Sale documents on top; every asset has its own Due Diligence and Collateral file sets; filenames follow the state and case convention. |
| TD7 | Search a state code, then a case number; use the state filter. | Search filters assets live and auto-expands matches; the state filter narrows the list. |
| TD8 | Download one document. | It opens watermarked to the demo entity with a class label and timestamp. |
| TD9 | Open a Healthcare (HLS) sale's Data Room. | Healthcare-specific files appear: Operator Financials, CMS Survey, Phase I Environmental, Regulatory Agreement, Operator Lease, AR Security Agreement; Asset Summaries at sale level. |
| TD10 | Open the Ginnie Mae Data Room (`?demo=gnma`). | The HECM data room renders with its own document set. |
| TD11 | Try six awkward filenames of your own. | Note any that file under the wrong asset or category, with the exact filename. |
| TD12 [REAL] | Live (Jelani-provisioned): upload a real document to a draft sale. | It uploads and then appears in that sale's Data Room. |

### Maurice — Bidder experience (MB)

| ID | Do | Expect |
| --- | --- | --- |
| MB1 | Open the Demo Center cold, as a stranger would. | Within about ten seconds you understand what this is, that it takes around fifteen minutes, and that nothing is live. |
| MB2 | In qualification, try to advance step 1 without signing the Confidentiality Agreement. | It refuses with clear errors; the CA/NDA gates everything behind it. |
| MB3 | Walk the qualification steps and certify. | Eight steps in order, each validating before advancing; error messages are specific; there is no "HUD-90092" anywhere. |
| MB4 | Browse the residential portal and open a sale. | The sales list and the sale detail read clearly; nothing looks unfinished. |
| MB5 | Open the Data Room and download one document. | The structure is clear; the document opens watermarked to your entity. |
| MB6 | Look at the bid sheet. | Every HUD figure is locked; the only editable cell per row is BID %; there is no reserve, optimizer, or suggested price. |
| MB7 | Enter a percentage in "apply to all" and apply it to a pool. | Every loan fills, each derived BID $ computes, the pool flips to Complete, and a total and deposit show. |
| MB8 | Download the Excel bid workbook. | A real, seller-branded, locked workbook downloads; only the BID % column is editable. |
| MB9 | Submit a bid (type SUBMIT to confirm). | A receipt appears with a receipt ID, a completion code, the total, and the deposit. |
| MB10 | Open My Bids; change a percentage and resubmit; then withdraw. | The latest form is Live and the earlier one is Superseded; withdrawing flips status and lets you submit again. |
| MB11 | Ask a question in Q&amp;A; check Notifications. | The question posts as your entity; a notification shows your bid was received. |
| MB12 | Try to find any other bidder anywhere. | Impossible; no other bidder, bid, count, or reserve is visible. |
| MB13 | Step back and judge the whole thing. | It looks premium and institutional and would not embarrass us next to a federal incumbent platform. |

### Gilda — Data integrity &amp; evaluation (GD)

| ID | Do | Expect |
| --- | --- | --- |
| GD1 | Open a sale's loans and scan the figures. | For each loan, UPB is below ULB which is at or below BPO; no fields are blank or garbled. |
| GD2 | Enter 50 percent on an HVLS pool and check one loan by hand. | Derived BID $ equals 50 percent of that loan's ULB; the pool aggregate is the sum of the loans. |
| GD3 | Read the bid sheet basis label. | HVLS bids are a percentage of ULB (not BPO); the label says "of ULB". |
| GD4 | In the workbook, switch the pricing basis from BPO to ULB. | The submitted dollar amount is preserved; the percentage is normalized to the official basis. |
| GD5 | Check the deposit on a small pool and on a large one. | Small pool deposit is the 100,000 floor; large pool deposit is 10 percent where that beats the floor. |
| GD6 | Note the completion code on two sales. | Each sale has its own consistent code (for example HVLS26D742, HLS26DHC84). |
| GD7 | Open the generated BEM Excel and change a reserve cell. | Rank, winner, cover, and award recompute from the formulas; nothing is hard-typed. |
| GD8 | Read the BEM recovery and tabulation sheets. | Recovery shows against UPB, ULB, and BPO; the figures tie to the bid tabulation. |
| GD9 | Reproduce two known figures. | HVLS at 55.12345 percent totals 619,588; HLS at 72.5 percent gives a 4,002,435 deposit on a 40,024,350 base. |
| GD10 | Check portal separation. | The residential portal never shows MHLS or HLS; the commercial portal never shows HVLS, HNVLS, or SFLS. |
| GD11 | Open the Ginnie Mae sale's loans and pools. | ULB is modeled from borrower age; Pool 1 is Non-Judicial (about 220 loans) and Pool 2 is Judicial (about 120). |
| GD12 | Run the Ginnie Mae BEM with its seeded bids. | Pool 1 awards to the high conforming bidder over a thin cover; Pool 2's high bid is below reserve, so No-Sale. |
| GD13 | Look for any reserve anywhere on the bidder side. | None; reserves live only in the admin BEM. |
| GD14 | Spot-check five Data Room files against their assets. | Each is filed under the correct asset and the correct Due Diligence or Collateral category. |

### Trish's team — Competing bidders (TT)

| ID | Do | Expect |
| --- | --- | --- |
| TT1 | Each teammate qualifies as a bidder in their own browser. | Qualification completes for each person independently. |
| TT2 | Place a bid through the on-screen grid (apply to all). | The pool fills and submits; a receipt with a completion code returns. |
| TT3 | Place a bid through the Excel workbook (download, fill BID %, upload). | The upload re-derives every dollar on the server and returns the same kind of receipt. |
| TT4 | Place a bid by pasting a column of percentages. | The paste maps to the loans in order and submits. |
| TT5 | Look for other bidders while bidding. | You see only your own bids and counts; no reserves; no other entities. |
| TT6 | Change a percentage and resubmit. | The new form is Live; the prior one is Superseded. |
| TT7 | (Some teammates) Bid on a Commercial sale. | The commercial sheet uses percentage of UPB; there is no cap rate, NOI, price per unit, or yield. |
| TT8 | Open the bidder portal on a phone and on a second browser. | Layout holds up; note anything cramped, cut off, or hard to tap. |
| TT9 [REAL] | Two teammates as different real entities bid the same pool. | The admin Bid Day and BEM show a true competitive field across the two entities. |

## Appendix B — Quick links

- Demo Center (HUD): `…/demo/index.html`
- Demo Center (Ginnie Mae): `…/demo/gnma/index.html`
- Residential portal: `…/residential/portal.html?demo=1`
- Commercial portal: `…/commercial/portal.html?demo=1`
- Admin Dashboard: `…/admin/index.html?demo=1`
- Sale Setup: `…/admin/sale-setup.html?demo=1`
- Staff Data Room: `…/admin/dataroom.html?demo=1`
- BEM &amp; Awards: `…/admin/bem.html?demo=1`
- Interactive test console: `…/demo/platform-test.html`

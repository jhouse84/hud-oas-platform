# Admin self-service sale setup &amp; document import — architecture

**Goal:** a staff person stands up an entire loan sale through the admin UI alone:
sale details, the loan tape, pool definitions, and the full document set (hundreds
of files), gated and organized. Repeatable for every sale. No Claude, no scripts,
nothing injected into the backend.

## Principle

The browser does the orchestration; the backend only issues short-lived signed
URLs and stores records. Importing 500 documents is the browser presigning and
PUT-ing each file straight to encrypted storage, classifying as it goes. The
backend never needs a human or an AI to run a one-off job.

## One connected workspace: "Set up a sale"

Five stages, each resumable, all in the admin console:

1. **Sale details** — program, seller, basis, dates, status. *(built — Sale Setup)*
2. **Loan tape** — drop the seller's .xlsx, auto-map columns to loan fields. *(built)*
3. **Pool definition** — build the pools (below). *(enhancing)*
4. **Documents** — bulk/folder import into the data room (below). *(building)*
5. **Review &amp; publish** — confirm loans, pools, documents; set the sale live.

## 1. Pool definition system

A real pool builder, not three canned strategies:

- A **loan grid**: every loan with its state, balances, status; filter and sort.
- **Multi-select** loans (checkbox, shift-range, select-all-filtered).
- **Assign to a pool** by any of: the tape's pool column, geography (state/region),
  balance band, a saved rule, or hand selection.
- **Pool cards** update live: loan count, aggregate UPB/ULB/BPO, state spread.
- **Rename, reorder, merge, split, clear** pools.
- Saves pools (with loan_ids + summaries) to the sale through `sales.update`.

## 2. Bulk document import

The file-hosting engine, built into the staff Data Room:

- **Pick a whole folder** (`webkitdirectory`) or drop hundreds of files at once.
- **Auto-classify** each file into a canonical taxonomy from its name + path:
  - per-asset (matched by the FHA case number in the name): Valuation, Collateral &amp;
    Case Files, Due Diligence, Property Reports;
  - sale-level: Bidder Information Package, Loan Tape, Asset Summaries, Sale
    Procedures, Forms &amp; Agreements;
  - internal (admin-only): BEM &amp; Pricing, Bid Day Ops, Results &amp; Post-Sale, TS
    Internal, Borrower &amp; Award Letters;
  - anything unknown defaults to admin-only and lands in a review queue (never
    silently bidder-visible).
- **Bidder vs admin visibility** per category, toggleable per file.
- **Mass upload** to gated, KMS-encrypted storage via folder-aware presigned PUTs
  (`originals/{saleId}/{category}/...` for bidder, `originals/{saleId}/_admin/...`
  for internal), with a live progress bar and a count of done / failed / skipped.
- **Review queue** for anything unsorted; assign and publish.
- The result is an organized, browsable data room, gated to qualified bidders,
  watermarked and access-logged on download.

## Backend (mostly already in place; small additions)

| Need | Status |
| --- | --- |
| Create / update a sale | built (`POST /sales`, `PUT /sales/{id}`) |
| Bulk-insert loans | built (`POST /sales/{id}/loans`) |
| Presigned upload | built (`POST /docs/presign-upload`) |
| Folder-aware key on presign (category subfolder) | small add |
| List + delete a sale's docs, per-file visibility | add (list exists; delete + visibility flag) |

All additive Lambda + route changes, deployed the safe out-of-band way (never the
full `sam deploy`, which would disturb the email-MFA pool).

## Build order

1. Folder-aware presign (backend) + port the canonical taxonomy into the shared
   classifier so the admin auto-sorts the same way every time.
2. Bulk/folder importer in the staff Data Room (pick folder → classify → mass
   upload → review → publish), with progress and visibility.
3. Pool definition system in Sale Setup (loan grid + assignment methods + live cards).
4. Dogfood it: load the real HUD sales through the UI, gated.

This file: `platform\ADMIN_IMPORT_ARCHITECTURE.md`

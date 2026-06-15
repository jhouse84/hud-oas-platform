TRISH — DATA ROOM OPERATIONS · YOUR TEST FILES
================================================================

These are sample documents to drag into the Admin > Data Room (the staff
intake screen) for the HVLS-2026-DEMO sale. The platform reads the FILE NAME
to decide where each one belongs, so the names here are built to the real
{STATE}_{FHA#}_{DOCTYPE} convention and use real case numbers from that sale.

HOW TO USE (cases TD1-TD5, TD11)
  1. Open Admin > Data Room and pick the HVLS sale.
  2. Drag this whole folder's PDFs onto the drop zone (or browse to them).
  3. Watch where each one is auto-filed, then compare to "WHAT TO EXPECT".

WHAT TO EXPECT
  Collateral (under the matching asset):
     *_Note.pdf, *_Mortgage.pdf, *_AssignmentOfMortgage.pdf
  Due Diligence (under the matching asset):
     *_BPO.pdf, *_Title_Search.pdf, *_Servicing_Comments.pdf, *_Occupancy_Inspection.pdf
  Sale folders (no asset, filed by name):
     ...Bidder-Information-Package.pdf  -> Bidder Information Package
     ...ALD-Loan-Tape.pdf               -> Loan Tape
     ...Procedures.pdf                  -> Procedures
     ...BAUF-BTAF-Deposit-Forms.pdf     -> Forms & Agreements
  Review queue (could not be matched, needs your decision):
     Scanned-Document-4471.pdf, misc-loan-notes.pdf
  Awkward but still matched (TD11):
     GA-215-8969045-Note.pdf  (all dashes) -> Collateral on that asset
     585-6141309_CA_BPO.pdf   (reordered)  -> Due Diligence on that asset

Mark Fail on anything that files in the wrong place, and note the exact file
name. For TD11, rename copies of these to your own awkward variants and see
what the classifier does.

The Healthcare data-room check (TD9) and the Ginnie Mae check (TD10) do NOT
need uploads — those documents are already in those rooms; you just open and
read them.

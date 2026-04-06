/**
 * HUD Office of Asset Sales — Sale Lifecycle Timelines
 * Milestones for each of the 4 active sales
 *
 * Statuses: "completed" | "active" | "upcoming" | "overdue"
 * Today: 2026-04-02
 *
 * Assigned to window.HSG_DATA.timelines
 */
window.HSG_DATA = window.HSG_DATA || {};

window.HSG_DATA.timelines = {

  /* ========================================================================
     HVLS 2026-2 — Active (Due Diligence), Bid Day April 22
     Most milestones completed, approaching bid day
     ======================================================================== */
  "HVLS-2026-2": [
    {
      date: "2026-02-18",
      label: "FRN Published",
      status: "completed",
      description: "Federal Register Notice published announcing HVLS 2026-2, establishing sale terms and opening the qualification period for prospective bidders."
    },
    {
      date: "2026-02-24",
      label: "Qualification Opens",
      status: "completed",
      description: "Bidder pre-qualification applications accepted. Prospective bidders submit entity documentation, financial capacity evidence, OFAC/SAM certifications, and designated servicer information."
    },
    {
      date: "2026-03-10",
      label: "Data Room Opens",
      status: "completed",
      description: "Qualified bidders granted VDR access after executing Confidentiality Agreement and Access Agreement (CAA). Loan-level documents available for due diligence."
    },
    {
      date: "2026-03-18",
      label: "BIP Released",
      status: "completed",
      description: "Complete Bidder Information Package distributed to qualified bidders including bidding instructions, loan sale agreement form, servicing transfer agreement, and pool summary statistics."
    },
    {
      date: "2026-04-01",
      label: "ALD Final Update",
      status: "completed",
      description: "Final Aggregate Loan Data tape published reflecting loan status as of the Asset Listing Date cutoff. Removed and added loans noted in the update log."
    },
    {
      date: "2026-04-08",
      label: "Qualification Deadline",
      status: "active",
      description: "Final deadline for new bidder qualification applications. Late applications not accepted. 14 bidders qualified across all pools."
    },
    {
      date: "2026-04-15",
      label: "Bid Questions Deadline",
      status: "upcoming",
      description: "Final date for bidders to submit written questions regarding the BIP, loan tape, or VDR documents. Responses distributed to all qualified bidders."
    },
    {
      date: "2026-04-22",
      label: "Bid Day",
      status: "upcoming",
      description: "Sealed bids due by 10:00 AM Eastern Time. Bid deposits must be received via wire transfer by 10:00 AM ET. Bids submitted as percentage of aggregate BPO per pool."
    },
    {
      date: "2026-05-06",
      label: "Award Date",
      status: "upcoming",
      description: "HUD notifies winning bidders. Award subject to Office of General Counsel review and Departmental approval. Non-winning bidders notified and deposits returned."
    },
    {
      date: "2026-06-03",
      label: "Settlement Date",
      status: "upcoming",
      description: "Loan sale closing and settlement. Wire transfer of purchase price, execution of loan sale agreement, and initiation of 60-day servicing transfer period."
    }
  ],

  /* ========================================================================
     HNVLS 2026-1 — Postponed
     Early milestones completed, then postponed pending regulatory guidance
     ======================================================================== */
  "HNVLS-2026-1": [
    {
      date: "2026-01-22",
      label: "FRN Published",
      status: "completed",
      description: "Federal Register Notice published announcing HNVLS 2026-1 for approximately 150 occupied HECM loans across three geographic pools."
    },
    {
      date: "2026-01-28",
      label: "Qualification Opens",
      status: "completed",
      description: "Bidder pre-qualification applications accepted. 9 prospective bidders submitted applications before postponement."
    },
    {
      date: "2026-02-24",
      label: "Data Room Opens",
      status: "completed",
      description: "VDR opened with loan-level documents. Data room remains accessible to qualified bidders during postponement period."
    },
    {
      date: "2026-03-05",
      label: "Sale Postponed",
      status: "overdue",
      description: "Sale postponed pending issuance of Mortgagee Letter 2026-08 clarifying post-sale borrower occupancy protections and HECM assignment requirements for occupied properties."
    },
    {
      date: null,
      label: "BIP Released",
      status: "upcoming",
      description: "Updated BIP reflecting any changes to sale terms based on Mortgagee Letter guidance. Will be released within 15 business days of ML publication."
    },
    {
      date: null,
      label: "Qualification Deadline",
      status: "upcoming",
      description: "Revised deadline for bidder qualification or re-qualification following updated sale terms. Previously qualified bidders may need to re-certify."
    },
    {
      date: null,
      label: "Bid Day",
      status: "upcoming",
      description: "Rescheduled bid date to be announced via supplemental FRN. Minimum 30 days notice from BIP release to bid day."
    },
    {
      date: null,
      label: "Award Date",
      status: "upcoming",
      description: "Award notification approximately 14 business days after bid day."
    },
    {
      date: null,
      label: "Settlement Date",
      status: "upcoming",
      description: "Settlement approximately 30 business days after award notification."
    }
  ],

  /* ========================================================================
     SFLS 2026-1 — Upcoming (Pre-Qualification)
     FRN published, qualification in progress, data room not yet open
     ======================================================================== */
  "SFLS-2026-1": [
    {
      date: "2026-03-11",
      label: "FRN Published",
      status: "completed",
      description: "Federal Register Notice published announcing SFLS 2026-1 for approximately 312 defaulted forward FHA single-family mortgage loans in three geographic pools."
    },
    {
      date: "2026-03-17",
      label: "Qualification Opens",
      status: "completed",
      description: "Bidder pre-qualification applications now being accepted. Prospective bidders must demonstrate servicing capacity or provide designated servicer arrangements."
    },
    {
      date: "2026-03-24",
      label: "Data Room Opens",
      status: "active",
      description: "VDR access granted to qualified bidders after CAA execution. Loan-level documents include payment histories, property valuations, and default timeline documentation."
    },
    {
      date: "2026-04-07",
      label: "BIP Released",
      status: "upcoming",
      description: "Complete BIP including bidding instructions, NSO mission provisions, loan sale agreement form, and aggregate loan data tape."
    },
    {
      date: "2026-04-22",
      label: "Qualification Deadline",
      status: "upcoming",
      description: "Final deadline for new bidder qualification applications. Bidders must have OFAC clearance, active SAM registration, and verified financial capacity."
    },
    {
      date: "2026-04-28",
      label: "ALD Final Update",
      status: "upcoming",
      description: "Final aggregate loan data tape reflecting loan status as of the Asset Listing Date. Loans resolved, paid off, or reinstated since initial ALD are removed."
    },
    {
      date: "2026-05-06",
      label: "Bid Day",
      status: "upcoming",
      description: "Sealed bids due by 10:00 AM Eastern Time. SFLS bids expressed as percentage of aggregate UPB per pool. Bid deposits required via wire transfer."
    },
    {
      date: "2026-05-20",
      label: "Award Date",
      status: "upcoming",
      description: "HUD notifies winning bidders following OGC review and Departmental approval. Bid deposits returned to non-winning bidders within 5 business days."
    },
    {
      date: "2026-06-17",
      label: "Settlement Date",
      status: "upcoming",
      description: "Closing and settlement with 60-day servicing transfer period. Purchaser assumes responsibility for loss mitigation and borrower outreach per NSO requirements."
    }
  ],

  /* ========================================================================
     MHLS 2026-1 — Upcoming
     Earliest stage: FRN just published, qualification just opened
     ======================================================================== */
  "MHLS-2026-1": [
    {
      date: "2026-03-25",
      label: "FRN Published",
      status: "completed",
      description: "Federal Register Notice published announcing MHLS 2026-1 for 8 FHA-insured multifamily and healthcare facility loans. Each deal bid individually with separate deal books."
    },
    {
      date: "2026-04-01",
      label: "Qualification Opens",
      status: "active",
      description: "Bidder qualification applications accepted. MHLS bidders must demonstrate multifamily asset management experience, financial capacity, and healthcare facility operating capability for healthcare deals."
    },
    {
      date: "2026-04-07",
      label: "Data Room Opens",
      status: "upcoming",
      description: "VDR access for qualified bidders. Organized by deal with Volume 1 (loan documents) and Volume 2 (property/financial documents) for each property."
    },
    {
      date: "2026-04-14",
      label: "BIP Released",
      status: "upcoming",
      description: "BIP including individual deal books, bidding instructions, and deal-specific information regarding regulatory agreements, HAP contracts, LIHTC obligations, and healthcare licensing."
    },
    {
      date: "2026-04-21",
      label: "Property Inspection Period Opens",
      status: "upcoming",
      description: "Qualified bidders may schedule property inspections through the Transaction Specialist. Inspections by appointment only, subject to tenant notification and healthcare facility access protocols."
    },
    {
      date: "2026-05-06",
      label: "Qualification Deadline",
      status: "upcoming",
      description: "Final deadline for bidder qualification. Healthcare facility bidders must provide evidence of operator qualifications and state licensing eligibility."
    },
    {
      date: "2026-05-13",
      label: "Bid Questions Deadline",
      status: "upcoming",
      description: "Final date for written questions on deal books, VDR documents, or regulatory obligations. Responses provided to all qualified bidders for the applicable deal."
    },
    {
      date: "2026-05-20",
      label: "Bid Day",
      status: "upcoming",
      description: "Sealed bids due by 10:00 AM Eastern Time. MHLS bids expressed as dollar amounts per deal. Bidders may bid on one or more deals independently."
    },
    {
      date: "2026-06-10",
      label: "Award Date",
      status: "upcoming",
      description: "Award notification by deal. Each deal awarded independently to the highest conforming bidder, subject to OGC review of regulatory agreement transfer requirements."
    },
    {
      date: "2026-07-15",
      label: "Settlement Date",
      status: "upcoming",
      description: "Deal closings may occur on different dates. Healthcare facility deals require state licensing agency approval of operator transfer prior to closing."
    }
  ]
};

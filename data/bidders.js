/**
 * HUD Office of Asset Sales - Qualified Bidder Registry
 * 8 sample bidder profiles across entity types and qualification statuses
 */
window.HSG_DATA = window.HSG_DATA || {};

window.HSG_DATA.bidders = [
  // ── Large Institutional (2) ────────────────────────────────────────────
  {
    bidderId: "BDR-001",
    entityName: "Lone Star Capital Partners LLC",
    entityType: "Institutional Investor",
    contactName: "Marcus Chen",
    contactEmail: "mchen@lonestarcap.com",
    qualificationStatus: "Qualified",
    ofacStatus: "Clear",
    samStatus: "Active - No Exclusions",
    priorSales: 12,
    programTypes: ["HVLS", "HNVLS", "SFLS"],
    submittedDate: "2026-02-20",
    approvedDate: "2026-03-05",
    notes: "Repeat bidder since HVLS 2022-1. Strong track record with vacant property disposition. Designated servicer: Celink. Has participated in all HVLS and SFLS sales since 2022.",
    financialCapacity: "Verified - $500M+ AUM",
    designatedServicer: "Celink"
  },
  {
    bidderId: "BDR-002",
    entityName: "Atlantic Residential Mortgage Trust",
    entityType: "Institutional Investor",
    contactName: "Jennifer Walsh",
    contactEmail: "jwalsh@atlanticrmt.com",
    qualificationStatus: "Qualified",
    ofacStatus: "Clear",
    samStatus: "Active - No Exclusions",
    priorSales: 8,
    programTypes: ["HVLS", "SFLS", "MHLS"],
    submittedDate: "2026-02-22",
    approvedDate: "2026-03-08",
    notes: "Active in both single-family and multifamily loan sale programs. Won awards in SFLS 2025-2 and MHLS 2025-1. In-house servicing platform for forward mortgages.",
    financialCapacity: "Verified - $350M+ AUM",
    designatedServicer: "Self-Servicing (Atlantic Residential Servicing)"
  },

  // ── Mid-Size For-Profit (2) ────────────────────────────────────────────
  {
    bidderId: "BDR-003",
    entityName: "Pinnacle Asset Recovery Group",
    entityType: "For-Profit - Asset Manager",
    contactName: "David Okafor",
    contactEmail: "dokafor@pinnaclearg.com",
    qualificationStatus: "Qualified",
    ofacStatus: "Clear",
    samStatus: "Active - No Exclusions",
    priorSales: 3,
    programTypes: ["HVLS", "SFLS"],
    submittedDate: "2026-03-01",
    approvedDate: "2026-03-18",
    notes: "Mid-size asset manager specializing in distressed residential assets. Participated in three prior HVLS sales. Designated servicer: PHH Mortgage.",
    financialCapacity: "Verified - $75M AUM",
    designatedServicer: "PHH Mortgage"
  },
  {
    bidderId: "BDR-004",
    entityName: "Meridian Housing Solutions Inc",
    entityType: "For-Profit - Servicer",
    contactName: "Sarah Kim",
    contactEmail: "skim@meridianhsg.com",
    qualificationStatus: "Pending - Financial Review",
    ofacStatus: "Clear",
    samStatus: "Active - No Exclusions",
    priorSales: 0,
    programTypes: ["SFLS"],
    submittedDate: "2026-03-15",
    approvedDate: null,
    notes: "First-time bidder. Licensed mortgage servicer in 38 states. Financial capacity documentation under review by Transaction Specialist. Anticipates qualification by April 15.",
    financialCapacity: "Under Review",
    designatedServicer: "Self-Servicing (Meridian Housing Solutions)"
  },

  // ── Nonprofits (2) ─────────────────────────────────────────────────────
  {
    bidderId: "BDR-005",
    entityName: "National Community Stabilization Trust",
    entityType: "Nonprofit - Housing",
    contactName: "Robert Williams",
    contactEmail: "rwilliams@stabilizationtrust.org",
    qualificationStatus: "Qualified - Mission Pool Eligible",
    ofacStatus: "Clear",
    samStatus: "Active - No Exclusions",
    priorSales: 6,
    programTypes: ["HVLS", "SFLS"],
    submittedDate: "2026-02-18",
    approvedDate: "2026-03-02",
    notes: "Qualified nonprofit with mission pool access under HUD Neighborhood Stabilization Outcome (NSO) provisions. Partners with local housing authorities and CDFIs for property rehabilitation. Active in HVLS mission pools since 2023.",
    financialCapacity: "Verified - Restricted Mission Use",
    designatedServicer: "Celink",
    missionPoolEligible: true,
    nsoPartners: ["Detroit Land Bank Authority", "Atlanta BeltLine Inc", "Philadelphia Housing Development Corp"]
  },
  {
    bidderId: "BDR-006",
    entityName: "Heartland Housing Preservation Alliance",
    entityType: "Nonprofit - CDFI",
    contactName: "Maria Gonzalez",
    contactEmail: "mgonzalez@heartlandhousing.org",
    qualificationStatus: "Pending - OGC Nonprofit Verification",
    ofacStatus: "Clear",
    samStatus: "Active - No Exclusions",
    priorSales: 0,
    programTypes: ["HVLS"],
    submittedDate: "2026-03-20",
    approvedDate: null,
    notes: "New applicant. Community Development Financial Institution seeking mission pool eligibility. 501(c)(3) verification and mission alignment documentation under review by HUD Office of General Counsel. Operating in Kansas City, St. Louis, and Indianapolis markets.",
    financialCapacity: "Under Review",
    designatedServicer: "TBD",
    missionPoolEligible: false
  },

  // ── Government Entity (1) ──────────────────────────────────────────────
  {
    bidderId: "BDR-007",
    entityName: "Cook County Land Bank Authority",
    entityType: "Government Entity",
    contactName: "Angela Thompson",
    contactEmail: "athompson@cookcountylandbank.org",
    qualificationStatus: "Qualified",
    ofacStatus: "N/A - Government Entity",
    samStatus: "Active - No Exclusions",
    priorSales: 2,
    programTypes: ["HVLS"],
    submittedDate: "2026-02-25",
    approvedDate: "2026-03-10",
    notes: "County land bank authority with statutory authority to acquire and rehabilitate vacant properties. Prior participation in HVLS 2024-2 and HVLS 2025-1. Focus on Cook County properties in Pool C and Pool D.",
    financialCapacity: "Government Appropriation",
    designatedServicer: "Celink",
    missionPoolEligible: true,
    jurisdictions: ["Cook County, IL"]
  },

  // ── Joint Venture (1) ──────────────────────────────────────────────────
  {
    bidderId: "BDR-008",
    entityName: "Cascade-Pacific Housing Partners JV",
    entityType: "Joint Venture",
    contactName: "Thomas Nakamura",
    contactEmail: "tnakamura@cascadepacific.com",
    qualificationStatus: "Pending - OGC Review",
    ofacStatus: "Clear",
    samStatus: "Active - No Exclusions",
    priorSales: 0,
    programTypes: ["MHLS"],
    submittedDate: "2026-03-28",
    approvedDate: null,
    notes: "Joint venture between Cascade Real Estate Capital (for-profit) and Pacific Northwest Health Services (nonprofit healthcare operator). Seeking qualification for MHLS 2026-1 healthcare facility deals. JV agreement and operating structure under OGC review for compliance with HUD bidder requirements.",
    financialCapacity: "Under Review",
    designatedServicer: "N/A - Multifamily",
    jvMembers: [
      { name: "Cascade Real Estate Capital LLC", role: "Managing Member / Capital Partner", ownership: 0.60 },
      { name: "Pacific Northwest Health Services", role: "Operating Partner", ownership: 0.40 }
    ]
  }
];

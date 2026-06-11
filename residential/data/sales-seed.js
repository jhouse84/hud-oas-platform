/**
 * HUD Office of Asset Sales - Active Loan Sales
 * Demo data for House Strategies Group platform prototype
 * 4 active sales across HVLS, HNVLS, SFLS, and MHLS program types
 */
window.HSG_DATA = window.HSG_DATA || {};

window.HSG_DATA.sales = [
  {
    id: "HVLS-2026-2",
    programType: "HVLS",
    name: "HECM Vacant Loan Sale 2026-2",
    description: "Sale of approximately 200 FHA-insured Home Equity Conversion Mortgage (HECM) loans secured by vacant properties. Loans are geographically distributed across four pools covering Southeast, Northeast, National, and targeted metropolitan areas.",
    loanCount: 203,
    aggregateValue: 55420000,
    valueLabel: "Aggregate BPO",
    bidDate: "2026-04-22",
    dataRoomOpenDate: "2026-03-10",
    qualificationDeadline: "2026-04-08",
    awardDate: "2026-05-06",
    settlementDate: "2026-06-03",
    status: "Active - Due Diligence",
    poolCount: 4,
    missionProvisions: true,
    transactionSpecialist: "Competitive Assets Advisors LLC",
    qualifiedBidders: 14,
    frn: "https://www.federalregister.gov/documents/2026/02/18/2026-03412/sale-of-hecm-vacant-loans",
    pools: [
      { poolId: "HVLS-2026-2-A", label: "Pool A - Southeast", loanCount: 62, aggregateBPO: 16850000 },
      { poolId: "HVLS-2026-2-B", label: "Pool B - Northeast", loanCount: 55, aggregateBPO: 17230000 },
      { poolId: "HVLS-2026-2-C", label: "Pool C - National", loanCount: 58, aggregateBPO: 14890000 },
      { poolId: "HVLS-2026-2-D", label: "Pool D - Metro Targeted", loanCount: 28, aggregateBPO: 6450000 }
    ]
  },
  {
    id: "HNVLS-2026-1",
    programType: "HNVLS",
    name: "HECM Non-Vacant Loan Sale 2026-1",
    description: "Sale of approximately 150 FHA-insured HECM loans secured by occupied properties. This sale was postponed due to pending regulatory guidance on borrower protections for occupied HECM properties. A revised bid date will be announced via Federal Register Notice.",
    loanCount: 148,
    aggregateValue: 42100000,
    valueLabel: "Aggregate ETD",
    bidDate: null,
    dataRoomOpenDate: "2026-02-24",
    qualificationDeadline: null,
    awardDate: null,
    settlementDate: null,
    status: "Postponed",
    poolCount: 3,
    missionProvisions: true,
    transactionSpecialist: "Competitive Assets Advisors LLC",
    qualifiedBidders: 9,
    frn: "https://www.federalregister.gov/documents/2026/01/22/2026-01588/sale-of-hecm-non-vacant-loans",
    pools: [
      { poolId: "HNVLS-2026-1-A", label: "Pool A - Southern", loanCount: 58, aggregateETD: 16340000 },
      { poolId: "HNVLS-2026-1-B", label: "Pool B - Northern", loanCount: 52, aggregateETD: 15120000 },
      { poolId: "HNVLS-2026-1-C", label: "Pool C - Western", loanCount: 38, aggregateETD: 10640000 }
    ],
    postponementReason: "Pending Mortgagee Letter 2026-08 clarifying post-sale borrower occupancy protections and assignment requirements."
  },
  {
    id: "SFLS-2026-1",
    programType: "SFLS",
    name: "Single Family Loan Sale 2026-1",
    description: "Sale of approximately 300 FHA-insured forward mortgage loans in various stages of default. Loans are organized into three pools by geographic region and delinquency status. Qualified bidders must demonstrate servicing capacity or designated servicer arrangements.",
    loanCount: 312,
    aggregateValue: 125800000,
    valueLabel: "Aggregate UPB",
    bidDate: "2026-05-06",
    dataRoomOpenDate: "2026-03-24",
    qualificationDeadline: "2026-04-22",
    awardDate: "2026-05-20",
    settlementDate: "2026-06-17",
    status: "Upcoming - Pre-Qualification",
    poolCount: 3,
    missionProvisions: true,
    transactionSpecialist: "First Madison Advisors LLC",
    qualifiedBidders: 0,
    frn: "https://www.federalregister.gov/documents/2026/03/11/2026-05221/sale-of-single-family-loans",
    pools: [
      { poolId: "SFLS-2026-1-P1", label: "Pool 1 - Eastern", loanCount: 118, aggregateUPB: 47200000 },
      { poolId: "SFLS-2026-1-P2", label: "Pool 2 - Central", loanCount: 104, aggregateUPB: 41600000 },
      { poolId: "SFLS-2026-1-P3", label: "Pool 3 - Western", loanCount: 90, aggregateUPB: 37000000 }
    ]
  },
  {
    id: "MHLS-2026-1",
    programType: "MHLS",
    name: "Multifamily and Healthcare Loan Sale 2026-1",
    description: "Sale of 8 FHA-insured multifamily and healthcare facility mortgage loans. Deals include a mix of conventional multifamily housing, skilled nursing facilities, and assisted living properties. Each deal is bid individually. Certain properties carry regulatory agreements, HAP contracts, or LIHTC obligations that transfer to the purchaser.",
    loanCount: 8,
    aggregateValue: 195400000,
    valueLabel: "Aggregate UPB",
    bidDate: "2026-05-20",
    dataRoomOpenDate: "2026-04-07",
    qualificationDeadline: "2026-05-06",
    awardDate: "2026-06-10",
    settlementDate: "2026-07-15",
    status: "Upcoming",
    poolCount: 8,
    missionProvisions: false,
    transactionSpecialist: "Capital Advisors Group LLC",
    qualifiedBidders: 0,
    frn: "https://www.federalregister.gov/documents/2026/03/25/2026-06180/sale-of-multifamily-healthcare-loans",
    pools: [
      { poolId: "MHLS-2026-1-D1", label: "Deal 1 - Riverside Gardens Apartments", upb: 32500000 },
      { poolId: "MHLS-2026-1-D2", label: "Deal 2 - Meadowbrook Senior Living", upb: 18200000 },
      { poolId: "MHLS-2026-1-D3", label: "Deal 3 - Crestview Towers", upb: 45100000 },
      { poolId: "MHLS-2026-1-D4", label: "Deal 4 - Sunrise Skilled Nursing Center", upb: 22800000 },
      { poolId: "MHLS-2026-1-D5", label: "Deal 5 - Heritage Park Residences", upb: 28600000 },
      { poolId: "MHLS-2026-1-D6", label: "Deal 6 - Commonwealth Care Facility", upb: 15900000 },
      { poolId: "MHLS-2026-1-D7", label: "Deal 7 - Parkside Village", upb: 24100000 },
      { poolId: "MHLS-2026-1-D8", label: "Deal 8 - Valley View Health Campus", upb: 8200000 }
    ]
  }
];

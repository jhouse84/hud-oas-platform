/**
 * HUD Office of Asset Sales - Virtual Data Room Document Manifests
 * Document structures for HVLS, MHLS, and BIP packages
 */
window.HSG_DATA = window.HSG_DATA || {};

window.HSG_DATA.documents = {

  // ── HVLS Per-Loan Document Set ─────────────────────────────────────────
  hvlsLoanDocuments: [
    {
      docId: "HVLS-DOC-001",
      category: "Valuation",
      name: "Broker Price Opinion (BPO) Report",
      description: "Independent BPO establishing current market value of the vacant property. Includes comparable sales analysis, condition assessment, and recommended list price.",
      format: "PDF",
      typical_pages: "8-15",
      required: true
    },
    {
      docId: "HVLS-DOC-002",
      category: "Property Condition",
      name: "Property Inspection Report",
      description: "Interior and exterior inspection documenting physical condition, vacancy confirmation, needed repairs, code violations, and habitability assessment.",
      format: "PDF",
      typical_pages: "12-25",
      required: true
    },
    {
      docId: "HVLS-DOC-003",
      category: "Collateral",
      name: "Collateral File Scan",
      description: "Scanned original loan documents including the HECM note, mortgage/deed of trust, HUD-1 settlement statement, and any modification agreements.",
      format: "PDF",
      typical_pages: "50-120",
      required: true
    },
    {
      docId: "HVLS-DOC-004",
      category: "Servicing",
      name: "Servicing Notes / Payment History",
      description: "Complete servicing history including payment records, borrower communications, loss mitigation attempts, occupancy status changes, and assignment to HUD timeline.",
      format: "PDF/Excel",
      typical_pages: "15-40",
      required: true
    },
    {
      docId: "HVLS-DOC-005",
      category: "Legal",
      name: "Assignment Documents",
      description: "Chain of assignment documents from originator through servicer to FHA/HUD. Includes HECM assignment election documentation and Mortgagee Letter compliance records.",
      format: "PDF",
      typical_pages: "10-20",
      required: true
    },
    {
      docId: "HVLS-DOC-006",
      category: "Title",
      name: "Title Search / Commitment",
      description: "Preliminary title report identifying liens, encumbrances, easements, and title exceptions. Includes tax lien status and municipal code violation records.",
      format: "PDF",
      typical_pages: "15-30",
      required: true
    },
    {
      docId: "HVLS-DOC-007",
      category: "Property Condition",
      name: "Property Photographs",
      description: "Dated photographs of the property exterior, interior (where accessible), street view, and any notable conditions or damage.",
      format: "PDF/ZIP",
      typical_pages: "10-20 photos",
      required: true
    },
    {
      docId: "HVLS-DOC-008",
      category: "Insurance",
      name: "Hazard Insurance Documentation",
      description: "Current force-placed hazard insurance policy, coverage details, and premium information.",
      format: "PDF",
      typical_pages: "5-10",
      required: false
    }
  ],

  // ── MHLS Volume 1 - Loan Documents ────────────────────────────────────
  mhlsVolume1: [
    { sectionNumber: "1.1", name: "FHA-Insured Mortgage Note", description: "Original promissory note with all endorsements, allonges, and riders." },
    { sectionNumber: "1.2", name: "Mortgage / Deed of Trust", description: "Recorded security instrument with all amendments and modifications." },
    { sectionNumber: "1.3", name: "Regulatory Agreement", description: "HUD Regulatory Agreement governing property operations, including use restrictions and residual receipts requirements." },
    { sectionNumber: "1.4", name: "Letter Agreements", description: "Side letters and supplemental agreements between HUD and the borrower modifying terms of the Regulatory Agreement." },
    { sectionNumber: "1.5", name: "Consolidation Agreement", description: "Agreement consolidating multiple mortgage instruments into a single lien, if applicable." },
    { sectionNumber: "1.6", name: "Transfer of Physical Assets (TPA) Documents", description: "Prior TPA approval documents, including OGC opinion letters and ownership entity documentation." },
    { sectionNumber: "1.7", name: "HUD-1 / ALTA Settlement Statement", description: "Original closing settlement statement with all disbursements and adjustments." },
    { sectionNumber: "1.8", name: "Title Insurance Policy", description: "Lender's title insurance policy with all endorsements and exceptions schedule." },
    { sectionNumber: "1.9", name: "Survey / ALTA Survey", description: "Most recent property survey or ALTA/NSPS Land Title Survey." },
    { sectionNumber: "1.10", name: "UCC Filings", description: "Uniform Commercial Code financing statements covering personal property and fixtures." },
    { sectionNumber: "1.11", name: "Assignment of Leases and Rents", description: "Assignment of all rents, leases, and income from the project to the lender." },
    { sectionNumber: "1.12", name: "HAP Contract", description: "Housing Assistance Payments contract, including all renewals, amendments, and rent schedules." },
    { sectionNumber: "1.13", name: "LIHTC Partnership Agreement", description: "Low Income Housing Tax Credit limited partnership or operating agreement, if applicable." },
    { sectionNumber: "1.14", name: "LIHTC Extended Use Agreement", description: "Land Use Restriction Agreement (LURA) or Extended Low-Income Housing Commitment." },
    { sectionNumber: "1.15", name: "Borrower Organizational Documents", description: "Articles of incorporation, bylaws, partnership agreement, or operating agreement of the borrowing entity." },
    { sectionNumber: "1.16", name: "Management Agreement", description: "Current property management agreement and any amendments." },
    { sectionNumber: "1.17", name: "Construction Documents", description: "Original construction contracts, specifications, and certificates of completion." },
    { sectionNumber: "1.18", name: "Insurance Certificates", description: "Current property insurance, general liability, and professional liability certificates." },
    { sectionNumber: "1.19", name: "Real Estate Tax Records", description: "Current and historical real estate tax bills, assessments, and payment records." },
    { sectionNumber: "1.20", name: "Escrow Account Records", description: "Reserve for replacement, tax, and insurance escrow account statements and balances." },
    { sectionNumber: "1.21", name: "Default and Workout Correspondence", description: "HUD default notices, workout proposals, forbearance agreements, and related correspondence." },
    { sectionNumber: "1.22", name: "OGC Legal Opinions", description: "Office of General Counsel opinion letters regarding enforceability, regulatory compliance, and transfer issues." },
    { sectionNumber: "1.23", name: "Subordination Agreements", description: "Subordination, non-disturbance, and attornment agreements (SNDAs) with tenants and subordinate lien holders." },
    { sectionNumber: "1.24", name: "Ground Lease", description: "Ground lease agreement and all amendments, if property is on leased land." },
    { sectionNumber: "1.25", name: "Use Agreements / Affordability Restrictions", description: "Use agreements, deed restrictions, or other recorded instruments restricting property use or tenant income levels." },
    { sectionNumber: "1.26", name: "Section 232 Healthcare Regulatory Agreement", description: "Section 232 Regulatory Agreement for healthcare facilities, including operator requirements and patient care provisions." },
    { sectionNumber: "1.27", name: "Healthcare License and Certification", description: "State healthcare facility license, CMS Medicare/Medicaid certification, and survey results." },
    { sectionNumber: "1.28", name: "Master Lease Agreement", description: "Master lease between property owner and healthcare facility operator, if applicable." }
  ],

  // ── MHLS Volume 2 - Property and Financial Documents ───────────────────
  mhlsVolume2: [
    { sectionNumber: "2.1", name: "Audited Financial Statements", description: "Most recent 3 years of audited financial statements for the project, including balance sheet, income statement, and cash flow." },
    { sectionNumber: "2.2", name: "Unaudited Financial Statements", description: "Year-to-date unaudited financial statements and interim operating reports." },
    { sectionNumber: "2.3", name: "Rent Rolls", description: "Current and historical (12-month) rent rolls showing unit types, tenant names, lease terms, contract rents, and vacancy." },
    { sectionNumber: "2.4", name: "Operating Statements", description: "Trailing 12-month operating statement with line-item income and expense detail." },
    { sectionNumber: "2.5", name: "Annual Financial Statements (AFHMP)", description: "Affirmative Fair Housing Marketing Plan and compliance documentation." },
    { sectionNumber: "2.6", name: "Appraisal Report", description: "Most recent MAI appraisal with income, cost, and sales comparison approaches to value." },
    { sectionNumber: "2.7", name: "Phase I Environmental Site Assessment", description: "ASTM-compliant Phase I ESA identifying recognized environmental conditions (RECs)." },
    { sectionNumber: "2.8", name: "Phase II Environmental Assessment", description: "Phase II subsurface investigation and remediation documentation, if triggered by Phase I findings." },
    { sectionNumber: "2.9", name: "Physical Needs Assessment (PNA)", description: "Capital needs assessment with immediate repairs, short-term needs (1-5 year), and long-term capital plan (5-20 year)." },
    { sectionNumber: "2.10", name: "As-Built Drawings / Floor Plans", description: "Architectural floor plans, site plans, and as-built drawings." },
    { sectionNumber: "2.11", name: "Utility Bills / Energy Audit", description: "12-month utility consumption records and any energy audit or benchmarking reports." },
    { sectionNumber: "2.12", name: "Market Study", description: "Market analysis including demographic data, comparable properties, absorption analysis, and market rent conclusions." },
    { sectionNumber: "2.13", name: "Capital Expenditure History", description: "Record of capital improvements and replacements made during the past 5 years." },
    { sectionNumber: "2.14", name: "Tenant Income Certifications", description: "Sample tenant income certifications and recertification records for affordable housing units." },
    { sectionNumber: "2.15", name: "Healthcare Facility Survey Reports", description: "State survey and CMS inspection reports, including deficiency citations and plans of correction." },
    { sectionNumber: "2.16", name: "Staffing and Patient Census Reports", description: "Healthcare facility staffing plans, patient census data, and acuity level reports." }
  ],

  // ── Bidder Information Package (BIP) Documents ─────────────────────────
  bipDocuments: [
    {
      docId: "BIP-001",
      name: "Executive Summary",
      description: "Overview of the loan sale including program description, sale timeline, aggregate portfolio characteristics, pool composition, and key terms and conditions.",
      applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"]
    },
    {
      docId: "BIP-002",
      name: "Confidentiality Agreement and Access Agreement (CAA)",
      description: "Non-disclosure and data room access agreement that must be executed before accessing the Virtual Data Room. Governs use and protection of confidential loan-level information.",
      applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"]
    },
    {
      docId: "BIP-003",
      name: "Bidding Instructions and Procedures",
      description: "Detailed instructions for bid submission including bid format, deposit requirements, submission deadline, conforming bid requirements, and bid evaluation criteria.",
      applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"]
    },
    {
      docId: "BIP-004",
      name: "Settlement Procedures",
      description: "Post-award settlement procedures including closing timeline, wire transfer instructions, document delivery requirements, and servicing transfer protocols.",
      applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"]
    },
    {
      docId: "BIP-005",
      name: "Loan Sale Agreement (Form)",
      description: "Template Loan Sale Agreement that the winning bidder will execute. Includes representations, warranties, covenants, and conditions to closing.",
      applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"]
    },
    {
      docId: "BIP-006",
      name: "Servicing Transfer Agreement (Form)",
      description: "Template agreement governing the transfer of servicing rights and responsibilities from the current servicer to the purchaser's designated servicer.",
      applicableTo: ["HVLS", "SFLS"]
    },
    {
      docId: "BIP-007",
      name: "Aggregate Loan Data (ALD) Tape",
      description: "Loan-level data file containing key characteristics for all loans in the sale, including UPB, BPO, property details, borrower status, and pool assignment. Updated through Asset Listing Date (ALD).",
      applicableTo: ["HVLS", "HNVLS", "SFLS"]
    },
    {
      docId: "BIP-008",
      name: "Pool Summary Statistics",
      description: "Summary statistics for each pool including geographic distribution, value stratification, property type mix, and weighted average characteristics.",
      applicableTo: ["HVLS", "HNVLS", "SFLS"]
    },
    {
      docId: "BIP-009",
      name: "Mission Provisions and NSO Requirements",
      description: "Neighborhood Stabilization Outcome (NSO) requirements for mission pool participants, including eligible disposition strategies, reporting requirements, and compliance monitoring.",
      applicableTo: ["HVLS", "SFLS"]
    },
    {
      docId: "BIP-010",
      name: "Qualification Application Package",
      description: "Application forms for bidder pre-qualification including entity information, financial capacity documentation requirements, OFAC/SAM certification, and designated servicer information.",
      applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"]
    },
    {
      docId: "BIP-011",
      name: "Deal Book (Individual Deal Summary)",
      description: "Individual property summary for each MHLS deal including property description, financial performance, capital needs, regulatory obligations, and key risk factors.",
      applicableTo: ["MHLS"]
    },
    {
      docId: "BIP-012",
      name: "Federal Register Notice (FRN)",
      description: "Published Federal Register Notice announcing the loan sale, establishing the public comment period, and providing bidder qualification information.",
      applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"]
    }
  ],

  // ── Document Access Matrix (who sees what) ─────────────────────────────
  accessMatrix: {
    public: ["BIP-001", "BIP-010", "BIP-012"],
    qualifiedBidders: ["BIP-002", "BIP-003", "BIP-004", "BIP-005", "BIP-006", "BIP-007", "BIP-008", "BIP-009", "BIP-011"],
    loanLevelDocuments: "Available in VDR after CAA execution",
    hudInternal: "Full access to all documents including bid submissions and award recommendations"
  }
};

/**
 * HUD Office of Asset Sales — Virtual Data Room Document Manifests
 * Document structures for HVLS, MHLS (Vol 1 & 2), and BIP packages
 *
 * Assigned to window.HSG_DATA.documents
 */
window.HSG_DATA = window.HSG_DATA || {};

window.HSG_DATA.documents = {

  /* ========================================================================
     HVLS Per-Loan Document Set
     Documents available in the VDR for each HECM Vacant loan
     ======================================================================== */
  hvlsLoanDocs: [
    { id: "bpo",             name: "BPO Report",                      type: "pdf",   required: true,  category: "Valuation",          description: "Independent Broker Price Opinion establishing current market value. Includes comparable sales analysis, condition assessment, and recommended list price." },
    { id: "inspection",      name: "Property Inspection Report",      type: "pdf",   required: true,  category: "Property Condition",  description: "Interior and exterior inspection documenting physical condition, vacancy confirmation, needed repairs, code violations, and habitability assessment." },
    { id: "collateral",      name: "Collateral File Scan",            type: "pdf",   required: true,  category: "Collateral",          description: "Scanned original loan documents including HECM note, mortgage/deed of trust, HUD-1 settlement statement, and modification agreements." },
    { id: "servicing",       name: "Servicing Notes / Payment History", type: "pdf", required: true,  category: "Servicing",           description: "Complete servicing history including payment records, borrower communications, loss mitigation attempts, and assignment to HUD timeline." },
    { id: "assignment",      name: "Assignment Documents",            type: "pdf",   required: true,  category: "Legal",               description: "Chain of assignment from originator through servicer to FHA/HUD, including HECM assignment election documentation." },
    { id: "title",           name: "Title Search / Commitment",       type: "pdf",   required: true,  category: "Title",               description: "Preliminary title report identifying liens, encumbrances, easements, tax lien status, and municipal code violation records." },
    { id: "photos",          name: "Property Photographs",            type: "pdf",   required: true,  category: "Property Condition",  description: "Dated photographs of property exterior, interior (where accessible), street view, and any notable conditions or damage." },
    { id: "insurance",       name: "Hazard Insurance Documentation",  type: "pdf",   required: false, category: "Insurance",           description: "Current force-placed hazard insurance policy, coverage details, and premium information." },
    { id: "tax-records",     name: "Property Tax Records",            type: "pdf",   required: false, category: "Tax",                 description: "Current and delinquent property tax records, municipal assessments, and tax sale status." },
    { id: "env-report",      name: "Environmental Report",            type: "pdf",   required: false, category: "Environmental",       description: "Environmental screening or Phase I assessment, if available, noting recognized environmental conditions." }
  ],

  /* ========================================================================
     MHLS Volume 1 — Loan Documents
     Full 28-section loan document set per HUD MHLS VDR structure
     ======================================================================== */
  mhlsVolume1: [
    { section: 1,  name: "FHA-Insured Mortgage Note",                     description: "Original promissory note with all endorsements, allonges, and riders." },
    { section: 2,  name: "Mortgage or Deed of Trust and Assignments",     description: "Recorded security instrument with all amendments, modifications, and recorded assignments." },
    { section: 3,  name: "Regulatory Agreement",                          description: "HUD Regulatory Agreement governing property operations, use restrictions, and residual receipts requirements." },
    { section: 4,  name: "Letter Agreements",                             description: "Side letters and supplemental agreements between HUD and the borrower modifying terms of the Regulatory Agreement." },
    { section: 5,  name: "Consolidation Agreement",                       description: "Agreement consolidating multiple mortgage instruments into a single lien, if applicable." },
    { section: 6,  name: "Transfer of Physical Assets (TPA) Documents",   description: "Prior TPA approval documents including OGC opinion letters and ownership entity documentation." },
    { section: 7,  name: "Final Firm Commitment",                         description: "HUD Firm Commitment letter establishing final mortgage insurance terms, conditions, and special requirements." },
    { section: 8,  name: "HUD-1 / ALTA Settlement Statement",            description: "Original closing settlement statement with all disbursements and adjustments." },
    { section: 9,  name: "Assignment of Rents and Leases",                description: "Assignment of all rents, leases, and income from the project to the lender." },
    { section: 10, name: "Security Agreements",                           description: "Security agreements covering personal property, fixtures, equipment, and accounts receivable." },
    { section: 11, name: "UCC Financing Statements",                      description: "Uniform Commercial Code financing statements covering personal property and fixtures, with continuation statements." },
    { section: 12, name: "Title Insurance Policy",                        description: "Lender's title insurance policy with all endorsements and exceptions schedule." },
    { section: 13, name: "Survey / ALTA Survey",                          description: "Most recent property survey or ALTA/NSPS Land Title Survey." },
    { section: 14, name: "Senior and Subordinate Loan Documents",         description: "Documentation of any senior or subordinate debt, including intercreditor or subordination agreements." },
    { section: 15, name: "Ground Lease",                                  description: "Ground lease agreement and all amendments, if property is on leased land." },
    { section: 16, name: "Leasehold Subordination Agreement",             description: "Subordination, non-disturbance, and attornment agreement between ground lessor and mortgagee." },
    { section: 17, name: "HAP Contract",                                  description: "Housing Assistance Payments contract including all renewals, amendments, and rent schedules." },
    { section: 18, name: "LIHTC Partnership Agreement",                   description: "Low Income Housing Tax Credit limited partnership or operating agreement, if applicable." },
    { section: 19, name: "LIHTC Extended Use Agreement (LURA)",           description: "Land Use Restriction Agreement or Extended Low-Income Housing Commitment recorded against the property." },
    { section: 20, name: "Borrower Organizational Documents",             description: "Articles of incorporation, bylaws, partnership agreement, or operating agreement of the borrowing entity." },
    { section: 21, name: "Management Agreement",                          description: "Current property management agreement and any amendments." },
    { section: 22, name: "Provisional Workout Agreement",                 description: "HUD-approved workout or forbearance agreement, modification terms, and compliance milestones." },
    { section: 23, name: "Indemnification Agreements",                    description: "Indemnification and hold-harmless agreements between HUD, borrower, and related parties." },
    { section: 24, name: "Use Agreements / Affordability Restrictions",   description: "Use agreements, deed restrictions, or other recorded instruments restricting property use or tenant income levels." },
    { section: 25, name: "Subordination Agreements (SNDAs)",              description: "Subordination, non-disturbance, and attornment agreements with tenants and subordinate lien holders." },
    { section: 26, name: "OGC Legal Opinions",                            description: "Office of General Counsel opinion letters regarding enforceability, regulatory compliance, and transfer issues." },
    { section: 27, name: "Section 232 Healthcare Regulatory Agreement",   description: "Section 232 Regulatory Agreement for healthcare facilities including operator requirements and patient care provisions." },
    { section: 28, name: "Healthcare License and Certification",          description: "State healthcare facility license, CMS Medicare/Medicaid certification, and survey results." }
  ],

  /* ========================================================================
     MHLS Volume 2 — Property and Financial Documents
     ======================================================================== */
  mhlsVolume2: [
    { section: 1,  name: "Audited Financial Statements",                  description: "Most recent 3 years of audited financial statements including balance sheet, income statement, and cash flow." },
    { section: 2,  name: "Unaudited / Interim Financial Statements",      description: "Year-to-date unaudited financial statements and interim operating reports." },
    { section: 3,  name: "Rent Rolls",                                    description: "Current and historical (12-month) rent rolls showing unit types, tenant names, lease terms, contract rents, and vacancy." },
    { section: 4,  name: "Operating Statements",                          description: "Trailing 12-month operating statement with line-item income and expense detail." },
    { section: 5,  name: "Affirmative Fair Housing Marketing Plan (AFHMP)", description: "AFHMP and fair housing compliance documentation." },
    { section: 6,  name: "Appraisal Report",                              description: "Most recent MAI appraisal with income, cost, and sales comparison approaches to value." },
    { section: 7,  name: "Phase I Environmental Site Assessment",         description: "ASTM-compliant Phase I ESA identifying recognized environmental conditions (RECs)." },
    { section: 8,  name: "Phase II Environmental Assessment",             description: "Phase II subsurface investigation and remediation documentation, if triggered by Phase I findings." },
    { section: 9,  name: "Physical Needs Assessment (PNA)",               description: "Capital needs assessment with immediate repairs, short-term (1-5 year), and long-term (5-20 year) capital plan." },
    { section: 10, name: "As-Built Drawings / Floor Plans",               description: "Architectural floor plans, site plans, and as-built drawings." },
    { section: 11, name: "Utility Bills / Energy Audit",                  description: "12-month utility consumption records and any energy audit or benchmarking reports." },
    { section: 12, name: "Market Study",                                  description: "Market analysis including demographic data, comparable properties, absorption analysis, and market rent conclusions." },
    { section: 13, name: "Capital Expenditure History",                   description: "Record of capital improvements and replacements made during the past 5 years." },
    { section: 14, name: "Tenant Income Certifications",                  description: "Sample tenant income certifications and recertification records for affordable housing units." },
    { section: 15, name: "Insurance Certificates",                        description: "Current property insurance, general liability, and professional liability certificates." },
    { section: 16, name: "Real Estate Tax Records",                       description: "Current and historical real estate tax bills, assessments, and payment records." },
    { section: 17, name: "Escrow Account Records",                        description: "Reserve for replacement, tax, and insurance escrow account statements and balances." },
    { section: 18, name: "Construction Documents",                        description: "Original construction contracts, specifications, and certificates of completion." },
    { section: 19, name: "Healthcare Facility Survey Reports",            description: "State survey and CMS inspection reports including deficiency citations and plans of correction." },
    { section: 20, name: "Staffing and Patient Census Reports",           description: "Healthcare facility staffing plans, patient census data, and acuity level reports." },
    { section: 21, name: "Master Lease Agreement",                        description: "Master lease between property owner and healthcare facility operator, if applicable." }
  ],

  /* ========================================================================
     Bidder Information Package (BIP) Documents
     Standard documents included in every BIP, with applicability per program
     ======================================================================== */
  bipDocuments: [
    { id: "exec-summary",     name: "Executive Summary",                             applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"], description: "Overview of the loan sale including program description, timeline, aggregate portfolio characteristics, pool composition, and key terms." },
    { id: "caa",              name: "Confidentiality and Access Agreement (CAA)",     applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"], description: "NDA and data room access agreement that must be executed before accessing the Virtual Data Room." },
    { id: "bid-instructions", name: "Bidding Instructions and Procedures",            applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"], description: "Detailed instructions for bid submission including format, deposit requirements, deadline, and evaluation criteria." },
    { id: "settlement-procs", name: "Settlement Procedures",                          applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"], description: "Post-award settlement procedures including closing timeline, wire instructions, document delivery, and servicing transfer protocols." },
    { id: "lsa-form",         name: "Loan Sale Agreement (Form)",                     applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"], description: "Template Loan Sale Agreement including representations, warranties, covenants, and conditions to closing." },
    { id: "sta-form",         name: "Servicing Transfer Agreement (Form)",            applicableTo: ["HVLS", "SFLS"],                   description: "Template agreement governing servicing rights transfer from current servicer to purchaser's designated servicer." },
    { id: "ald-tape",         name: "Aggregate Loan Data (ALD) Tape",                 applicableTo: ["HVLS", "HNVLS", "SFLS"],          description: "Loan-level data file with key characteristics: UPB, BPO, property details, borrower status, pool assignment. Updated through Asset Listing Date." },
    { id: "pool-stats",       name: "Pool Summary Statistics",                        applicableTo: ["HVLS", "HNVLS", "SFLS"],          description: "Summary statistics per pool: geographic distribution, value stratification, property type mix, weighted average characteristics." },
    { id: "nso-provisions",   name: "Mission Provisions and NSO Requirements",        applicableTo: ["HVLS", "SFLS"],                   description: "Neighborhood Stabilization Outcome requirements: eligible disposition strategies, reporting requirements, and compliance monitoring." },
    { id: "qual-package",     name: "Qualification Application Package",              applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"], description: "HUD-9611 or HUD-90092 forms for bidder pre-qualification: entity info, financial capacity, OFAC/SAM certification, designated servicer." },
    { id: "deal-book",        name: "Deal Book (Individual Deal Summary)",            applicableTo: ["MHLS"],                           description: "Individual property summary for each MHLS deal: property description, financial performance, capital needs, regulatory obligations, key risk factors." },
    { id: "frn",              name: "Federal Register Notice (FRN)",                  applicableTo: ["HVLS", "HNVLS", "SFLS", "MHLS"], description: "Published Federal Register Notice announcing the loan sale, establishing public comment period, and providing qualification information." }
  ],

  /* ========================================================================
     Document Access Matrix — who sees what
     ======================================================================== */
  accessMatrix: {
    public:              ["exec-summary", "qual-package", "frn"],
    qualifiedBidders:    ["caa", "bid-instructions", "settlement-procs", "lsa-form", "sta-form", "ald-tape", "pool-stats", "nso-provisions", "deal-book"],
    loanLevelDocuments:  "Available in VDR after CAA execution",
    hudInternal:         "Full access to all documents including bid submissions and award recommendations"
  }
};

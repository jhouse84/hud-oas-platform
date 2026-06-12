/**
 * Generate the SYNTHETIC dataset for the Ginnie Mae demonstration variant.
 * Shapes follow public Ginnie Mae disclosure aggregates for the defaulted-
 * issuer HECM book (Issuer 9281): balances ~$240K mean, note rates ~6.3% WA
 * (93% ARM), vintages concentrated 2017–2021, CA-heavy geography, borrower
 * age ~79, current value ≈ balance / 0.41. Sale pools draw from the
 * 0.80–0.98 balance/MCA bands (the assignment-adjacent sale perimeter).
 * Every record is synthetic — no Ginnie Mae data is present.
 *
 *   node demo/gnma/generate-data.mjs        (deterministic; fixed seed/dates)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Deterministic PRNG (mulberry32) — same output every run
let seed = 0x9281;
function rng() {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const range = (lo, hi) => lo + rng() * (hi - lo);
const clip = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const round = (n, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
// Box-Muller normal
function normal(mean, sd) {
  const u = Math.max(rng(), 1e-9), v = Math.max(rng(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function weighted(pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = rng() * total;
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs[pairs.length - 1][0];
}

const AS_OF = '2026-06-01';
const SALE_ID = 'GNMA-HECM-2027-1-DEMO';

// Geography — non-judicial pool weights (CA-heavy, per disclosure mix)
const NONJUD = [['CA', 31], ['CO', 6.6], ['WA', 5.2], ['TX', 4.8], ['AZ', 4.1], ['UT', 4.1], ['OR', 2.9],
                ['GA', 2.6], ['NC', 2.4], ['MO', 2.0], ['TN', 1.9], ['MI', 1.8], ['VA', 1.7], ['NV', 1.6], ['SC', 1.4]];
const JUD = [['NY', 4.0], ['FL', 6.3], ['IL', 2.8], ['PA', 2.4], ['NJ', 2.2], ['OH', 1.9], ['CT', 1.2]];
const CITIES = {
  CA: ['Los Angeles', 'Riverside', 'Sacramento', 'San Diego', 'Fresno', 'Bakersfield'],
  CO: ['Denver', 'Colorado Springs', 'Pueblo'], WA: ['Seattle', 'Spokane', 'Tacoma'],
  TX: ['Houston', 'San Antonio', 'Dallas'], AZ: ['Phoenix', 'Tucson', 'Mesa'],
  UT: ['Salt Lake City', 'Ogden', 'Provo'], OR: ['Portland', 'Salem', 'Eugene'],
  GA: ['Atlanta', 'Savannah', 'Macon'], NC: ['Charlotte', 'Raleigh', 'Greensboro'],
  MO: ['St. Louis', 'Kansas City', 'Springfield'], TN: ['Memphis', 'Nashville', 'Knoxville'],
  MI: ['Detroit', 'Grand Rapids', 'Flint'], VA: ['Richmond', 'Norfolk', 'Roanoke'],
  NV: ['Las Vegas', 'Reno', 'Henderson'], SC: ['Columbia', 'Charleston', 'Greenville'],
  NY: ['Brooklyn', 'Queens', 'Buffalo', 'Rochester'], FL: ['Miami', 'Tampa', 'Orlando', 'Jacksonville'],
  IL: ['Chicago', 'Rockford', 'Peoria'], PA: ['Philadelphia', 'Pittsburgh', 'Allentown'],
  NJ: ['Newark', 'Trenton', 'Camden'], OH: ['Cleveland', 'Columbus', 'Cincinnati'], CT: ['Hartford', 'Bridgeport', 'New Haven']
};
const VINTAGES = [[2012, 2], [2013, 3], [2014, 4], [2015, 5], [2016, 6], [2017, 8], [2018, 12], [2019, 18], [2020, 24], [2021, 16], [2022, 2]];

let caseSeq = 1000000;
function makeLoan(i, state, poolTag) {
  const bal = round(clip(normal(240000, 95000), 62000, 840000) / 1000) * 1000;
  const balMca = clip(normal(0.885, 0.045), 0.80, 0.98);            // sale perimeter bands
  const mca = round(bal / balMca / 1000) * 1000;
  const value = round(clip(bal / clip(normal(0.41, 0.07), 0.25, 0.62), bal * 1.05, bal * 4.5) / 1000) * 1000;
  const rate = round(clip(normal(6.3, 0.45), 5.0, 7.5), 3);
  const vintage = weighted(VINTAGES);
  const age = Math.round(clip(normal(79, 6), 62, 98));
  const vacant = rng() < 0.70;
  const bpoAge = Math.floor(range(5, 120));                          // days before AS_OF
  const bpoDate = new Date(Date.parse(AS_OF) - bpoAge * 86400000).toISOString().slice(0, 10);
  const fha = `SYN-${pick(['561', '562', '563'])}-${caseSeq++}`;
  return {
    saleId: SALE_ID, loanId: fha, loan_id: fha, fha_case_number: fha, fha_root: fha,
    portal: 'residential', program: 'HVLS', asset_class: 'HECM', synthetic: true,
    pool_tag: poolTag,
    property: { state, city: pick(CITIES[state] || ['—']) },
    property_name: `${pick(CITIES[state] || ['—']).toUpperCase()} HECM ${i + 1}`,
    current_upb: bal,
    max_claim_amount: mca,
    bal_mca_pct: round(balMca * 100, 1),
    note_rate: rate,
    rate_type: rng() < 0.93 ? 'ARM' : 'FIXED',
    vintage_year: vintage,
    borrower_age: age,
    est_value: value,
    bpo_value: value,
    bpo_date: bpoDate,
    occupancy_status: vacant ? 'VACANT' : 'OCCUPIED',
    property_condition: pick(['GOOD', 'GOOD', 'FAIR', 'FAIR', 'POOR']),
    related_loans: { has_related: false }
  };
}

// Pool 1 — Non-Judicial (220) · Pool 2 — Judicial (120)
const loans = [];
for (let i = 0; i < 220; i++) loans.push(makeLoan(i, weighted(NONJUD), 'non-judicial'));
for (let i = 0; i < 120; i++) loans.push(makeLoan(220 + i, weighted(JUD), 'judicial'));

function poolSummary(list) {
  return {
    loan_count: list.length,
    aggregate_bpo: list.reduce((s, l) => s + l.bpo_value, 0),
    aggregate_upb: list.reduce((s, l) => s + l.current_upb, 0),
    states: [...new Set(list.map(l => l.property.state))].sort()
  };
}
const p1 = loans.filter(l => l.pool_tag === 'non-judicial');
const p2 = loans.filter(l => l.pool_tag === 'judicial');

const sale = {
  saleId: SALE_ID, sale_id: SALE_ID, portal: 'residential',
  program: 'HVLS', programType: 'HVLS', sale_type: 'HECM Disposition (Demonstration)',
  sale_name: 'GNMA HECM Disposition 2027-1 (Demonstration)',
  name: 'GNMA HECM Disposition 2027-1 (Demonstration)',
  long_name: 'Ginnie Mae Defaulted-Issuer HECM Disposition 2027-1 — Platform Demonstration (synthetic data)',
  status: 'bid_window', state: 'bid_window',
  completion_code: 'GNMA27D481',
  deposit_terms: { minimum_deposit_floor: 100000, deposit_pct_of_aggregate_bid: 0.10, under_floor_pct: 0.50 },
  key_dates: {
    advisory_recommendation_approved: '2026-04-22',
    qualification_opens: '2026-05-04',
    go_live_data_room: '2026-05-18',
    bid_day: '2026-06-10',
    bid_window_open_eastern: '10:00 AM',
    award_date: '2026-06-11',
    settlement_target: '2026-07-22'
  },
  summary: poolSummary(loans),
  transaction_specialist: 'House Strategies Group LLC (demonstration)',
  pools: [
    { pool_id: SALE_ID + '-P1', pool_name: 'Pool 1 — Non-Judicial States', pool_number: 1,
      stratification_basis: 'Assignment-adjacent vacant/occupied HECMs in non-judicial foreclosure states (0.80–0.98 balance/MCA)',
      minimum_bid_basis: 'Aggregate BPO', eligible_bidder_types: ['all'],
      loan_ids: p1.map(l => l.loan_id), summary: poolSummary(p1) },
    { pool_id: SALE_ID + '-P2', pool_name: 'Pool 2 — Judicial States', pool_number: 2,
      stratification_basis: 'Assignment-adjacent HECMs in judicial foreclosure states (NY/FL/IL/PA/NJ/OH/CT) — longer disposition timelines priced separately',
      minimum_bid_basis: 'Aggregate BPO', eligible_bidder_types: ['all'],
      loan_ids: p2.map(l => l.loan_id), summary: poolSummary(p2) }
  ]
};

// ---- Portfolio Recommendations Register (the advisory system of record) ----
const PORTAL = 'https://gnma-portfolio-advisory.housestrategiesgroup.com';
const recommendations = [
  {
    recId: 'REC-2026-004', state: 'In Execution',
    title: 'Sell the non-assignable vacant cohort (~$180M) via competitive whole-pool sale',
    summary: 'Vacant, assignment-adjacent HECMs in the 0.80–0.98 balance/MCA bands carry the highest carry-cost and tax-and-insurance advance exposure. Recommend a two-pool competitive disposition with judicial-state collateral priced separately.',
    actorSubmitted: 'HSG Advisor', submittedAt: '2026-04-08T14:20:00Z',
    actorApproved: 'Ginnie Mae COR', approvedAt: '2026-04-22T16:05:00Z',
    execution: { type: 'sale', saleId: SALE_ID, label: 'GNMA HECM Disposition 2027-1 (Demonstration)' },
    evidence: [
      { label: 'Portfolio funnel & sale perimeter', url: PORTAL + '/funnel' },
      { label: 'Carry-cost model (vacant cohort)', url: PORTAL + '/economics' },
      { label: 'Judicial vs non-judicial timeline analysis', url: PORTAL + '/workflow' }
    ],
    audit: [
      ['2026-04-08T14:20:00Z', 'HSG Advisor', 'Recommendation drafted and submitted with evidence package'],
      ['2026-04-15T10:02:00Z', 'Ginnie Mae COR', 'Clarification requested: judicial-state pooling treatment'],
      ['2026-04-17T09:41:00Z', 'HSG Advisor', 'Revised: judicial states split to separate pool, priced separately'],
      ['2026-04-22T16:05:00Z', 'Ginnie Mae COR', 'APPROVED — execution workstream authorized'],
      ['2026-05-04T13:00:00Z', 'HSG Advisor', 'Sale workstream spawned: qualification opened (GNMA-HECM-2027-1-DEMO)']
    ]
  },
  {
    recId: 'REC-2026-003', state: 'Approved',
    title: 'Hold the 95–98% balance/MCA cohort to assignment',
    summary: 'Loans within 3–5 points of the assignment threshold monetize faster and at lower loss through HUD assignment than through sale. Recommend hold-to-assignment with monthly threshold monitoring.',
    actorSubmitted: 'HSG Advisor', submittedAt: '2026-04-08T14:25:00Z',
    actorApproved: 'Ginnie Mae COR', approvedAt: '2026-04-22T16:09:00Z',
    execution: { type: 'monitoring', label: 'Monthly assignment-eligibility sweep — next run 2026-06-30' },
    evidence: [
      { label: 'Assignment economics vs sale execution', url: PORTAL + '/economics' },
      { label: 'Threshold-crossing forecast', url: PORTAL + '/funnel' }
    ],
    audit: [
      ['2026-04-08T14:25:00Z', 'HSG Advisor', 'Recommendation drafted and submitted'],
      ['2026-04-22T16:09:00Z', 'Ginnie Mae COR', 'APPROVED — monitoring cadence set to monthly'],
      ['2026-05-30T11:15:00Z', 'HSG Advisor', 'May sweep complete: 412 loans crossed threshold; assignment packages queued']
    ]
  },
  {
    recId: 'REC-2026-005', state: 'In Execution',
    title: 'Data remediation sprint: servicer-of-record + BPO refresh across the sale perimeter',
    summary: 'Sale-perimeter records require current BPOs (≤120 days) and corrected servicer-of-record fields before tape cut. Recommend a 6-week remediation sprint with weekly completion reporting into the repository.',
    actorSubmitted: 'HSG Advisor', submittedAt: '2026-04-28T09:10:00Z',
    actorApproved: 'Ginnie Mae COR', approvedAt: '2026-05-02T15:30:00Z',
    execution: { type: 'remediation', label: 'Sprint 4 of 6 — 87% BPO coverage, 96% servicer-of-record corrected' },
    evidence: [
      { label: 'Data-quality scorecard', url: PORTAL + '/workflow' },
      { label: 'BPO coverage tracker', url: PORTAL + '/funnel' }
    ],
    audit: [
      ['2026-04-28T09:10:00Z', 'HSG Advisor', 'Remediation plan submitted (6-week sprint, weekly reporting)'],
      ['2026-05-02T15:30:00Z', 'Ginnie Mae COR', 'APPROVED'],
      ['2026-05-09T17:00:00Z', 'HSG Advisor', 'Week 1 report filed: 22% BPO refresh complete'],
      ['2026-05-23T17:00:00Z', 'HSG Advisor', 'Week 3 report filed: 61% BPO refresh complete'],
      ['2026-06-06T17:00:00Z', 'HSG Advisor', 'Week 5 report filed: 87% BPO refresh complete']
    ]
  },
  {
    recId: 'REC-2026-006', state: 'Under Ginnie Mae Review',
    title: 'Tail sale perimeter pending Fifth Circuit mandate (TCB)',
    summary: 'A tail cohort’s lien-priority exposure turns on the pending Fifth Circuit mandate in the TCB matter. Recommend holding the affected collateral out of the 2027-1 perimeter and pre-positioning a follow-on sale decision within 30 days of mandate.',
    actorSubmitted: 'HSG Advisor', submittedAt: '2026-05-20T10:45:00Z',
    actorApproved: null, approvedAt: null,
    execution: { type: 'pending', label: 'Awaiting Ginnie Mae determination' },
    evidence: [
      { label: 'Litigation exposure memo (summary)', url: PORTAL + '/workflow' },
      { label: 'Tail-cohort sizing', url: PORTAL + '/funnel' }
    ],
    audit: [
      ['2026-05-20T10:45:00Z', 'HSG Advisor', 'Recommendation submitted with litigation-contingent perimeter'],
      ['2026-05-28T14:12:00Z', 'Ginnie Mae COR', 'Under review — OGC consult requested']
    ]
  }
];

// ---- Supporting cast ----
const demoBidder = {
  bidderId: 'BDR-DEMO', portal: 'residential',
  entityName: 'Meridian Disposition Partners, LLC (Demonstration)',
  entityType: 'Limited Liability Company',
  contactName: 'Demonstration Reviewer',
  contactEmail: 'demo@hudloansales.housestrategiesgroup.com',
  qualificationStatus: 'Qualified',
  programTypes: ['HVLS']
};
const bidders = [
  demoBidder,
  { bidderId: 'BDR-GN-001', portal: 'residential', entityName: 'Pacific Crest Mortgage Capital, L.P.', entityType: 'Limited Partnership', contactEmail: 'ops@example.com', qualificationStatus: 'Qualified', programTypes: ['HVLS'], submittedAt: '2026-05-06T12:00:00Z' },
  { bidderId: 'BDR-GN-002', portal: 'residential', entityName: 'Harborline Residential Credit Fund', entityType: 'Investment Fund', contactEmail: 'dd@example.com', qualificationStatus: 'Qualified', programTypes: ['HVLS'], submittedAt: '2026-05-07T12:00:00Z' },
  { bidderId: 'BDR-GN-003', portal: 'residential', entityName: 'Garnet Hill Servicing & Asset Co.', entityType: 'Corporation', contactEmail: 'bid@example.com', qualificationStatus: 'Pending - Initial Review', programTypes: ['HVLS'], submittedAt: '2026-06-05T12:00:00Z' }
];
const qa = [
  { qaId: 'QA-GN-1', saleId: SALE_ID, question: 'Will tax-and-insurance advance schedules be provided per loan in the data room?', answer: 'Yes — per-loan T&I advance schedules are in each asset’s Due Diligence Files; aggregate schedules accompany the tape as a supplement.', status: 'answered', visibility: 'all', askedAt: '2026-05-22T15:00:00Z', answeredAt: '2026-05-23T18:00:00Z' },
  { qaId: 'QA-GN-2', saleId: SALE_ID, question: 'Are judicial-state loans bid separately from non-judicial?', answer: 'Yes — Pool 2 carries the judicial-state collateral and is bid whole-pool on its own percentage, priced separately from Pool 1.', status: 'answered', visibility: 'all', askedAt: '2026-05-27T15:00:00Z', answeredAt: '2026-05-28T12:30:00Z' }
];
const seedSettlements = [{
  awardId: 'AWD-GN-PRIOR', saleId: 'GNMA-HECM-2026-2-DEMO', poolOrDealId: 'Prior disposition (closed)',
  bidderId: 'BDR-GN-001', programType: 'HVLS', awardAmountUSD: 41200000,
  status: 'Closed', expectedSettlementDate: '2026-03-28T00:00:00Z',
  milestones: [
    { label: 'Award notice issued', status: 'done', dueOffsetDays: 0 },
    { label: 'Deposit reconciled', status: 'done', dueOffsetDays: 3 },
    { label: 'CAA executed', status: 'done', dueOffsetDays: 10 },
    { label: 'Collateral files conveyed', status: 'done', dueOffsetDays: 28 },
    { label: 'Final settlement & wire', status: 'done', dueOffsetDays: 42 }
  ],
  deliverables: [
    { label: 'Executed CAA', category: 'legal', required: true, completed: true },
    { label: 'Wire instructions acknowledged', category: 'financial', required: true, completed: true },
    { label: 'Post-sale outcomes report (initial)', category: 'reporting', required: true, completed: true }
  ]
}];

const out = {
  generatedAt: AS_OF + 'T00:00:00Z',
  variant: 'gnma',
  disclaimer: 'Platform demonstration configured for Sources Sought APP-T-2027-125 market research. All data is synthetic — no Ginnie Mae data is present. House Strategies Group LLC.',
  demoBidder, sales: [sale], loans, qc: [], bidders, qa, seedSettlements, recommendations
};

const target = path.resolve(__dirname, 'data.js');
fs.writeFileSync(target, '/* Generated by demo/gnma/generate-data.mjs — SYNTHETIC DATA ONLY */\nwindow.HSG_DEMO_DATA_GNMA = ' + JSON.stringify(out) + ';\n');
const mb = (fs.statSync(target).size / 1048576).toFixed(2);
console.log('Wrote', target, mb + 'MB');
console.log('loans:', loans.length, '| P1:', p1.length, '| P2:', p2.length);
console.log('agg UPB: $' + (sale.summary.aggregate_upb / 1e6).toFixed(1) + 'M | agg BPO: $' + (sale.summary.aggregate_bpo / 1e6).toFixed(1) + 'M');
console.log('mean bal: $' + Math.round(loans.reduce((s, l) => s + l.current_upb, 0) / loans.length / 1000) + 'K',
            '| WA rate:', (loans.reduce((s, l) => s + l.note_rate * l.current_upb, 0) / loans.reduce((s, l) => s + l.current_upb, 0)).toFixed(2) + '%',
            '| ARM:', Math.round(loans.filter(l => l.rate_type === 'ARM').length / loans.length * 100) + '%',
            '| vacant:', Math.round(loans.filter(l => l.occupancy_status === 'VACANT').length / loans.length * 100) + '%');
console.log('2017-2021 vintages:', Math.round(loans.filter(l => l.vintage_year >= 2017 && l.vintage_year <= 2021).length / loans.length * 100) + '%',
            '| CA share:', Math.round(loans.filter(l => l.property.state === 'CA').length / loans.length * 100) + '%');

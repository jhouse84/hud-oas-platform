/**
 * load-historical.mjs — load the original ("old") HUD sale tapes into the demo
 * dataset so they are browsable in ?demo=1 with real addresses + BPOs, which
 * powers the bidder property map, Street View links, and BPO views.
 *
 * Source tapes use a flat camelCase schema; this maps them to the canonical
 * demo loan shape (loan_id, property.{address,city,state,zip}, ulb/current_upb/
 * bpo_value, pools, summary) and appends three sales to demo/data.js:
 *   HVLS-2026-2 (50 HECM vacant), SFLS-2026-1 (30 forward), MHLS-2026-1 (8 deals).
 * Idempotent: skips a sale already present. Re-run after any data.js regen.
 *
 * Run: node demo/load-historical.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TARGET = path.join(__dirname, 'data.js');

// ---- load the source tapes (they assign onto window.HSG_DATA) ----
const ctx = { window: {} };
['residential/data/sales-seed.js', 'residential/data/loans-hvls.js',
 'residential/data/loans-sfls.js', 'commercial/data/loans-mhls.js'].forEach(rel => {
  new Function('window', fs.readFileSync(path.join(ROOT, rel), 'utf8'))(ctx.window);
});
const SRC = ctx.window.HSG_DATA;
const saleMeta = (id) => (SRC.sales || []).find(s => s.id === id) || {};

function r1k(n) { return Math.round(Number(n) / 1000) * 1000; }
function poolNameFor(meta, poolId) {
  const p = (meta.pools || []).find(x => x.poolId === poolId);
  return p ? p.label : poolId;
}
function summarize(loans) {
  return {
    loan_count: loans.length,
    aggregate_upb: loans.reduce((s, l) => s + (Number(l.current_upb) || 0), 0),
    aggregate_ulb: loans.reduce((s, l) => s + (Number(l.ulb) || 0), 0),
    aggregate_bpo: loans.reduce((s, l) => s + (Number(l.bpo_value) || 0), 0),
    states: [...new Set(loans.map(l => l.property && l.property.state).filter(Boolean))].sort()
  };
}
function mapState(status) {
  if (/active/i.test(status)) return 'bid_window';
  if (/postponed/i.test(status)) return 'announced';
  return 'qualification_open';   // Upcoming / pre-qualification
}

// ---- per-program loan transforms ----
function hvlsLoan(l) {
  return {
    loan_id: l.loanId, loanId: l.loanId,
    fha_case_number: l.fhaCaseNumber, fha_root: l.fhaCaseNumber,
    saleId: 'HVLS-2026-2', poolId: l.poolId,
    property: { address: l.propertyAddress, city: l.city, state: l.state, zip: l.zip },
    current_upb: l.originalBalance, ulb: l.estimatedTotalDebt, unpaid_loan_balance: l.estimatedTotalDebt,
    bpo_value: l.bpoValue, original_principal_balance: l.originalBalance, interest_rate: l.noteRate,
    occupancy_status: 'VACANT', asset_class: 'HECM',
    county: l.county, servicer: l.servicer, assignment_date: l.assignmentDate, property_status: l.propertyStatus
  };
}
function sflsLoan(l) {
  const value = l.ltv ? r1k(l.upb / (l.ltv / 100)) : r1k(l.upb * 1.12);
  return {
    loan_id: l.loanId, loanId: l.loanId,
    fha_case_number: l.fhaCaseNumber, fha_root: l.fhaCaseNumber,
    saleId: 'SFLS-2026-1', poolId: l.poolId,
    property: { address: l.propertyAddress, city: l.city, state: l.state, zip: l.zip },
    current_upb: l.upb, ulb: l.upb, unpaid_loan_balance: l.upb,
    bpo_value: value, original_principal_balance: l.originalAmount, interest_rate: l.noteRate,
    occupancy_status: (l.occupancyStatus || '').toUpperCase().indexOf('VACANT') >= 0 ? 'VACANT' : 'OCCUPIED',
    asset_class: l.propertyType || 'Single Family',
    servicer: l.servicer, ltv: l.ltv, delinquency_months: l.delinquencyMonths, default_date: l.defaultDate
  };
}
function mhlsLoan(d) {
  return {
    loan_id: d.dealId, loanId: d.dealId,
    saleId: 'MHLS-2026-1', poolId: d.dealId,
    property: { address: d.address, city: d.city, state: d.state, zip: null },
    property_name: d.propertyName,
    current_upb: d.upb, ulb: d.upb, unpaid_loan_balance: d.upb,
    bpo_value: d.appraisedValue, units: d.unitCount, asset_class: d.propertyType,
    interest_rate: d.noteRate, occupancy_status: d.occupancyRate != null ? Math.round(d.occupancyRate * 100) + '% occupied' : null,
    noi: d.noi, dscr: d.dscr, regulatory_agreement: d.regulatoryAgreement, hap_contract: d.hapContract,
    lihtc: d.lihtc, year_built: d.yearBuilt, maturity_date: d.maturityDate, fha_project_number: d.fhaProjectNumber
  };
}

function buildSale(id, programType, basis, loans, portal) {
  const meta = saleMeta(id);
  // pools: group loans by poolId, in the meta's pool order
  const order = (meta.pools || []).map(p => p.poolId);
  const byPool = {};
  loans.forEach(l => { (byPool[l.poolId] = byPool[l.poolId] || []).push(l); });
  const poolIds = order.filter(p => byPool[p]).concat(Object.keys(byPool).filter(p => order.indexOf(p) < 0));
  const pools = poolIds.map((pid, i) => {
    const pl = byPool[pid];
    return {
      pool_id: pid, poolId: pid, pool_name: poolNameFor(meta, pid), pool_number: i + 1,
      minimum_bid_basis: 'Aggregate ' + basis, eligible_bidder_types: ['all'],
      loan_ids: pl.map(l => l.loan_id), summary: summarize(pl)
    };
  });
  const code = (programType + '26' + id.slice(-1) + 'H' + (id.charCodeAt(0) % 90 + 10)).toUpperCase();
  return {
    saleId: id, programType, program: programType, portal,
    seller: 'HUD', name: meta.name, sale_name: meta.name, long_name: meta.name,
    description: meta.description, status: mapState(meta.status), state: mapState(meta.status),
    bid_basis: basis, bidBasis: basis,
    key_dates: { bid_day: meta.bidDate, go_live_data_room: meta.dataRoomOpenDate,
                 qualification_closes: meta.qualificationDeadline, award: meta.awardDate, expected_settlement: meta.settlementDate },
    bidDate: meta.bidDate,
    deposit_terms: { deposit_pct_of_aggregate_bid: 0.10, minimum_deposit_floor: 100000, under_floor_pct: 0.50 },
    transactionSpecialist: meta.transactionSpecialist, frn: meta.frn, missionProvisions: meta.missionProvisions,
    pools, summary: summarize(loans), completion_code: code, historical: true
  };
}

// ---- assemble the three sales ----
const sales = [
  buildSale('HVLS-2026-2', 'HVLS', 'ULB', (SRC.loansHVLS || []).map(hvlsLoan), 'residential'),
  buildSale('SFLS-2026-1', 'SFLS', 'UPB', (SRC.loansSFLS || []).map(sflsLoan), 'residential'),
  buildSale('MHLS-2026-1', 'MHLS', 'UPB', (SRC.loansMHLS || []).map(mhlsLoan), 'commercial')
];
const newLoans = [].concat(
  (SRC.loansHVLS || []).map(hvlsLoan),
  (SRC.loansSFLS || []).map(sflsLoan),
  (SRC.loansMHLS || []).map(mhlsLoan)
);

// ---- merge into demo/data.js ----
const dctx = {};
new Function('window', fs.readFileSync(TARGET, 'utf8'))(dctx);
const D = dctx.HSG_DEMO_DATA;
const have = new Set((D.sales || []).map(s => s.saleId));
let addedSales = 0, addedLoans = 0;
sales.forEach(s => { if (!have.has(s.saleId)) { D.sales.push(s); addedSales++; } });
const haveLoan = new Set((D.loans || []).map(l => (l.saleId || '') + '|' + (l.loan_id || l.loanId)));
newLoans.forEach(l => { const k = l.saleId + '|' + l.loan_id; if (!haveLoan.has(k)) { D.loans.push(l); haveLoan.add(k); addedLoans++; } });

fs.writeFileSync(TARGET, '/* Generated by backend/scripts/export-demo-data.mjs — DO NOT EDIT BY HAND */\nwindow.HSG_DEMO_DATA = ' + JSON.stringify(D) + ';\n');
console.log('Added', addedSales, 'sales,', addedLoans, 'loans. data.js now', (fs.statSync(TARGET).size / 1048576).toFixed(2) + 'MB');
sales.forEach(s => console.log('  ', s.saleId, '|', s.programType, '| pools', s.pools.length, '| loans', s.summary.loan_count, '| basis', s.bid_basis, '| states', s.summary.states.join(',')));

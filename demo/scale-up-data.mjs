/**
 * scale-up-data.mjs — make the HUD demo sales realistically sized.
 *
 * Real HVLS/HNVLS/SFLS sales carry hundreds-to-thousands of loans across pools;
 * the seed export only had ~12-18 each. This expands the RESIDENTIAL sales by
 * cloning their real-shaped loan records with varied identifiers, geography, and
 * jittered balances (keeping every field + the UPB<ULB<BPO ordering), rebuilds
 * pools/summaries, and seeds a competing 4-bidder field so the BEM has something
 * to evaluate. Commercial (MHLS/HLS) is left small — that's realistic for it.
 *
 * Deterministic (seeded PRNG) → same output every run. Run: node demo/scale-up-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(__dirname, 'data.js');

// realistic per-sale loan counts (renderable per-pool, BIP-plausible)
const SIZES = { 'HVLS-2026-DEMO': 900, 'HNVLS-2026-DEMO': 440, 'SFLS-2026-DEMO': 900 };
const POOLS = { 'HVLS-2026-DEMO': 2, 'HNVLS-2026-DEMO': 2, 'SFLS-2026-DEMO': 3 };

// geography for variety (state -> cities)
const GEO = {
  FL: ['Jacksonville', 'Orlando', 'Tampa', 'Miami', 'Tallahassee', 'Fort Myers'],
  TX: ['Houston', 'Dallas', 'San Antonio', 'Austin', 'El Paso', 'Fort Worth'],
  CA: ['Los Angeles', 'Sacramento', 'Fresno', 'Riverside', 'Bakersfield', 'Stockton'],
  GA: ['Atlanta', 'Augusta', 'Savannah', 'Macon', 'Columbus'],
  OH: ['Cleveland', 'Columbus', 'Cincinnati', 'Toledo', 'Dayton'],
  PA: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading'],
  NC: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Fayetteville'],
  AZ: ['Phoenix', 'Tucson', 'Mesa', 'Glendale', 'Chandler'],
  MI: ['Detroit', 'Grand Rapids', 'Flint', 'Lansing', 'Warren'],
  IL: ['Chicago', 'Rockford', 'Aurora', 'Peoria', 'Springfield']
};
const STATES = Object.keys(GEO);
const STREETS = ['Magnolia Blvd', 'Live Oak Dr', 'Maple Ave', 'Sycamore Ln', 'Cedar St', 'Birch Way', 'Willow Creek Rd', 'Hickory Ln', 'Dogwood Dr', 'Elm St', 'Juniper Ct', 'Aspen Way', 'Cypress Pt', 'Redwood Ave', 'Spruce St', 'Chestnut Hill', 'Poplar Ln', 'Walnut St', 'Cherry Blossom Way', 'Pinehurst Dr'];

let _s = 0x2f6e21a7;
function rng() { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; }
function pick(a) { return a[Math.floor(rng() * a.length)]; }
function jit(v, amp) { return v ? Math.round(v * (1 + (rng() * 2 - 1) * amp) / 1000) * 1000 : v; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

const ctx = {};
new Function('window', fs.readFileSync(TARGET, 'utf8'))(ctx);
const D = ctx.HSG_DEMO_DATA;

let seq = 1000;
function newLoan(tmpl, saleId, poolId, idx) {
  const l = clone(tmpl);
  const st = pick(STATES), city = pick(GEO[st]);
  const fha = (100 + Math.floor(rng() * 800)) + '-' + (1000000 + Math.floor(rng() * 8999999));
  const id = saleId + '-' + String(idx).padStart(5, '0');
  l.loan_id = id; l.loanId = id;
  l.fha_case_number = fha; l.fha_root = fha;
  l.saleId = saleId; l.poolId = poolId;
  l.property = l.property || {};
  l.property.state = st; l.property.city = city;
  l.property.address = (1000 + Math.floor(rng() * 8999)) + ' ' + pick(STREETS);
  if (l.property_name) l.property_name = city.toUpperCase() + ' ' + (l.asset_class || 'ASSET') + ' ' + idx;
  // jitter balances, preserve UPB < ULB <~ BPO ordering
  const upb = jit(l.current_upb || l.original_principal_balance || 200000, 0.28) || 180000;
  l.current_upb = upb;
  if (l.original_principal_balance != null) l.original_principal_balance = Math.round(upb * (0.85 + rng() * 0.2) / 1000) * 1000;
  if (l.max_claim_amount != null) l.max_claim_amount = Math.round(upb * (1.0 + rng() * 0.18) / 1000) * 1000;
  l.ulb = Math.round(upb * (1.03 + rng() * 0.14) / 1000) * 1000;
  l.unpaid_loan_balance = l.ulb;
  if (l.bpo_value != null) l.bpo_value = Math.round(upb / (0.30 + rng() * 0.35) / 1000) * 1000;
  if (l.etd_adjusted_bpo != null) l.etd_adjusted_bpo = Math.round((l.bpo_value || upb * 1.6) * (0.9 + rng() * 0.5) / 1000) * 1000;
  if (l.occupancy_status) l.occupancy_status = rng() < 0.68 ? 'VACANT' : 'OCCUPIED';
  if (l.property_condition) l.property_condition = pick(['GOOD', 'GOOD', 'FAIR', 'FAIR', 'POOR']);
  return l;
}

function basisField(prog) { return prog === 'HNVLS' ? 'etd_adjusted_bpo' : prog === 'SFLS' ? 'current_upb' : 'ulb'; }
function poolSummary(loans) {
  return {
    loan_count: loans.length,
    aggregate_bpo: loans.reduce((s, l) => s + (l.bpo_value || 0), 0),
    aggregate_upb: loans.reduce((s, l) => s + (l.current_upb || 0), 0),
    aggregate_ulb: loans.reduce((s, l) => s + (l.ulb || 0), 0),
    states: [...new Set(loans.map(l => l.property && l.property.state).filter(Boolean))].sort()
  };
}

const otherLoans = D.loans.filter(l => !SIZES[l.saleId]);   // keep non-residential as-is
const newLoans = [];
const seedBids = [];

for (const sale of D.sales) {
  if (!SIZES[sale.saleId]) continue;
  const prog = sale.programType || sale.program;
  const tmpls = D.loans.filter(l => l.saleId === sale.saleId);
  if (!tmpls.length) continue;
  const total = SIZES[sale.saleId], nPools = POOLS[sale.saleId];
  const per = Math.floor(total / nPools);
  const pools = [];
  let gi = 0;
  for (let p = 0; p < nPools; p++) {
    const poolId = sale.saleId + '-P' + (p + 1);
    const count = p === nPools - 1 ? total - per * (nPools - 1) : per;
    const ploans = [];
    for (let i = 0; i < count; i++) { const l = newLoan(tmpls[gi % tmpls.length], sale.saleId, poolId, ++seq); gi++; ploans.push(l); newLoans.push(l); }
    pools.push({
      pool_id: poolId, pool_name: 'Pool ' + (p + 1), pool_number: p + 1,
      minimum_bid_basis: 'Aggregate ' + (prog === 'SFLS' ? 'UPB' : prog === 'HNVLS' ? 'ETD' : 'ULB'),
      eligible_bidder_types: ['all'], loan_ids: ploans.map(l => l.loan_id), summary: poolSummary(ploans)
    });
  }
  sale.pools = pools;
  sale.summary = poolSummary(pools.flatMap(p => newLoans.filter(l => p.loan_ids.includes(l.loan_id))));
  if (!sale.bid_basis) sale.bid_basis = prog === 'SFLS' ? 'UPB' : prog === 'HNVLS' ? 'ETD' : 'ULB';

  // compact competing bids (aggregate-only) so the BEM has a field to evaluate
  const bf = basisField(prog);
  const FIELD = bf === 'etd_adjusted_bpo' ? 'etd_adjusted_bpo' : bf === 'current_upb' ? 'current_upb' : 'ulb';
  const slate = [
    { id: 'BDR-DEMO', name: D.demoBidder ? D.demoBidder.entityName : 'Meridian Disposition Partners, LLC', conf: true },
    { id: 'BDR-RS-001', name: 'Cardinal Mortgage Acquisitions, L.P.', conf: true },
    { id: 'BDR-RS-002', name: 'Stonebridge Residential Credit', conf: true },
    { id: 'BDR-RS-003', name: 'Latimer Asset Holdings, LLC', conf: false }
  ];
  pools.forEach((pool, pi) => {
    const poolLoans = newLoans.filter(l => pool.loan_ids.includes(l.loan_id));
    const aggBasis = poolLoans.reduce((s, l) => s + (Number(l[FIELD]) || 0), 0);
    slate.forEach((b, bi) => {
      const pct = Math.round((46 + bi * 1.6 + (pi === 1 ? -3 : 0) + rng() * 2) * 1e5) / 1e5;
      seedBids.push({
        bidId: 'BID-' + b.id + '-' + pool.pool_id, saleId: sale.saleId, portal: 'residential',
        poolId: pool.pool_id, poolLabel: pool.pool_name, bidderId: b.id, bidderName: b.name,
        bidderType: bi === 1 ? 'Limited Partnership' : 'Limited Liability Company',
        programType: prog, bidBasis: FIELD, loanCount: poolLoans.length,
        aggregateUsd: Math.round(pct / 100 * aggBasis * 100) / 100, basePct: pct, mode: 'pool-level',
        conforming: b.conf, conformingStatus: b.conf ? 'Conforming' : 'Non-conforming — bidder not qualified at bid close',
        status: 'live', withdrawn: false, receiptId: 'RCPT-' + b.id + '-' + pool.pool_number,
        completionCode: sale.completion_code || null, timestamp: '2026-05-2' + (5 + pi) + 'T13:0' + bi + ':00Z'
      });
    });
  });
}

D.loans = otherLoans.concat(newLoans);
D.seedBids = (D.seedBids || []).concat(seedBids);
// extra bidders for the residential slate
const have = new Set((D.bidders || []).map(b => b.bidderId));
[['BDR-RS-001', 'Cardinal Mortgage Acquisitions, L.P.', 'Qualified'], ['BDR-RS-002', 'Stonebridge Residential Credit', 'Qualified'], ['BDR-RS-003', 'Latimer Asset Holdings, LLC', 'Pending - Initial Review']]
  .forEach(([id, name, q]) => { if (!have.has(id)) (D.bidders = D.bidders || []).push({ bidderId: id, portal: 'residential', entityName: name, entityType: 'Limited Liability Company', contactEmail: 'bids@example.com', qualificationStatus: q, programTypes: ['HVLS', 'HNVLS', 'SFLS'] }); });

fs.writeFileSync(TARGET, '/* Generated by backend/scripts/export-demo-data.mjs — DO NOT EDIT BY HAND */\nwindow.HSG_DEMO_DATA = ' + JSON.stringify(D) + ';\n');
const mb = (fs.statSync(TARGET).size / 1048576).toFixed(2);
console.log('Wrote', TARGET, mb + 'MB');
D.sales.forEach(s => { const n = D.loans.filter(l => l.saleId === s.saleId).length; console.log((s.programType || s.program).padEnd(6), '|', s.saleId, '| pools=' + (s.pools || []).length, '| loans=' + n); });
console.log('total loans:', D.loans.length, '| seedBids:', D.seedBids.length, '| bidders:', D.bidders.length);

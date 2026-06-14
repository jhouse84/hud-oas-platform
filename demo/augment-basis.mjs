/**
 * augment-basis.mjs — add ULB and explicit bid_basis to a demo dataset.
 *
 * The live tape carries UPB and BPO but not a distinct Unpaid Loan Balance.
 * For the demo we synthesize a believable ULB (UPB + accrued interest/MIP) so
 * the reference columns (UPB / ULB / BPO) and the ULB bid basis are meaningful.
 * Deterministic (flat accrual factor) — no randomness, idempotent.
 *
 * Used by export-demo-data.mjs (so live re-exports keep it) and runnable
 * directly to patch an existing demo/data.js in place:
 *   node demo/augment-basis.mjs            (patches demo/data.js)
 *   node demo/augment-basis.mjs gnma       (patches demo/gnma/data.js — already native, no-op)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ULB_FACTOR = 1.08;                 // UPB + ~8% accrued; ULB sits between UPB and BPO
const round1000 = (n) => Math.round(n / 1000) * 1000;

// Program → official bid basis (survey-grounded). Commercial (HLS/MHLS) bids % of
// aggregate UPB at the asset level and is left to its own engine.
const PROGRAM_BASIS = { HVLS: 'ULB', SFLS: 'UPB', HNVLS: 'ETD' };

export function augment(data) {
  const loans = data.loans || [];
  for (const l of loans) {
    if (l.ulb == null && l.current_upb != null) {
      l.ulb = round1000(Number(l.current_upb) * ULB_FACTOR);
      l.unpaid_loan_balance = l.ulb;
    }
  }
  const ulbById = new Map(loans.map((l) => [l.loan_id || l.loanId, Number(l.ulb) || 0]));

  function addAgg(summary, ids) {
    if (!summary) return;
    if (summary.aggregate_ulb == null && Array.isArray(ids)) {
      summary.aggregate_ulb = ids.reduce((s, id) => s + (ulbById.get(id) || 0), 0);
    }
  }

  for (const sale of data.sales || []) {
    const prog = sale.programType || sale.program;
    if (!sale.bid_basis && PROGRAM_BASIS[prog]) sale.bid_basis = PROGRAM_BASIS[prog];
    const basisKey = (sale.bid_basis || PROGRAM_BASIS[prog] || '').toUpperCase();
    for (const pool of sale.pools || []) {
      addAgg(pool.summary, pool.loan_ids || pool.loanIds);
      // Keep the descriptive label consistent with the official basis (residential only)
      if (basisKey && pool.minimum_bid_basis && /aggregate/i.test(pool.minimum_bid_basis)) {
        pool.minimum_bid_basis = 'Aggregate ' + basisKey;
      }
    }
    // sale-level summary aggregate across all its loans
    if (sale.summary && sale.summary.aggregate_ulb == null) {
      const ids = loans.filter((l) => l.saleId === (sale.saleId || sale.sale_id)).map((l) => l.loan_id || l.loanId);
      sale.summary.aggregate_ulb = ids.reduce((s, id) => s + (ulbById.get(id) || 0), 0);
    }
  }
  return data;
}

// ---- CLI: patch an existing data.js in place ----
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const which = process.argv[2] || 'hud';
  const target = which === 'gnma'
    ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'gnma', 'data.js')
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'data.js');
  const globalName = which === 'gnma' ? 'HSG_DEMO_DATA_GNMA' : 'HSG_DEMO_DATA';
  const src = fs.readFileSync(target, 'utf8');
  const header = (src.match(/^\/\*[\s\S]*?\*\//) || ['/* Generated demo data */'])[0];
  const ctx = {};
  // eslint-disable-next-line no-new-func
  new Function('window', src)(ctx);
  const data = augment(ctx[globalName]);
  fs.writeFileSync(target, header + '\nwindow.' + globalName + ' = ' + JSON.stringify(data) + ';\n');
  const withUlb = (data.loans || []).filter((l) => l.ulb != null).length;
  console.log('Augmented', target, '—', withUlb, 'of', (data.loans || []).length, 'loans now carry ULB');
  for (const s of data.sales || []) console.log(' ', s.saleId, '| basis=' + (s.bid_basis || '(commercial/default)'));
}

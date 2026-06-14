/**
 * HSG.bidding.pool — Loan-level percentage bidding (HVLS / HNVLS / SFLS).
 *
 * Mirrors the HUD bid form exactly:
 *   - The bidder enters ONE number per loan: a BID % (up to 5 decimals).
 *   - BID $ is DERIVED (BID % × the HUD-furnished per-loan basis) and read-only.
 *   - Basis by program: HVLS = per-loan BPO · HNVLS = ETD-adjusted BPO (tape value,
 *     never recomputed here) · SFLS = per-loan UPB.
 *   - Whole-pool participation: to bid a pool, EVERY loan in it needs a valid %;
 *     a pool is declined by leaving all of its loans blank.
 *   - Blank = NO BID (allowed). A literal 0 = error. Derived $ below the per-loan
 *     minimum = error. HNVLS BID % capped at 175.
 *   - Deposit (per sale deposit_terms): greater of the floor ($100,000) or 10% of
 *     the aggregate bid, rounded up to the whole dollar; aggregates under the
 *     floor take a 50%-of-bid deposit instead.
 *
 * Receipts and the form-completion CODE are issued by the server at submit;
 * nothing here invents codes or reveals reserves.
 *
 * A loan entry: { loanId, pct, usd }
 * A pool result: { poolId, participation: 'COMPLETE'|'NO_BID'|'INCOMPLETE',
 *                  loans, aggregateUsd, missionBid, errors, missing }
 */
window.HSG = window.HSG || {};
HSG.bidding = HSG.bidding || {};

HSG.bidding.pool = (function () {
  'use strict';

  var CONFIG = {
    pctDecimals: 5,
    minDerivedUSD: 100,
    maxPctByProgram: { HNVLS: 175 },   // others: no cap unless the sale supplies one
    deposit: { rate: 0.10, floor: 100000, underFloorRate: 0.50 }
  };

  // Bid basis is set per SALE (sale.bid_basis); these are the program defaults when
  // a sale doesn't override. Grounded in the bidder survey: HVLS bids are a % of ULB
  // (unpaid loan balance), SFLS a % of UPB, HNVLS a % of ETD-adjusted BPO.
  var BASIS_FIELD = { ULB: 'ulb', UPB: 'current_upb', BPO: 'bpo_value', ETD: 'etd_adjusted_bpo' };
  var BASIS_LABEL = { ULB: 'ULB', UPB: 'UPB', BPO: 'BPO', ETD: 'ETD-adj. BPO' };
  var BASIS_LONG  = { ULB: 'Unpaid Loan Balance', UPB: 'Unpaid Principal Balance', BPO: 'Broker Price Opinion', ETD: 'ETD-Adjusted BPO' };

  function defaultBasisKey(programType) {
    if (programType === 'HNVLS') return 'ETD';
    if (programType === 'SFLS') return 'UPB';
    if (programType === 'HVLS') return 'ULB';
    return 'UPB';
  }

  /** The sale's official bid basis key ('ULB'|'UPB'|'BPO'|'ETD'). */
  function basisKey(programType, saleConfig) {
    var explicit = saleConfig && (saleConfig.bidBasis || saleConfig.bid_basis);
    return explicit ? String(explicit).toUpperCase() : defaultBasisKey(programType);
  }
  function basisField(programType, saleConfig) { return BASIS_FIELD[basisKey(programType, saleConfig)] || 'current_upb'; }
  function basisLabel(programType, saleConfig) { var k = basisKey(programType, saleConfig); return BASIS_LABEL[k] || k; }
  function basisLong(programType, saleConfig)  { var k = basisKey(programType, saleConfig); return BASIS_LONG[k] || k; }

  /** Tape value for ANY basis key on a loan, with graceful fallbacks for a thin tape. */
  function loanBasisByKey(loan, key) {
    if (!loan) return 0;
    var v = Number(loan[BASIS_FIELD[key]]);
    if (!v) {
      if (key === 'ULB') v = Number(loan.unpaid_loan_balance) || Number(loan.current_upb) || Number(loan.currentUpb);
      else if (key === 'ETD') v = Number(loan.etdAdjustedBpo) || Number(loan.bpo_value);
      else if (key === 'UPB') v = Number(loan.currentUpb);
      else if (key === 'BPO') v = Number(loan.bpoValue);
    }
    return v || 0;
  }

  /** HUD-furnished per-loan basis value for the sale's OFFICIAL basis. Never recomputed. */
  function loanBasis(loan, programType, saleConfig) {
    return loanBasisByKey(loan, basisKey(programType, saleConfig));
  }

  function roundPct(n) {
    var m = Math.pow(10, CONFIG.pctDecimals);
    return Math.round(Number(n) * m) / m;
  }

  function maxPct(programType, saleConfig) {
    if (saleConfig && saleConfig.maxPct != null) return Number(saleConfig.maxPct);
    var cap = CONFIG.maxPctByProgram[programType];
    return cap != null ? cap : null;
  }

  /**
   * Parse one raw input value.
   * Returns { state: 'blank' | 'invalid' | 'ok', pct, message }.
   */
  function parsePct(raw) {
    if (raw === '' || raw == null) return { state: 'blank' };
    var n = Number(raw);
    if (typeof raw === 'string' && raw.trim() === '') return { state: 'blank' };
    if (isNaN(n)) return { state: 'invalid', message: 'Enter a numeric percentage' };
    if (n === 0) return { state: 'invalid', message: 'A bid of 0 is not valid — leave the loan blank to decline the pool' };
    if (n < 0) return { state: 'invalid', message: 'Percentage must be positive' };
    return { state: 'ok', pct: roundPct(n) };
  }

  /** Derived BID $ for one loan (read-only on the sheet), against the sale's official basis. */
  function deriveUsd(pct, loan, programType, saleConfig) {
    var basis = loanBasis(loan, programType, saleConfig);
    return Math.round((Number(pct) / 100) * basis * 100) / 100;
  }

  /**
   * Validate one loan's entry.
   * Returns { state: 'NO_BID' | 'error' | 'ok', pct, usd, message }.
   */
  function validateLoanEntry(raw, loan, programType, saleConfig) {
    var parsed = parsePct(raw);
    if (parsed.state === 'blank') return { state: 'NO_BID' };
    if (parsed.state === 'invalid') return { state: 'error', message: parsed.message };
    var cap = maxPct(programType, saleConfig);
    if (cap != null && parsed.pct > cap) {
      return { state: 'error', message: 'BID % exceeds the ' + programType + ' maximum (' + cap + '%)' };
    }
    var usd = deriveUsd(parsed.pct, loan, programType, saleConfig);
    if (usd < CONFIG.minDerivedUSD) {
      return { state: 'error', message: 'Derived bid $' + usd.toLocaleString() + ' is below the per-loan minimum ($' + CONFIG.minDerivedUSD + ')' };
    }
    return { state: 'ok', pct: parsed.pct, usd: usd };
  }

  /**
   * Whole-pool participation check across every loan in the pool.
   * entries: { loanId → raw input value }. poolLoans: full roster for the pool.
   */
  function validatePool(entries, poolLoans, programType, opts) {
    opts = opts || {};
    var results = [], errors = [], missing = [], aggregate = 0;
    var loans = poolLoans || [];
    var enteredCount = 0;

    loans.forEach(function (loan) {
      var id = loan.loan_id || loan.loanId;
      var raw = entries ? entries[id] : undefined;
      var r = validateLoanEntry(raw, loan, programType, opts.saleConfig);
      if (r.state === 'ok') {
        enteredCount++;
        aggregate += r.usd;
        results.push({ loanId: id, pct: r.pct, usd: r.usd });
      } else if (r.state === 'error') {
        enteredCount++;
        errors.push({ loanId: id, message: r.message });
      } else {
        missing.push(id);
      }
    });

    if (enteredCount === 0) {
      return { participation: 'NO_BID', loans: [], aggregateUsd: 0, errors: [], missing: [] };
    }
    if (errors.length === 0 && missing.length === 0) {
      return {
        participation: 'COMPLETE',
        loans: results,
        aggregateUsd: Math.round(aggregate * 100) / 100,
        missionBid: !!opts.missionBid,
        errors: [], missing: []
      };
    }
    return {
      participation: 'INCOMPLETE',
      loans: results,
      aggregateUsd: Math.round(aggregate * 100) / 100,
      errors: errors,
      missing: missing
    };
  }

  /**
   * Deposit per the sale's published terms (DP-01):
   * greater of floor or rate × aggregate, rounded UP; under the floor, 50% of bid.
   */
  function deposit(aggregateUsd, terms) {
    var t = terms || {};
    var rate = Number(t.deposit_pct_of_aggregate_bid != null ? t.deposit_pct_of_aggregate_bid : CONFIG.deposit.rate);
    var floor = Number(t.minimum_deposit_floor != null ? t.minimum_deposit_floor : CONFIG.deposit.floor);
    var underRate = Number(t.under_floor_pct != null ? t.under_floor_pct : CONFIG.deposit.underFloorRate);
    var agg = Number(aggregateUsd) || 0;
    if (agg <= 0) return 0;
    if (agg < floor) return Math.ceil(agg * underRate);
    return Math.max(floor, Math.ceil(agg * rate));
  }

  /** Slip totals across complete pool results. */
  function slipTotal(poolResults, terms) {
    var s = (poolResults || []).reduce(function (acc, p) {
      if (p.participation !== 'COMPLETE') return acc;
      acc.poolCount += 1;
      acc.loanCount += (p.loans || []).length;
      acc.totalUSD += p.aggregateUsd || 0;
      if (p.missionBid) acc.missionCount += 1;
      return acc;
    }, { poolCount: 0, loanCount: 0, totalUSD: 0, missionCount: 0 });
    s.totalUSD = Math.round(s.totalUSD * 100) / 100;
    s.depositUSD = deposit(s.totalUSD, terms);
    return s;
  }

  return {
    CONFIG: CONFIG,
    basisKey: basisKey,
    basisField: basisField,
    basisLabel: basisLabel,
    basisLong: basisLong,
    loanBasis: loanBasis,
    loanBasisByKey: loanBasisByKey,
    parsePct: parsePct,
    deriveUsd: deriveUsd,
    validateLoanEntry: validateLoanEntry,
    validatePool: validatePool,
    deposit: deposit,
    slipTotal: slipTotal
  };
})();

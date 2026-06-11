/**
 * HSG.bidding.pool — Pool-based percentage bidding (HVLS / HNVLS / SFLS).
 *
 * Residential portal bidding mechanics:
 *   - HVLS / HNVLS bid as % of aggregate BPO (Broker Opinion of Value).
 *   - SFLS bids as % of aggregate UPB (Unpaid Principal Balance).
 *   - Bid amount can be displayed in % or $ — the calc engine maintains
 *     dual representation and the same bid record stores both.
 *   - Mission bids are flagged on the bid record and may be subject to
 *     reserve discounts in BEM.
 *
 * A bid record has shape:
 *   {
 *     bidderId, saleId, poolId, programType,
 *     bidPct,        // 25.5  (always populated)
 *     bidAmountUSD,  // 2_550_000  (derived from pct × aggregate)
 *     valuationBasis,// 'BPO' | 'UPB' | 'ETD'
 *     missionBid,    // bool
 *     conditional,   // optional: { dependsOnPool, dependsOnAward }
 *     submittedAt, status, confirmationCode
 *   }
 */
window.HSG = window.HSG || HSG;
HSG.bidding = HSG.bidding || {};

HSG.bidding.pool = (function () {
  'use strict';

  var DEFAULT_RANGE = { min: 5, max: 105 };  // % range — caller can override per program

  function valuationBasis(programType) {
    if (programType === 'HVLS' || programType === 'HNVLS') return 'BPO';
    if (programType === 'SFLS') return 'UPB';
    return 'BPO';
  }

  function aggregateForBasis(pool, basis) {
    if (!pool) return 0;
    if (basis === 'BPO') return pool.aggregateBPO || 0;
    if (basis === 'UPB') return pool.aggregateUPB || 0;
    if (basis === 'ETD') return pool.aggregateETD || 0;
    return pool.aggregateBPO || pool.aggregateUPB || 0;
  }

  function pctToUsd(pct, pool, basis) {
    var agg = aggregateForBasis(pool, basis || valuationBasis(pool && pool.programType));
    return Math.round(((Number(pct) || 0) / 100) * agg);
  }

  function usdToPct(usd, pool, basis) {
    var agg = aggregateForBasis(pool, basis || valuationBasis(pool && pool.programType));
    if (!agg) return 0;
    return Number(((Number(usd) || 0) / agg) * 100);
  }

  /**
   * Validate a bid before submission. Returns { valid, errors, warnings }.
   * Errors block submission; warnings are surfaced but submission proceeds.
   */
  function validate(bid, pool, opts) {
    opts = opts || {};
    var errors = [];
    var warnings = [];
    var range = opts.range || pool && pool.bidRange || DEFAULT_RANGE;

    if (!bid.bidderId)  errors.push({ field: 'bidderId',  message: 'Bidder ID is required' });
    if (!bid.saleId)    errors.push({ field: 'saleId',    message: 'Sale ID is required' });
    if (!bid.poolId)    errors.push({ field: 'poolId',    message: 'Pool ID is required' });
    if (!bid.programType) errors.push({ field: 'programType', message: 'Program type is required' });

    if (typeof bid.bidPct !== 'number' || isNaN(bid.bidPct)) {
      errors.push({ field: 'bidPct', message: 'Bid percentage is required' });
    } else if (bid.bidPct < range.min) {
      errors.push({ field: 'bidPct', message: 'Bid is below the minimum threshold (' + range.min + '%)' });
    } else if (bid.bidPct > range.max) {
      errors.push({ field: 'bidPct', message: 'Bid exceeds the maximum threshold (' + range.max + '%)' });
    }

    // Cross-check derived USD vs aggregate
    var basis = bid.valuationBasis || valuationBasis(bid.programType);
    var agg = aggregateForBasis(pool, basis);
    if (agg) {
      var derived = pctToUsd(bid.bidPct, pool, basis);
      if (typeof bid.bidAmountUSD === 'number' && Math.abs(derived - bid.bidAmountUSD) > Math.max(100, agg * 0.0001)) {
        warnings.push({ field: 'bidAmountUSD', message: 'USD amount and percentage do not match — recalculating' });
        bid.bidAmountUSD = derived;
      } else if (typeof bid.bidAmountUSD !== 'number') {
        bid.bidAmountUSD = derived;
      }
    }

    // Reserve price check (warning only — bidder may still bid below)
    if (pool && pool.reservePct != null && bid.bidPct < pool.reservePct) {
      warnings.push({ field: 'bidPct', message: 'Bid is below reserve (' + pool.reservePct + '%) — may be ineligible' });
    }

    // Mission bid eligibility
    if (bid.missionBid && !pool.missionEligible) {
      errors.push({ field: 'missionBid', message: 'This pool is not designated mission-eligible' });
    }

    return { valid: errors.length === 0, errors: errors, warnings: warnings, bid: bid };
  }

  /**
   * Build a slip total for an array of pool bids.
   */
  function slipTotal(bids, opts) {
    opts = opts || {};
    var depositRate = (opts.depositRate != null) ? opts.depositRate : 0.10;  // 10% standard
    var pools = (bids || []).reduce(function (acc, b) {
      acc.totalUSD += Number(b.bidAmountUSD || 0);
      acc.poolCount += 1;
      if (b.missionBid) acc.missionCount += 1;
      return acc;
    }, { totalUSD: 0, poolCount: 0, missionCount: 0 });
    pools.depositUSD = Math.round(pools.totalUSD * depositRate);
    pools.depositRate = depositRate;
    return pools;
  }

  /**
   * Generate a confirmation code (HUD-YYYY-XXXXX).
   */
  function confirmationCode() {
    var y = new Date().getFullYear();
    var rand = Math.random().toString(36).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 5);
    while (rand.length < 5) rand += Math.floor(Math.random() * 36).toString(36).toUpperCase();
    return 'HUD-' + y + '-' + rand;
  }

  return {
    valuationBasis: valuationBasis,
    aggregateForBasis: aggregateForBasis,
    pctToUsd: pctToUsd,
    usdToPct: usdToPct,
    validate: validate,
    slipTotal: slipTotal,
    confirmationCode: confirmationCode,
    DEFAULT_RANGE: DEFAULT_RANGE
  };
})();

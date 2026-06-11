/**
 * HSG.bidding.deal — Deal-level dollar bidding (MHLS / HLS).
 *
 * Commercial portal bidding mechanics:
 *   - Bid is a single $ amount per deal (note or note pool).
 *   - Per-unit price is derived (bid / unit count) for multifamily.
 *   - Implied cap rate is derived (NOI / bid) for multifamily and healthcare.
 *   - Yield-to-purchase is derived from coupon, bid, and remaining term.
 *   - Reserve price is dollar-denominated, not percentage.
 *
 * A deal bid record:
 *   {
 *     bidderId, saleId, dealId, programType,
 *     bidAmountUSD,       // 12_500_000
 *     pricePerUnit,       // optional — derived for multifamily
 *     impliedCapRate,     // optional — derived
 *     conditions,         // array of bidder-imposed conditions
 *     submittedAt, status, confirmationCode
 *   }
 */
window.HSG = window.HSG || {};
HSG.bidding = HSG.bidding || {};

HSG.bidding.deal = (function () {
  'use strict';

  function pricePerUnit(bidUSD, deal) {
    if (!deal || !deal.unitCount) return null;
    return Math.round(((Number(bidUSD) || 0) / deal.unitCount) * 100) / 100;
  }

  function impliedCapRate(bidUSD, deal) {
    if (!deal || !deal.noi || !bidUSD) return null;
    return Math.round((deal.noi / Number(bidUSD)) * 10000) / 100;  // pct, 2 decimals
  }

  function pctOfUPB(bidUSD, deal) {
    if (!deal || !deal.upb) return null;
    return Math.round(((Number(bidUSD) || 0) / deal.upb) * 10000) / 100;
  }

  function yieldToPurchase(bidUSD, deal) {
    // Approximation: coupon × (UPB / bid). Real YTM requires DCF over remaining term.
    if (!deal || !deal.upb || !deal.couponRate || !bidUSD) return null;
    return Math.round(((deal.couponRate * (deal.upb / Number(bidUSD)))) * 100) / 100;
  }

  function validate(bid, deal, opts) {
    opts = opts || {};
    var errors = [];
    var warnings = [];

    if (!bid.bidderId)    errors.push({ field: 'bidderId',    message: 'Bidder ID is required' });
    if (!bid.saleId)      errors.push({ field: 'saleId',      message: 'Sale ID is required' });
    if (!bid.dealId)      errors.push({ field: 'dealId',      message: 'Deal ID is required' });
    if (!bid.programType) errors.push({ field: 'programType', message: 'Program type is required' });

    if (typeof bid.bidAmountUSD !== 'number' || isNaN(bid.bidAmountUSD) || bid.bidAmountUSD <= 0) {
      errors.push({ field: 'bidAmountUSD', message: 'Bid amount is required and must be positive' });
    } else {
      var minimumBid = (deal && deal.minimumBidUSD) || 100000;
      if (bid.bidAmountUSD < minimumBid) {
        errors.push({ field: 'bidAmountUSD', message: 'Bid is below the deal minimum ($' + minimumBid.toLocaleString() + ')' });
      }
      if (deal && deal.upb && bid.bidAmountUSD > deal.upb * 1.5) {
        warnings.push({ field: 'bidAmountUSD', message: 'Bid exceeds 150% of UPB — please confirm' });
      }
    }

    // Reserve price
    if (deal && deal.reservePriceUSD != null && bid.bidAmountUSD < deal.reservePriceUSD) {
      warnings.push({ field: 'bidAmountUSD', message: 'Bid is below reserve ($' + deal.reservePriceUSD.toLocaleString() + ') — may be ineligible' });
    }

    // Healthcare-specific checks
    if (bid.programType === 'HLS') {
      if (deal && deal.requiresOperatorContinuity && !bid.operatorContinuityPlan) {
        errors.push({ field: 'operatorContinuityPlan', message: 'Section 232 deals require an operator continuity plan' });
      }
    }

    // Auto-derive metrics
    bid.pricePerUnit   = pricePerUnit(bid.bidAmountUSD, deal);
    bid.impliedCapRate = impliedCapRate(bid.bidAmountUSD, deal);
    bid.pctOfUPB       = pctOfUPB(bid.bidAmountUSD, deal);
    bid.yieldToPurchase = yieldToPurchase(bid.bidAmountUSD, deal);

    return { valid: errors.length === 0, errors: errors, warnings: warnings, bid: bid };
  }

  function slipTotal(bids, opts) {
    opts = opts || {};
    var depositRate = (opts.depositRate != null) ? opts.depositRate : 0.10;
    var summary = (bids || []).reduce(function (acc, b) {
      acc.totalUSD += Number(b.bidAmountUSD || 0);
      acc.dealCount += 1;
      acc.totalUnits += (b._dealMeta && b._dealMeta.unitCount) || 0;
      return acc;
    }, { totalUSD: 0, dealCount: 0, totalUnits: 0 });
    summary.depositUSD = Math.round(summary.totalUSD * depositRate);
    summary.depositRate = depositRate;
    summary.weightedAvgPricePerUnit = summary.totalUnits ? Math.round(summary.totalUSD / summary.totalUnits) : null;
    return summary;
  }

  function confirmationCode() {
    var y = new Date().getFullYear();
    var rand = Math.random().toString(36).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 5);
    while (rand.length < 5) rand += Math.floor(Math.random() * 36).toString(36).toUpperCase();
    return 'HUD-' + y + '-' + rand;
  }

  // ---------------------------------------------------------------------
  //  Cross-collateralization enforcement
  // ---------------------------------------------------------------------
  /**
   * Detect cross-collateralization within a pool. Returns groups of related
   * loan IDs that must be acquired together. Empty array if independent.
   *   const groups = crossCollatGroups(pool, loans);
   *   // [["094-38008S","094-38009S"]]   ← Cando + Sheyenne
   */
  function crossCollatGroups(pool, loans) {
    if (!pool || !loans) return [];
    var ids = pool.loan_ids || pool.loanIds || [];
    var poolLoans = loans.filter(function (l) { return ids.indexOf(l.loan_id || l.loanId) >= 0; });
    var seen = {};
    var groups = [];
    poolLoans.forEach(function (l) {
      var rel = l.related_loans || {};
      if (!rel.has_related || !rel.related_fha) return;
      var myId = String(l.loan_id || l.loanId);
      if (seen[myId]) return;
      var relRoot = String(rel.related_fha).replace(/[^A-Za-z0-9]/g, '');
      var related = poolLoans.filter(function (other) {
        var otherRoot = String(other.loan_id || other.loanId).replace(/[^A-Za-z0-9]/g, '');
        return otherRoot === relRoot;
      });
      if (related.length > 0) {
        var groupIds = [myId].concat(related.map(function (x) { return String(x.loan_id || x.loanId); }));
        groupIds.forEach(function (id) { seen[id] = true; });
        groups.push(groupIds);
      }
    });
    return groups;
  }

  /**
   * Returns true if any cross-collat group exists within the pool.
   * Bid UI uses this to lock loan-level toggles; the pool is bid as a unit.
   */
  function poolIsCrossCollateralized(pool, loans) {
    return crossCollatGroups(pool, loans).length > 0;
  }

  /**
   * Validate that a bid does not partially-select a cross-collateralized group.
   * Returns { valid, message } — message describes the violation if invalid.
   */
  function validateCrossCollatSelection(pool, loans, selectedLoanIds) {
    var groups = crossCollatGroups(pool, loans);
    for (var i = 0; i < groups.length; i++) {
      var group = groups[i];
      var inSelection = group.filter(function (id) { return selectedLoanIds.indexOf(id) >= 0; });
      if (inSelection.length > 0 && inSelection.length < group.length) {
        return {
          valid: false,
          message: 'Cross-collateralized loans must be acquired together: ' + group.join(' + ') +
                   '. Selected only: ' + inSelection.join(', ')
        };
      }
    }
    return { valid: true };
  }

  return {
    pricePerUnit: pricePerUnit,
    impliedCapRate: impliedCapRate,
    pctOfUPB: pctOfUPB,
    yieldToPurchase: yieldToPurchase,
    validate: validate,
    slipTotal: slipTotal,
    confirmationCode: confirmationCode,
    crossCollatGroups: crossCollatGroups,
    poolIsCrossCollateralized: poolIsCrossCollateralized,
    validateCrossCollatSelection: validateCrossCollatSelection
  };
})();

/**
 * HSG.bidding.deal — Asset-level percentage bidding (MHLS / HLS).
 *
 * Mirrors the HUD commercial bid form exactly:
 *   - Each asset (note or small note pool) is one row: "ASSET POOL NUM".
 *   - The bidder enters ONE number per asset: a BID % of that asset's UPB
 *     (up to 5 decimals). BID $ is DERIVED and read-only.
 *   - Each asset is bid independently; an asset is declined by leaving it blank.
 *   - Blank = NO BID (allowed). A literal 0 = error. Derived $ below the
 *     per-asset minimum = error.
 *   - The bid surface carries UPB, BID %, and derived BID $ only — analysis
 *     metrics (per-unit, cap rate, yield, NOI) belong to the data room, not
 *     the bid sheet.
 *   - HUD-furnished related-loan linkage (cross-collateral) is enforced as
 *     offered: linked notes transfer together, so a bid on one applies to the
 *     group as a single row/unit.
 *   - Deposit follows the sale's published terms (greater of floor or rate ×
 *     aggregate, rounded up; 50%-of-bid under the floor).
 *
 * Receipts and the form-completion CODE are issued by the server at submit.
 *
 * An asset entry: { assetId, pct, usd }
 */
window.HSG = window.HSG || {};
HSG.bidding = HSG.bidding || {};

HSG.bidding.deal = (function () {
  'use strict';

  var CONFIG = {
    pctDecimals: 5,
    minDerivedUSD: 100,
    maxPct: null,                       // no cap unless the sale supplies one
    deposit: { rate: 0.10, floor: 100000, underFloorRate: 0.50 }
  };

  /** HUD-furnished asset UPB (the bid basis). Never derived or corrected here. */
  function assetUpb(asset) {
    if (!asset) return 0;
    if (asset.summary && asset.summary.aggregate_upb != null) return Number(asset.summary.aggregate_upb) || 0;
    return Number(asset.aggregate_upb || asset.aggregateUPB || asset.upb || 0) || 0;
  }

  function roundPct(n) {
    var m = Math.pow(10, CONFIG.pctDecimals);
    return Math.round(Number(n) * m) / m;
  }

  /** Parse one raw input. Returns { state: 'blank'|'invalid'|'ok', pct, message }. */
  function parsePct(raw) {
    if (raw === '' || raw == null) return { state: 'blank' };
    if (typeof raw === 'string' && raw.trim() === '') return { state: 'blank' };
    var n = Number(raw);
    if (isNaN(n)) return { state: 'invalid', message: 'Enter a numeric percentage' };
    if (n === 0) return { state: 'invalid', message: 'A bid of 0 is not valid — leave the asset blank to decline it' };
    if (n < 0) return { state: 'invalid', message: 'Percentage must be positive' };
    return { state: 'ok', pct: roundPct(n) };
  }

  /** Derived BID $ for one asset (read-only on the sheet). */
  function deriveUsd(pct, asset) {
    return Math.round((Number(pct) / 100) * assetUpb(asset) * 100) / 100;
  }

  /**
   * Validate one asset's entry.
   * Returns { state: 'NO_BID' | 'error' | 'ok', pct, usd, message }.
   */
  function validateAssetEntry(raw, asset, saleConfig) {
    var parsed = parsePct(raw);
    if (parsed.state === 'blank') return { state: 'NO_BID' };
    if (parsed.state === 'invalid') return { state: 'error', message: parsed.message };
    var cap = (saleConfig && saleConfig.maxPct != null) ? Number(saleConfig.maxPct) : CONFIG.maxPct;
    if (cap != null && parsed.pct > cap) {
      return { state: 'error', message: 'BID % exceeds the sale maximum (' + cap + '%)' };
    }
    var usd = deriveUsd(parsed.pct, asset);
    if (usd < CONFIG.minDerivedUSD) {
      return { state: 'error', message: 'Derived bid $' + usd.toLocaleString() + ' is below the per-asset minimum ($' + CONFIG.minDerivedUSD + ')' };
    }
    return { state: 'ok', pct: parsed.pct, usd: usd };
  }

  /**
   * Validate the whole sheet: entries = { assetId → raw value }, assets = roster.
   * Every entered asset must be valid; untouched assets are NO BID.
   */
  function validateSheet(entries, assets, opts) {
    opts = opts || {};
    var bids = [], errors = [], aggregate = 0;
    (assets || []).forEach(function (asset) {
      var id = asset.pool_id || asset.poolId || asset.assetId || asset.dealId;
      var raw = entries ? entries[id] : undefined;
      var r = validateAssetEntry(raw, asset, opts.saleConfig);
      if (r.state === 'ok') {
        aggregate += r.usd;
        bids.push({ assetId: id, pct: r.pct, usd: r.usd });
      } else if (r.state === 'error') {
        errors.push({ assetId: id, message: r.message });
      }
    });
    return {
      complete: errors.length === 0 && bids.length > 0,
      bids: bids,
      errors: errors,
      aggregateUsd: Math.round(aggregate * 100) / 100
    };
  }

  /** Deposit per the sale's published terms (DP-01). */
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

  /** Slip totals across asset entries. */
  function slipTotal(assetBids, terms) {
    var s = (assetBids || []).reduce(function (acc, b) {
      acc.assetCount += 1;
      acc.totalUSD += Number(b.usd || b.bidAmountUSD || 0);
      return acc;
    }, { assetCount: 0, totalUSD: 0 });
    s.totalUSD = Math.round(s.totalUSD * 100) / 100;
    s.depositUSD = deposit(s.totalUSD, terms);
    return s;
  }

  // -------------------------------------------------------------------
  // HUD-furnished related-loan (cross-collateral) linkage — offered as-is
  // -------------------------------------------------------------------
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

  function poolIsCrossCollateralized(pool, loans) {
    return crossCollatGroups(pool, loans).length > 0;
  }

  return {
    CONFIG: CONFIG,
    assetUpb: assetUpb,
    parsePct: parsePct,
    deriveUsd: deriveUsd,
    validateAssetEntry: validateAssetEntry,
    validateSheet: validateSheet,
    deposit: deposit,
    slipTotal: slipTotal,
    crossCollatGroups: crossCollatGroups,
    poolIsCrossCollateralized: poolIsCrossCollateralized
  };
})();

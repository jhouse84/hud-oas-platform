/**
 * HUD Loan Sale Platform — Bid Evaluation Methodology (BEM) Engine
 * House Strategies Group LLC
 *
 * The most complex part of HUD loan sale operations. The TS (Transaction Specialist)
 * runs BEM to rank conforming bids and recommend awards. This engine supports:
 *
 *   1. Configurable reserve prices (per pool, can be adjusted on the fly)
 *   2. Mission pool carveouts (nonprofit-only pools or loans within pools)
 *   3. Cutout acceptance/rejection (HUD decides which cutouts to honor)
 *   4. Conditional bid resolution (combinatorial: "only if I win A+B+C")
 *   5. Tie-breaking rules (configurable)
 *   6. Scenario modeling (what-if: different reserves, different mission allocations)
 *   7. Award optimization (highest aggregate proceeds vs mission priority vs simple ranking)
 *
 * BEM parameters are persisted to HSG.state under 'bemConfig' namespace so the TS
 * can save scenarios, compare runs, and hand the approved scenario to Awards.
 *
 * Key HUD context:
 *   - Bids typically expressed as % of aggregate BPO (HVLS) or UPB (SFLS/MHLS)
 *   - Reserve price usually ~55-65% of BPO, set per pool before bid day
 *   - Mission bids get discount to reserve (often 5-10%) in exchange for NSO commitments
 *   - Cutouts reduce pool size; bidder's % applied to reduced aggregate
 *   - Conditional bids create combinatorial optimization problem (NP-hard in general,
 *     but HUD sales have <10 pools so brute force is acceptable)
 *
 * Future integration points:
 *   - TODO: [AWS/Lambda] Run BEM as a Lambda function for large-scale sales
 *   - TODO: [AI] Use Claude API to explain BEM outcomes in natural language
 *   - TODO: [Export] Generate BEM PDF report with appendix showing all scenarios
 */
window.HSG = window.HSG || {};

HSG.bem = (function () {
  'use strict';

  var state = HSG.state;
  var u = HSG.utils;

  /* ========================================================================
     BEM CONFIG (persisted per sale)
     ======================================================================== */

  /**
   * Default BEM config for a sale. Admin can edit and save scenarios.
   */
  function defaultConfig(sale) {
    var pools = sale.pools || [];
    return {
      saleId: sale.id,
      program: sale.programType,
      createdAt: new Date().toISOString(),
      scenarioName: 'Default',
      // Per-pool reserve prices (% of aggregate or $ for MHLS)
      reservePrices: pools.reduce(function(acc, p) {
        var agg = p.aggregateBPO || p.aggregateUPB || p.aggregateETD || p.upb || 0;
        acc[p.poolId] = {
          poolId: p.poolId,
          poolLabel: p.label,
          aggregateValue: agg,
          reservePct: 55,  // default 55% of BPO
          reserveDollar: agg * 0.55,
          isDollarBased: (sale.programType === 'MHLS' || sale.programType === 'HLS')
        };
        return acc;
      }, {}),
      // TS-imposed pool cutouts: { poolId: [{loanId, bpo, reason}] }
      // Cutouts reduce the effective aggregate that bidders' % applies to.
      // Typical reasons: bankruptcy, forbearance, litigation, regulatory holds.
      poolCutouts: {},
      // Mission pool configuration
      missionProvisions: {
        enabled: !!sale.missionProvisions,
        allocationMode: 'first-look', // 'first-look', 'reserved-pool', 'discount-only'
        missionDiscountPct: 10, // Mission bids get 10% discount off reserve
        reservedPoolIds: [], // If allocation-mode is 'reserved-pool'
        missionEligibleBidders: [] // Loaded from bidders data
      },
      // Cutout policy governs when cutouts are allowed and by whom
      cutoutPolicy: {
        allowCutouts: true,
        maxCutoutPct: 15, // Max 15% of pool BPO can be cut out
        requireTSApproval: true,
        autoRejectIfExceeds: true
      },
      // Award optimization
      awardMode: 'highest-per-pool', // 'highest-per-pool', 'highest-aggregate', 'mission-priority'
      tieBreaker: 'earliest-timestamp', // 'earliest-timestamp', 'highest-prior-sales', 'financial-capacity'
      // Conditional bid handling
      conditionalBidPolicy: 'evaluate-combinatorial', // 'evaluate-combinatorial', 'reject-conditional'
      // Scenario metadata
      notes: '',
      approvedBy: null,
      approvedAt: null
    };
  }

  /**
   * Load or create BEM config for a sale.
   */
  function getConfig(saleId) {
    var stored = state.load().bemConfig || {};
    var cfg = stored[saleId];
    if (!cfg) {
      var sale = findSale(saleId);
      if (!sale) return null;
      cfg = defaultConfig(sale);
      saveConfig(saleId, cfg);
    }
    return cfg;
  }

  function saveConfig(saleId, cfg) {
    var cache = state.load();
    if (!cache.bemConfig) cache.bemConfig = {};
    cache.bemConfig[saleId] = cfg;
    // Force persist (state.js load() mutates cache but we need save)
    try { localStorage.setItem('hsg.platform.v1', JSON.stringify(cache)); } catch(e){}
    state.emit('bem.configSaved', { saleId: saleId, config: cfg });
    return cfg;
  }

  function resetConfig(saleId) {
    var sale = findSale(saleId);
    if (!sale) return null;
    var cfg = defaultConfig(sale);
    saveConfig(saleId, cfg);
    return cfg;
  }

  /**
   * Save a named scenario snapshot (for comparison).
   */
  function saveScenario(saleId, name, config) {
    var cache = state.load();
    if (!cache.bemScenarios) cache.bemScenarios = {};
    if (!cache.bemScenarios[saleId]) cache.bemScenarios[saleId] = {};
    var id = 'scenario-' + Date.now();
    cache.bemScenarios[saleId][id] = Object.assign({}, config, {
      scenarioId: id,
      scenarioName: name,
      savedAt: new Date().toISOString()
    });
    try { localStorage.setItem('hsg.platform.v1', JSON.stringify(cache)); } catch(e){}
    return id;
  }

  function listScenarios(saleId) {
    var cache = state.load();
    var scenarios = (cache.bemScenarios || {})[saleId] || {};
    return Object.keys(scenarios).map(function(k) { return scenarios[k]; });
  }

  function deleteScenario(saleId, scenarioId) {
    var cache = state.load();
    if (cache.bemScenarios && cache.bemScenarios[saleId]) {
      delete cache.bemScenarios[saleId][scenarioId];
      try { localStorage.setItem('hsg.platform.v1', JSON.stringify(cache)); } catch(e){}
    }
  }

  /* ========================================================================
     BEM EVALUATION
     ======================================================================== */

  /**
   * Run BEM against all bids for a sale, applying the given configuration.
   * Returns:
   *   {
   *     saleId, scenarioName,
   *     poolResults: [{poolId, label, reserve, bids: [...], winner, reserveMet, isMission}],
   *     aggregateResults: { totalProceeds, avgPctOfBPO, coverage, poolsAwarded, unsold },
   *     recommendations: [{poolId, bidderId, action, rationale}],
   *     warnings: []
   *   }
   */
  function evaluate(saleId, config) {
    config = config || getConfig(saleId);
    if (!config) return null;

    var sale = findSale(saleId);
    if (!sale) return null;

    // Load bids for this sale (from state, includes any fresh submissions)
    var bids = state.bids.getAll().filter(function(b) {
      return b.saleId === saleId && !b.sandbox && !b.withdrawn;
    });
    // Also merge any static demo bids for the sale
    if (window.HSG_DATA && window.HSG_DATA.bids) {
      var staticBids = (window.HSG_DATA.bids.hvls || [])
        .concat(window.HSG_DATA.bids.mhls || [])
        .filter(function(b) { return b.saleId === saleId; });
      staticBids.forEach(function(sb) {
        if (!bids.find(function(b) { return b.bidId === sb.bidId; })) bids.push(sb);
      });
    }

    var warnings = [];
    var pools = sale.pools || [];
    var poolResults = pools.map(function(pool) {
      return evaluatePool(pool, bids, config, warnings);
    });

    // Apply conditional bid resolution (combinatorial)
    if (config.conditionalBidPolicy === 'evaluate-combinatorial') {
      poolResults = resolveCombinatorial(poolResults, bids, config, warnings);
    }

    // Aggregate metrics
    var totalProceeds = 0;
    var totalBpo = 0;
    var poolsAwarded = 0;
    var unsold = [];
    poolResults.forEach(function(pr) {
      totalBpo += pr.aggregateValue;
      if (pr.winner) {
        totalProceeds += pr.winner.impliedDollarAmount || 0;
        poolsAwarded++;
      } else {
        unsold.push(pr);
      }
    });

    var recommendations = generateRecommendations(poolResults, config);

    return {
      saleId: saleId,
      scenarioName: config.scenarioName,
      evaluatedAt: new Date().toISOString(),
      config: config,
      poolResults: poolResults,
      aggregateResults: {
        totalProceeds: totalProceeds,
        totalBpo: totalBpo,
        avgPctOfBPO: totalBpo > 0 ? (totalProceeds / totalBpo) * 100 : 0,
        coverage: pools.length > 0 ? (poolsAwarded / pools.length) * 100 : 0,
        poolsAwarded: poolsAwarded,
        poolsTotal: pools.length,
        unsoldPools: unsold,
        missionAwards: poolResults.filter(function(p) { return p.winner && p.winner.missionBid; }).length
      },
      recommendations: recommendations,
      warnings: warnings
    };
  }

  /**
   * Evaluate bids for a single pool.
   */
  function evaluatePool(pool, allBids, config, warnings) {
    var poolBids = allBids.filter(function(b) { return b.poolId === pool.poolId; });
    var reserve = (config.reservePrices || {})[pool.poolId];
    var agg = reserve ? reserve.aggregateValue : (pool.aggregateBPO || pool.aggregateUPB || pool.upb || 0);
    var isMissionReservedPool = (config.missionProvisions && config.missionProvisions.allocationMode === 'reserved-pool'
      && (config.missionProvisions.reservedPoolIds || []).indexOf(pool.poolId) >= 0);

    // Score each bid
    var scored = poolBids.map(function(b) {
      return scoreBid(b, pool, config, reserve, isMissionReservedPool);
    });

    // Filter to conforming bids that meet reserve
    var eligible = scored.filter(function(s) {
      return s.conforming && s.meetsReserve && s.allowed;
    });

    // Rank by effective score
    eligible.sort(function(a, b) {
      // Highest bid wins, with tie-break
      if (b.effectivePct !== a.effectivePct) return b.effectivePct - a.effectivePct;
      return applyTieBreaker(a, b, config);
    });

    // Mission first-look: if enabled, prefer mission bids if within tolerance of highest
    if (config.missionProvisions && config.missionProvisions.enabled
        && config.missionProvisions.allocationMode === 'first-look') {
      eligible = applyMissionFirstLook(eligible, config);
    }

    var winner = eligible[0] || null;
    var reserveMet = eligible.length > 0;

    if (!reserveMet && poolBids.length > 0) {
      warnings.push({
        poolId: pool.poolId,
        level: 'warning',
        message: pool.label + ': No bid met reserve price of ' + (reserve ? reserve.reservePct + '%' : 'reserve')
      });
    }

    // All bids ranked: eligible first, then below-reserve (allowed but fails), then not-allowed (non-conforming/violations)
    var belowReserve = scored.filter(function(s){return s.allowed && !s.meetsReserve;});
    belowReserve.sort(function(a, b) { return b.effectivePct - a.effectivePct; });
    var notAllowed = scored.filter(function(s){return !s.allowed;});

    return {
      poolId: pool.poolId,
      label: pool.label,
      aggregateValue: agg,
      reservePct: reserve ? reserve.reservePct : null,
      reserveDollar: reserve ? reserve.reserveDollar : 0,
      isMissionReservedPool: isMissionReservedPool,
      totalBids: poolBids.length,
      conformingBids: scored.filter(function(s){return s.conforming;}).length,
      eligibleBids: eligible.length,
      bidsRanked: eligible.concat(belowReserve).concat(notAllowed),
      winner: winner,
      reserveMet: reserveMet,
      rawBids: scored
    };
  }

  /**
   * Score a single bid against BEM rules.
   */
  function scoreBid(bid, pool, config, reserve, isMissionReservedPool) {
    var conforming = bid.conformingStatus === 'Conforming';
    var isMission = !!bid.missionBid;
    var reservePct = reserve ? reserve.reservePct : 55;
    var missionDiscount = (config.missionProvisions && config.missionProvisions.missionDiscountPct) || 0;

    // TS-imposed cutouts (applied uniformly to every bid in the pool)
    var tsImposedCutouts = (config.poolCutouts && config.poolCutouts[pool.poolId]) || [];
    var tsCutoutBpo = tsImposedCutouts.reduce(function(s, c) { return s + (c.bpo || 0); }, 0);

    // Bidder-specified cutouts (rare; usually TS-managed). De-dup against TS cutouts.
    var bidderCutouts = (bid.cutouts || []).filter(function(bc) {
      return !tsImposedCutouts.some(function(tc) { return tc.loanId === bc.loanId; });
    });
    var bidderCutoutBpo = bidderCutouts.reduce(function(s, c) { return s + (c.bpo || 0); }, 0);

    var cutoutBpo = tsCutoutBpo + bidderCutoutBpo;
    var agg = reserve ? reserve.aggregateValue : (pool.aggregateBPO || pool.aggregateUPB || 0);
    var effectiveAgg = Math.max(agg - cutoutBpo, 1);

    // Cutout policy check — only applies to BIDDER-requested cutouts; TS-imposed ones are legitimate
    var bidderCutoutPctOfPool = agg > 0 ? (bidderCutoutBpo / agg) * 100 : 0;
    var cutoutViolation = false;
    if (config.cutoutPolicy && !config.cutoutPolicy.allowCutouts && bidderCutoutBpo > 0) {
      cutoutViolation = true;
    } else if (config.cutoutPolicy && bidderCutoutPctOfPool > config.cutoutPolicy.maxCutoutPct) {
      cutoutViolation = true;
    }
    var cutoutPctOfPool = agg > 0 ? (cutoutBpo / agg) * 100 : 0;

    // Meets reserve?
    var effectiveReserve = isMission
      ? Math.max(reservePct - missionDiscount, 0)
      : reservePct;

    var bidPct = parseFloat(bid.bidAmount) || 0;

    var meetsReserve = bidPct >= effectiveReserve;

    // Mission reserved pool: only mission bidders allowed
    var allowed = true;
    var allowedReason = '';
    if (isMissionReservedPool && !isMission) {
      allowed = false;
      allowedReason = 'Pool reserved for mission bidders';
    }
    if (cutoutViolation) {
      allowed = false;
      allowedReason = (bidderCutoutPctOfPool > 0 ? 'Bidder cutout exceeds max ' + config.cutoutPolicy.maxCutoutPct + '% policy' : 'Bidder cutouts not allowed');
    }
    if (!conforming) {
      allowed = false;
      allowedReason = allowedReason || 'Non-conforming: ' + (bid.nonConformingReason || 'procedural');
    }

    return {
      bidId: bid.bidId,
      bidderId: bid.bidderId,
      bidderName: bid.bidderName,
      rawBid: bid,
      bidPct: bidPct,
      effectivePct: bidPct,
      impliedDollarAmount: effectiveAgg * (bidPct / 100),
      effectiveAggregate: effectiveAgg,
      cutoutBpo: cutoutBpo,
      cutoutPctOfPool: cutoutPctOfPool,
      missionBid: isMission,
      conforming: conforming,
      meetsReserve: meetsReserve,
      effectiveReserve: effectiveReserve,
      allowed: allowed,
      allowedReason: allowedReason,
      timestamp: bid.timestamp,
      priorSales: getBidderPriorSales(bid.bidderId)
    };
  }

  function getBidderPriorSales(bidderId) {
    if (!window.HSG_DATA || !window.HSG_DATA.bidders) return 0;
    var b = window.HSG_DATA.bidders.find(function(x) { return x.bidderId === bidderId; });
    return b ? (b.priorSales || 0) : 0;
  }

  /**
   * Apply tie-breaker when two bids have identical amounts.
   * Returns -1 if a wins, 1 if b wins, 0 if still tied.
   */
  function applyTieBreaker(a, b, config) {
    switch (config.tieBreaker) {
      case 'earliest-timestamp':
        return new Date(a.timestamp) - new Date(b.timestamp);
      case 'highest-prior-sales':
        return b.priorSales - a.priorSales;
      case 'financial-capacity':
        // Simple proxy: prior sales indicates financial depth
        return b.priorSales - a.priorSales;
      default:
        return 0;
    }
  }

  /**
   * Mission first-look: if a mission bid is within X% of highest, it wins.
   */
  function applyMissionFirstLook(eligible, config) {
    if (!eligible.length) return eligible;
    var topPct = eligible[0].effectivePct;
    var tolerance = 5; // 5 percentage points
    var missionBids = eligible.filter(function(s) { return s.missionBid; });
    if (!missionBids.length) return eligible;
    var bestMission = missionBids[0];
    if (topPct - bestMission.effectivePct <= tolerance) {
      // Promote the mission bid to top
      return [bestMission].concat(eligible.filter(function(s) { return s !== bestMission; }));
    }
    return eligible;
  }

  /**
   * Resolve combinatorial conditional bids.
   * If a bidder has a bid on Pool A conditioned on "must also win B", we check
   * if they're the projected winner on both. If not, their conditional bid is dropped.
   */
  function resolveCombinatorial(poolResults, allBids, config, warnings) {
    // Simple approach: iterate until stable. If a winner's conditional isn't satisfied,
    // drop them and move to next ranked bidder.
    var changed = true;
    var iterations = 0;
    while (changed && iterations < 10) {
      changed = false;
      iterations++;
      poolResults.forEach(function(pr) {
        if (!pr.winner) return;
        var conditional = pr.winner.rawBid && pr.winner.rawBid.conditional;
        if (!conditional) return;
        // Parse conditional (simple: look for "pool A" or pool IDs in conditional string)
        var required = parseConditional(conditional, allBids);
        if (!required.length) return;
        var satisfied = required.every(function(reqPoolId) {
          var reqPr = poolResults.find(function(p) { return p.poolId === reqPoolId; });
          return reqPr && reqPr.winner && reqPr.winner.bidderId === pr.winner.bidderId;
        });
        if (!satisfied) {
          // Drop winner, promote next
          warnings.push({
            poolId: pr.poolId,
            level: 'info',
            message: pr.label + ': Conditional bid by ' + pr.winner.bidderName + ' not satisfied — demoted'
          });
          var idx = pr.bidsRanked.indexOf(pr.winner);
          pr.bidsRanked.splice(idx, 1);
          pr.winner = pr.bidsRanked.find(function(b) { return b.allowed && b.meetsReserve; }) || null;
          pr.reserveMet = !!pr.winner;
          changed = true;
        }
      });
    }
    return poolResults;
  }

  function parseConditional(str, allBids) {
    if (!str) return [];
    // Look for pool references like "Pool A", "pool-a", or pool IDs
    var matches = str.match(/pool\s*[-_]?\s*([a-z0-9]+)/gi);
    if (!matches) return [];
    // Map to pool IDs — this is demo-level, production would use structured data
    return matches.map(function(m) {
      var letter = m.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-1);
      // Find any pool with that letter suffix in allBids
      var pool = allBids.find(function(b) { return b.poolId && b.poolId.endsWith('-' + letter); });
      return pool ? pool.poolId : null;
    }).filter(Boolean);
  }

  /**
   * Generate award recommendations in plain English.
   */
  function generateRecommendations(poolResults, config) {
    var recs = [];
    poolResults.forEach(function(pr) {
      if (pr.winner) {
        recs.push({
          poolId: pr.poolId,
          poolLabel: pr.label,
          action: 'award',
          bidderId: pr.winner.bidderId,
          bidderName: pr.winner.bidderName,
          bidPct: pr.winner.bidPct,
          impliedDollar: pr.winner.impliedDollarAmount,
          missionBid: pr.winner.missionBid,
          rationale: buildRationale(pr)
        });
      } else {
        recs.push({
          poolId: pr.poolId,
          poolLabel: pr.label,
          action: pr.totalBids === 0 ? 'no-bids' : 'no-award',
          rationale: pr.totalBids === 0
            ? 'No bids received for this pool'
            : 'No conforming bid met reserve of ' + pr.reservePct + '%'
        });
      }
    });
    return recs;
  }

  function buildRationale(poolResult) {
    var w = poolResult.winner;
    var parts = [];
    parts.push('Highest conforming bid at ' + w.bidPct.toFixed(1) + '% of BPO');
    parts.push('Implied proceeds: ' + u.currency(w.impliedDollarAmount));
    if (w.missionBid) parts.push('Designated mission bid (NSO outcome commitments)');
    if (w.cutoutBpo > 0) {
      var cutCount = ((w.rawBid && w.rawBid.cutouts) ? w.rawBid.cutouts.length : 0);
      parts.push(cutCount + ' loan cutout(s) · ' + u.currencyCompact(w.cutoutBpo) + ' BPO reduction');
    }
    parts.push('Meets reserve of ' + poolResult.reservePct + '%');
    return parts.join(' · ');
  }

  /* ========================================================================
     SCENARIO COMPARISON
     ======================================================================== */

  /**
   * Compare two evaluations side-by-side.
   */
  function compare(evalA, evalB) {
    return {
      scenarioA: evalA.scenarioName,
      scenarioB: evalB.scenarioName,
      proceedsDelta: evalB.aggregateResults.totalProceeds - evalA.aggregateResults.totalProceeds,
      proceedsPctDelta: evalA.aggregateResults.totalProceeds > 0
        ? ((evalB.aggregateResults.totalProceeds - evalA.aggregateResults.totalProceeds) / evalA.aggregateResults.totalProceeds) * 100
        : 0,
      coverageDelta: evalB.aggregateResults.coverage - evalA.aggregateResults.coverage,
      missionAwardsDelta: evalB.aggregateResults.missionAwards - evalA.aggregateResults.missionAwards,
      winnerChanges: evalA.poolResults.map(function(prA) {
        var prB = evalB.poolResults.find(function(p){return p.poolId === prA.poolId;});
        var changed = false;
        if (prA.winner && prB && prB.winner) changed = prA.winner.bidderId !== prB.winner.bidderId;
        else if ((prA.winner && !prB.winner) || (!prA.winner && prB.winner)) changed = true;
        return {
          poolId: prA.poolId,
          poolLabel: prA.label,
          winnerA: prA.winner ? prA.winner.bidderName : 'No award',
          winnerB: prB && prB.winner ? prB.winner.bidderName : 'No award',
          bidA: prA.winner ? prA.winner.bidPct : null,
          bidB: prB && prB.winner ? prB.winner.bidPct : null,
          changed: changed
        };
      })
    };
  }

  /* ========================================================================
     HELPERS
     ======================================================================== */

  function findSale(saleId) {
    if (!window.HSG_DATA || !window.HSG_DATA.sales) return null;
    return window.HSG_DATA.sales.find(function(s){return s.id === saleId;});
  }

  /* ========================================================================
     PUBLIC API
     ======================================================================== */
  return {
    defaultConfig: defaultConfig,
    getConfig: getConfig,
    saveConfig: saveConfig,
    resetConfig: resetConfig,
    saveScenario: saveScenario,
    listScenarios: listScenarios,
    deleteScenario: deleteScenario,
    evaluate: evaluate,
    compare: compare
  };
})();

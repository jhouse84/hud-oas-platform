import { getItem, query, TABLES } from '../../lib/ddb.mjs';
import { ok, badRequest, notFound, wrap, parseBody } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

export const handler = wrap(async (event) => {
  requireAdmin(event);
  const body = parseBody(event);
  if (!body.scenarioId) return badRequest('scenarioId required');

  const scenario = await getItem(TABLES.SCENARIOS, { scenarioId: body.scenarioId });
  if (!scenario) return notFound('Scenario');

  const sale = await getItem(TABLES.SALES, { saleId: scenario.saleId });
  if (!sale) return notFound('Sale');

  const bids = await query(TABLES.BIDS, {
    IndexName: 'bySale',
    KeyConditionExpression: '#s = :s',
    ExpressionAttributeNames: { '#s': 'saleId' },
    ExpressionAttributeValues: { ':s': scenario.saleId }
  });

  // BEM core: per-pool reserve filter, mission discount, tie-break
  const cfg = scenario.config || {};
  const reserves = cfg.reserves || {};
  const missionDiscount = Number(cfg.missionDiscountPct || 0);
  const awards = {};
  const conforming = bids.filter(b => b.status !== 'withdrawn' && b.conforming !== false);

  // Group by pool/deal
  const byKey = {};
  conforming.forEach(b => {
    const key = b.poolId || b.dealId;
    if (!key) return;
    (byKey[key] = byKey[key] || []).push(b);
  });

  Object.keys(byKey).forEach(key => {
    const candidates = byKey[key].slice();
    candidates.forEach(b => {
      const reserve = reserves[key];
      if (reserve != null) {
        const value = b.bidPct != null ? b.bidPct : b.bidAmountUSD;
        b._belowReserve = value < reserve;
      }
      // mission discount applied by adjusting the comparable score
      b._adjustedScore = (b.bidPct != null ? b.bidPct : b.bidAmountUSD) +
                         (b.missionBid ? missionDiscount : 0);
    });
    const eligible = candidates.filter(b => !b._belowReserve);
    eligible.sort((a, b) => b._adjustedScore - a._adjustedScore || (a.submittedAt || '').localeCompare(b.submittedAt || ''));
    if (eligible.length > 0) awards[key] = eligible[0];
  });

  const totalProceeds = Object.values(awards).reduce((sum, a) => sum + Number(a.bidAmountUSD || 0), 0);
  const coverageCount = Object.keys(awards).length;

  return ok({
    scenarioId: body.scenarioId,
    awards,
    summary: {
      coverageCount,
      totalProceeds,
      bidsEvaluated: conforming.length,
      poolsOrDeals: Object.keys(byKey).length
    },
    runAt: new Date().toISOString()
  });
});

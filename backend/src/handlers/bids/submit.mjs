import { getItem, putItem, updateItem, query, uid, TABLES } from '../../lib/ddb.mjs';
import { created, parseBody, wrap, forbidden, HttpError } from '../../lib/response.mjs';
import { validateBidSubmission } from '../../lib/schema.mjs';
import { requireBidderOrAdmin } from '../../lib/auth.mjs';
import { sendEmail } from '../../lib/ses.mjs';
import { portalForProgram, stampPortal } from '../../lib/portal.mjs';

/**
 * POST /bids — one validated bid FORM per submission.
 *
 * The bidder transmits percentages only; every dollar figure is derived here
 * from HUD-furnished basis values. The platform receipt and the sale's form
 * completion CODE are issued server-side on a fully valid form.
 *
 * Residential payload (HVLS / HNVLS / SFLS):
 *   { saleId, poolBids: [ { poolId, missionBid?, loans: [ { loanId, bidPct } ] } ] }
 *   Whole-pool participation: every loan in each bid pool must carry a valid %.
 *
 * Commercial payload (MHLS / HLS):
 *   { saleId, assetBids: [ { assetId, bidPct } ] }
 *   Each asset is independent; % applies to the asset's aggregate UPB.
 *
 * Rules (per the OAS configuration spec):
 *   - 5-decimal percentages; a literal 0 is invalid; derived BID $ ≥ $100.
 *   - HNVLS BID % capped at 175 (of ETD-adjusted BPO).
 *   - Basis values come from the tape as furnished — never recomputed.
 *   - In-window resubmission supersedes the bidder's prior bid on that
 *     pool/asset; the latest validated form governs at close.
 *   - Deposit per the sale's published terms: greater of the floor or the
 *     stated % of aggregate, rounded up; 50%-of-bid under the floor.
 */

const PCT_DECIMALS = 5;
const MIN_DERIVED_USD = 100;
const MAX_PCT_BY_PROGRAM = { HNVLS: 175 };

const roundPct = (n) => Math.round(Number(n) * 1e5) / 1e5;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

function basisField(programType) {
  if (programType === 'HNVLS') return 'etd_adjusted_bpo';
  if (programType === 'SFLS') return 'current_upb';
  return 'bpo_value'; // HVLS
}

function validatePct(raw, label, programType) {
  const n = Number(raw);
  if (raw == null || raw === '' || Number.isNaN(n)) {
    throw new HttpError(`${label}: BID % must be numeric`, 400, 'ValidationError');
  }
  if (n === 0) {
    throw new HttpError(`${label}: a bid of 0 is not valid — omit the row to decline`, 400, 'ValidationError');
  }
  if (n < 0) {
    throw new HttpError(`${label}: BID % must be positive`, 400, 'ValidationError');
  }
  const cap = MAX_PCT_BY_PROGRAM[programType];
  if (cap != null && n > cap) {
    throw new HttpError(`${label}: BID % exceeds the ${programType} maximum (${cap}%)`, 400, 'ValidationError');
  }
  return roundPct(n);
}

function depositFor(aggregate, terms = {}) {
  const rate = Number(terms.deposit_pct_of_aggregate_bid ?? 0.10);
  const floor = Number(terms.minimum_deposit_floor ?? 100000);
  const underRate = Number(terms.under_floor_pct ?? 0.50);
  const agg = Number(aggregate) || 0;
  if (agg <= 0) return 0;
  if (agg < floor) return Math.ceil(agg * underRate);
  return Math.max(floor, Math.ceil(agg * rate));
}

/** Mark the bidder's prior live bids on this pool/asset superseded (in-window revision). */
async function supersedePrior(bidderId, saleId, poolId, receiptId) {
  const prior = await query(TABLES.BIDS, {
    IndexName: 'byBidder',
    KeyConditionExpression: 'bidderId = :b',
    ExpressionAttributeValues: { ':b': bidderId }
  });
  const live = prior.filter(b => b.saleId === saleId && b.poolId === poolId && !b.withdrawn && b.status !== 'superseded');
  await Promise.all(live.map(b => updateItem(TABLES.BIDS, { bidId: b.bidId }, {
    status: 'superseded',
    supersededAt: new Date().toISOString(),
    supersededByReceipt: receiptId
  })));
}

export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const body = parseBody(event);
  validateBidSubmission(body);

  // Bidders submit only under their own identity
  const bidderId = me.isAdmin ? (body.bidderId || me.bidderId) : (me.bidderId || body.bidderId);
  if (!me.isAdmin && body.bidderId && body.bidderId !== me.bidderId) {
    return forbidden('Cannot submit bids for another bidder');
  }

  const bidder = await getItem(TABLES.BIDDERS, { bidderId });
  if (!bidder) throw new HttpError('Bidder not found', 404);
  if (!/Qualified|qualified/.test(bidder.qualificationStatus || bidder.status || '')) {
    return forbidden(`Bidder not qualified (current: ${bidder.qualificationStatus || bidder.status})`);
  }

  const sale = await getItem(TABLES.SALES, { saleId: body.saleId });
  if (!sale) throw new HttpError('Sale not found', 404);
  stampPortal(sale);
  const salePortal = sale.portal || portalForProgram(sale.programType || sale.program);
  if (!me.isSuperAdmin && bidder.portal && bidder.portal !== 'both' && salePortal && bidder.portal !== salePortal) {
    return forbidden(`Bidder qualified for ${bidder.portal}; sale is ${salePortal}`);
  }

  // Server clock + sale state are authoritative for the window
  const acceptingStates = new Set(['bid_window', 'Bid Window', 'active']);
  if (sale.state && !acceptingStates.has(sale.state) && !me.isAdmin) {
    return forbidden(`Bid window not open (sale state: ${sale.state})`);
  }

  const programType = sale.programType || sale.program;
  const pools = sale.pools || [];
  const poolById = new Map(pools.map(p => [p.pool_id || p.poolId, p]));
  const now = new Date().toISOString();
  const receiptId = uid('RCPT');
  const completionCode = sale.completion_code || sale.completionCode || null;

  const records = [];
  let totalUSD = 0;

  if (Array.isArray(body.poolBids) && body.poolBids.length) {
    // ---- Residential: loan-level %, whole-pool participation ----
    const loans = await query(TABLES.LOANS, {
      KeyConditionExpression: '#s = :s',
      ExpressionAttributeNames: { '#s': 'saleId' },
      ExpressionAttributeValues: { ':s': body.saleId }
    });
    const loanById = new Map(loans.map(l => [l.loan_id || l.loanId, l]));
    const bField = basisField(programType);

    for (const pb of body.poolBids) {
      const pool = poolById.get(pb.poolId);
      if (!pool) throw new HttpError(`Pool ${pb.poolId} not found on ${body.saleId}`, 400, 'ValidationError');
      const roster = pool.loan_ids || pool.loanIds || [];
      const entries = new Map((pb.loans || []).map(e => [e.loanId, e.bidPct]));

      const missing = roster.filter(id => !entries.has(id));
      if (missing.length) {
        throw new HttpError(
          `Pool ${pb.poolId}: whole-pool participation requires a BID % on every loan — missing ${missing.length} (${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''})`,
          400, 'ValidationError'
        );
      }
      const extras = [...entries.keys()].filter(id => !roster.includes(id));
      if (extras.length) {
        throw new HttpError(`Pool ${pb.poolId}: loans not on the pool roster: ${extras.slice(0, 5).join(', ')}`, 400, 'ValidationError');
      }

      const loanBids = [];
      let poolAgg = 0;
      for (const loanId of roster) {
        const loan = loanById.get(loanId);
        if (!loan) throw new HttpError(`Loan ${loanId} not found on ${body.saleId}`, 400, 'ValidationError');
        const pct = validatePct(entries.get(loanId), `Pool ${pb.poolId} · loan ${loanId}`, programType);
        const basis = Number(loan[bField]) || 0;
        if (!basis) throw new HttpError(`Loan ${loanId}: HUD basis value (${bField}) missing from the tape`, 500, 'DataError');
        const usd = round2((pct / 100) * basis);
        if (usd < MIN_DERIVED_USD) {
          throw new HttpError(`Pool ${pb.poolId} · loan ${loanId}: derived BID $${usd} is below the $${MIN_DERIVED_USD} minimum`, 400, 'ValidationError');
        }
        loanBids.push({ loanId, bidPct: pct, basis, bidUsd: usd });
        poolAgg = round2(poolAgg + usd);
      }

      totalUSD = round2(totalUSD + poolAgg);
      records.push({
        bidId: uid('BID'),
        saleId: body.saleId,
        portal: salePortal,
        poolId: pb.poolId,
        poolLabel: pool.pool_name || pb.poolId,
        bidderId,
        bidderName: bidder.entityName,
        programType,
        bidBasis: bField,
        loanBids,
        loanCount: loanBids.length,
        aggregateUsd: poolAgg,
        missionBid: !!pb.missionBid,
        receiptId,
        completionCode,
        status: 'live',
        conformingStatus: 'Conforming',
        withdrawn: false,
        timestamp: now,
        submittedBy: me.email || me.sub
      });
    }
  } else {
    // ---- Commercial: % of UPB per asset, each independent ----
    for (const ab of body.assetBids) {
      const pool = poolById.get(ab.assetId);
      if (!pool) throw new HttpError(`Asset ${ab.assetId} not found on ${body.saleId}`, 400, 'ValidationError');
      const pct = validatePct(ab.bidPct, `Asset ${ab.assetId}`, programType);
      const upb = Number(pool.summary && pool.summary.aggregate_upb) || Number(pool.aggregate_upb) || 0;
      if (!upb) throw new HttpError(`Asset ${ab.assetId}: aggregate UPB missing from the sale record`, 500, 'DataError');
      const usd = round2((pct / 100) * upb);
      if (usd < MIN_DERIVED_USD) {
        throw new HttpError(`Asset ${ab.assetId}: derived BID $${usd} is below the $${MIN_DERIVED_USD} minimum`, 400, 'ValidationError');
      }
      totalUSD = round2(totalUSD + usd);
      records.push({
        bidId: uid('BID'),
        saleId: body.saleId,
        portal: salePortal,
        poolId: ab.assetId,
        poolLabel: pool.pool_name || ab.assetId,
        bidderId,
        bidderName: bidder.entityName,
        programType,
        bidBasis: 'aggregate_upb',
        bidPct: pct,
        upb,
        aggregateUsd: usd,
        receiptId,
        completionCode,
        status: 'live',
        conformingStatus: 'Conforming',
        withdrawn: false,
        timestamp: now,
        submittedBy: me.email || me.sub
      });
    }
  }

  const depositUSD = depositFor(totalUSD, sale.deposit_terms);

  // In-window revision: latest validated form supersedes priors per pool/asset
  for (const r of records) {
    await supersedePrior(bidderId, body.saleId, r.poolId, receiptId);
  }
  for (const r of records) {
    r.totalFormUsd = totalUSD;
    r.depositUsd = depositUSD;
    await putItem(TABLES.BIDS, r);
  }

  // Receipt email — figures and CODE come from the validated form
  await sendEmail({
    to: bidder.contactEmail,
    subject: `Bid form received — ${body.saleId} · ${receiptId}`,
    text: `Your bid form for ${body.saleId} has been received and validated.\n\n` +
          `Receipt: ${receiptId}\n` +
          (completionCode ? `Form completion CODE: ${completionCode}\n` : '') +
          `Pools/assets bid: ${records.length}\n` +
          `Total (derived): $${totalUSD.toLocaleString()}\n` +
          `Deposit due per the BIP: $${depositUSD.toLocaleString()}\n\n` +
          `You may revise and resubmit any time before the bid window closes; the latest validated form governs at close.`
  });

  return created({
    receipt: {
      receiptId,
      completionCode,
      saleId: body.saleId,
      pools: records.map(r => ({ poolId: r.poolId, aggregateUsd: r.aggregateUsd })),
      totalUSD,
      depositUSD,
      submittedAt: now
    }
  });
});

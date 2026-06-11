import { getItem, putItem, uid, TABLES } from '../../lib/ddb.mjs';
import { created, parseBody, wrap, forbidden, HttpError } from '../../lib/response.mjs';
import { validateBidSubmission } from '../../lib/schema.mjs';
import { requireBidderOrAdmin } from '../../lib/auth.mjs';
import { sendEmail } from '../../lib/ses.mjs';
import { portalForProgram, stampPortal } from '../../lib/portal.mjs';

export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const body = parseBody(event);
  validateBidSubmission(body);

  // Bidders can only submit bids under their own bidderId
  const bidderId = me.isAdmin ? body.bidderId : (me.bidderId || body.bidderId);
  if (!me.isAdmin && bidderId !== me.bidderId) {
    return forbidden('Cannot submit bids for another bidder');
  }

  const bidder = await getItem(TABLES.BIDDERS, { bidderId });
  if (!bidder) throw new HttpError('Bidder not found', 404);
  if (!/Qualified|qualified/.test(bidder.qualificationStatus || bidder.status || '')) {
    return forbidden(`Bidder not qualified (current: ${bidder.qualificationStatus || bidder.status})`);
  }

  // Verify sale state allows bidding + portal scope matches bidder portal
  const sale = await getItem(TABLES.SALES, { saleId: body.saleId });
  if (!sale) throw new HttpError('Sale not found', 404);
  stampPortal(sale);
  const salePortal = sale.portal || portalForProgram(sale.programType || sale.program);
  if (!me.isSuperAdmin && bidder.portal && bidder.portal !== 'both' && salePortal && bidder.portal !== salePortal) {
    return forbidden(`Bidder qualified for ${bidder.portal}; sale is ${salePortal}`);
  }
  // Bid window enforcement (state machine: only state == 'bid_window' accepts bids)
  const acceptingStates = new Set(['bid_window', 'Bid Window', 'active']);
  if (sale.state && !acceptingStates.has(sale.state) && !me.isAdmin) {
    return forbidden(`Bid window not open (sale state: ${sale.state})`);
  }

  const now = new Date();
  const amt = Number(body.bidAmount);
  const unit = body.bidAmountUnit;
  let conforming = 'Conforming';
  if (!amt || amt <= 0) conforming = 'Non-Conforming';
  else if (/^% of/i.test(unit || '') && (amt < 20 || amt > 110)) conforming = 'Non-Conforming';

  const bid = {
    bidId: uid('BID'),
    saleId: body.saleId,
    portal: salePortal,
    poolId: body.poolId,
    poolLabel: body.poolLabel || body.poolId,
    bidderId,
    bidderName: bidder.entityName,
    bidAmount: amt,
    bidAmountUnit: unit,
    impliedDollarAmount: body.impliedDollarAmount || null,
    confirmationCode: body.confirmationCode || uid('CONF'),
    missionBid: !!body.missionBid,
    sandbox: !!body.sandbox,
    withdrawn: false,
    conformingStatus: conforming,
    timestamp: now.toISOString(),
    submittedBy: me.email || me.sub
  };

  await putItem(TABLES.BIDS, bid);

  // Confirmation email (skip for sandbox)
  if (!bid.sandbox) {
    await sendEmail({
      to: bidder.contactEmail,
      subject: `Bid received — ${bid.poolLabel} · ${bid.confirmationCode}`,
      text: `Your bid on ${bid.poolLabel} (${bid.saleId}) has been received. Amount: ${bid.bidAmount} ${bid.bidAmountUnit}. Confirmation: ${bid.confirmationCode}.`
    });
  }

  return created({ bid });
});

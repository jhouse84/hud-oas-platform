import { getItem, updateItem, putItem, uid, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, parseBody, wrap, forbidden, HttpError } from '../../lib/response.mjs';
import { requireBidderOrAdmin } from '../../lib/auth.mjs';
import { sendEmail } from '../../lib/ses.mjs';

/**
 * POST /bids/{bidId}/withdraw  { reason }
 *
 * Pre-close withdrawal (SB-05): a bidder may withdraw their own live bid while
 * the bid window is open. The record is retained for the audit trail — never
 * deleted — and the withdrawal reveals nothing about any other bid.
 * Admins may withdraw on a bidder's documented instruction.
 */
export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const bidId = event.pathParameters && event.pathParameters.bidId;
  if (!bidId) return notFound('Bid');
  const body = parseBody(event);
  const reason = (body.reason || '').slice(0, 500);
  if (!reason) throw new HttpError('A withdrawal reason is required', 400, 'ValidationError');

  const bid = await getItem(TABLES.BIDS, { bidId });
  if (!bid) return notFound('Bid');

  // Ownership: bidders may only withdraw their own bids.
  if (!me.isAdmin && bid.bidderId !== me.bidderId) {
    return forbidden('Cannot withdraw another bidder\'s bid');
  }
  if (bid.withdrawn) return ok({ bid, alreadyWithdrawn: true });
  if (bid.status === 'superseded') {
    throw new HttpError('This bid was superseded by a later submission — withdraw the live bid instead', 409, 'Conflict');
  }

  // Window enforcement: withdrawal is a bid action; it ends when the window ends.
  const sale = await getItem(TABLES.SALES, { saleId: bid.saleId });
  const acceptingStates = new Set(['bid_window', 'Bid Window', 'active']);
  if (sale && sale.state && !acceptingStates.has(sale.state) && !me.isAdmin) {
    return forbidden(`Bids are irrevocable once the window closes (sale state: ${sale.state})`);
  }

  const now = new Date().toISOString();
  const updated = await updateItem(TABLES.BIDS, { bidId }, {
    withdrawn: true,
    status: 'withdrawn',
    withdrawnAt: now,
    withdrawnBy: me.email || me.sub,
    withdrawalReason: reason
  });

  // Audit trail entry
  await putItem(TABLES.ACCESS, {
    accessId: uid('ACC'),
    bidderId: bid.bidderId,
    saleId: bid.saleId,
    action: 'bid-withdraw',
    docId: bidId,
    detail: reason,
    timestamp: now,
    actor: me.email || me.sub,
    ip: event.requestContext?.http?.sourceIp || null
  });

  // In-app notification + email confirmation to the bidder of record
  await putItem(TABLES.NOTIFICATIONS, {
    notifId: uid('NTF'),
    recipientId: bid.bidderId,
    type: 'bid-withdrawn',
    title: 'Bid withdrawn',
    message: `Your bid on ${bid.poolLabel || bid.poolId} (${bid.saleId}) was withdrawn. You may submit a new bid form any time before the window closes.`,
    createdAt: now
  });
  const bidder = await getItem(TABLES.BIDDERS, { bidderId: bid.bidderId });
  if (bidder && bidder.contactEmail) {
    await sendEmail({
      to: bidder.contactEmail,
      subject: `Bid withdrawn — ${bid.poolLabel || bid.poolId} · ${bid.saleId}`,
      text: `Your bid on ${bid.poolLabel || bid.poolId} (${bid.saleId}) was withdrawn at ${now}.\nReason: ${reason}\n\nYou may submit a new bid form any time before the bid window closes.`
    });
  }

  return ok({ bid: updated });
});

import { getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap, forbidden } from '../../lib/response.mjs';
import { requireBidderOrAdmin } from '../../lib/auth.mjs';

export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const bidderId = event.pathParameters?.bidderId;
  if (!bidderId) return notFound('Bidder');

  const bidder = await getItem(TABLES.BIDDERS, { bidderId });
  if (!bidder) return notFound('Bidder');

  // Bidders can only read their own record
  if (!me.isAdmin && bidder.bidderId !== me.bidderId && bidder.contactEmail !== me.email) {
    return forbidden('Cannot access another bidder\'s record');
  }

  // Portal-scoped admins can only see bidders in their portal
  if (me.isAdmin && !me.isSuperAdmin && bidder.portal && bidder.portal !== 'both' && bidder.portal !== me.portalScope) {
    return forbidden('Bidder belongs to a different portal');
  }

  return ok({ bidder });
});

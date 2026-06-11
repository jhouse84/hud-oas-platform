import { query, scanAll, TABLES } from '../../lib/ddb.mjs';
import { ok, wrap } from '../../lib/response.mjs';
import { requireBidderOrAdmin } from '../../lib/auth.mjs';
import { filterByPortal } from '../../lib/portal.mjs';

export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const qs = event.queryStringParameters || {};
  const portal = qs.portal || me.portalScope;

  let items = [];
  if (qs.saleId) {
    items = await query(TABLES.BIDS, {
      IndexName: 'bySale',
      KeyConditionExpression: 'saleId = :s',
      ExpressionAttributeValues: { ':s': qs.saleId },
      ScanIndexForward: false
    });
  } else if (qs.bidderId || !me.isAdmin) {
    const bidderId = me.isAdmin ? qs.bidderId : me.bidderId;
    items = await query(TABLES.BIDS, {
      IndexName: 'byBidder',
      KeyConditionExpression: 'bidderId = :b',
      ExpressionAttributeValues: { ':b': bidderId },
      ScanIndexForward: false
    });
  } else {
    items = await scanAll(TABLES.BIDS);
  }

  // Portal scope: super-admin sees all; admin-residential / commercial see scoped; bidder sees own
  if (!me.isSuperAdmin && portal && portal !== 'both') {
    items = filterByPortal(items, portal);
  }

  return ok({ bids: items, count: items.length });
});

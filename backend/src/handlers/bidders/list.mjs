import { scanAll, query, TABLES } from '../../lib/ddb.mjs';
import { ok, wrap } from '../../lib/response.mjs';
import { requireBidderOrAdmin } from '../../lib/auth.mjs';
import { filterByPortal } from '../../lib/portal.mjs';

export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const qs = event.queryStringParameters || {};
  const statusFilter = qs.status;
  const portalFilter = qs.portal || me.portalScope;

  let items;
  if (statusFilter) {
    items = await query(TABLES.BIDDERS, {
      IndexName: 'byStatus',
      KeyConditionExpression: '#s = :s',
      ExpressionAttributeNames: { '#s': 'qualificationStatus' },
      ExpressionAttributeValues: { ':s': statusFilter }
    });
  } else {
    items = await scanAll(TABLES.BIDDERS);
  }

  // Bidders only see their own record; admins see portal-scoped or all (super-admin)
  if (!me.isAdmin) {
    items = items.filter(b => b.bidderId === me.bidderId || b.contactEmail === me.email);
  } else if (!me.isSuperAdmin && portalFilter && portalFilter !== 'both') {
    items = filterByPortal(items, portalFilter);
  } else if (portalFilter && portalFilter !== 'both') {
    items = filterByPortal(items, portalFilter);
  }

  return ok({ bidders: items, count: items.length, portal: portalFilter });
});

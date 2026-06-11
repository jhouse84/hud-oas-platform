import { query, getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, wrap, notFound } from '../../lib/response.mjs';
import { requireBidderOrAdmin, requirePortalAccess } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const saleId = event.pathParameters?.saleId;
  if (!saleId) return notFound('Sale');

  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);

  const items = await query(TABLES.QA, {
    IndexName: 'bySale',
    KeyConditionExpression: 'saleId = :s',
    ExpressionAttributeValues: { ':s': saleId },
    ScanIndexForward: false
  });

  // Bidders only see: their own questions + publicly-visible answered questions
  let visible = items;
  if (!me.isAdmin) {
    visible = items.filter(q =>
      q.bidderId === me.bidderId ||
      (q.status === 'answered' && q.visibility === 'all')
    );
  }

  return ok({ saleId, qa: visible, count: visible.length });
});

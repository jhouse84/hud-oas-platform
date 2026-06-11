import { putItem, getItem, uid, TABLES } from '../../lib/ddb.mjs';
import { created, parseBody, wrap, notFound } from '../../lib/response.mjs';
import { validateQA } from '../../lib/schema.mjs';
import { requireBidderOrAdmin, requirePortalAccess } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const body = parseBody(event);
  validateQA(body);
  const saleId = event.pathParameters?.saleId;
  if (!saleId) return notFound('Sale');

  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);

  const now = new Date();

  const entry = {
    qaId: uid('QA'),
    saleId,
    portal: sale.portal,
    question: body.question,
    bidderId: me.bidderId || `admin:${me.sub}`,
    bidderName: me.entityName || 'Bidder (Anonymous)',
    askedBy: me.email || me.sub,
    askedAt: now.toISOString(),
    status: 'pending',
    answer: null,
    answeredAt: null,
    answeredBy: null,
    visibility: body.visibility || 'all'
  };

  await putItem(TABLES.QA, entry);
  return created({ qa: entry });
});

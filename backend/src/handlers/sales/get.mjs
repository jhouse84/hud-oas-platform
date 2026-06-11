import { getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap } from '../../lib/response.mjs';
import { requirePortalAccess } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

export const handler = wrap(async (event) => {
  const saleId = event.pathParameters && event.pathParameters.saleId;
  if (!saleId) return notFound('Sale');
  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);
  return ok({ sale });
});

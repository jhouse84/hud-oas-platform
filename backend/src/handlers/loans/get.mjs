import { getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap } from '../../lib/response.mjs';
import { requirePortalAccess } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

/**
 * GET /loans/{saleId}/{loanId}
 * Returns a single loan record (full SALD shape).
 */
export const handler = wrap(async (event) => {
  const { saleId, loanId } = event.pathParameters || {};
  if (!saleId || !loanId) return notFound('Loan');

  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);

  const loan = await getItem(TABLES.LOANS, { saleId, loanId });
  if (!loan) return notFound('Loan');

  return ok({ loan });
});

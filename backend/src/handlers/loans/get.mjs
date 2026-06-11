import { getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap } from '../../lib/response.mjs';
import { requirePortalAccess, requireQualifiedForSale } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

/**
 * GET /loans/{saleId}/{loanId}
 * Returns a single loan record (full SALD shape). Qualification-gated (QL-03).
 */
export const handler = wrap(async (event) => {
  const { saleId, loanId } = event.pathParameters || {};
  if (!saleId || !loanId) return notFound('Loan');

  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);
  await requireQualifiedForSale(event, sale, (id) => getItem(TABLES.BIDDERS, { bidderId: id }));

  const loan = await getItem(TABLES.LOANS, { saleId, loanId });
  if (!loan) return notFound('Loan');

  return ok({ loan });
});

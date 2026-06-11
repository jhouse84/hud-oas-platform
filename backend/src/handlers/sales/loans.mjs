import { query, getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap } from '../../lib/response.mjs';
import { requirePortalAccess } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

/**
 * GET /sales/{saleId}/loans
 *   ?poolId=...     filter by a pool's loan_ids array
 *   ?asset_class=Multifamily | Healthcare
 *   ?risk_flag=...
 *   ?loanIds=a,b,c  explicit list (comma-separated)
 *
 * Returns flat array of loans for the sale. Pool/deal definitions still come
 * from the sale record (sales/get and sales/pools).
 */
export const handler = wrap(async (event) => {
  const saleId = event.pathParameters && event.pathParameters.saleId;
  if (!saleId) return notFound('Sale');

  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);

  const items = await query(TABLES.LOANS, {
    KeyConditionExpression: '#s = :s',
    ExpressionAttributeNames: { '#s': 'saleId' },
    ExpressionAttributeValues: { ':s': saleId }
  });

  let loans = items;
  const qs = event.queryStringParameters || {};

  if (qs.poolId) {
    const pool = (sale.pools || []).find(p => (p.pool_id || p.poolId) === qs.poolId);
    const ids = (pool && (pool.loan_ids || pool.loanIds)) || [];
    loans = loans.filter(l => ids.includes(l.loan_id || l.loanId));
  }

  if (qs.loanIds) {
    const ids = qs.loanIds.split(',').filter(Boolean);
    loans = loans.filter(l => ids.includes(l.loan_id || l.loanId));
  }

  if (qs.asset_class) {
    loans = loans.filter(l => l.asset_class === qs.asset_class);
  }

  if (qs.risk_flag) {
    loans = loans.filter(l => (l.risk_flags || []).includes(qs.risk_flag));
  }

  return ok({ saleId, loans, count: loans.length });
});

import { getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap } from '../../lib/response.mjs';
import { requirePortalAccess, identity } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

/**
 * GET /sales/{saleId}/pools
 * Bidders receive the HUD-furnished offering data only. Reserve / floor /
 * BEM-related fields are admin work product and are stripped for non-admins
 * regardless of how they were stored (SB-04 / BE-01).
 */
const ADMIN_ONLY_KEY = /reserve|floor|bem/i;

function redactForBidder(pool) {
  const out = {};
  for (const k of Object.keys(pool)) {
    if (ADMIN_ONLY_KEY.test(k)) continue;
    out[k] = pool[k];
  }
  return out;
}

export const handler = wrap(async (event) => {
  const saleId = event.pathParameters && event.pathParameters.saleId;
  if (!saleId) return notFound('Sale');
  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);

  const me = identity(event);
  let pools = sale.pools || [];
  if (!me.isAdmin) pools = pools.map(redactForBidder);

  return ok({ saleId, pools, count: pools.length });
});

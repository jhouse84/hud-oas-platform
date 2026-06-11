import { getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap } from '../../lib/response.mjs';
import { requirePortalAccess, identity } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

/**
 * GET /sales/{saleId}
 * Non-admins receive the offering as published: reserve / floor / BEM fields
 * are stripped wherever they appear (SB-04 / BE-01), and the form completion
 * CODE stays server-side until it is earned on a validated submission.
 */
const ADMIN_ONLY_KEY = /reserve|floor|bem|completion_code|completionCode/i;

function redact(obj) {
  if (Array.isArray(obj)) return obj.map(redact);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) {
      if (ADMIN_ONLY_KEY.test(k)) continue;
      out[k] = redact(obj[k]);
    }
    return out;
  }
  return obj;
}

export const handler = wrap(async (event) => {
  const saleId = event.pathParameters && event.pathParameters.saleId;
  if (!saleId) return notFound('Sale');
  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);

  const me = identity(event);
  return ok({ sale: me.isAdmin ? sale : redact(sale) });
});

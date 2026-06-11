import { getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, forbidden, wrap } from '../../lib/response.mjs';
import { identity, requirePortalAccess } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

export const handler = wrap(async (event) => {
  const me = identity(event);
  const settlementId = event.pathParameters && event.pathParameters.settlementId;
  if (!settlementId) return notFound('Settlement');
  const item = await getItem(TABLES.SETTLEMENT, { awardId: settlementId });
  if (!item) return notFound('Settlement');
  stampPortal(item);
  requirePortalAccess(event, item);
  if (!me.isAdmin && item.bidderId !== me.bidderId) return forbidden();
  return ok({ settlement: item });
});

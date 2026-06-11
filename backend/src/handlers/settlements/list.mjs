import { scanAll, TABLES } from '../../lib/ddb.mjs';
import { ok, wrap } from '../../lib/response.mjs';
import { identity } from '../../lib/auth.mjs';
import { filterByPortal, stampPortal } from '../../lib/portal.mjs';

export const handler = wrap(async (event) => {
  const me = identity(event);
  const qs = event.queryStringParameters || {};
  const portal = qs.portal || me.portalScope;

  let items = await scanAll(TABLES.SETTLEMENT);
  items = items.map(stampPortal);

  if (portal && portal !== 'both') {
    items = filterByPortal(items, portal);
  }

  // Bidders only see their own settlements
  if (!me.isAdmin && me.bidderId) {
    items = items.filter(s => s.bidderId === me.bidderId);
  }

  if (qs.status) items = items.filter(s => s.status === qs.status);

  items.sort((a, b) => (a.expectedSettlementDate || '').localeCompare(b.expectedSettlementDate || ''));
  return ok({ settlements: items, count: items.length });
});

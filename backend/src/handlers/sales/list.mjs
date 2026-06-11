import { scanAll, TABLES } from '../../lib/ddb.mjs';
import { ok, wrap } from '../../lib/response.mjs';
import { identity } from '../../lib/auth.mjs';
import { filterByPortal, stampPortal, programsForPortal } from '../../lib/portal.mjs';

export const handler = wrap(async (event) => {
  const me = identity(event);
  const qs = event.queryStringParameters || {};
  const portal = qs.portal || me.portalScope;
  const status = qs.status;
  const programType = qs.programType;

  let items = await scanAll(TABLES.SALES);
  items = items.map(stampPortal);

  if (portal && portal !== 'both' && !me.isSuperAdmin) {
    items = filterByPortal(items, portal);
  } else if (portal && portal !== 'both') {
    items = filterByPortal(items, portal);
  }

  if (programType) {
    items = items.filter(s => s.programType === programType);
  } else if (portal && portal !== 'both') {
    const allowed = programsForPortal(portal);
    items = items.filter(s => allowed.includes(s.programType));
  }

  if (status) items = items.filter(s => s.status === status);

  // Bidders receive the offering as published — reserve / floor / BEM fields
  // and the unearned completion CODE stay server-side (SB-04 / BE-01).
  const ADMIN_ONLY_KEY = /reserve|floor|bem|completion_code|completionCode/i;
  const redact = (obj) => {
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
  };
  if (!me.isAdmin) items = items.map(redact);

  items.sort((a, b) => (b.bidDate || '').localeCompare(a.bidDate || ''));
  return ok({ sales: items, count: items.length, portal });
});

/**
 * Identity + RBAC for API Gateway v2 (HTTP API) Cognito JWT authorizer.
 *
 * Adds portal-aware checks on top of legacy admin/bidder roles. Each handler
 * should call requirePortalAccess() to enforce that the caller has rights to
 * the queried portal (via JWT custom:portalScope or admin-superuser group).
 */

const ADMIN_GROUPS = ['admin', 'admin-superuser', 'admin-residential', 'admin-commercial'];
const BIDDER_GROUPS = ['bidder', 'residential-bidder', 'commercial-bidder'];

export function identity(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  const rawGroups = claims['cognito:groups'] || '';
  const groups = Array.isArray(rawGroups)
    ? rawGroups
    : String(rawGroups).replace(/^\[|\]$/g, '').split(/[,\s]+/).filter(Boolean);

  const isAdmin = groups.some(g => ADMIN_GROUPS.includes(g));
  const isBidder = groups.some(g => BIDDER_GROUPS.includes(g));
  const isSuperAdmin = groups.includes('admin') || groups.includes('admin-superuser');
  const portalScope = claims['custom:portalScope'] || derivePortalFromGroups(groups);

  return {
    sub: claims.sub,
    email: claims.email,
    username: claims['cognito:username'] || claims.email,
    groups,
    bidderId: claims['custom:bidderId'] || null,
    entityName: claims['custom:entityName'] || null,
    portalScope,                        // 'residential' | 'commercial' | 'both' | null
    isAdmin,
    isBidder,
    isSuperAdmin
  };
}

function derivePortalFromGroups(groups) {
  if (groups.includes('admin') || groups.includes('admin-superuser')) return 'both';
  if (groups.includes('residential-bidder') || groups.includes('admin-residential')) return 'residential';
  if (groups.includes('commercial-bidder') || groups.includes('admin-commercial')) return 'commercial';
  return null;
}

export function requireAdmin(event) {
  const me = identity(event);
  if (!me.isAdmin) {
    const err = new Error('Admin access required');
    err.statusCode = 403; err.expose = true;
    throw err;
  }
  return me;
}

export function requireBidderOrAdmin(event) {
  const me = identity(event);
  if (!me.isAdmin && !me.isBidder) {
    const err = new Error('Authenticated bidder or admin required');
    err.statusCode = 403; err.expose = true;
    throw err;
  }
  return me;
}

/**
 * Enforce portal scope. Caller passes either a target portal explicitly
 * (e.g. derived from the request path) or a record with a `portal` field.
 *
 *   const me = requirePortalAccess(event, 'residential');
 *   const me = requirePortalAccess(event, { portal: sale.portal });
 *
 * Super-admins (`admin-superuser`) may access either portal.
 */
export function requirePortalAccess(event, target) {
  const me = identity(event);
  const portal = typeof target === 'string' ? target : (target && target.portal) || null;
  if (!portal) return me;

  if (me.isSuperAdmin || me.portalScope === 'both') return me;
  if (me.portalScope === portal) return me;

  const err = new Error(`Access denied: caller portal=${me.portalScope || 'none'}, requested=${portal}`);
  err.statusCode = 403; err.expose = true;
  throw err;
}

// Sale states at which qualified bidders may see sale-sensitive data (tape, VDR).
export const VDR_OPEN_STATES = new Set([
  'go_live', 'Go-Live', 'bid_window', 'Bid Window',
  'under_evaluation', 'Under evaluation', 'awarded', 'Awarded',
  'settling', 'Settling', 'post_sale', 'Post-sale'
]);

/**
 * Gate sale-sensitive data (loan tape, VDR) behind qualification (QL-03).
 * Admins pass freely. A non-admin bidder must be Qualified AND the sale must
 * be at an open state. Returns the identity on success; throws 403 otherwise.
 * `getBidder` is an async (bidderId) => bidderRecord (callers pass ddb getItem).
 */
export async function requireQualifiedForSale(event, sale, getBidder) {
  const me = identity(event);
  if (me.isAdmin) return me;
  if (!me.bidderId) {
    const err = new Error('Authenticated bidder required'); err.statusCode = 403; err.expose = true; throw err;
  }
  const bidder = await getBidder(me.bidderId);
  if (!bidder || !/Qualified/i.test(bidder.qualificationStatus || bidder.status || '')) {
    const err = new Error(`Qualification required before sale data access (current: ${bidder ? (bidder.qualificationStatus || bidder.status) : 'none'})`);
    err.statusCode = 403; err.expose = true; throw err;
  }
  if (sale && sale.state && !VDR_OPEN_STATES.has(sale.state)) {
    const err = new Error(`Sale data is not open (sale state: ${sale.state})`); err.statusCode = 403; err.expose = true; throw err;
  }
  return me;
}

/**
 * Derive portal from request — query string `?portal=` or path prefix.
 */
export function portalFromRequest(event) {
  const qs = event?.queryStringParameters || {};
  if (qs.portal && ['residential', 'commercial'].includes(qs.portal)) return qs.portal;
  const path = event?.rawPath || event?.requestContext?.http?.path || '';
  if (path.indexOf('/residential') >= 0) return 'residential';
  if (path.indexOf('/commercial') >= 0) return 'commercial';
  return null;
}

/**
 * Derive portal from a sale's programType.
 */
export function portalFromProgramType(programType) {
  if (!programType) return null;
  if (['HVLS', 'HNVLS', 'SFLS'].includes(programType)) return 'residential';
  if (['MHLS', 'HLS'].includes(programType)) return 'commercial';
  return null;
}

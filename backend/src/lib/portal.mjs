/**
 * Portal helpers — derive portal from program type, validate transitions,
 * filter records by portal scope.
 */

const RESIDENTIAL = ['HVLS', 'HNVLS', 'SFLS'];
const COMMERCIAL = ['MHLS', 'HLS'];

export function portalForProgram(programType) {
  if (!programType) return null;
  if (RESIDENTIAL.includes(programType)) return 'residential';
  if (COMMERCIAL.includes(programType)) return 'commercial';
  return null;
}

export function programsForPortal(portal) {
  if (portal === 'residential') return RESIDENTIAL.slice();
  if (portal === 'commercial')  return COMMERCIAL.slice();
  return RESIDENTIAL.concat(COMMERCIAL);
}

export function isValidPortal(p) {
  return p === 'residential' || p === 'commercial' || p === 'both';
}

/**
 * Filter a list of records by portal scope. Records are kept if:
 *   - record.portal matches scope, OR
 *   - scope is 'both', OR
 *   - record has no portal field (legacy / pre-migration data) and we're not enforcing
 */
export function filterByPortal(items, scope, opts = {}) {
  if (!scope || scope === 'both') return items;
  return (items || []).filter(item => {
    if (!item.portal) return !opts.strict;
    return item.portal === scope;
  });
}

/**
 * Stamp a portal onto an item if not already set, deriving from programType.
 */
export function stampPortal(item) {
  if (!item) return item;
  if (item.portal) return item;
  const p = portalForProgram(item.programType);
  if (p) item.portal = p;
  return item;
}

export const PORTALS = { RESIDENTIAL: 'residential', COMMERCIAL: 'commercial', BOTH: 'both' };

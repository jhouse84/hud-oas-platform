import { listObjects, BUCKETS } from '../../lib/s3.mjs';
import { ok, notFound, wrap, forbidden } from '../../lib/response.mjs';
import { getItem, TABLES } from '../../lib/ddb.mjs';
import { requireBidderOrAdmin, requirePortalAccess } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const saleId = event.pathParameters?.saleId;
  if (!saleId) return notFound('Sale');

  // Verify sale exists + caller portal scope matches
  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);

  // Bidders require Qualified status to list docs (and sale state must allow VDR access)
  if (!me.isAdmin) {
    const bidder = me.bidderId ? await getItem(TABLES.BIDDERS, { bidderId: me.bidderId }) : null;
    if (!bidder || !/Qualified|qualified/.test(bidder.qualificationStatus || bidder.status || '')) {
      return forbidden('Qualification required to access this data room');
    }
    // VDR access opens at Go-Live state and remains for the rest of the sale lifecycle
    const vdrOpenStates = new Set(['go_live', 'Go-Live', 'bid_window', 'Bid Window', 'under_evaluation', 'Under evaluation', 'awarded', 'Awarded', 'settling', 'Settling', 'post_sale', 'Post-sale']);
    if (sale.state && !vdrOpenStates.has(sale.state)) {
      return forbidden(`Data room is not open (sale state: ${sale.state})`);
    }
  }

  const prefix = `originals/${saleId}/`;
  const objects = await listObjects({ bucket: BUCKETS.DOCS, prefix });

  let docs = objects.map(o => ({
    docId:    o.Key,
    docKey:   o.Key.replace(prefix, ''),
    filename: o.Key.split('/').pop(),
    size:     o.Size,
    modified: o.LastModified
  }));

  // Admin-only documents live under originals/{saleId}/_admin/ (BEM, pricing,
  // bid-day, post-sale, borrower letters, anything unrecognized). They are never
  // listed to a bidder, only to staff.
  if (!me.isAdmin) docs = docs.filter(d => !/(^|\/)_admin(\/|$)/.test(d.docKey));

  return ok({ saleId, docs, count: docs.length });
});

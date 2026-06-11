import { presignDownload, BUCKETS } from '../../lib/s3.mjs';
import { getItem, putItem, uid, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, parseBody, wrap, forbidden } from '../../lib/response.mjs';
import { validatePresignDownload } from '../../lib/schema.mjs';
import { requireBidderOrAdmin, requirePortalAccess } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

/**
 * Returns a short-lived presigned URL to download a VDR document.
 * Logs the access attempt synchronously before returning the URL,
 * so every download is captured even if the bidder never actually pulls the bytes.
 */
export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const body = parseBody(event);
  validatePresignDownload(body);

  const { saleId, docKey } = body;

  // Verify sale exists + portal scope
  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);

  // Admins may download freely. Bidders must be Qualified to access a sale's VDR.
  if (!me.isAdmin) {
    if (!me.bidderId) return forbidden('Authenticated bidder required');
    const bidder = await getItem(TABLES.BIDDERS, { bidderId: me.bidderId });
    if (!bidder) return notFound('Bidder');
    if (!/Qualified/i.test(bidder.qualificationStatus || '')) {
      return forbidden(`Qualification required before data room access (current: ${bidder.qualificationStatus})`);
    }
  }

  // Prefer watermarked copy if one exists; fall back to original
  const userPrefix = me.isAdmin ? 'admin' : me.bidderId;
  const watermarkedKey = `watermarked/${saleId}/${userPrefix}/${docKey}`;
  const originalKey = `originals/${saleId}/${docKey}`;

  // Presign the original (watermarking happens on upload; per-bidder watermark is async-applied on-demand for future iteration)
  const url = await presignDownload({
    bucket: BUCKETS.DOCS,
    key: originalKey,
    expires: 300,
    contentDisposition: `attachment; filename="${docKey.split('/').pop()}"`
  });

  // Write access log (append-only)
  const now = new Date();
  const accessId = uid('ACC');
  await putItem(TABLES.ACCESS, {
    accessId,
    bidderId: me.bidderId || `admin:${me.sub}`,
    docId: originalKey,
    docKey,
    saleId,
    timestamp: now.toISOString(),
    action: 'presign-download',
    userAgent: event.headers?.['user-agent'] || null,
    ip: event.requestContext?.http?.sourceIp || null,
    email: me.email || null
  });

  return ok({ url, expiresIn: 300, accessId, watermarkedKey });
});

import { presignDownload, BUCKETS, headObject, s3, GetObjectCommand, PutObjectCommand } from '../../lib/s3.mjs';
import { getItem, putItem, uid, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, parseBody, wrap, forbidden, HttpError } from '../../lib/response.mjs';
import { validatePresignDownload } from '../../lib/schema.mjs';
import { requireBidderOrAdmin, requirePortalAccess } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';
import { stampPdf } from '../../lib/stamp.mjs';

/**
 * Returns a short-lived presigned URL to download a VDR document.
 *
 * Security posture (audit S-5 + presign finding):
 *   - docKey is validated: no traversal segments, no absolute paths, and the
 *     object must actually exist under this sale's originals/ prefix.
 *   - PDFs are watermarked PER BIDDER on demand — entity, bidder ID, email,
 *     and retrieval timestamp burned into every page — and the bidder receives
 *     the stamped copy, never the original. Non-PDFs pass through.
 *   - Every presign is access-logged (bidder, IP, UA) before the URL returns.
 */
export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const body = parseBody(event);
  validatePresignDownload(body);

  const { saleId, docKey } = body;

  // Key hygiene: relative segments, absolute paths, or escapes are rejected outright.
  if (/(^|[\\/])\.\.([\\/]|$)/.test(docKey) || docKey.startsWith('/') || docKey.startsWith('\\') || docKey.includes('watermarked/')) {
    throw new HttpError('Invalid document key', 400, 'ValidationError');
  }

  // Admin-only documents live under _admin/ and are never served to a bidder,
  // even by direct key. Staff (isAdmin) may retrieve them.
  if (!me.isAdmin && /(^|\/)_admin(\/|$)/.test(docKey)) {
    return forbidden('This document is not part of the bidder data room');
  }

  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);

  // Bidders must hold Qualified status for data-room access.
  let bidder = null;
  if (!me.isAdmin) {
    if (!me.bidderId) return forbidden('Authenticated bidder required');
    bidder = await getItem(TABLES.BIDDERS, { bidderId: me.bidderId });
    if (!bidder) return notFound('Bidder');
    if (!/Qualified/i.test(bidder.qualificationStatus || '')) {
      return forbidden(`Qualification required before data room access (current: ${bidder.qualificationStatus})`);
    }
  }

  // The document must exist under THIS sale's originals prefix.
  const originalKey = `originals/${saleId}/${docKey}`;
  const head = await headObject({ bucket: BUCKETS.DOCS, key: originalKey });
  if (!head) return notFound('Document');

  // Per-bidder watermark for PDFs; admins and non-PDFs get the original.
  let serveKey = originalKey;
  const isPdf = /\.pdf$/i.test(docKey);
  if (isPdf && !me.isAdmin) {
    const stampedKey = `watermarked/${saleId}/${me.bidderId}/${docKey}`;
    const existing = await headObject({ bucket: BUCKETS.DOCS, key: stampedKey });
    if (!existing) {
      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKETS.DOCS, Key: originalKey }));
      const chunks = [];
      for await (const c of obj.Body) chunks.push(c);
      const stampedAt = new Date().toISOString();
      const stamped = await stampPdf(Buffer.concat(chunks), {
        diagonal: `CONFIDENTIAL — ${bidder.entityName || me.bidderId}`,
        footerLines: [
          `Furnished under the ${saleId} Confidentiality Agreement to ${bidder.entityName || ''} (${me.bidderId}) — ${me.email || ''}`,
          `Retrieved ${stampedAt} · HUD OAS Transaction Platform · access-logged`
        ]
      });
      await s3.send(new PutObjectCommand({
        Bucket: BUCKETS.DOCS,
        Key: stampedKey,
        Body: stamped,
        ContentType: 'application/pdf',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: process.env.KMS_KEY_ID,
        Metadata: { 'source-key': originalKey, 'bidder-id': me.bidderId, 'stamped-at': stampedAt }
      }));
    }
    serveKey = stampedKey;
  }

  const url = await presignDownload({
    bucket: BUCKETS.DOCS,
    key: serveKey,
    expires: 300,
    contentDisposition: `attachment; filename="${docKey.split('/').pop()}"`
  });

  // Access log (append-only) — written before the URL is returned.
  const now = new Date();
  const accessId = uid('ACC');
  await putItem(TABLES.ACCESS, {
    accessId,
    bidderId: me.bidderId || `admin:${me.sub}`,
    docId: serveKey,
    docKey,
    saleId,
    timestamp: now.toISOString(),
    action: 'presign-download',
    watermarked: serveKey !== originalKey,
    userAgent: event.headers?.['user-agent'] || null,
    ip: event.requestContext?.http?.sourceIp || null,
    email: me.email || null
  });

  return ok({ url, expiresIn: 300, accessId, watermarked: serveKey !== originalKey });
});

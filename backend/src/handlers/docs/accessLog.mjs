import { putItem, uid, TABLES } from '../../lib/ddb.mjs';
import { created, parseBody, wrap } from '../../lib/response.mjs';
import { requireBidderOrAdmin } from '../../lib/auth.mjs';

/**
 * Explicit access log write — e.g., when the bidder actually downloads the file
 * after we presigned the URL, or when they view it in the preview modal.
 */
export const handler = wrap(async (event) => {
  const me = requireBidderOrAdmin(event);
  const body = parseBody(event);
  const now = new Date();

  const entry = {
    accessId: uid('ACC'),
    bidderId: me.bidderId || `admin:${me.sub}`,
    docId:    body.docId,
    docKey:   body.docKey || null,
    saleId:   body.saleId || null,
    action:   body.action || 'view',
    timestamp: now.toISOString(),
    userAgent: event.headers?.['user-agent'] || null,
    ip:        event.requestContext?.http?.sourceIp || null,
    email:     me.email || null,
    meta:      body.meta || null
  };

  await putItem(TABLES.ACCESS, entry);
  return created({ accessId: entry.accessId });
});

import { presignUpload, BUCKETS } from '../../lib/s3.mjs';
import { ok, parseBody, wrap } from '../../lib/response.mjs';
import { validatePresignUpload } from '../../lib/schema.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

/**
 * Admins upload original VDR documents.
 * Uploads go to `originals/{saleId}/{filename}` — triggers the watermark Lambda.
 */
export const handler = wrap(async (event) => {
  const me = requireAdmin(event);
  const body = parseBody(event);
  validatePresignUpload(body);

  const { saleId, filename, contentType } = body;

  // Sanitize path components
  const safeSale = String(saleId).replace(/[^A-Za-z0-9_-]/g, '_');
  const safeFile = String(filename).replace(/[^A-Za-z0-9._-]/g, '_');
  const key = `originals/${safeSale}/${safeFile}`;

  const url = await presignUpload({
    bucket: BUCKETS.DOCS,
    key,
    contentType: contentType || 'application/octet-stream',
    expires: 600,
    metadata: {
      'uploaded-by': me.email || me.sub,
      'sale-id': safeSale,
      'original-filename': safeFile
    }
  });

  return ok({
    url,
    key,
    expiresIn: 600,
    requiredHeaders: {
      'content-type': contentType || 'application/octet-stream',
      'x-amz-server-side-encryption': 'aws:kms',
      'x-amz-server-side-encryption-aws-kms-key-id': process.env.KMS_KEY_ID
    }
  });
});

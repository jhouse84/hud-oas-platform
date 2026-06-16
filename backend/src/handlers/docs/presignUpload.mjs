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

  const { saleId, filename, contentType, folder } = body;

  // Sanitize path components. An optional folder (up to two segments, e.g.
  // "Valuation" or "_admin/BEM & Pricing") lets the bulk importer organize the
  // data room by category. Traversal and odd chars are stripped.
  const safeSale = String(saleId).replace(/[^A-Za-z0-9_-]/g, '_');
  const safeFile = String(filename).replace(/[^A-Za-z0-9._-]/g, '_');
  const safeFolder = folder
    ? String(folder).split('/').map(s => s.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^_+(?!admin)|_+$/g, '')).filter(Boolean).slice(0, 2).join('/')
    : '';
  const key = safeFolder ? `originals/${safeSale}/${safeFolder}/${safeFile}` : `originals/${safeSale}/${safeFile}`;

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

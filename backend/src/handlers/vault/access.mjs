import { presignDownload, BUCKETS, s3, GetObjectCommand } from '../../lib/s3.mjs';
import { ok, parseBody, wrap, forbidden, badRequest } from '../../lib/response.mjs';

/**
 * Vault access — a shared-code gate over the private, KMS-encrypted historical
 * file set (s3://docs/vault/...). Internal-testing use only.
 *
 * The bucket is private (PAB all-on, presign-only). This endpoint has no Cognito
 * authorizer on purpose: access is gated by a shared code (env VAULT_CODE),
 * checked here in constant time. Files are never returned directly — only the
 * index and short-lived presigned GET URLs. Every access is logged.
 */
const CODE = process.env.VAULT_CODE || '';

function safeEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function readJson(key) {
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKETS.DOCS, Key: key }));
  const chunks = [];
  for await (const c of obj.Body) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export const handler = wrap(async (event) => {
  const body = parseBody(event);
  if (!CODE || !safeEq(String(body.code || ''), CODE)) return forbidden('Invalid access code');

  const action = body.action;

  if (action === 'index') {
    let index;
    try { index = await readJson('vault/_index.json'); }
    catch (e) { return ok({ files: [], note: 'The file index is not ready yet (upload in progress).' }); }
    return ok(index, { 'cache-control': 'no-store' });
  }

  if (action === 'url') {
    const rel = String(body.rel || '');
    if (!rel || /(^|[\\/])\.\.([\\/]|$)/.test(rel) || rel.startsWith('/') || rel.indexOf('\0') >= 0) {
      return badRequest('Invalid path');
    }
    const key = 'vault/' + rel;
    const url = await presignDownload({
      bucket: BUCKETS.DOCS, key, expires: 300,
      contentDisposition: 'inline; filename="' + rel.split('/').pop().replace(/"/g, '') + '"'
    });
    console.log('vault-access', JSON.stringify({
      rel, ip: event.requestContext?.http?.sourceIp || null,
      ua: (event.headers && event.headers['user-agent']) || null, at: new Date().toISOString()
    }));
    return ok({ url, expiresIn: 300 });
  }

  return badRequest('Unknown action');
});

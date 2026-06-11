/**
 * Minimal dependency-free input validator. Throws HttpError on failure.
 */
import { HttpError } from './response.mjs';

export function required(obj, keys) {
  const missing = keys.filter(k => obj[k] === undefined || obj[k] === null || obj[k] === '');
  if (missing.length > 0) {
    throw new HttpError(`Missing required fields: ${missing.join(', ')}`, 400, 'ValidationError');
  }
}

export function isEmail(v) {
  return typeof v === 'string' && /^\S+@\S+\.\S+$/.test(v);
}

export function clamp(n, min, max) {
  n = Number(n);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function sanitizeString(s, max = 500) {
  if (typeof s !== 'string') return '';
  return s.slice(0, max).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function validateBidderSubmission(body) {
  required(body, ['entityName', 'entityType', 'ein', 'uei', 'contactName', 'contactEmail', 'signerName', 'signature']);
  if (!isEmail(body.contactEmail)) {
    throw new HttpError('Invalid contact email', 400, 'ValidationError');
  }
  if (!Array.isArray(body.programTypes) || body.programTypes.length === 0) {
    throw new HttpError('At least one program type is required', 400, 'ValidationError');
  }
  if (body.signerName && body.signature &&
      body.signerName.trim().toLowerCase() !== body.signature.trim().toLowerCase()) {
    throw new HttpError('Signature must match signer name exactly', 400, 'ValidationError');
  }
}

export function validatePresignDownload(body) {
  required(body, ['saleId', 'docKey']);
}

export function validatePresignUpload(body) {
  required(body, ['saleId', 'filename']);
}

export function validateBidSubmission(body) {
  required(body, ['saleId', 'poolId', 'bidAmount', 'bidAmountUnit', 'bidderId']);
}

export function validateQA(body) {
  required(body, ['question']);
}

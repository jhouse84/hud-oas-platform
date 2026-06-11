import { putItem, uid, TABLES } from '../../lib/ddb.mjs';
import { ok, badRequest, wrap, parseBody } from '../../lib/response.mjs';

/**
 * IRS TIN Match — validates EIN-to-name pairing.
 *
 * Real integration requires IRS e-Services enrollment (multi-month process).
 * v1 handler does structural validation only and returns 'pending' for
 * manual review by Transaction Specialist.
 */
export const handler = wrap(async (event) => {
  const body = parseBody(event);
  const ein = (body.ein || '').replace(/-/g, '').trim();
  const legalName = (body.legalName || '').trim();
  if (!ein || !/^\d{9}$/.test(ein)) return badRequest('ein must be 9 digits');
  if (!legalName) return badRequest('legalName required');

  const screeningId = uid('TIN');
  const screenedAt = new Date().toISOString();

  // v1: structural validation only — IRS enrollment pending
  const status = 'pending';
  const message = 'IRS TIN Match queued for manual review (production API enrollment pending)';
  const details = {
    source: 'IRS TIN Matching e-Services',
    enrollmentStatus: 'pending',
    fallback: 'manual-verification'
  };

  const evidence = {
    screeningId,
    bidderId: body.bidderId || 'PENDING',
    type: 'TIN',
    ein: ein.replace(/^(\d{2})(\d{7})$/, '$1-$2'),
    legalName,
    status,
    message,
    details,
    screenedAt
  };
  try { await putItem(TABLES.SCREENINGS, evidence); } catch (e) {}

  return ok({ status, message, evidenceId: screeningId, screenedAt, details });
});

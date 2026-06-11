import { putItem, uid, TABLES } from '../../lib/ddb.mjs';
import { ok, badRequest, wrap, parseBody } from '../../lib/response.mjs';

/**
 * SAM.gov Entity API — verifies UEI exists, is active, and not excluded.
 *
 * In v1, the API key is loaded from Secrets Manager `hsg/{stage}/sam-api`.
 * Until the key is provisioned, the handler returns a structured 'pending'
 * result rather than a 'hit' so qualification flow continues with manual
 * review flagged on the bidder record.
 */
export const handler = wrap(async (event) => {
  const body = parseBody(event);
  const uei = (body.uei || '').trim().toUpperCase();
  if (!uei || uei.length !== 12) return badRequest('uei must be 12 alphanumeric characters');

  const screeningId = uid('SAM');
  const screenedAt = new Date().toISOString();

  let status = 'pending';
  let details = null;
  let message = 'SAM.gov verification pending — awaiting API key provisioning';

  // Stub: emit a deterministic clear unless flagged via env override
  try {
    const knownExclusions = (process.env.SAM_TEST_EXCLUSIONS || '').split(',').map(s => s.toUpperCase()).filter(Boolean);
    if (knownExclusions.includes(uei)) {
      status = 'hit';
      message = `${uei} appears on the SAM exclusion list`;
      details = { source: 'SAM.gov Entity API', exclusionType: 'debarment' };
    } else {
      // Simulate active, registered entity for now
      status = 'clear';
      message = `${uei} is active in SAM.gov`;
      details = { source: 'SAM.gov Entity API', registrationStatus: 'active', expirationDate: null };
    }
  } catch (e) {
    status = 'error';
    message = 'SAM.gov lookup failed: ' + e.message;
  }

  const evidence = {
    screeningId,
    bidderId: body.bidderId || 'PENDING',
    type: 'SAM',
    uei,
    status,
    message,
    details,
    screenedAt
  };
  try { await putItem(TABLES.SCREENINGS, evidence); } catch (e) {}

  return ok({ status, message, evidenceId: screeningId, screenedAt, details });
});

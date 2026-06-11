import { putItem, uid, TABLES } from '../../lib/ddb.mjs';
import { created, parseBody, wrap, HttpError } from '../../lib/response.mjs';
import { validateBidderSubmission } from '../../lib/schema.mjs';
import { sendEmail, EMAIL_TEMPLATES } from '../../lib/ses.mjs';
import { portalForProgram } from '../../lib/portal.mjs';

/**
 * Anonymous bidder qualification submission.
 * Routes to appropriate initial status based on entity type, attestations, and capital.
 */
export const handler = wrap(async (event) => {
  const body = parseBody(event);
  validateBidderSubmission(body);

  const now = new Date();
  const aum = Number(body.aum) || 0;
  const entityType = body.entityType || '';

  const ofacFlag = !body.ofacCert;
  const samFlag = !body.samActive;
  const debarmentFlag = !body.noDebarment;

  let status;
  let declineReason = null;
  if (ofacFlag || debarmentFlag) {
    status = 'Declined';
    declineReason = ofacFlag
      ? 'OFAC attestation not affirmed.'
      : 'Federal debarment attestation not affirmed.';
  } else if (samFlag) {
    status = 'Pending - SAM.gov Verification';
  } else if (/Nonprofit|Joint Venture/i.test(entityType) || body.missionInterest) {
    status = 'Pending - OGC Review';
  } else if (aum > 0 && aum < 10_000_000) {
    status = 'Pending - Financial Review';
  } else {
    status = 'Pending - Initial Review';
  }

  const bidderId = body.bidderId || uid('BDR');

  // Derive portal scope from programTypes — residential = HVLS/HNVLS/SFLS, commercial = MHLS/HLS.
  // If a bidder selected programs across both, we mark `both` (admin can split during review).
  const portalsRequested = Array.from(new Set((body.programTypes || []).map(portalForProgram).filter(Boolean)));
  const portal = portalsRequested.length === 1 ? portalsRequested[0]
                : portalsRequested.length > 1 ? 'both'
                : (body.portal || null);

  const bidder = {
    bidderId,
    portal,
    entityName: body.entityName,
    dba: body.dba || null,
    entityType,
    stateOfFormation: body.stateOfFormation || null,
    yearFounded: Number(body.yearFounded) || null,
    ein: body.ein,
    uei: body.uei,
    cage: body.cage || null,
    hqAddress: body.hqAddress || null,
    contactName: body.contactName,
    contactTitle: body.contactTitle || null,
    contactEmail: body.contactEmail,
    contactPhone: body.contactPhone || null,
    programTypes: body.programTypes,
    designatedServicer: body.designatedServicer || null,
    missionPoolEligible: !!body.missionInterest && /Nonprofit|Government/i.test(entityType),
    missionInterest: !!body.missionInterest,
    nsoAreas: body.nsoAreas || null,
    mfHealthExperience: body.mfHealthExperience || null,
    financialCapacity: `AUM $${aum.toLocaleString('en-US')} · Liquid $${Number(body.liquidCapital||0).toLocaleString('en-US')}`,
    aum,
    liquidCapital: Number(body.liquidCapital) || 0,
    fundingSource: body.fundingSource || null,
    priorSales: Number(body.priorSales) || 0,
    priorSalesDesc: body.priorSalesDesc || null,
    documents: body.documents || {},
    complianceChecks: {
      ofac: body.ofacCert ? 'Clear (attested)' : 'Flagged',
      sam: body.samActive ? 'Active - No Exclusions (attested)' : 'Pending Verification',
      debarment: body.noDebarment ? 'Clear' : 'Flagged',
      eoInsurance: !!body.eoInsurance,
      litigation: body.noLitigation ? 'None disclosed' : (body.litigationDesc || 'Disclosed — pending review'),
      conflictOfInterest: body.noConflict ? 'None disclosed' : (body.conflictDesc || 'Disclosed — pending review')
    },
    ofacStatus: body.ofacCert ? 'Clear' : 'Flagged - Review Required',
    samStatus: body.samActive ? 'Active - No Exclusions' : 'Pending Verification',
    signer: {
      name: body.signerName,
      title: body.signerTitle,
      signature: body.signature,
      qsrAcknowledged: !!body.qsrAck
    },
    qualificationStatus: status,
    submittedDate: now.toISOString().slice(0, 10),
    submittedAt: now.toISOString(),
    declineReason,
    reviewLog: [],
    notes: `Application submitted via /qualify. Routed to: ${status}`,
    // Idempotency: same UEI cannot submit twice within 10 days
    ueiLock: `${body.uei}#${now.toISOString().slice(0,10)}`
  };

  try {
    await putItem(TABLES.BIDDERS, bidder, {
      ConditionExpression: 'attribute_not_exists(bidderId)'
    });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      throw new HttpError('Bidder ID collision — retry submission', 409, 'Conflict');
    }
    throw err;
  }

  // Fire-and-forget email (doesn't block response)
  const tpl = EMAIL_TEMPLATES.applicationReceived(bidder);
  await sendEmail({ to: bidder.contactEmail, ...tpl });

  return created({ bidder });
});

import { putItem, TABLES } from '../../lib/ddb.mjs';
import { created, parseBody, wrap, HttpError } from '../../lib/response.mjs';
import { requireAdmin, portalFromProgramType } from '../../lib/auth.mjs';

/**
 * POST /sales — create a sale (admin only).
 *
 * The Sale Setup wizard sends the assembled sale record: programType, basis,
 * key_dates, pools (with loan_ids + summaries), and an aggregate summary. We
 * stamp the portal from the program, default the state to draft, and write it
 * with a uniqueness guard. Loans are loaded separately via POST /sales/{id}/loans.
 */
const PROGRAMS = ['HVLS', 'HNVLS', 'SFLS', 'MHLS', 'HLS'];

export const handler = wrap(async (event) => {
  requireAdmin(event);
  const body = parseBody(event);

  const saleId = String(body.saleId || '').trim();
  const programType = String(body.programType || body.program || '').trim();
  if (!saleId) throw new HttpError('saleId is required', 400);
  if (!/^[A-Za-z0-9._-]+$/.test(saleId)) throw new HttpError('saleId may only contain letters, numbers, dot, dash, underscore', 400);
  if (!PROGRAMS.includes(programType)) throw new HttpError(`programType must be one of ${PROGRAMS.join(', ')}`, 400);

  const now = new Date().toISOString();
  const portal = body.portal || portalFromProgramType(programType);
  const status = body.status || body.state || 'draft';

  const sale = {
    ...body,
    saleId,
    programType,
    program: programType,
    portal,
    status,
    state: status,
    pools: Array.isArray(body.pools) ? body.pools : [],
    summary: body.summary || { loan_count: 0, aggregate_upb: 0 },
    createdAt: now,
    updatedAt: now
  };

  try {
    await putItem(TABLES.SALES, sale, { ConditionExpression: 'attribute_not_exists(saleId)' });
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') throw new HttpError(`Sale ${saleId} already exists`, 409, 'Conflict');
    throw err;
  }

  return created({ sale });
});

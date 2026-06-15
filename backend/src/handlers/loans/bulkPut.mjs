import { getItem, batchPut, TABLES } from '../../lib/ddb.mjs';
import { ok, parseBody, notFound, wrap, HttpError } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

/**
 * POST /sales/{saleId}/loans — bulk-ingest a sale's loan tape (admin only).
 *
 * The LOANS table is keyed (saleId, loan_id). The wizard chunks large tapes
 * (~400/request); this handler BatchWrites in 25-item batches with retry.
 * Body: { loans: [ { loan_id, current_upb, ulb, bpo_value, ... }, ... ] }.
 */
const MAX_PER_REQUEST = 1000;

export const handler = wrap(async (event) => {
  requireAdmin(event);
  const saleId = event.pathParameters && event.pathParameters.saleId;
  if (!saleId) return notFound('Sale');

  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) throw new HttpError('Create the sale before loading its tape', 404, 'NotFound');

  const body = parseBody(event);
  const loans = Array.isArray(body.loans) ? body.loans : null;
  if (!loans || !loans.length) throw new HttpError('Body must include a non-empty loans array', 400);
  if (loans.length > MAX_PER_REQUEST) throw new HttpError(`Too many loans in one request (max ${MAX_PER_REQUEST}); chunk the upload`, 400);

  const seen = new Set();
  const items = [];
  for (const l of loans) {
    const loan_id = String(l.loan_id || l.loanId || '').trim();
    if (!loan_id) throw new HttpError('Every loan needs a loan_id', 400);
    if (seen.has(loan_id)) throw new HttpError(`Duplicate loan_id in payload: ${loan_id}`, 400);
    seen.add(loan_id);
    items.push({ ...l, saleId, loan_id, loanId: loan_id });
  }

  const count = await batchPut(TABLES.LOANS, items);
  return ok({ saleId, count });
});

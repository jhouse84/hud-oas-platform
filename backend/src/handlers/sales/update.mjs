import { getItem, updateItem, TABLES } from '../../lib/ddb.mjs';
import { ok, parseBody, notFound, wrap, HttpError } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

/**
 * PUT /sales/{saleId} — patch a sale (admin only).
 *
 * Used to advance a sale's state (draft → announced → … ), adjust key dates,
 * pools, basis, or deposit terms after creation. saleId itself is immutable.
 */
const MUTABLE = new Set([
  'status', 'state', 'sale_name', 'long_name', 'bid_basis', 'bidBasis', 'seller',
  'key_dates', 'bidDate', 'deposit_terms', 'pools', 'summary', 'completion_code',
  'portal', 'reserve', 'floor', 'bem'
]);

export const handler = wrap(async (event) => {
  requireAdmin(event);
  const saleId = event.pathParameters && event.pathParameters.saleId;
  if (!saleId) return notFound('Sale');

  const existing = await getItem(TABLES.SALES, { saleId });
  if (!existing) return notFound('Sale');

  const body = parseBody(event);
  const updates = {};
  for (const k of Object.keys(body)) {
    if (k === 'saleId') continue;            // immutable key
    if (MUTABLE.has(k)) updates[k] = body[k];
  }
  if (Object.keys(updates).length === 0) throw new HttpError('No mutable fields supplied', 400);
  updates.updatedAt = new Date().toISOString();
  // keep status/state mirrored when either is set
  if (updates.status && !updates.state) updates.state = updates.status;
  if (updates.state && !updates.status) updates.status = updates.state;

  const sale = await updateItem(TABLES.SALES, { saleId }, updates);
  return ok({ sale });
});

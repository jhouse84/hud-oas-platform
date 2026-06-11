import { getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

/**
 * GET /qc/{saleId}/{qcId}
 * Admin-only. Returns full QC finding including SALD-vs-OPIIS reconciliation.
 */
export const handler = wrap(async (event) => {
  requireAdmin(event);
  const { saleId, qcId } = event.pathParameters || {};
  if (!saleId || !qcId) return notFound('QC finding');
  const item = await getItem(TABLES.QC_FINDINGS, { saleId, qcId });
  if (!item) return notFound('QC finding');
  return ok({ finding: item });
});

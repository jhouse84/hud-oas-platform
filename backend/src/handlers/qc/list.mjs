import { query, getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap } from '../../lib/response.mjs';
import { identity, requirePortalAccess } from '../../lib/auth.mjs';
import { stampPortal } from '../../lib/portal.mjs';

/**
 * GET /sales/{saleId}/qc
 *   ?status=verified | verified_negative_noi | needs_review | missing_financials
 *
 * Returns QC findings for a sale. Bidders see status-only summaries (no SALD-vs-OPIIS
 * deltas); admins see the full payload.
 */
export const handler = wrap(async (event) => {
  const saleId = event.pathParameters && event.pathParameters.saleId;
  if (!saleId) return notFound('Sale');

  const sale = await getItem(TABLES.SALES, { saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);
  requirePortalAccess(event, sale);

  const me = identity(event);
  const qs = event.queryStringParameters || {};

  let items;
  if (qs.status) {
    items = await query(TABLES.QC_FINDINGS, {
      IndexName: 'bySaleAndStatus',
      KeyConditionExpression: '#s = :s AND #st = :st',
      ExpressionAttributeNames: { '#s': 'saleId', '#st': 'status' },
      ExpressionAttributeValues: { ':s': saleId, ':st': qs.status }
    });
  } else {
    items = await query(TABLES.QC_FINDINGS, {
      KeyConditionExpression: '#s = :s',
      ExpressionAttributeNames: { '#s': 'saleId' },
      ExpressionAttributeValues: { ':s': saleId }
    });
  }

  // Bidders get a redacted view; admins get full payload
  if (!me.isAdmin) {
    items = items.map(f => ({
      qc_id: f.qc_id, qcId: f.qcId,
      loan_id: f.loan_id, loanId: f.loanId,
      property_name: f.property_name,
      status: f.status,
      severity: f.severity,
      checked_at: f.checked_at
    }));
  }

  return ok({ saleId, findings: items, count: items.length });
});

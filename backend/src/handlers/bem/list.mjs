import { query, scanAll, TABLES } from '../../lib/ddb.mjs';
import { ok, wrap } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

export const handler = wrap(async (event) => {
  requireAdmin(event);
  const qs = event.queryStringParameters || {};
  let items;
  if (qs.saleId) {
    items = await query(TABLES.SCENARIOS, {
      IndexName: 'bySale',
      KeyConditionExpression: '#s = :s',
      ExpressionAttributeNames: { '#s': 'saleId' },
      ExpressionAttributeValues: { ':s': qs.saleId },
      ScanIndexForward: false
    });
  } else {
    items = await scanAll(TABLES.SCENARIOS);
  }
  return ok({ scenarios: items, count: items.length });
});

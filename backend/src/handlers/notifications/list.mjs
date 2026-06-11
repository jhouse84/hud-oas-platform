import { query, TABLES } from '../../lib/ddb.mjs';
import { ok, wrap } from '../../lib/response.mjs';
import { identity } from '../../lib/auth.mjs';

export const handler = wrap(async (event) => {
  const me = identity(event);
  const recipientId = me.bidderId || me.sub || me.email;
  if (!recipientId) return ok({ notifications: [], count: 0 });

  const items = await query(TABLES.NOTIFICATIONS, {
    IndexName: 'byRecipient',
    KeyConditionExpression: '#r = :r',
    ExpressionAttributeNames: { '#r': 'recipientId' },
    ExpressionAttributeValues: { ':r': recipientId },
    ScanIndexForward: false,
    Limit: 100
  });
  const unread = items.filter(n => !n.readAt).length;
  return ok({ notifications: items, count: items.length, unread });
});

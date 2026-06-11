import { getItem, putItem, query, TABLES } from '../../lib/ddb.mjs';
import { ok, wrap, notFound, parseBody } from '../../lib/response.mjs';
import { identity } from '../../lib/auth.mjs';

export const handler = wrap(async (event) => {
  const me = identity(event);
  const recipientId = me.bidderId || me.sub || me.email;
  const path = event.rawPath || (event.requestContext && event.requestContext.http && event.requestContext.http.path) || '';
  const isMarkAll = path.endsWith('/mark-all-read');

  if (isMarkAll) {
    const items = await query(TABLES.NOTIFICATIONS, {
      IndexName: 'byRecipient',
      KeyConditionExpression: '#r = :r',
      ExpressionAttributeNames: { '#r': 'recipientId' },
      ExpressionAttributeValues: { ':r': recipientId }
    });
    const now = new Date().toISOString();
    let updated = 0;
    for (const it of items) {
      if (!it.readAt) {
        it.readAt = now;
        await putItem(TABLES.NOTIFICATIONS, it);
        updated++;
      }
    }
    return ok({ markedRead: updated });
  }

  const notifId = event.pathParameters && event.pathParameters.notifId;
  if (!notifId) return notFound('Notification');
  const item = await getItem(TABLES.NOTIFICATIONS, { notifId });
  if (!item) return notFound('Notification');
  if (item.recipientId !== recipientId) return notFound('Notification');
  item.readAt = new Date().toISOString();
  await putItem(TABLES.NOTIFICATIONS, item);
  return ok({ notification: item });
});

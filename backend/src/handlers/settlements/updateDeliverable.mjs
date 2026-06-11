import { getItem, putItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap, parseBody } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

export const handler = wrap(async (event) => {
  const me = requireAdmin(event);
  const { settlementId, deliverableId } = event.pathParameters || {};
  const body = parseBody(event);
  if (!settlementId || !deliverableId) return notFound('Deliverable');

  const item = await getItem(TABLES.SETTLEMENT, { awardId: settlementId });
  if (!item) return notFound('Settlement');

  item.deliverables = item.deliverables || [];
  const d = item.deliverables.find(x => x.id === deliverableId);
  if (!d) return notFound('Deliverable');

  if (typeof body.completed === 'boolean') d.completed = body.completed;
  if (body.note) d.note = body.note;
  d.updatedAt = new Date().toISOString();
  d.updatedBy = me.email;

  item.updatedAt = new Date().toISOString();
  await putItem(TABLES.SETTLEMENT, item);
  return ok({ settlement: item });
});

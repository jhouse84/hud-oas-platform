import { getItem, putItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, badRequest, wrap, parseBody } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

export const handler = wrap(async (event) => {
  const me = requireAdmin(event);
  const { settlementId, idx } = event.pathParameters || {};
  const body = parseBody(event);
  if (!settlementId) return notFound('Settlement');
  const milestoneIdx = Number(idx);
  if (isNaN(milestoneIdx)) return badRequest('idx must be a number');

  const item = await getItem(TABLES.SETTLEMENT, { awardId: settlementId });
  if (!item) return notFound('Settlement');

  item.milestones = item.milestones || [];
  if (!item.milestones[milestoneIdx]) return notFound('Milestone');

  const m = item.milestones[milestoneIdx];
  if (typeof body.status === 'string') m.status = body.status;
  if (body.note) m.note = body.note;
  m.updatedAt = new Date().toISOString();
  m.updatedBy = me.email;

  item.updatedAt = new Date().toISOString();
  await putItem(TABLES.SETTLEMENT, item);
  return ok({ settlement: item });
});

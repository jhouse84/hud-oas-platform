import { getItem, updateItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, parseBody, wrap, HttpError } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

export const handler = wrap(async (event) => {
  const me = requireAdmin(event);
  const qaId = event.pathParameters?.qaId;
  const body = parseBody(event);
  if (!body.answer) throw new HttpError('Answer text required', 400);

  const entry = await getItem(TABLES.QA, { qaId });
  if (!entry) return notFound('Q&A entry');
  // Portal-scoped admins can only answer Q&As in their portal
  if (!me.isSuperAdmin && entry.portal && entry.portal !== me.portalScope) {
    return notFound('Q&A entry');
  }

  const updated = await updateItem(TABLES.QA, { qaId }, {
    answer: body.answer,
    answeredAt: new Date().toISOString(),
    answeredBy: me.email || 'Transaction Specialist',
    status: 'answered'
  });

  return ok({ qa: updated });
});

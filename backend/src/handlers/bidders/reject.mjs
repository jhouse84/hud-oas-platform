import { getItem, updateItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap, parseBody, HttpError } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';
import { sendEmail, EMAIL_TEMPLATES } from '../../lib/ses.mjs';

export const handler = wrap(async (event) => {
  const me = requireAdmin(event);
  const bidderId = event.pathParameters?.bidderId;
  const body = parseBody(event);
  if (!body.reason || body.reason.trim().length < 5) {
    throw new HttpError('A decline reason of at least 5 characters is required', 400);
  }

  const bidder = await getItem(TABLES.BIDDERS, { bidderId });
  if (!bidder) return notFound('Bidder');
  if (!me.isSuperAdmin && bidder.portal && bidder.portal !== 'both' && bidder.portal !== me.portalScope) {
    throw new HttpError('Cannot act on bidder in another portal', 403);
  }

  const now = new Date();
  const updated = await updateItem(TABLES.BIDDERS, { bidderId }, {
    qualificationStatus: 'Declined',
    declinedDate: now.toISOString().slice(0, 10),
    declinedAt: now.toISOString(),
    declineReason: body.reason,
    reviewLog: [
      ...(bidder.reviewLog || []),
      {
        action: 'declined',
        reviewer: me.email || 'admin',
        note: body.reason,
        timestamp: now.toISOString()
      }
    ]
  });

  const tpl = EMAIL_TEMPLATES.declined(updated, body.reason);
  await sendEmail({ to: bidder.contactEmail, ...tpl });

  return ok({ bidder: updated });
});

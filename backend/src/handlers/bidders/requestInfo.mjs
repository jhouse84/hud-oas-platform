import { getItem, updateItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap, parseBody, HttpError } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';
import { sendEmail, EMAIL_TEMPLATES } from '../../lib/ses.mjs';

export const handler = wrap(async (event) => {
  const me = requireAdmin(event);
  const bidderId = event.pathParameters?.bidderId;
  const body = parseBody(event);
  if (!body.note) throw new HttpError('Note describing what is needed is required', 400);

  const bidder = await getItem(TABLES.BIDDERS, { bidderId });
  if (!bidder) return notFound('Bidder');
  if (!me.isSuperAdmin && bidder.portal && bidder.portal !== 'both' && bidder.portal !== me.portalScope) {
    throw new HttpError('Cannot act on bidder in another portal', 403);
  }

  const now = new Date();
  const updated = await updateItem(TABLES.BIDDERS, { bidderId }, {
    qualificationStatus: 'Pending - Additional Info Requested',
    reviewLog: [
      ...(bidder.reviewLog || []),
      {
        action: 'info-requested',
        reviewer: me.email || 'admin',
        note: body.note,
        timestamp: now.toISOString()
      }
    ]
  });

  const tpl = EMAIL_TEMPLATES.infoRequested(updated, body.note);
  await sendEmail({ to: bidder.contactEmail, ...tpl });

  return ok({ bidder: updated });
});

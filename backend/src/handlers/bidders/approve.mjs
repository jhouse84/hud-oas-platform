import { getItem, updateItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap, parseBody } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';
import { sendEmail, EMAIL_TEMPLATES } from '../../lib/ses.mjs';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand
} from '@aws-sdk/client-cognito-identity-provider';

const cognito = new CognitoIdentityProviderClient({ region: process.env.REGION });

export const handler = wrap(async (event) => {
  const me = requireAdmin(event);
  const bidderId = event.pathParameters?.bidderId;
  const body = parseBody(event);

  const bidder = await getItem(TABLES.BIDDERS, { bidderId });
  if (!bidder) return notFound('Bidder');
  if (!me.isSuperAdmin && bidder.portal && bidder.portal !== 'both' && bidder.portal !== me.portalScope) {
    return notFound('Bidder');
  }

  const now = new Date();
  const updated = await updateItem(TABLES.BIDDERS, { bidderId }, {
    qualificationStatus: 'Qualified',
    approvedDate: now.toISOString().slice(0, 10),
    approvedAt: now.toISOString(),
    reviewLog: [
      ...(bidder.reviewLog || []),
      {
        action: 'approved',
        reviewer: me.email || 'admin',
        note: body.note || 'Approved via admin review',
        timestamp: now.toISOString()
      }
    ]
  });

  // Provision Cognito user with portal-scoped group + portalScope claim.
  // bidder.portal ∈ residential | commercial | both — set on /bidders create.
  const portal = bidder.portal || 'residential';
  const groupName = portal === 'commercial' ? 'commercial-bidder'
                  : portal === 'both' ? 'residential-bidder' // primary group; second added below
                  : 'residential-bidder';

  const userAttrs = [
    { Name: 'email', Value: bidder.contactEmail },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'given_name', Value: (bidder.contactName || '').split(' ')[0] || '' },
    { Name: 'family_name', Value: (bidder.contactName || '').split(' ').slice(1).join(' ') || '' },
    { Name: 'custom:bidderId', Value: bidder.bidderId },
    { Name: 'custom:entityName', Value: bidder.entityName },
    { Name: 'custom:portalScope', Value: portal }
  ];

  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: bidder.contactEmail,
      UserAttributes: userAttrs,
      DesiredDeliveryMediums: ['EMAIL']
    }));
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: bidder.contactEmail,
      GroupName: groupName
    }));
    // Cross-portal bidders get added to both groups
    if (portal === 'both') {
      await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: bidder.contactEmail,
        GroupName: 'commercial-bidder'
      }));
    }
  } catch (err) {
    if (err.name !== 'UsernameExistsException') {
      console.error('Cognito provisioning failed', { bidderId, error: err.message });
    }
  }

  const tpl = EMAIL_TEMPLATES.approved(updated);
  await sendEmail({ to: bidder.contactEmail, ...tpl });

  return ok({ bidder: updated });
});

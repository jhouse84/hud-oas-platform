/**
 * Provision a single qualified test-bidder Cognito user that can bid on every
 * sample sale across both portals.
 *
 *   AWS_PROFILE=hsg-hudoas BIDDER_EMAIL=jelani.house@gmail.com node scripts/provision-test-bidder.mjs
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminAddUserToGroupCommand, AdminGetUserCommand, AdminUpdateUserAttributesCommand } from '@aws-sdk/client-cognito-identity-provider';

const stage = (process.argv.find(a => a.startsWith('--stage=')) || '--stage=dev').split('=')[1];
const region = process.env.AWS_REGION || 'us-east-1';
const email = process.env.BIDDER_EMAIL || process.argv[2];
if (!email) { console.error('Pass BIDDER_EMAIL=foo@bar.com or arg'); process.exit(1); }

const USER_POOL_ID = 'us-east-1_Qg4tpC0jh';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), { marshallOptions: { removeUndefinedValues: true } });
const cognito = new CognitoIdentityProviderClient({ region });

function uid() { return 'BDR-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

async function main() {
  const bidderId = process.env.BIDDER_ID || uid();
  const now = new Date();
  const entityName = 'Test Bidder Capital, LLC';

  // 1. Bidder record — qualified, both-portal scope
  const bidder = {
    bidderId: bidderId,
    portal: 'both',
    entityName: entityName,
    entityType: 'Limited Liability Company',
    stateOfFormation: 'DE',
    yearFounded: 2024,
    ein: '88-8888888',
    uei: 'TESTBIDR12345',
    cage: null,
    contactName: 'Test Bidder',
    contactTitle: 'Managing Director',
    contactEmail: email,
    contactPhone: '(555) 555-0100',
    programTypes: ['HVLS', 'HNVLS', 'SFLS', 'MHLS', 'HLS'],
    aum: 250_000_000,
    liquidCapital: 50_000_000,
    financialCapacity: 'AUM $250,000,000 · Liquid $50,000,000',
    designatedServicer: 'Compu-Link Corporation (CELINK)',
    missionPoolEligible: false,
    missionInterest: false,
    complianceChecks: {
      ofac: 'Clear (attested)',
      sam: 'Active - No Exclusions (attested)',
      debarment: 'Clear',
      eoInsurance: true,
      litigation: 'None disclosed',
      conflictOfInterest: 'None disclosed'
    },
    ofacStatus: 'Clear',
    samStatus: 'Active - No Exclusions',
    qualificationStatus: 'Qualified',
    submittedDate: now.toISOString().slice(0, 10),
    submittedAt: now.toISOString(),
    approvedDate: now.toISOString().slice(0, 10),
    approvedAt: now.toISOString(),
    reviewLog: [{ action: 'approved', reviewer: 'system', note: 'Provisioned for end-to-end test', timestamp: now.toISOString() }],
    notes: 'Test bidder — qualified for all 5 programs, dual-portal scope.'
  };

  console.log('1. Writing bidder record ' + bidderId + '...');
  await ddb.send(new PutCommand({ TableName: 'hsg-' + stage + '-bidders', Item: bidder }));
  console.log('   OK');

  // 2. Cognito user — create or update
  let cognitoExists = false;
  try {
    await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: email }));
    cognitoExists = true;
  } catch (e) {
    if (e.name !== 'UserNotFoundException') throw e;
  }

  if (cognitoExists) {
    console.log('2. Cognito user already exists — updating attributes…');
    await cognito.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'custom:bidderId', Value: bidderId },
        { Name: 'custom:entityName', Value: entityName },
        { Name: 'custom:portalScope', Value: 'both' }
      ]
    }));
    console.log('   OK');
  } else {
    console.log('2. Creating Cognito user ' + email + '…');
    const tempPassword = 'HUD-Test-' + Math.random().toString(36).slice(2, 8) + '!A1';
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'given_name', Value: 'Jelani' },
        { Name: 'family_name', Value: 'House' },
        { Name: 'custom:bidderId', Value: bidderId },
        { Name: 'custom:entityName', Value: entityName },
        { Name: 'custom:portalScope', Value: 'both' }
      ],
      DesiredDeliveryMediums: ['EMAIL'],
      TemporaryPassword: tempPassword,
      MessageAction: 'SUPPRESS' // We'll surface the temp password directly so the user doesn't have to wait for the inviter email
    }));
    console.log('   OK');
    console.log('   TEMP_PASSWORD: ' + tempPassword);
  }

  // 3. Add to both portal groups
  console.log('3. Adding to residential-bidder + commercial-bidder groups…');
  for (const groupName of ['residential-bidder', 'commercial-bidder']) {
    try {
      await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID, Username: email, GroupName: groupName
      }));
      console.log('   ' + groupName + ' OK');
    } catch (e) {
      if (e.name === 'ResourceNotFoundException') console.warn('   group ' + groupName + ' not found');
      else throw e;
    }
  }

  console.log('');
  console.log('Test bidder provisioned. Sign in: https://d1cinbd36524ob.cloudfront.net/commercial/login.html');
  console.log('Email:    ' + email);
  console.log('BidderId: ' + bidderId);
}

main().catch(function (err) { console.error(err); process.exit(1); });

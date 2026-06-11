/**
 * One-shot: stamp the spec fields onto LIVE dev data without a reseed.
 *   - Every demo sale gets its form completion CODE + full deposit terms
 *     (floor / rate / under-floor percentage).
 *   - HNVLS loans get the HUD-furnished ETD-adjusted BPO basis
 *     (bpo × (1 − 0.0075 × ETD months), rounded — the tape value bids derive from).
 *
 *   AWS_PROFILE=hsg-hudoas node scripts/patch-spec-fields.mjs [--stage=dev]
 *
 * Idempotent: re-running rewrites the same values.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const stage = (process.argv.find(a => a.startsWith('--stage=')) || '--stage=dev').split('=')[1];
const region = process.env.AWS_REGION || 'us-east-1';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true }
});

const SALES_TBL = `hsg-${stage}-sales`;
const LOANS_TBL = `hsg-${stage}-loans`;

const COMPLETION_CODES = {
  'HVLS-2026-DEMO': 'HVLS26D742',
  'HNVLS-2026-DEMO': 'HNVLS26D851',
  'SFLS-2026-DEMO': 'SFLS26D119',
  'MHLS-2026-DEMO': 'MHLS26DMF63',
  'HLS-2026-DEMO': 'HLS26DHC84'
};

async function main() {
  // Sales: completion CODE + deposit terms
  const sales = (await ddb.send(new ScanCommand({ TableName: SALES_TBL }))).Items || [];
  for (const s of sales) {
    const code = COMPLETION_CODES[s.saleId];
    if (!code) { console.log(`skip ${s.saleId} (no code mapped)`); continue; }
    const terms = Object.assign(
      { minimum_deposit_floor: 100000, deposit_pct_of_aggregate_bid: 0.10 },
      s.deposit_terms || {},
      { under_floor_pct: 0.50 }
    );
    await ddb.send(new UpdateCommand({
      TableName: SALES_TBL,
      Key: { saleId: s.saleId },
      UpdateExpression: 'SET completion_code = :c, deposit_terms = :d',
      ExpressionAttributeValues: { ':c': code, ':d': terms }
    }));
    console.log(`sale ${s.saleId}: completion_code=${code}, deposit_terms upgraded`);
  }

  // HNVLS loans: ETD-adjusted BPO basis
  const loans = (await ddb.send(new QueryCommand({
    TableName: LOANS_TBL,
    KeyConditionExpression: 'saleId = :s',
    ExpressionAttributeValues: { ':s': 'HNVLS-2026-DEMO' }
  }))).Items || [];
  let patched = 0;
  for (const l of loans) {
    if (!l.bpo_value || l.estimated_time_to_disposition_months == null) continue;
    const adj = Math.round(l.bpo_value * (1 - 0.0075 * l.estimated_time_to_disposition_months));
    await ddb.send(new UpdateCommand({
      TableName: LOANS_TBL,
      Key: { saleId: l.saleId, loanId: l.loanId },
      UpdateExpression: 'SET etd_adjusted_bpo = :v',
      ExpressionAttributeValues: { ':v': adj }
    }));
    patched++;
  }
  console.log(`HNVLS loans patched with etd_adjusted_bpo: ${patched}/${loans.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });

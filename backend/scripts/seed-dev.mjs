/**
 * Wipe-and-reseed the dev DDB tables from commercial-seed-data.json.
 *
 * Idempotent: each run wipes the four target tables (in safe order) then
 * loads the seed package fresh. Bidder records are stamped with `portal:
 * 'commercial'`. Loans are stamped with `{saleId, loanId, portal}` keys.
 * QC findings get `{saleId, qcId}`.
 *
 *   AWS_PROFILE=hsg-hudoas node scripts/seed-dev.mjs [--stage=dev]
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stage = (process.argv.find(a => a.startsWith('--stage=')) || '--stage=dev').split('=')[1];
const region = process.env.AWS_REGION || 'us-east-1';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false }
});

const TABLES = {
  sales:       `hsg-${stage}-sales`,
  loans:       `hsg-${stage}-loans`,
  bidders:     `hsg-${stage}-bidders`,
  qc_findings: `hsg-${stage}-qc-findings`
};

const KEYS = {
  sales:       ['saleId'],
  loans:       ['saleId', 'loanId'],
  bidders:     ['bidderId'],
  qc_findings: ['saleId', 'qcId']
};

async function wipe(tableName, keyAttrs) {
  let total = 0;
  let exclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey: exclusiveStartKey }));
    const items = res.Items || [];
    for (const item of items) {
      const Key = Object.fromEntries(keyAttrs.map(k => [k, item[k]]));
      // Skip rows missing key attributes (legacy / corrupt)
      if (keyAttrs.some(k => Key[k] === undefined)) continue;
      await ddb.send(new DeleteCommand({ TableName: tableName, Key }));
      total++;
    }
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);
  if (total > 0) console.log(`  wiped ${total} from ${tableName}`);
}

async function batchWrite(tableName, items) {
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25).map(Item => ({ PutRequest: { Item } }));
    let req = { RequestItems: { [tableName]: batch } };
    let attempts = 0;
    do {
      const res = await ddb.send(new BatchWriteCommand(req));
      const unprocessed = res.UnprocessedItems && res.UnprocessedItems[tableName];
      if (!unprocessed || unprocessed.length === 0) break;
      req = { RequestItems: { [tableName]: unprocessed } };
      attempts++;
      if (attempts > 5) throw new Error(`Too many retries on ${tableName}`);
      await new Promise(r => setTimeout(r, 200 * attempts));
    } while (true);
    console.log(`  wrote ${batch.length} → ${tableName}`);
  }
}

function normalizeSale(s) {
  // Map JSON underscore-keys to platform's camelCase keys where the table expects them.
  // Existing handlers read `saleId`, `programType`, `status`, etc. — keep the SALD shape
  // alongside camelCase aliases for forward compatibility.
  return {
    ...s,
    saleId:      s.sale_id || s.saleId,
    programType: s.program || s.programType,
    name:        s.sale_name || s.name,
    status:      s.state || s.status,
    portal:      s.portal || 'commercial',
    aggregateValue: (s.summary && s.summary.aggregate_upb) || s.aggregateValue,
    poolCount:      (s.summary && s.summary.pool_count) || (s.pools || []).length,
    bidDate:        (s.key_dates && s.key_dates.bid_day) || s.bidDate,
    qualificationDeadline: (s.key_dates && s.key_dates.qualification_closes) || s.qualificationDeadline
  };
}

function normalizeLoan(l, saleId) {
  return {
    ...l,
    saleId: saleId,
    loanId: l.loan_id || l.loanId,
    portal: 'commercial'
  };
}

function normalizeBidder(b) {
  // Map seed's snake_case to bidders table's camelCase keys.
  return {
    ...b,
    bidderId:     b.bidder_id || b.bidderId,
    entityName:   b.entity_name || b.entityName,
    entityType:   b.entity_type || b.entityType,
    portal:       b.portal || 'commercial',
    contactName:  (b.primary_contact && b.primary_contact.name) || b.contactName,
    contactEmail: (b.primary_contact && b.primary_contact.email) || b.contactEmail,
    contactPhone: (b.primary_contact && b.primary_contact.phone) || b.contactPhone,
    contactTitle: (b.primary_contact && b.primary_contact.title) || b.contactTitle,
    qualificationStatus: mapStatusToLegacy(b.status),
    submittedAt:  b.submitted_at || b.submittedAt,
    declineReason: b.rejection_reason || b.declineReason,
    reviewLog:    b.reviewLog || []
  };
}

function mapStatusToLegacy(status) {
  // Seed uses lowercase 'qualified' / 'under_review' / 'rejected'; legacy handlers
  // expect Title-cased phrases like "Qualified" / "Pending - OGC Review" / "Declined".
  const map = {
    qualified:    'Qualified',
    under_review: 'Pending - Initial Review',
    rejected:     'Declined',
    pending:      'Pending - Initial Review',
    submitted:    'Pending - Initial Review'
  };
  return map[String(status || '').toLowerCase()] || status;
}

function normalizeQc(q, saleId) {
  return {
    ...q,
    saleId: saleId,
    qcId:   q.qc_id || q.qcId,
    loanId: q.loan_id || q.loanId,
    portal: 'commercial'
  };
}

async function main() {
  const seedPath = path.join(__dirname, 'commercial-seed-data.json');
  console.log(`Loading seed: ${seedPath}`);
  const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'));
  const tables = seed.tables || {};

  console.log(`Stage: ${stage}  Region: ${region}`);

  // Wipe in safe order (qc + loans + bidders before sales)
  console.log('Wiping target tables…');
  await wipe(TABLES.qc_findings, KEYS.qc_findings);
  await wipe(TABLES.loans,       KEYS.loans);
  await wipe(TABLES.bidders,     KEYS.bidders);
  await wipe(TABLES.sales,       KEYS.sales);

  // Reseed
  console.log('Reseeding…');
  if (tables.sales && tables.sales.length) {
    await batchWrite(TABLES.sales, tables.sales.map(normalizeSale));
  }

  if (tables.loans && tables.loans.length) {
    // Determine the saleId — seed JSON has loans flat without saleId; the seed is one-sale (MHLS-2026-DEMO)
    const saleId = (tables.sales && tables.sales[0] && (tables.sales[0].sale_id || tables.sales[0].saleId)) || 'MHLS-2026-DEMO';
    await batchWrite(TABLES.loans, tables.loans.map(l => normalizeLoan(l, saleId)));
  }

  if (tables.bidders && tables.bidders.length) {
    await batchWrite(TABLES.bidders, tables.bidders.map(normalizeBidder));
  }

  if (tables.qc_findings && tables.qc_findings.length) {
    const saleId = (tables.sales && tables.sales[0] && (tables.sales[0].sale_id || tables.sales[0].saleId)) || 'MHLS-2026-DEMO';
    await batchWrite(TABLES.qc_findings, tables.qc_findings.map(q => normalizeQc(q, saleId)));
  }

  console.log('Seed complete:');
  console.log(JSON.stringify(seed.stats || {}, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });

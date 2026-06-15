import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
  BatchWriteCommand
} from '@aws-sdk/lib-dynamodb';

const raw = new DynamoDBClient({ region: process.env.REGION || process.env.AWS_REGION });
export const ddb = DynamoDBDocumentClient.from(raw, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false }
});

export async function getItem(TableName, Key) {
  const res = await ddb.send(new GetCommand({ TableName, Key }));
  return res.Item ?? null;
}

export async function putItem(TableName, Item, opts = {}) {
  await ddb.send(new PutCommand({ TableName, Item, ...opts }));
  return Item;
}

export async function updateItem(TableName, Key, updates, opts = {}) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return null;
  const set = [];
  const ExpressionAttributeNames = {};
  const ExpressionAttributeValues = {};
  keys.forEach((k, i) => {
    set.push(`#k${i} = :v${i}`);
    ExpressionAttributeNames[`#k${i}`] = k;
    ExpressionAttributeValues[`:v${i}`] = updates[k];
  });
  const res = await ddb.send(new UpdateCommand({
    TableName,
    Key,
    UpdateExpression: 'SET ' + set.join(', '),
    ExpressionAttributeNames,
    ExpressionAttributeValues,
    ReturnValues: 'ALL_NEW',
    ...opts
  }));
  return res.Attributes;
}

export async function query(TableName, opts) {
  const res = await ddb.send(new QueryCommand({ TableName, ...opts }));
  return res.Items ?? [];
}

export async function scanAll(TableName, opts = {}) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({ TableName, ExclusiveStartKey, ...opts }));
    if (res.Items) items.push(...res.Items);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

export async function deleteItem(TableName, Key) {
  await ddb.send(new DeleteCommand({ TableName, Key }));
}

/**
 * Bulk-put items in 25-item batches, retrying UnprocessedItems with backoff.
 * Returns the count written. Used by tape ingestion (hundreds–thousands of loans).
 */
export async function batchPut(TableName, items) {
  let written = 0;
  for (let i = 0; i < items.length; i += 25) {
    let batch = items.slice(i, i + 25).map(Item => ({ PutRequest: { Item } }));
    let attempt = 0;
    while (batch.length) {
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [TableName]: batch } }));
      const unprocessed = (res.UnprocessedItems && res.UnprocessedItems[TableName]) || [];
      written += batch.length - unprocessed.length;
      batch = unprocessed;
      if (batch.length) {
        attempt += 1;
        if (attempt > 6) throw new Error(`BatchWrite could not drain ${batch.length} items after retries`);
        await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)));
      }
    }
  }
  return written;
}

export function uid(prefix = 'ID') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const TABLES = {
  BIDDERS:       process.env.TBL_BIDDERS,
  BIDS:          process.env.TBL_BIDS,
  QA:            process.env.TBL_QA,
  ACCESS:        process.env.TBL_ACCESS,
  SALES:         process.env.TBL_SALES,
  SETTLEMENT:    process.env.TBL_SETTLEMENT,
  SCENARIOS:     process.env.TBL_SCENARIOS,
  NOTIFICATIONS: process.env.TBL_NOTIFICATIONS,
  SCREENINGS:    process.env.TBL_SCREENINGS,
  LOANS:         process.env.TBL_LOANS,
  QC_FINDINGS:   process.env.TBL_QC_FINDINGS
};

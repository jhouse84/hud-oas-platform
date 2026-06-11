import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand
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

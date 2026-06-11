import { putItem, getItem, uid, TABLES } from '../../lib/ddb.mjs';
import { ok, created, badRequest, notFound, wrap, parseBody } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

export const handler = wrap(async (event) => {
  const me = requireAdmin(event);
  const body = parseBody(event);
  const pathScenarioId = event.pathParameters && event.pathParameters.scenarioId;
  const scenarioId = pathScenarioId || body.scenarioId || uid('SCN');

  if (!body.saleId) return badRequest('saleId is required');
  if (!body.name)   return badRequest('Scenario name is required');

  const now = new Date().toISOString();
  const existing = pathScenarioId ? await getItem(TABLES.SCENARIOS, { scenarioId: pathScenarioId }) : null;
  if (pathScenarioId && !existing) return notFound('Scenario');

  const item = {
    scenarioId,
    saleId: body.saleId,
    name: body.name,
    description: body.description || '',
    config: body.config || {},
    awardMode: body.awardMode || 'highest-aggregate',
    tieBreaker: body.tieBreaker || 'earliest-timestamp',
    createdAt: existing ? existing.createdAt : now,
    createdBy: existing ? existing.createdBy : me.email,
    updatedAt: now,
    updatedBy: me.email
  };

  await putItem(TABLES.SCENARIOS, item);
  return existing ? ok({ scenario: item }) : created({ scenario: item });
});

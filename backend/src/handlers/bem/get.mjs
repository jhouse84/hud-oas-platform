import { getItem, TABLES } from '../../lib/ddb.mjs';
import { ok, notFound, wrap } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

export const handler = wrap(async (event) => {
  requireAdmin(event);
  const scenarioId = event.pathParameters && event.pathParameters.scenarioId;
  if (!scenarioId) return notFound('Scenario');
  const item = await getItem(TABLES.SCENARIOS, { scenarioId });
  if (!item) return notFound('Scenario');
  return ok({ scenario: item });
});

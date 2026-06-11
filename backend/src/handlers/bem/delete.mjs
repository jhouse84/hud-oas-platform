import { deleteItem, TABLES } from '../../lib/ddb.mjs';
import { noContent, notFound, wrap } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';

export const handler = wrap(async (event) => {
  requireAdmin(event);
  const scenarioId = event.pathParameters && event.pathParameters.scenarioId;
  if (!scenarioId) return notFound('Scenario');
  await deleteItem(TABLES.SCENARIOS, { scenarioId });
  return noContent();
});

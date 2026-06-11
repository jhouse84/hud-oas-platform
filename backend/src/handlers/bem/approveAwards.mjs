import { getItem, putItem, query, uid, TABLES } from '../../lib/ddb.mjs';
import { ok, badRequest, notFound, wrap, parseBody } from '../../lib/response.mjs';
import { requireAdmin } from '../../lib/auth.mjs';
import { sendEmail, EMAIL_TEMPLATES } from '../../lib/ses.mjs';
import { stampPortal } from '../../lib/portal.mjs';

export const handler = wrap(async (event) => {
  const me = requireAdmin(event);
  const body = parseBody(event);
  if (!body.saleId || !body.scenarioId) return badRequest('saleId and scenarioId required');

  const scenario = await getItem(TABLES.SCENARIOS, { scenarioId: body.scenarioId });
  if (!scenario) return notFound('Scenario');
  const sale = await getItem(TABLES.SALES, { saleId: body.saleId });
  if (!sale) return notFound('Sale');
  stampPortal(sale);

  const settlements = [];
  const awards = body.awards || scenario.awards || {};

  for (const key of Object.keys(awards)) {
    const winningBid = awards[key];
    if (!winningBid) continue;
    const awardId = uid('AWD');
    const settlementDays = sale.programType === 'HVLS' || sale.programType === 'HNVLS' ? 42
                         : sale.programType === 'SFLS' ? 45
                         : sale.programType === 'MHLS' ? 56 : 63;
    const expectedSettlementDate = new Date(Date.now() + settlementDays * 86400 * 1000).toISOString();
    const item = {
      awardId,
      saleId: sale.saleId,
      portal: sale.portal,
      programType: sale.programType,
      poolOrDealId: key,
      bidderId: winningBid.bidderId,
      awardAmountUSD: winningBid.bidAmountUSD || 0,
      missionBid: !!winningBid.missionBid,
      status: 'pending-execution',
      milestones: defaultMilestones(sale.programType),
      deliverables: defaultDeliverables(sale.programType),
      expectedSettlementDate,
      createdAt: new Date().toISOString(),
      createdBy: me.email
    };
    await putItem(TABLES.SETTLEMENT, item);
    settlements.push(item);
    // Fire award email (best-effort)
    try {
      await sendEmail({
        to: winningBid.bidderEmail || null,
        template: EMAIL_TEMPLATES.awardNotice || 'awardNotice',
        params: { saleId: sale.saleId, awardId, amountUSD: item.awardAmountUSD }
      });
    } catch (e) { /* non-fatal */ }
  }

  return ok({
    settlementsCreated: settlements.length,
    settlements,
    sale: { saleId: sale.saleId, programType: sale.programType }
  });
});

function defaultMilestones(programType) {
  const base = [
    { idx: 0, label: 'Award notification sent', status: 'done', dueOffsetDays: 0 },
    { idx: 1, label: 'Conditional Award Acceptance signed', status: 'pending', dueOffsetDays: 3 },
    { idx: 2, label: 'CAA / LSA executed', status: 'pending', dueOffsetDays: 7 },
    { idx: 3, label: 'Deposit wire received', status: 'pending', dueOffsetDays: 10 },
    { idx: 4, label: 'PSA / ISA executed', status: 'pending', dueOffsetDays: 14 },
    { idx: 5, label: 'Final payment + collateral transfer', status: 'pending', dueOffsetDays: programType === 'HVLS' ? 42 : programType === 'SFLS' ? 45 : programType === 'MHLS' ? 56 : 63 }
  ];
  return base;
}

function defaultDeliverables(programType) {
  const common = [
    { id: 'caa', label: 'Conditional Award Acceptance', category: 'legal', required: true, completed: false },
    { id: 'psa', label: 'Purchase Sale Agreement', category: 'legal', required: true, completed: false },
    { id: 'deposit', label: 'Deposit wire confirmation', category: 'financial', required: true, completed: false },
    { id: 'final-wire', label: 'Final payment wire confirmation', category: 'financial', required: true, completed: false },
    { id: 'collateral', label: 'Collateral file delivery', category: 'operational', required: true, completed: false }
  ];
  if (programType === 'HVLS' || programType === 'HNVLS' || programType === 'SFLS') {
    common.push({ id: 'mers', label: 'MERS assignment batch', category: 'operational', required: true, completed: false });
    common.push({ id: 'respa', label: 'RESPA borrower notices mailed', category: 'operational', required: true, completed: false });
  }
  if (programType === 'HLS') {
    common.push({ id: 'chow', label: 'CMS Change of Ownership filed', category: 'operational', required: true, completed: false });
  }
  return common;
}

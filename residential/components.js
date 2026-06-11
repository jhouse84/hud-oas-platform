/**
 * Residential portal components — pool-card rendering, bid input, BPO sparkline.
 */
window.HSG = window.HSG || {};
HSG.residential = HSG.residential || {};

HSG.residential.components = (function () {
  'use strict';
  var u = HSG.utils;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function renderSaleCard(sale) {
    var statusBadge = '<span class="badge badge--' + esc(sale.status || 'active') + '">' + esc((sale.status || 'active').toUpperCase()) + '</span>';
    var progBar = '';
    if (sale.qualificationDeadline) {
      var days = u.daysUntil(sale.qualificationDeadline);
      var label = days >= 0 ? days + ' days to qualify' : 'Qualification closed';
      progBar = '<div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); margin-top: var(--space-2);">' + esc(label) + '</div>';
    }
    return '<article class="card" style="padding: var(--space-6); border-left: 4px solid var(--color-' + esc(sale.programType.toLowerCase()) + '); cursor: pointer;" data-route="#/sale/' + esc(sale.saleId) + '">' +
      '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3);">' +
        '<span style="font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.06em; color: var(--color-' + esc(sale.programType.toLowerCase()) + ');">' + esc(sale.programType) + ' · ' + esc(sale.saleId) + '</span>' +
        statusBadge +
      '</div>' +
      '<h3 style="font-family: var(--font-heading); font-size: var(--text-xl); margin-bottom: var(--space-2);">' + esc(sale.name || sale.saleId) + '</h3>' +
      '<p style="color: var(--color-text-muted); font-size: var(--text-sm); margin-bottom: var(--space-3);">' + esc(sale.summary || sale.description || '') + '</p>' +
      '<div style="display: flex; gap: var(--space-4); font-size: var(--text-sm); color: var(--color-text-muted);">' +
        (sale.poolCount ? '<span><strong style="color: var(--color-text);">' + esc(sale.poolCount) + '</strong> pools</span>' : '') +
        (sale.aggregateValue ? '<span><strong style="color: var(--color-text);">' + esc(u.currencyCompact(sale.aggregateValue)) + '</strong> aggregate</span>' : '') +
        (sale.bidDate ? '<span>Bid: ' + esc(u.dateShort(sale.bidDate)) + '</span>' : '') +
      '</div>' +
      progBar +
    '</article>';
  }

  function renderPoolCard(pool, sale, currentBid) {
    var basis = HSG.bidding.pool.valuationBasis(sale.programType);
    var agg = HSG.bidding.pool.aggregateForBasis(pool, basis);
    var pct = (currentBid && currentBid.bidPct) || '';
    var usd = pct ? HSG.bidding.pool.pctToUsd(pct, pool, basis) : 0;
    return '<article class="card" style="padding: var(--space-5); margin-bottom: var(--space-4);" data-pool-id="' + esc(pool.poolId) + '">' +
      '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3);">' +
        '<div>' +
          '<div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); letter-spacing: 0.06em;">POOL ' + esc(pool.poolId) + '</div>' +
          '<h4 style="font-family: var(--font-heading); font-size: var(--text-lg);">' + esc(pool.name || ('Pool ' + pool.poolId)) + '</h4>' +
        '</div>' +
        (pool.missionEligible ? '<span class="badge" style="background: var(--color-success-bg); color: var(--color-success);">MISSION ELIGIBLE</span>' : '') +
      '</div>' +
      '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); margin-bottom: var(--space-4); padding: var(--space-3); background: var(--color-grey-50); border-radius: var(--radius-md);">' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">LOANS</div><div style="font-weight: 600;">' + esc(u.number(pool.loanCount || 0)) + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">' + esc(basis) + '</div><div style="font-weight: 600;">' + esc(u.currencyCompact(agg)) + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">RESERVE</div><div style="font-weight: 600;">' + (pool.reservePct != null ? pool.reservePct + '%' : '—') + '</div></div>' +
      '</div>' +
      '<div class="form-grid form-grid--2" style="align-items: end;">' +
        '<div class="wizard__field" style="margin-bottom: 0;">' +
          '<label class="wizard__label">Bid (% of ' + esc(basis) + ')</label>' +
          '<input class="form-input" type="number" step="0.1" min="0" max="200" name="bid-pct" value="' + esc(pct) + '" data-pool-id="' + esc(pool.poolId) + '" />' +
        '</div>' +
        '<div class="wizard__field" style="margin-bottom: 0;">' +
          '<label class="wizard__label">$ equivalent</label>' +
          '<input class="form-input" type="text" readonly value="' + esc(u.currency(usd)) + '" data-pool-id="' + esc(pool.poolId) + '" data-role="usd-display" />' +
        '</div>' +
      '</div>' +
      (pool.missionEligible ? '<label class="form-checkbox" style="margin-top: var(--space-3);"><input type="checkbox" name="mission-bid" data-pool-id="' + esc(pool.poolId) + '"' + (currentBid && currentBid.missionBid ? ' checked' : '') + ' /><span><span class="form-checkbox__label">Mark as mission bid</span><span class="form-checkbox__desc">Eligible bidders can flag this bid for NSO carveout consideration.</span></span></label>' : '') +
      (pool.cutoutsApplied ? '<div class="auth-info" style="margin-top: var(--space-3);">⚠ The Transaction Specialist has imposed cutouts on this pool. Review the loan tape filter before bidding.</div>' : '') +
    '</article>';
  }

  function renderLoanTapeRow(loan) {
    return '<tr>' +
      '<td>' + esc(loan.loanId) + '</td>' +
      '<td>' + esc(loan.fhaCaseNumber || '—') + '</td>' +
      '<td>' + esc(loan.propertyState || '—') + '</td>' +
      '<td style="text-align: right;">' + esc(u.currency(loan.bpoValue || loan.upb || 0)) + '</td>' +
      '<td style="text-align: right;">' + esc(u.currency(loan.estimatedTotalDebt || 0)) + '</td>' +
      '<td>' + esc(loan.propertyStatus || '—') + '</td>' +
      '<td>' + (loan.nsoEligible ? '<span class="badge" style="background: var(--color-success-bg); color: var(--color-success);">NSO</span>' : '') + '</td>' +
    '</tr>';
  }

  function renderLoanTape(loans, programType) {
    var headers = (programType === 'SFLS')
      ? ['Loan ID', 'FHA Case', 'State', 'UPB', 'ETD', 'Status', 'NSO']
      : ['Loan ID', 'FHA Case', 'State', 'BPO', 'ETD', 'Status', 'Flags'];
    return '<table class="data-table">' +
      '<thead><tr>' + headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '</tr></thead>' +
      '<tbody>' + (loans || []).map(renderLoanTapeRow).join('') + '</tbody>' +
    '</table>';
  }

  function renderBidSlip(bids, sale, opts) {
    opts = opts || {};
    var summary = HSG.bidding.pool.slipTotal(bids, opts);
    if (summary.poolCount === 0) {
      return '<div class="card" style="padding: var(--space-5);">' +
        '<h3 style="font-family: var(--font-heading); margin-bottom: var(--space-2);">Bid slip</h3>' +
        '<p style="color: var(--color-text-muted); font-size: var(--text-sm);">No bids in your slip yet. Enter a percentage on a pool above to add it.</p>' +
      '</div>';
    }
    return '<div class="card" style="padding: var(--space-5);">' +
      '<h3 style="font-family: var(--font-heading); margin-bottom: var(--space-3);">Bid slip — ' + esc(sale.saleId) + '</h3>' +
      '<table class="data-table" style="margin-bottom: var(--space-3);">' +
        '<thead><tr><th>Pool</th><th>%</th><th style="text-align:right;">$</th><th>Mission</th></tr></thead>' +
        '<tbody>' + bids.map(function (b) {
          return '<tr><td>' + esc(b.poolId) + '</td><td>' + esc(b.bidPct) + '%</td><td style="text-align:right;">' + esc(u.currency(b.bidAmountUSD)) + '</td><td>' + (b.missionBid ? '✓' : '') + '</td></tr>';
        }).join('') + '</tbody>' +
      '</table>' +
      '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); padding: var(--space-3); background: var(--color-portal-soft); border-radius: var(--radius-md);">' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">POOLS</div><div style="font-weight: 600;">' + summary.poolCount + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">TOTAL</div><div style="font-weight: 600;">' + esc(u.currency(summary.totalUSD)) + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">DEPOSIT (10%)</div><div style="font-weight: 600;">' + esc(u.currency(summary.depositUSD)) + '</div></div>' +
      '</div>' +
    '</div>';
  }

  return {
    esc: esc,
    renderSaleCard: renderSaleCard,
    renderPoolCard: renderPoolCard,
    renderLoanTape: renderLoanTape,
    renderBidSlip: renderBidSlip
  };
})();

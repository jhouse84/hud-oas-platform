/**
 * Residential portal components — sale cards, loan-level bid sheet, bid slip.
 *
 * The bid sheet mirrors the HUD form: every loan is a row; the ONLY editable
 * cell is BID % (5 decimals); BID $ derives read-only from the HUD basis
 * (HVLS = BPO · HNVLS = ETD-adj. BPO · SFLS = UPB). Pools participate whole:
 * a % on every loan, or every loan blank to decline. Reserves are admin-only
 * and never rendered here.
 */
window.HSG = window.HSG || {};
HSG.residential = HSG.residential || {};

HSG.residential.components = (function () {
  'use strict';
  var u = HSG.utils;
  var eng = function () { return HSG.bidding.pool; };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function pid(pool) { return pool.pool_id || pool.poolId; }
  function lid(loan) { return loan.loan_id || loan.loanId; }
  function poolName(pool) { return pool.pool_name || pool.name || ('Pool ' + pid(pool)); }
  function poolLoanIds(pool) { return pool.loan_ids || pool.loanIds || []; }

  function renderSaleCard(sale) {
    var statusBadge = '<span class="badge badge--' + esc(sale.status || 'active') + '">' + esc(String(sale.status || 'active').replace(/_/g, ' ').toUpperCase()) + '</span>';
    var summary = sale.summary || {};
    var agg = summary.aggregate_bpo || summary.aggregate_upb || sale.aggregateValue;
    var bidDay = (sale.key_dates && sale.key_dates.bid_day) || sale.bidDate;
    var poolCount = (sale.pools && sale.pools.length) || sale.poolCount;
    return '<article class="card" style="padding: var(--space-6); border-left: 4px solid var(--color-' + esc(String(sale.programType || '').toLowerCase()) + '); cursor: pointer;" data-route="#/sale/' + esc(sale.saleId) + '">' +
      '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3);">' +
        '<span style="font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.06em; color: var(--color-' + esc(String(sale.programType || '').toLowerCase()) + ');">' + esc(sale.programType) + ' · ' + esc(sale.saleId) + '</span>' +
        statusBadge +
      '</div>' +
      '<h3 style="font-family: var(--font-heading); font-size: var(--text-xl); margin-bottom: var(--space-2);">' + esc(sale.name || sale.sale_name || sale.saleId) + '</h3>' +
      '<p style="color: var(--color-text-muted); font-size: var(--text-sm); margin-bottom: var(--space-3);">' + esc(sale.long_name || sale.summaryText || sale.description || '') + '</p>' +
      '<div style="display: flex; gap: var(--space-4); font-size: var(--text-sm); color: var(--color-text-muted);">' +
        (poolCount ? '<span><strong style="color: var(--color-text);">' + esc(poolCount) + '</strong> pools</span>' : '') +
        (agg ? '<span><strong style="color: var(--color-text);">' + esc(u.currencyCompact(agg)) + '</strong> aggregate</span>' : '') +
        (bidDay ? '<span>Bid: ' + esc(u.dateShort(bidDay)) + '</span>' : '') +
      '</div>' +
    '</article>';
  }

  /**
   * Loan-level bid sheet for one pool. entries = { loanId → raw input value }.
   * Locked columns are HUD-furnished; the BID % cell is the single input.
   */
  function renderBidSheet(pool, loans, sale, entries, missionChecked) {
    entries = entries || {};
    var programType = sale.programType;
    var basisLbl = eng().basisLabel(programType);
    var ids = poolLoanIds(pool);
    var poolLoans = (loans || []).filter(function (l) { return ids.indexOf(lid(l)) >= 0; });
    var result = eng().validatePool(entries, poolLoans, programType);
    var summary = pool.summary || {};
    var aggBasis = summary.aggregate_bpo || summary.aggregate_upb || 0;

    var pill;
    if (result.participation === 'COMPLETE') {
      pill = '<span class="badge" style="background: var(--color-success-bg); color: var(--color-success);">COMPLETE — ' + esc(u.currency(result.aggregateUsd)) + '</span>';
    } else if (result.participation === 'NO_BID') {
      pill = '<span class="badge">NO BID</span>';
    } else {
      pill = '<span class="badge" style="background: var(--color-warning-bg, #FEF3C7); color: var(--color-warning);">INCOMPLETE — ' + (result.missing.length ? result.missing.length + ' loan(s) blank' : 'fix errors') + '</span>';
    }

    var rows = poolLoans.map(function (loan) {
      var id = lid(loan);
      var raw = entries[id] != null ? entries[id] : '';
      var entry = eng().validateLoanEntry(raw, loan, programType);
      var usdCell = entry.state === 'ok' ? u.currency(entry.usd) : '—';
      var errAttr = entry.state === 'error' ? ' style="border-color: var(--color-error);" title="' + esc(entry.message) + '"' : '';
      var basisVal = eng().loanBasis(loan, programType);
      var st = (loan.property && loan.property.state) || loan.propertyState || '—';
      return '<tr data-loan-row="' + esc(id) + '">' +
        '<td style="font-family: var(--font-mono); font-size: var(--text-xs);">' + esc(id) + '</td>' +
        '<td style="font-family: var(--font-mono); font-size: var(--text-xs);">' + esc(loan.fha_case_number || loan.fhaCaseNumber || '—') + '</td>' +
        '<td>' + esc(st) + '</td>' +
        '<td style="text-align: right;">' + esc(u.currency(basisVal)) + '</td>' +
        '<td style="width: 130px;"><input class="form-input" type="number" step="0.00001" min="0" inputmode="decimal" name="bid-pct" value="' + esc(raw) + '" data-pool-id="' + esc(pid(pool)) + '" data-loan-id="' + esc(id) + '"' + errAttr + ' /></td>' +
        '<td style="text-align: right; font-weight: 600;" data-role="usd-cell" data-loan-id="' + esc(id) + '">' + esc(usdCell) + '</td>' +
      '</tr>';
    }).join('');

    var errList = result.errors.length
      ? '<div class="auth-error" style="margin-top: var(--space-3);">' + result.errors.map(function (e) { return esc(e.loanId + ': ' + e.message); }).join('<br/>') + '</div>'
      : '';

    return '<article class="card" style="padding: var(--space-5); margin-bottom: var(--space-4);" data-pool-card="' + esc(pid(pool)) + '">' +
      '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3);">' +
        '<div>' +
          '<div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); letter-spacing: 0.06em;">POOL ' + esc(pid(pool)) + ' · ' + esc(poolLoans.length) + ' LOANS · AGG. ' + esc(basisLbl) + ' ' + esc(u.currencyCompact(aggBasis)) + '</div>' +
          '<h4 style="font-family: var(--font-heading); font-size: var(--text-lg);">' + esc(poolName(pool)) + '</h4>' +
        '</div>' +
        '<span data-role="pool-pill" data-pool-id="' + esc(pid(pool)) + '">' + pill + '</span>' +
      '</div>' +
      '<div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: var(--space-3); padding: 12px 14px; background: var(--color-portal-soft); border: 1px solid var(--color-border); border-radius: var(--radius-md);">' +
        '<span style="font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-portal); font-weight: 600;">Bulk bidding</span>' +
        '<button class="btn-portal" style="font-size: 13px; padding: 8px 14px;" data-role="wb-download" data-pool-id="' + esc(pid(pool)) + '">⬇ Download bid workbook (Excel)</button>' +
        '<button class="btn-portal btn-portal--ghost" style="font-size: 13px; padding: 8px 14px;" data-role="wb-upload-btn" data-pool-id="' + esc(pid(pool)) + '">⬆ Upload completed workbook</button>' +
        '<input type="file" accept=".xlsx" data-role="wb-upload-input" data-pool-id="' + esc(pid(pool)) + '" style="display: none;" />' +
        '<button class="btn-portal btn-portal--ghost" style="font-size: 13px; padding: 8px 14px;" data-role="wb-paste" data-pool-id="' + esc(pid(pool)) + '">Paste from spreadsheet</button>' +
        '<span data-role="wb-status" data-pool-id="' + esc(pid(pool)) + '" style="font-size: 12.5px; color: var(--color-text-muted); flex-basis: 100%;">Price hundreds of loans in Excel — the workbook is locked to bid input only, and the platform re-derives every figure on upload.</span>' +
      '</div>' +
      '<div style="display: flex; gap: var(--space-3); align-items: center; margin-bottom: var(--space-3); font-size: var(--text-sm);">' +
        '<input class="form-input" type="number" step="0.00001" min="0" placeholder="%" style="width: 110px;" data-role="fill-all" data-pool-id="' + esc(pid(pool)) + '" />' +
        '<button class="btn-portal btn-portal--ghost" style="font-size: var(--text-xs);" data-role="fill-all-btn" data-pool-id="' + esc(pid(pool)) + '">Apply % to all loans in pool</button>' +
        '<span style="color: var(--color-text-muted); font-size: var(--text-xs);">Or fill a flat % down the whole pool. Whole-pool participation: a % on every loan, or leave the pool entirely blank.</span>' +
      '</div>' +
      '<table class="data-table">' +
        '<thead><tr><th>Loan ID</th><th>FHA Case</th><th>State</th><th style="text-align: right;">' + esc(basisLbl) + '</th><th>BID %</th><th style="text-align: right;">BID $ (derived)</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
      errList +
      (pool.mission_eligible || pool.missionEligible ? '<label class="form-checkbox" style="margin-top: var(--space-3);"><input type="checkbox" name="mission-bid" data-pool-id="' + esc(pid(pool)) + '"' + (missionChecked ? ' checked' : '') + ' /><span><span class="form-checkbox__label">Mark as mission bid</span><span class="form-checkbox__desc">Eligible bidders can flag this pool bid for NSO consideration.</span></span></label>' : '') +
    '</article>';
  }

  function renderLoanTapeRow(loan) {
    var st = (loan.property && loan.property.state) || loan.propertyState || '—';
    return '<tr>' +
      '<td>' + esc(lid(loan)) + '</td>' +
      '<td>' + esc(loan.fha_case_number || loan.fhaCaseNumber || '—') + '</td>' +
      '<td>' + esc(st) + '</td>' +
      '<td style="text-align: right;">' + esc(u.currency(loan.bpo_value || loan.bpoValue || loan.current_upb || loan.upb || 0)) + '</td>' +
      '<td style="text-align: right;">' + esc(u.currency(loan.estimated_total_debt || loan.estimatedTotalDebt || 0)) + '</td>' +
      '<td>' + esc(loan.property_condition || loan.propertyStatus || '—') + '</td>' +
      '<td>' + (loan.nso_eligible || loan.nsoEligible ? '<span class="badge" style="background: var(--color-success-bg); color: var(--color-success);">NSO</span>' : '') + '</td>' +
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

  /**
   * Bid slip: complete pools only, plus live deposit per the sale's published
   * terms. poolResults = output of validatePool per pool (COMPLETE ones shown).
   */
  function renderBidSlip(poolResults, sale) {
    var complete = (poolResults || []).filter(function (p) { return p.participation === 'COMPLETE'; });
    var terms = sale.deposit_terms || sale.depositTerms;
    if (complete.length === 0) {
      return '<div class="card" style="padding: var(--space-5);">' +
        '<h3 style="font-family: var(--font-heading); margin-bottom: var(--space-2);">Bid slip</h3>' +
        '<p style="color: var(--color-text-muted); font-size: var(--text-sm);">No complete pool bids yet. Enter a BID % on every loan in a pool to add it.</p>' +
      '</div>';
    }
    var s = eng().slipTotal(complete, terms);
    return '<div class="card" style="padding: var(--space-5);">' +
      '<h3 style="font-family: var(--font-heading); margin-bottom: var(--space-3);">Bid slip — ' + esc(sale.saleId) + '</h3>' +
      '<table class="data-table" style="margin-bottom: var(--space-3);">' +
        '<thead><tr><th>Pool</th><th>Loans</th><th style="text-align:right;">Aggregate $</th><th>Mission</th></tr></thead>' +
        '<tbody>' + complete.map(function (p) {
          return '<tr><td>' + esc(p.poolId) + '</td><td>' + p.loans.length + '</td><td style="text-align:right;">' + esc(u.currency(p.aggregateUsd)) + '</td><td>' + (p.missionBid ? '✓' : '') + '</td></tr>';
        }).join('') + '</tbody>' +
      '</table>' +
      '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); padding: var(--space-3); background: var(--color-portal-soft); border-radius: var(--radius-md);">' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">POOLS / LOANS</div><div style="font-weight: 600;">' + s.poolCount + ' / ' + s.loanCount + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">TOTAL (DERIVED)</div><div style="font-weight: 600;">' + esc(u.currency(s.totalUSD)) + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">DEPOSIT</div><div style="font-weight: 600;">' + esc(u.currency(s.depositUSD)) + '</div></div>' +
      '</div>' +
      '<p style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: var(--space-2);">Deposit per the BIP: the greater of the floor or the stated percentage of your aggregate bid. Final figures are confirmed on your platform receipt.</p>' +
    '</div>';
  }

  return {
    esc: esc,
    pid: pid,
    lid: lid,
    renderSaleCard: renderSaleCard,
    renderBidSheet: renderBidSheet,
    renderLoanTape: renderLoanTape,
    renderBidSlip: renderBidSlip
  };
})();

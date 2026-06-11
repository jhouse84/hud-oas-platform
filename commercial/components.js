/**
 * Commercial portal components — deal-card rendering, deal bid input,
 * per-unit / cap rate / DSCR analytics displays, risk flag pills,
 * asset-class panels (multifamily / healthcare), cross-collat banner,
 * and QC verification badges.
 */
window.HSG = window.HSG || {};
HSG.commercial = HSG.commercial || {};

HSG.commercial.components = (function () {
  'use strict';
  var u = HSG.utils;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  // ---------------------------------------------------------------------
  //  Risk flags — auto-generated server-side, rendered as colored pills
  // ---------------------------------------------------------------------
  var FLAG_META = {
    borrower_bankruptcy:  { label: 'Bankruptcy',     severity: 'critical', desc: 'Borrower in bankruptcy' },
    court_receiver:       { label: 'Receiver',       severity: 'critical', desc: 'Court-appointed receiver in place' },
    pwa_active:           { label: 'PWA',            severity: 'high',     desc: 'Provisional Workout Arrangement active' },
    delinquent_principal: { label: 'Delinq Princ',   severity: 'high',     desc: 'Delinquent principal balance' },
    negative_noi:         { label: 'Neg NOI',        severity: 'high',     desc: 'Most recent year NOI negative' },
    dscr_below_1x:        { label: 'DSCR <1x',       severity: 'high',     desc: 'Debt service coverage below 1.0x' },
    delinquent_interest:  { label: 'Delinq Int',     severity: 'medium',   desc: 'Delinquent interest balance' },
    modified_loan:        { label: 'Modified',       severity: 'medium',   desc: 'Loan terms have been modified' }
  };

  function renderRiskFlagPills(flags) {
    if (!flags || !flags.length) return '<span class="pill pill--neutral">No flags</span>';
    return flags.map(function (f) {
      var meta = FLAG_META[f] || { label: f, severity: 'medium', desc: f };
      return '<span class="pill pill--' + esc(meta.severity) + '" title="' + esc(meta.desc) + '">' + esc(meta.label) + '</span>';
    }).join('');
  }

  function renderFlaggedSummary(loans) {
    var flagged = (loans || []).filter(function (l) { return (l.risk_flags || []).length > 0; });
    if (flagged.length === 0) return '<span class="pill pill--ok">All clean</span>';
    var total = (loans || []).length;
    return '<span class="pill pill--high">' + flagged.length + ' of ' + total + ' loans flagged</span>';
  }

  // ---------------------------------------------------------------------
  //  QC verification badge
  // ---------------------------------------------------------------------
  function renderQcBadge(status) {
    if (!status) return '';
    var map = {
      verified:                 { mod: 'verified',              icon: '✓', label: 'Verified' },
      verified_negative_noi:    { mod: 'verified-negative-noi', icon: '⚠', label: 'Neg NOI' },
      needs_review:             { mod: 'needs-review',          icon: '?', label: 'Review' },
      missing_financials:       { mod: 'missing-financials',    icon: '—', label: 'No financials' }
    };
    var m = map[status] || map.needs_review;
    return '<span class="qc-badge qc-badge--' + m.mod + '" title="QC status: ' + esc(status) + '"><span class="qc-badge__icon">' + m.icon + '</span> ' + esc(m.label) + '</span>';
  }

  // ---------------------------------------------------------------------
  //  Term display rounding (months → "Y yr M mo")
  // ---------------------------------------------------------------------
  function formatTerm(months) {
    if (months == null || isNaN(months)) return '—';
    var m = Math.round(Number(months));
    if (m < 1) return '0 mo';
    var y = Math.floor(m / 12);
    var rem = m % 12;
    if (y === 0) return rem + ' mo';
    if (rem === 0) return y + ' yr';
    return y + ' yr ' + rem + ' mo';
  }

  // ---------------------------------------------------------------------
  //  Cross-collat detection + banner
  // ---------------------------------------------------------------------
  function poolHasCrossCollat(pool, loans) {
    if (!pool || !loans) return false;
    var ids = pool.loan_ids || pool.loanIds || [];
    var poolLoans = loans.filter(function (l) { return ids.indexOf(l.loan_id || l.loanId) >= 0; });
    // True if any loan declares a related FHA in the same pool
    return poolLoans.some(function (l) {
      var rel = l.related_loans || {};
      if (!rel.has_related) return false;
      if (!rel.related_fha) return false;
      var relRoot = String(rel.related_fha).replace(/[^A-Za-z0-9]/g, '');
      return poolLoans.some(function (other) {
        if (other === l) return false;
        var otherRoot = String(other.loan_id || other.loanId).replace(/[^A-Za-z0-9]/g, '');
        return relRoot === otherRoot;
      });
    });
  }

  function renderCrossCollatBanner(pool, loans) {
    var fromNote = pool.notes && /cross-?collateralized/i.test(pool.notes);
    var fromLoans = poolHasCrossCollat(pool, loans);
    if (!fromNote && !fromLoans) return '';
    var noteText = pool.notes || 'Cross-collateralized loans must be acquired together.';
    return '<div class="banner banner--warning"><strong>Cross-collateralized pool.</strong> ' + esc(noteText) +
      ' Per the Loan Sale Agreement, the loans in this pool must be acquired together; partial bids are not permitted.</div>';
  }

  // ---------------------------------------------------------------------
  //  Asset-class panels — Multifamily vs Healthcare
  // ---------------------------------------------------------------------
  function renderMultifamilyPanel(loan) {
    var p = (loan && loan.property) || {};
    var mix = p.mf_unit_mix || {};
    var rows = [
      ['Efficiency', mix.efficiency],
      ['1BR / 1BA', mix.br1_1ba],
      ['2BR / 1BA', mix.br2_1ba],
      ['2BR / 2BA', mix.br2_2ba],
      ['3BR / 2BA', mix.br3_2ba],
      ['Other', mix.other]
    ].filter(function (r) { return Number(r[1]) > 0; });
    var rowsHtml = rows.length
      ? rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td style="text-align:right;">' + esc(u.number(r[1])) + '</td></tr>'; }).join('')
      : '<tr><td colspan="2" style="color: var(--color-text-muted);">Unit mix not reported</td></tr>';
    return '<div style="padding: var(--space-4); background: var(--color-grey-50); border-radius: var(--radius-md); margin-top: var(--space-3);">' +
      '<div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); letter-spacing: 0.06em;">MULTIFAMILY UNIT MIX</div>' +
      '<table class="data-table" style="margin-top: var(--space-2); font-size: var(--text-sm);">' +
        '<tbody>' + rowsHtml + '</tbody>' +
      '</table>' +
      '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); margin-top: var(--space-3);">' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">TOTAL UNITS</div><div style="font-weight: 600;">' + esc(u.number(p.units_total || mix.total_units || 0)) + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">NET RENTABLE SF</div><div style="font-weight: 600;">' + esc(p.net_rentable_sf ? u.number(p.net_rentable_sf) : '—') + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">AVG RENT PSF</div><div style="font-weight: 600;">' + (mix.avg_rent_psf != null ? '$' + Number(mix.avg_rent_psf).toFixed(2) : '—') + '</div></div>' +
      '</div>' +
    '</div>';
  }

  function renderHealthcarePanel(loan) {
    var p = (loan && loan.property) || {};
    var u_mix = p.hc_unit_mix || {};
    var pay = p.hc_payor_mix || {};
    var hasPayor = pay && (Number(pay.self_pay_pct) || Number(pay.medicare_pct) || Number(pay.medicaid_pct) || Number(pay.state_aid_pct) || Number(pay.va_other_pct));
    var segs = [];
    if (hasPayor) {
      var rawTotal = (Number(pay.self_pay_pct) || 0) + (Number(pay.medicare_pct) || 0) +
                     (Number(pay.medicaid_pct) || 0) + (Number(pay.state_aid_pct) || 0) + (Number(pay.va_other_pct) || 0);
      var keyed = [
        ['self_pay',  'Self pay',  pay.self_pay_pct],
        ['medicare',  'Medicare',  pay.medicare_pct],
        ['medicaid',  'Medicaid',  pay.medicaid_pct],
        ['state_aid', 'State aid', pay.state_aid_pct],
        ['va_other',  'VA / other',pay.va_other_pct]
      ];
      keyed.forEach(function (k) {
        var pct = Number(k[2]) || 0;
        if (rawTotal && rawTotal !== 1 && rawTotal < 2) pct = pct * 100; // 0-1 ratios → percentages
        if (pct > 0) segs.push({ key: k[0], label: k[1], pct: pct });
      });
    }
    var total = segs.reduce(function (s, x) { return s + x.pct; }, 0);
    var barHtml = total > 0
      ? '<div class="payor-bar">' +
          segs.map(function (s) {
            return '<div class="payor-bar__seg payor-bar__seg--' + s.key + '" style="width: ' + ((s.pct / total) * 100).toFixed(1) + '%;" title="' + esc(s.label) + ': ' + s.pct.toFixed(1) + '%">' +
              (s.pct >= 8 ? s.pct.toFixed(0) + '%' : '') +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="payor-bar__legend">' +
          segs.map(function (s) {
            return '<span class="payor-bar__legend-item"><span class="payor-bar__legend-swatch" style="background: ' +
              ({ self_pay:'#2A7A50', medicare:'#3B82F6', medicaid:'#B8720A', state_aid:'#8C5A00', va_other:'#57595F' }[s.key] || '#888') + ';"></span>' +
              esc(s.label) + ' ' + s.pct.toFixed(0) + '%</span>';
          }).join('') +
        '</div>'
      : '<p style="color: var(--color-text-muted); font-size: var(--text-sm);">Payor mix not reported.</p>';

    var occ = pay.occupancy_pct;
    var occDisplay = occ != null ? (Number(occ) > 1 ? Number(occ).toFixed(1) + '%' : (Number(occ) * 100).toFixed(1) + '%') : '—';

    return '<div style="padding: var(--space-4); background: var(--color-grey-50); border-radius: var(--radius-md); margin-top: var(--space-3);">' +
      '<div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); letter-spacing: 0.06em;">HEALTHCARE FACILITY</div>' +
      '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); margin-top: var(--space-3);">' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">UNITS</div><div style="font-weight: 600;">' + esc(u.number(u_mix.total_units || 0)) + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">BEDS</div><div style="font-weight: 600;">' + esc(u.number(u_mix.total_beds || 0)) + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">CONGREGATE BEDS</div><div style="font-weight: 600;">' + esc(u.number(u_mix.congregate_beds || 0)) + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">OCCUPANCY</div><div style="font-weight: 600;">' + esc(occDisplay) + '</div></div>' +
      '</div>' +
      '<div style="margin-top: var(--space-4);">' +
        '<div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); letter-spacing: 0.06em;">PAYOR MIX</div>' +
        barHtml +
      '</div>' +
    '</div>';
  }

  function renderAssetClassPanel(loan) {
    if (!loan) return '';
    if (loan.asset_class === 'Healthcare') return renderHealthcarePanel(loan);
    return renderMultifamilyPanel(loan);
  }

  function renderSaleCard(sale) {
    // Support both legacy (saleId/programType/aggregateValue) and SALD shape (sale_id/program/summary.aggregate_upb)
    var saleId = sale.saleId || sale.sale_id;
    var program = sale.programType || sale.program || 'MHLS';
    var status = sale.status || sale.state || 'active';
    var name = sale.name || sale.sale_name || sale.long_name || saleId;
    var summary = sale.summary && typeof sale.summary === 'object' ? sale.summary : {};
    var aggregate = sale.aggregateValue || summary.aggregate_upb || 0;
    var loanCount = summary.loan_count || 0;
    var poolCount = summary.pool_count || (sale.pools || []).length || 0;
    var description = sale.description || sale.long_name || '';
    var bidDate = sale.bidDate || (sale.key_dates && sale.key_dates.bid_day);
    var qualClose = sale.qualificationDeadline || (sale.key_dates && sale.key_dates.qualification_closes);

    var statusBadge = '<span class="badge badge--' + esc(status) + '">' + esc(String(status).replace(/_/g, ' ').toUpperCase()) + '</span>';
    var deadline = qualClose
      ? '<div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); margin-top: var(--space-2);">' + esc(u.daysUntil(qualClose)) + ' days to qualify · closes ' + esc(u.dateShort(qualClose)) + '</div>'
      : '';
    return '<article class="card" style="padding: var(--space-6); border-left: 4px solid var(--color-' + esc(program.toLowerCase()) + '); cursor: pointer;" data-route="#/sale/' + esc(saleId) + '">' +
      '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3);">' +
        '<span style="font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: 0.06em; color: var(--color-' + esc(program.toLowerCase()) + ');">' + esc(program) + ' · ' + esc(saleId) + '</span>' +
        statusBadge +
      '</div>' +
      '<h3 style="font-family: var(--font-heading); font-size: var(--text-xl); margin-bottom: var(--space-2);">' + esc(name) + '</h3>' +
      '<p style="color: var(--color-text-muted); font-size: var(--text-sm); margin-bottom: var(--space-3);">' + esc(description) + '</p>' +
      '<div style="display: flex; gap: var(--space-4); font-size: var(--text-sm); color: var(--color-text-muted); flex-wrap: wrap;">' +
        (loanCount ? '<span><strong style="color: var(--color-text);">' + esc(u.number(loanCount)) + '</strong> loans</span>' : '') +
        (poolCount ? '<span><strong style="color: var(--color-text);">' + esc(poolCount) + '</strong> pools</span>' : '') +
        (aggregate ? '<span><strong style="color: var(--color-text);">' + esc(u.currencyCompact(aggregate)) + '</strong> UPB</span>' : '') +
        (bidDate ? '<span>Bid: ' + esc(u.dateShort(bidDate)) + '</span>' : '') +
      '</div>' +
      deadline +
    '</article>';
  }

  // ---------------------------------------------------------------------
  //  Pool card — for the new sale schema where pools group loans by ID
  // ---------------------------------------------------------------------
  function renderPoolCard(pool, poolLoans, currentBid) {
    var poolId = pool.pool_id || pool.poolId;
    var poolName = pool.pool_name || pool.name || ('Pool ' + (pool.pool_number || poolId));
    var summary = pool.summary || {};
    var loanCount = summary.loan_count || (poolLoans || []).length;
    var aggUpb = summary.aggregate_upb || (poolLoans || []).reduce(function (s, l) { return s + (Number(l.current_upb) || 0); }, 0);
    var avgDscr = summary.avg_dscr;
    var states = (summary.states || []).join(', ');
    var rawPct = currentBid != null && currentBid.rawPct != null ? currentBid.rawPct : '';
    var ccBanner = renderCrossCollatBanner(pool, poolLoans);
    var flagSummary = renderFlaggedSummary(poolLoans);
    var entry = HSG.bidding.deal.validateAssetEntry(rawPct === '' ? undefined : rawPct, pool);
    var usdCell = entry.state === 'ok' ? u.currency(entry.usd) : '—';
    var errAttr = entry.state === 'error' ? ' style="border-color: var(--color-error);" title="' + esc(entry.message) + '"' : '';

    return '<article class="card" style="padding: var(--space-5); margin-bottom: var(--space-4);" data-pool-id="' + esc(poolId) + '">' +
      '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-3);">' +
        '<div>' +
          '<div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); letter-spacing: 0.06em;">ASSET POOL ' + esc(poolId) + '</div>' +
          '<h4 style="font-family: var(--font-heading); font-size: var(--text-lg);">' + esc(poolName) + '</h4>' +
          '<div style="font-size: var(--text-sm); color: var(--color-text-muted);">' + esc(states) + '</div>' +
        '</div>' +
        '<div>' + flagSummary + '</div>' +
      '</div>' +
      ccBanner +
      '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); margin-bottom: var(--space-4); padding: var(--space-3); background: var(--color-grey-50); border-radius: var(--radius-md);">' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">NOTES</div><div style="font-weight: 600;">' + esc(loanCount) + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">UPB (BID BASIS)</div><div style="font-weight: 600;">' + esc(u.currency(aggUpb)) + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">AVG DSCR</div><div style="font-weight: 600;">' + (avgDscr != null ? Number(avgDscr).toFixed(2) + 'x' : '—') + '</div></div>' +
      '</div>' +
      '<div class="form-grid form-grid--2" style="align-items: end;">' +
        '<div class="wizard__field" style="margin-bottom: 0;">' +
          '<label class="wizard__label">BID % of UPB <span style="color: var(--color-text-muted); font-weight: 400;">(up to 5 decimals · blank = no bid)</span></label>' +
          '<input class="form-input" type="number" step="0.00001" min="0" inputmode="decimal" name="bid-pct" value="' + esc(rawPct) + '" data-pool-id="' + esc(poolId) + '"' + errAttr + ' />' +
        '</div>' +
        '<div class="wizard__field" style="margin-bottom: 0;">' +
          '<label class="wizard__label">BID $ (derived — read-only)</label>' +
          '<div style="padding: var(--space-3); background: var(--color-grey-50); border-radius: var(--radius-md); font-weight: 600; text-align: right;" data-role="usd-cell" data-pool-id="' + esc(poolId) + '">' + esc(usdCell) + '</div>' +
        '</div>' +
      '</div>' +
      (entry.state === 'error' ? '<div class="auth-error" style="margin-top: var(--space-2); font-size: var(--text-sm);" data-role="pool-error" data-pool-id="' + esc(poolId) + '">' + esc(entry.message) + '</div>' : '<div data-role="pool-error" data-pool-id="' + esc(poolId) + '" style="display:none;"></div>') +
    '</article>';
  }

  function renderDealRow(deal) {
    return '<tr>' +
      '<td>' + esc(deal.dealId) + '</td>' +
      '<td>' + esc(deal.name || deal.propertyName || '—') + '</td>' +
      '<td>' + esc(deal.propertyCity || '') + (deal.propertyState ? ', ' + esc(deal.propertyState) : '') + '</td>' +
      '<td style="text-align: right;">' + esc(u.number(deal.unitCount || 0)) + '</td>' +
      '<td style="text-align: right;">' + esc(u.currency(deal.upb || 0)) + '</td>' +
      '<td style="text-align: right;">' + esc(deal.dscr != null ? deal.dscr.toFixed(2) : '—') + '</td>' +
      '<td style="text-align: right;">' + esc(deal.occupancyRate != null ? (deal.occupancyRate * 100).toFixed(0) + '%' : '—') + '</td>' +
    '</tr>';
  }

  // ---------------------------------------------------------------------
  //  Loan-tape row — SALD shape (uses loan_id, property.{...}, metrics.*, risk_flags)
  // ---------------------------------------------------------------------
  function renderLoanTapeRow(loan, qcByLoan) {
    var prop = loan.property || {};
    var metrics = loan.metrics || {};
    var fin = (loan.financials && loan.financials.latest_year) || {};
    var qc = qcByLoan && qcByLoan[loan.loan_id || loan.loanId];
    return '<tr data-loan-id="' + esc(loan.loan_id || loan.loanId) + '" style="cursor: pointer;">' +
      '<td><strong>' + esc(loan.fha_case_number || loan.loan_id) + '</strong></td>' +
      '<td>' + esc(loan.property_name || '—') + '</td>' +
      '<td>' + esc((prop.city || '') + (prop.state ? ', ' + prop.state : '')) + '</td>' +
      '<td><span class="pill pill--' + (loan.asset_class === 'Healthcare' ? 'info' : 'neutral') + '">' + esc(loan.asset_class || '—') + '</span></td>' +
      '<td style="text-align: right;">' + esc(u.currency(loan.current_upb || 0)) + '</td>' +
      '<td style="text-align: right;">' + esc(metrics.dscr_latest_year != null ? Number(metrics.dscr_latest_year).toFixed(2) + 'x' : '—') + '</td>' +
      '<td style="text-align: right;">' + esc(metrics.debt_yield_latest_year != null ? (Number(metrics.debt_yield_latest_year) * 100).toFixed(1) + '%' : '—') + '</td>' +
      '<td style="text-align: right;">' + esc(formatTerm(loan.remaining_term_months)) + '</td>' +
      '<td>' + renderQcBadge(qc && qc.status) + '</td>' +
      '<td>' + renderRiskFlagPills(loan.risk_flags) + '</td>' +
    '</tr>';
  }

  function renderLoanTape(loans, qcByLoan) {
    var rowsHtml = (loans || []).map(function (l) { return renderLoanTapeRow(l, qcByLoan); }).join('');
    return '<table class="data-table">' +
      '<thead><tr>' +
        '<th>FHA #</th>' +
        '<th>Property</th>' +
        '<th>Location</th>' +
        '<th>Class</th>' +
        '<th style="text-align:right;">UPB</th>' +
        '<th style="text-align:right;">DSCR (LY)</th>' +
        '<th style="text-align:right;">Debt yield</th>' +
        '<th style="text-align:right;">Remaining term</th>' +
        '<th>QC</th>' +
        '<th>Flags</th>' +
      '</tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table>';
  }

  // ---------------------------------------------------------------------
  //  Loan detail panel — full SALD-derived view
  // ---------------------------------------------------------------------
  function renderLoanDetail(loan, qc) {
    if (!loan) return '<p class="empty">Loan not found.</p>';
    var b = loan.borrower || {};
    var p = loan.property || {};
    var m = loan.metrics || {};
    var fin = loan.financials || {};
    var ly = fin.latest_year || {};
    var y2 = fin.second_latest_year || {};
    var y3 = fin.third_latest_year || {};
    var de = loan.delinquencies_escrows || {};
    var lien = loan.lien_stack || [];

    var financialRow = function (label, ly, y2, y3) {
      return '<tr><td>' + esc(label) + '</td>' +
        '<td style="text-align:right;">' + (ly != null ? esc(u.currency(ly)) : '—') + '</td>' +
        '<td style="text-align:right;">' + (y2 != null ? esc(u.currency(y2)) : '—') + '</td>' +
        '<td style="text-align:right;">' + (y3 != null ? esc(u.currency(y3)) : '—') + '</td>' +
      '</tr>';
    };

    return '<div>' +
      '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); margin-bottom: var(--space-4);">' +
        '<div class="stat-card"><div class="stat-card__label">UPB</div><div class="stat-card__value">' + esc(u.currencyCompact(loan.current_upb || 0)) + '</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">DSCR (LY)</div><div class="stat-card__value">' + (m.dscr_latest_year != null ? Number(m.dscr_latest_year).toFixed(2) + 'x' : '—') + '</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">RATE / TYPE</div><div class="stat-card__value" style="font-size: var(--text-lg);">' + esc(loan.current_interest_rate != null ? (Number(loan.current_interest_rate) * 100).toFixed(2) + '%' : '—') + ' ' + esc(loan.current_interest_rate_type || '') + '</div></div>' +
        '<div class="stat-card"><div class="stat-card__label">REMAINING</div><div class="stat-card__value" style="font-size: var(--text-lg);">' + esc(formatTerm(loan.remaining_term_months)) + '</div></div>' +
      '</div>' +

      (qc ? '<div style="margin-bottom: var(--space-4);">' + renderQcBadge(qc.status) + ' <span style="margin-left: var(--space-2); color: var(--color-text-muted); font-size: var(--text-sm);">' + esc(qc.finding || '') + '</span></div>' : '') +

      (loan.risk_flags && loan.risk_flags.length ? '<div style="margin-bottom: var(--space-4);">' + renderRiskFlagPills(loan.risk_flags) + '</div>' : '') +

      '<h4 style="font-family: var(--font-heading); margin: var(--space-4) 0 var(--space-2);">Property</h4>' +
      '<div style="font-size: var(--text-sm);">' +
        esc(p.street1 || '') + (p.street2 ? ', ' + esc(p.street2) : '') + ' · ' +
        esc((p.city || '') + (p.state ? ', ' + p.state : '') + (p.zip ? ' ' + p.zip : '')) +
        (p.year_built ? ' · Built ' + esc(Math.round(p.year_built)) : '') +
        (p.year_renovated ? ' · Renov. ' + esc(Math.round(p.year_renovated)) : '') +
      '</div>' +

      renderAssetClassPanel(loan) +

      '<h4 style="font-family: var(--font-heading); margin: var(--space-6) 0 var(--space-2);">3-year financial trend</h4>' +
      '<table class="data-table">' +
        '<thead><tr><th>Line</th><th style="text-align:right;">Latest</th><th style="text-align:right;">Y-1</th><th style="text-align:right;">Y-2</th></tr></thead>' +
        '<tbody>' +
          financialRow('Total revenue',  ly.total_revenue, y2.total_revenue, y3.total_revenue) +
          financialRow('Total expenses', ly.total_expenses, y2.total_expenses, y3.total_expenses) +
          financialRow('NOI',            ly.noi, y2.noi, y3.noi) +
        '</tbody>' +
      '</table>' +

      '<h4 style="font-family: var(--font-heading); margin: var(--space-6) 0 var(--space-2);">Borrower</h4>' +
      '<div style="font-size: var(--text-sm);">' +
        '<div><strong>' + esc(b.name || '—') + '</strong></div>' +
        '<div style="color: var(--color-text-muted);">' + esc((b.address1 || '') + (b.city ? ', ' + b.city : '') + (b.state ? ', ' + b.state : '')) + '</div>' +
        (b.tax_id_masked ? '<div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted); margin-top: var(--space-1);">EIN: ' + esc(b.tax_id_masked) + '</div>' : '') +
      '</div>' +

      '<h4 style="font-family: var(--font-heading); margin: var(--space-6) 0 var(--space-2);">Lien stack</h4>' +
      '<table class="data-table">' +
        '<thead><tr><th>Position</th><th>Lender</th><th style="text-align:right;">Balance</th><th>Status</th></tr></thead>' +
        '<tbody>' + lien.map(function (l) {
          return '<tr><td>' + esc(l.position) + '</td><td>' + esc(l.lender || '—') + '</td><td style="text-align:right;">' + esc(u.currency(l.balance || 0)) + '</td><td>' + esc(l.status || '—') + '</td></tr>';
        }).join('') + '</tbody>' +
      '</table>' +

      ((de.delinquent_interest || de.delinquent_principal) ? '<div class="banner banner--warning" style="margin-top: var(--space-4);"><strong>Delinquencies:</strong> ' +
        (de.delinquent_interest ? 'Interest ' + esc(u.currency(de.delinquent_interest)) : '') +
        (de.delinquent_principal ? ' · Principal ' + esc(u.currency(de.delinquent_principal)) : '') +
      '</div>' : '') +

    '</div>';
  }

  /** sheet = HSG.bidding.deal.validateSheet(...) result; bids carry { assetId, pct, usd }. */
  function renderBidSlip(sheet, sale) {
    var saleId = sale.sale_id || sale.saleId;
    var terms = sale.deposit_terms || sale.depositTerms;
    var bids = (sheet && sheet.bids) || [];
    if (bids.length === 0) {
      return '<div class="card" style="padding: var(--space-5);">' +
        '<h3 style="font-family: var(--font-heading); margin-bottom: var(--space-2);">Bid form</h3>' +
        '<p style="color: var(--color-text-muted); font-size: var(--text-sm);">Enter a BID % of UPB on an asset above to add it. Assets left blank are simply not bid.</p>' +
      '</div>';
    }
    var s = HSG.bidding.deal.slipTotal(bids, terms);
    return '<div class="card" style="padding: var(--space-5);">' +
      '<h3 style="font-family: var(--font-heading); margin-bottom: var(--space-3);">Bid form — ' + esc(saleId) + '</h3>' +
      '<table class="data-table" style="margin-bottom: var(--space-3);">' +
        '<thead><tr><th>Asset</th><th style="text-align:right;">BID %</th><th style="text-align:right;">BID $ (derived)</th></tr></thead>' +
        '<tbody>' + bids.map(function (b) {
          return '<tr><td>' + esc(b.assetId) + '</td><td style="text-align:right;">' + esc(b.pct) + '%</td><td style="text-align:right;">' + esc(u.currency(b.usd)) + '</td></tr>';
        }).join('') + '</tbody>' +
      '</table>' +
      '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-3); padding: var(--space-3); background: var(--color-portal-soft); border-radius: var(--radius-md);">' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">ASSETS</div><div style="font-weight: 600;">' + s.assetCount + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">TOTAL (DERIVED)</div><div style="font-weight: 600;">' + esc(u.currency(s.totalUSD)) + '</div></div>' +
        '<div><div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--color-text-muted);">DEPOSIT</div><div style="font-weight: 600;">' + esc(u.currency(s.depositUSD)) + '</div></div>' +
      '</div>' +
      '<p style="font-size: var(--text-xs); color: var(--color-text-muted); margin-top: var(--space-2);">Deposit per the BIP: the greater of the floor or the stated percentage of your aggregate bid. Final figures are confirmed on your platform receipt.</p>' +
    '</div>';
  }

  return {
    esc: esc,
    formatTerm: formatTerm,
    FLAG_META: FLAG_META,
    poolHasCrossCollat: poolHasCrossCollat,
    renderSaleCard: renderSaleCard,
    renderDealRow: renderDealRow,
    renderPoolCard: renderPoolCard,
    renderBidSlip: renderBidSlip,
    renderRiskFlagPills: renderRiskFlagPills,
    renderFlaggedSummary: renderFlaggedSummary,
    renderQcBadge: renderQcBadge,
    renderCrossCollatBanner: renderCrossCollatBanner,
    renderMultifamilyPanel: renderMultifamilyPanel,
    renderHealthcarePanel: renderHealthcarePanel,
    renderAssetClassPanel: renderAssetClassPanel,
    renderLoanTape: renderLoanTape,
    renderLoanTapeRow: renderLoanTapeRow,
    renderLoanDetail: renderLoanDetail
  };
})();

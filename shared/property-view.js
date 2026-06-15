/**
 * HSG.propertyView — the bidder "Properties" tab: a pool map, per-property
 * cards with the BPO and the loan figures, a Street View / Maps link, and an
 * inline-generated BPO document. CSP-safe (inline SVG map, no external tiles
 * or iframes; Street View is a new-tab link). Works for any sale whose loans
 * carry property addresses.
 *
 *   HSG.propertyView.render(containerEl, { sale: sale, pools: pools, loans: loans });
 */
window.HSG = window.HSG || {};

HSG.propertyView = (function () {
  'use strict';

  var POOL_COLORS = ['#2563EB', '#0E9F6E', '#B45309', '#7C3AED', '#DC2626', '#0891B2', '#CA8A04', '#DB2777', '#475569', '#15803D'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function money(n) { return (window.HSG.utils && HSG.utils.currency) ? HSG.utils.currency(n) : ('$' + Math.round(Number(n) || 0).toLocaleString()); }
  function compact(n) { return (window.HSG.utils && HSG.utils.currencyCompact) ? HSG.utils.currencyCompact(n) : money(n); }
  function pid(p) { return p.pool_id || p.poolId; }
  function lid(l) { return l.loan_id || l.loanId; }

  var BASIS = { ULB: { field: 'ulb', label: 'ULB' }, UPB: { field: 'current_upb', label: 'UPB' }, BPO: { field: 'bpo_value', label: 'BPO' }, ETD: { field: 'etd_adjusted_bpo', label: 'ETD' } };
  function basisOf(sale) { return BASIS[String(sale.bid_basis || sale.bidBasis || (sale.programType === 'SFLS' ? 'UPB' : sale.programType === 'HNVLS' ? 'ETD' : sale.programType === 'HVLS' ? 'ULB' : 'UPB')).toUpperCase()] || BASIS.UPB; }

  function ensureStyle() {
    if (document.getElementById('hsg-pv-style')) return;
    var s = document.createElement('style'); s.id = 'hsg-pv-style';
    s.textContent = [
      '.pv__bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}',
      '.pv__pill{font:600 12.5px/1 var(--font-mono,monospace);padding:7px 13px;border-radius:999px;border:1px solid var(--color-border);background:var(--color-surface);color:var(--color-text);cursor:pointer}',
      '.pv__pill--on{background:var(--color-portal-dark,#0B1B33);color:#fff;border-color:var(--color-portal-dark,#0B1B33)}',
      '.pv__pill .dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:-1px}',
      '.pv__mapwrap{position:relative;border:1px solid var(--color-border);border-radius:var(--radius-lg,12px);overflow:hidden;background:#0B1B33;margin-bottom:18px}',
      '.pv__map{display:block;width:100%;height:auto}',
      '.pv__pin{cursor:pointer;transition:r .1s}',
      '.pv__pin:hover{stroke:#fff;stroke-width:2}',
      '.pv__tip{position:absolute;pointer-events:none;z-index:5;background:#0B1B33;color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:8px 11px;font-size:12px;line-height:1.5;max-width:240px;opacity:0;transform:translateY(4px);transition:opacity .12s;box-shadow:0 8px 24px rgba(0,0,0,.35)}',
      '.pv__tip b{color:#fff}',
      '.pv__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}',
      '.pv__card{border:1px solid var(--color-border);border-radius:var(--radius-lg,12px);background:var(--color-surface);padding:15px 16px;box-shadow:var(--shadow-sm)}',
      '.pv__card.hot{border-color:var(--color-portal,#2563EB);box-shadow:0 0 0 2px var(--color-portal-soft,#E8EEFF)}',
      '.pv__addr{font-weight:700;color:var(--color-ink);font-size:14.5px}',
      '.pv__sub{color:var(--color-text-muted);font-size:12.5px;margin-top:2px}',
      '.pv__bpo{margin-top:11px;display:flex;align-items:baseline;gap:8px}',
      '.pv__bpo b{font-family:var(--font-heading);font-size:23px;color:var(--color-ink);line-height:1}',
      '.pv__bpo span{font:600 10px/1 var(--font-mono,monospace);letter-spacing:.06em;color:var(--color-text-muted);text-transform:uppercase}',
      '.pv__rows{margin-top:10px;font-size:12.5px;color:var(--color-text)}',
      '.pv__rows div{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--color-grey-100,#f0f0f2)}',
      '.pv__rows div:last-child{border-bottom:none}',
      '.pv__rows span:first-child{color:var(--color-text-muted)}',
      '.pv__poolbadge{display:inline-block;margin-top:11px;font:600 10.5px/1 var(--font-mono,monospace);padding:4px 9px;border-radius:999px;color:#fff}',
      '.pv__acts{display:flex;gap:8px;margin-top:13px}',
      '.pv__act{flex:1;text-align:center;font:600 12px/1 inherit;padding:8px 10px;border-radius:var(--radius-md,8px);text-decoration:none;border:1px solid var(--color-border);color:var(--color-portal,#2563EB);background:var(--color-surface);cursor:pointer}',
      '.pv__act:hover{background:var(--color-portal-soft,#E8EEFF)}',
      '.pv__act--sv{background:var(--color-portal-dark,#0B1B33);color:#fff;border-color:var(--color-portal-dark,#0B1B33)}',
      '.pv__act--sv:hover{opacity:.92;background:var(--color-portal-dark,#0B1B33)}'
    ].join('');
    document.head.appendChild(s);
  }

  function loansForPool(pool, loans) {
    var ids = pool.loan_ids || pool.loanIds || [];
    return loans.filter(function (l) { return ids.indexOf(lid(l)) >= 0; });
  }

  function buildMap(W, H, items) {
    // items: [{loan, pt:{x,y}, color}]
    var states = [].concat.apply([], items.map(function (i) { return i.pt.state; }));
    var labels = HSG.geo.stateLabels([].concat.apply([], [Array.from(new Set(states))]), W, H);
    var svg = '<svg class="pv__map" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">';
    svg += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#0B1B33"/>';
    // faint grid
    for (var gx = 1; gx < 6; gx++) svg += '<line x1="' + (gx * W / 6) + '" y1="0" x2="' + (gx * W / 6) + '" y2="' + H + '" stroke="rgba(255,255,255,0.04)"/>';
    for (var gy = 1; gy < 3; gy++) svg += '<line x1="0" y1="' + (gy * H / 3) + '" x2="' + W + '" y2="' + (gy * H / 3) + '" stroke="rgba(255,255,255,0.04)"/>';
    labels.forEach(function (l) { svg += '<text x="' + l.x + '" y="' + l.y + '" fill="rgba(255,255,255,0.22)" font-family="monospace" font-size="11" text-anchor="middle">' + l.state + '</text>'; });
    items.forEach(function (it) {
      var r = 4 + Math.min(5, (Number(it.loan.bpo_value) || 0) / 120000);
      svg += '<circle class="pv__pin" data-loan="' + esc(lid(it.loan)) + '" cx="' + it.pt.x.toFixed(1) + '" cy="' + it.pt.y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + it.color + '" fill-opacity="0.85" stroke="rgba(255,255,255,0.5)" stroke-width="0.75"/>';
    });
    svg += '</svg>';
    return svg;
  }

  // Minimal client-side BPO PDF (no library, CSP-safe blob).
  function bpoPdf(loan, sale) {
    var p = loan.property || {};
    function asc(s) { return String(s == null ? '' : s).replace(/[—–]/g, '-').replace(/[()\\]/g, ''); }
    var val = Number(loan.bpo_value) || 0;
    var lines = [
      'Property: ' + asc([p.address, p.city, p.state, p.zip].filter(Boolean).join(', ')),
      'FHA case number: ' + asc(loan.fha_case_number || '-'),
      'Sale: ' + asc((sale.sale_name || sale.saleId) + '  (' + sale.programType + ')'),
      '',
      'As-is market value (BPO): $' + val.toLocaleString(),
      'As-repaired value (est.): $' + Math.round(val * 1.18).toLocaleString(),
      'Suggested list price: $' + Math.round(val * 0.97).toLocaleString(),
      'Property condition: ' + asc(loan.property_condition || (loan.occupancy_status === 'VACANT' ? 'Average, vacant' : 'Average')),
      'Occupancy: ' + asc(loan.occupancy_status || '-'),
      '',
      'Comparable sales (illustrative):',
      '  1.  0.3 mi   $' + Math.round(val * 0.94).toLocaleString() + '   sold 2 mo ago',
      '  2.  0.6 mi   $' + Math.round(val * 1.05).toLocaleString() + '   sold 4 mo ago',
      '  3.  0.9 mi   $' + Math.round(val * 0.99).toLocaleString() + '   sold 1 mo ago',
      '',
      'This is a sample Broker Price Opinion generated for platform',
      'demonstration. Values are illustrative and not a real appraisal.'
    ];
    var content = 'BT /F1 17 Tf 54 744 Td (Broker Price Opinion) Tj ET\n';
    var y = 712;
    lines.forEach(function (ln) { content += 'BT /F1 11 Tf 54 ' + y + ' Td (' + asc(ln) + ') Tj ET\n'; y -= 17; });
    var objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    var out = '%PDF-1.4\n', off = [];
    objs.forEach(function (o, i) { off.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    off.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return URL.createObjectURL(new Blob([out], { type: 'application/pdf' }));
  }

  function render(container, opts) {
    ensureStyle();
    var sale = opts.sale, pools = opts.pools || [], loans = opts.loans || [];
    var basis = basisOf(sale);
    var withAddr = loans.filter(function (l) { return l.property && (l.property.address || l.property.city); });
    if (!withAddr.length) { container.innerHTML = '<p class="empty">No property locations on this sale.</p>'; return; }

    var colorByPool = {}; pools.forEach(function (p, i) { colorByPool[pid(p)] = POOL_COLORS[i % POOL_COLORS.length]; });
    function colorOf(l) { return colorByPool[l.poolId] || POOL_COLORS[0]; }

    var W = 760, H = 392, state = { pool: 'all' };

    container.innerHTML =
      '<div class="pv__bar" id="pv-bar"></div>' +
      '<div class="pv__mapwrap"><div id="pv-map"></div><div class="pv__tip" id="pv-tip"></div></div>' +
      '<div class="pv__grid" id="pv-grid"></div>';

    var bar = container.querySelector('#pv-bar');
    bar.innerHTML = ['<button class="pv__pill pv__pill--on" data-pool="all">All properties (' + withAddr.length + ')</button>']
      .concat(pools.map(function (p) {
        var n = loansForPool(p, withAddr).length;
        return '<button class="pv__pill" data-pool="' + esc(pid(p)) + '"><span class="dot" style="background:' + colorByPool[pid(p)] + '"></span>' + esc(p.pool_name || pid(p)) + ' (' + n + ')</button>';
      })).join('');

    var tip = container.querySelector('#pv-tip');
    function visible() { return state.pool === 'all' ? withAddr : withAddr.filter(function (l) { return l.poolId === state.pool; }); }

    function draw() {
      var vis = visible();
      var items = vis.map(function (l) { var pt = HSG.geo.pointFor(l, W, H); return pt ? { loan: l, pt: pt, color: colorOf(l) } : null; }).filter(Boolean);
      container.querySelector('#pv-map').innerHTML = buildMap(W, H, items);
      // cards
      container.querySelector('#pv-grid').innerHTML = vis.map(function (l) {
        var p = l.property || {}, pl = pools.find(function (x) { return pid(x) === l.poolId; });
        var basisVal = Number(l[basis.field]) || 0;
        return '<div class="pv__card" data-loan="' + esc(lid(l)) + '">' +
          '<div class="pv__addr">' + esc(l.property_name || p.address || lid(l)) + '</div>' +
          '<div class="pv__sub">' + esc([p.city, p.state, p.zip].filter(Boolean).join(', ')) + (l.county ? ' &middot; ' + esc(l.county) + ' County' : '') + '</div>' +
          '<div class="pv__bpo"><b>' + money(l.bpo_value) + '</b><span>BPO value</span></div>' +
          '<div class="pv__rows">' +
            '<div><span>' + basis.label + '</span><span>' + money(basisVal) + '</span></div>' +
            (l.occupancy_status ? '<div><span>Occupancy</span><span>' + esc(l.occupancy_status) + '</span></div>' : '') +
            (l.units ? '<div><span>Units</span><span>' + esc(l.units) + '</span></div>' : '') +
            (l.servicer ? '<div><span>Servicer</span><span>' + esc(l.servicer) + '</span></div>' : '') +
          '</div>' +
          '<span class="pv__poolbadge" style="background:' + colorOf(l) + '">' + esc(pl ? (pl.pool_name || pid(pl)) : l.poolId) + '</span>' +
          '<div class="pv__acts">' +
            '<a class="pv__act pv__act--sv" href="' + esc(HSG.geo.mapsUrl(l)) + '" target="_blank" rel="noopener">Street View &#8599;</a>' +
            '<button class="pv__act" data-bpo="' + esc(lid(l)) + '">View BPO &#8599;</button>' +
          '</div>' +
        '</div>';
      }).join('');
      wirePins();
    }

    function wirePins() {
      var byId = {}; visible().forEach(function (l) { byId[lid(l)] = l; });
      container.querySelectorAll('.pv__pin').forEach(function (pin) {
        var l = byId[pin.getAttribute('data-loan')]; if (!l) return;
        pin.addEventListener('mousemove', function (e) {
          var wrap = container.querySelector('.pv__mapwrap').getBoundingClientRect();
          tip.style.left = (e.clientX - wrap.left + 12) + 'px'; tip.style.top = (e.clientY - wrap.top + 12) + 'px';
          var p = l.property || {};
          tip.innerHTML = '<b>' + esc(l.property_name || p.address || '') + '</b><br>' + esc([p.city, p.state].filter(Boolean).join(', ')) + '<br>BPO ' + money(l.bpo_value);
          tip.style.opacity = '1';
          var card = container.querySelector('.pv__card[data-loan="' + (window.CSS && CSS.escape ? CSS.escape(lid(l)) : lid(l)) + '"]');
          if (card) card.classList.add('hot');
        });
        pin.addEventListener('mouseleave', function () { tip.style.opacity = '0'; container.querySelectorAll('.pv__card.hot').forEach(function (c) { c.classList.remove('hot'); }); });
        pin.addEventListener('click', function () { window.open(HSG.geo.mapsUrl(l), '_blank', 'noopener'); });
      });
      container.querySelectorAll('[data-bpo]').forEach(function (b) {
        b.addEventListener('click', function () {
          var l = visible().find(function (x) { return lid(x) === b.getAttribute('data-bpo'); });
          if (l) window.open(bpoPdf(l, sale), '_blank', 'noopener');
        });
      });
    }

    bar.querySelectorAll('[data-pool]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        bar.querySelectorAll('.pv__pill').forEach(function (x) { x.classList.remove('pv__pill--on'); });
        btn.classList.add('pv__pill--on'); state.pool = btn.getAttribute('data-pool'); draw();
      });
    });
    draw();
  }

  return { render: render };
})();

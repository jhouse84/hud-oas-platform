/**
 * HSG.demoDocs — realistic document generator for the demo data room.
 *
 * The demo VDR lists the full document structure; without this, every download
 * is a one-line placeholder. This builds a populated, real-looking single-page
 * PDF per document type (BPO, Note, Mortgage, Title, Occupancy, Servicing, the
 * Bidder Information Package, etc.), filled from the asset's actual loan data,
 * so a tester sees "what it looks like to view real files." Every page carries
 * a SAMPLE / demonstration watermark line. No libraries, CSP-safe blob.
 */
window.HSG = window.HSG || {};

HSG.demoDocs = (function () {
  'use strict';

  function asc(s) {
    return String(s == null ? '' : s).replace(/[—–]/g, '-')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[()\\]/g, '');
  }
  function money(n) { n = Number(n) || 0; return '$' + Math.round(n).toLocaleString(); }
  function pct(n) { return (Number(n) || 0).toFixed(3) + '%'; }
  var _furnished = '';   // per-bidder watermark line, set by forDoc()

  // ---- single-page PDF from blocks: {h}|{kv:[[k,v]]}|{p:[lines]}|{gap} ----
  function buildPdf(title, sub, blocks, footer) {
    var ops = [];
    function T(x, y, size, s) { ops.push('BT /F1 ' + size + ' Tf ' + x + ' ' + y + ' Td (' + asc(s) + ') Tj ET'); }
    function TB(x, y, size, s) { ops.push('BT /F2 ' + size + ' Tf ' + x + ' ' + y + ' Td (' + asc(s) + ') Tj ET'); }
    var y = 756;
    TB(54, y, 17, title); y -= 20;
    if (sub) { T(54, y, 10, sub); y -= 8; }
    ops.push('0.75 w 54 ' + y + ' m 558 ' + y + ' l S'); y -= 20;
    blocks.forEach(function (b) {
      if (y < 80) return;
      if (b.gap) { y -= b.gap; return; }
      if (b.h) { TB(54, y, 12, b.h); y -= 17; }
      if (b.kv) b.kv.forEach(function (r) {
        if (y < 80) return;
        T(58, y, 10, r[0]); T(280, y, 10, String(r[1])); y -= 15;
      });
      if (b.p) b.p.forEach(function (ln) { if (y < 80) return; T(58, y, 10, ln); y -= 14; });
      y -= 6;
    });
    // footer watermark
    ops.push('0.6 w 54 74 m 558 74 l S');
    T(54, 60, 8.5, footer || 'SAMPLE DOCUMENT - platform demonstration. Illustrative data, not a real instrument.');
    if (_furnished) T(54, 48, 8, _furnished);
    var content = ops.join('\n') + '\n';
    var objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
      '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
    ];
    var out = '%PDF-1.4\n', off = [];
    objs.forEach(function (o, i) { off.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var xref = out.length; out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    off.forEach(function (o) { out += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    return URL.createObjectURL(new Blob([out], { type: 'application/pdf' }));
  }

  function addr(loan) { var p = (loan && loan.property) || {}; return [p.address, p.city, p.state, p.zip].filter(Boolean).join(', '); }
  function sellerLine(sale) { return (sale.seller === 'Ginnie Mae' ? 'Government National Mortgage Association' : 'U.S. Department of Housing and Urban Development') + ' - Office of Asset Sales'; }
  function head(sale, loan, kind) {
    return sellerLine(sale) + '   |   ' + (sale.sale_name || sale.saleId) + '   |   ' + kind;
  }

  // ---- per-type templates (loan = the asset, sale = the sale) ----
  function bpo(sale, loan) {
    var v = Number(loan.bpo_value) || 0;
    return buildPdf('Broker Price Opinion', head(sale, loan, 'BPO'), [
      { h: 'Subject property', kv: [['Address', addr(loan)], ['FHA case number', loan.fha_case_number || '-'], ['Occupancy', loan.occupancy_status || '-'], ['Property type', loan.asset_class || 'Single family residence']] },
      { h: 'Opinion of value', kv: [['As-is market value', money(v)], ['As-repaired value', money(v * 1.18)], ['Estimated repairs', money(v * 0.12)], ['Suggested list price', money(v * 0.97)], ['Marketing time', '90-120 days']] },
      { h: 'Comparable sales', p: [
        '1.   0.3 mi   ' + money(v * 0.94) + '   1,640 sf   sold 2 months ago',
        '2.   0.6 mi   ' + money(v * 1.05) + '   1,880 sf   sold 4 months ago',
        '3.   0.9 mi   ' + money(v * 0.99) + '   1,720 sf   sold 1 month ago'
      ] },
      { h: 'Condition', p: ['Exterior: average. Roof and systems functional. ' + (loan.occupancy_status === 'VACANT' ? 'Vacant; secured.' : 'Occupied at inspection.')] }
    ], 'SAMPLE Broker Price Opinion - platform demonstration. Not a certified appraisal.');
  }
  function avm(sale, loan) {
    var v = Number(loan.bpo_value) || 0;
    return buildPdf('Automated Valuation Model', head(sale, loan, 'AVM'), [
      { h: 'Subject', kv: [['Address', addr(loan)], ['FHA case number', loan.fha_case_number || '-']] },
      { h: 'Valuation', kv: [['AVM estimate', money(v * 0.98)], ['Value range (low)', money(v * 0.9)], ['Value range (high)', money(v * 1.08)], ['Confidence score', '82 / 100'], ['Forecast standard deviation', '9%']] },
      { h: 'Model notes', p: ['Hedonic model on county records and recent arms-length sales within 1 mile.'] }
    ], 'SAMPLE AVM - platform demonstration.');
  }
  function note(sale, loan) {
    return buildPdf('Promissory Note (Adjustable Rate - HECM)', head(sale, loan, 'Note'), [
      { h: 'Loan', kv: [['FHA case number', loan.fha_case_number || '-'], ['Original principal limit', money(loan.original_principal_balance || loan.current_upb)], ['Note rate', pct(loan.interest_rate || 0)], ['Property', addr(loan)]] },
      { h: 'Terms', p: [
        'For value received, the undersigned Borrower promises to pay to the order of',
        'the Lender the principal balance advanced under the Home Equity Conversion',
        'Mortgage, together with interest accruing on the outstanding balance.',
        'Repayment becomes due upon a maturity event as defined in the Loan Agreement.'
      ] },
      { h: 'Maturity events', p: ['Death of last surviving borrower; sale of the property; failure to occupy; or failure to meet tax and insurance obligations.'] }
    ], 'SAMPLE Promissory Note - platform demonstration. Not a negotiable instrument.');
  }
  function mortgage(sale, loan) {
    return buildPdf('Mortgage / Deed of Trust', head(sale, loan, 'Security Instrument'), [
      { h: 'Security instrument', kv: [['FHA case number', loan.fha_case_number || '-'], ['Secured amount', money((loan.bpo_value || loan.current_upb) * 1.5)], ['Property', addr(loan)], ['County', loan.county || '-']] },
      { h: 'Granting clause', p: [
        'Borrower irrevocably grants and conveys to the Trustee, in trust, with power',
        'of sale, the property described herein, together with all improvements and',
        'appurtenances, to secure the indebtedness evidenced by the Note.'
      ] },
      { h: 'Recording', kv: [['Instrument', 'Recorded'], ['Lien position', 'First'], ['Assignment to HUD', 'Recorded']] }
    ], 'SAMPLE Security Instrument - platform demonstration.');
  }
  function titleDoc(sale, loan) {
    return buildPdf('Title Commitment', head(sale, loan, 'Title'), [
      { h: 'Property', kv: [['Address', addr(loan)], ['FHA case number', loan.fha_case_number || '-']] },
      { h: 'Schedule A', kv: [['Estate', 'Fee simple'], ['Vested in', 'HUD Secretary, by assignment'], ['Policy amount', money(loan.bpo_value)]] },
      { h: 'Schedule B - exceptions', p: ['1. Taxes for the current year, a lien not yet due.', '2. Easements and restrictions of record.', '3. Prior HECM mortgage, assigned to HUD.'] }
    ], 'SAMPLE Title Commitment - platform demonstration.');
  }
  function occupancy(sale, loan) {
    return buildPdf('Occupancy / Property Inspection', head(sale, loan, 'Inspection'), [
      { h: 'Inspection', kv: [['Address', addr(loan)], ['Status', loan.occupancy_status || '-'], ['Exterior condition', loan.property_condition || 'Average'], ['Utilities', 'Off'], ['Secured', loan.occupancy_status === 'VACANT' ? 'Yes - lockbox' : 'N/A']] },
      { h: 'Observations', p: ['Drive-by and exterior inspection completed. ' + (loan.occupancy_status === 'VACANT' ? 'No signs of occupancy; lawn maintained by field services.' : 'Occupant present at inspection.')] }
    ], 'SAMPLE Inspection report - platform demonstration.');
  }
  function servicing(sale, loan) {
    return buildPdf('Servicing Comments', head(sale, loan, 'Servicing'), [
      { h: 'Account', kv: [['FHA case number', loan.fha_case_number || '-'], ['Servicer', loan.servicer || '-'], ['Status', 'Due and payable - assigned to HUD'], ['Assignment date', loan.assignment_date || '-']] },
      { h: 'Recent activity', p: [
        'Borrower deceased / maturity event confirmed. Loan called due and payable.',
        'Property referred to field services. BPO ordered and received.',
        'Loan assigned to HUD Secretary and placed in the asset-sale population.'
      ] }
    ], 'SAMPLE Servicing notes - platform demonstration.');
  }
  function bip(sale, loan) {
    var s = sale.summary || {};
    return buildPdf('Bidder Information Package', sellerLine(sale) + '   |   ' + (sale.sale_name || sale.saleId), [
      { h: 'Sale overview', kv: [['Sale', sale.sale_name || sale.saleId], ['Program', sale.programType], ['Pools', (sale.pools || []).length], ['Loans', s.loan_count || '-'], ['Official bid basis', sale.bid_basis || '-']] },
      { h: 'Key dates', kv: [['Data room go-live', (sale.key_dates || {}).go_live_data_room || '-'], ['Qualification closes', (sale.key_dates || {}).qualification_closes || '-'], ['Bid day', (sale.key_dates || {}).bid_day || '-']] },
      { h: 'How to bid', p: [
        'Qualified bidders submit a sealed bid as a percentage of the official basis',
        'for every loan in each pool. Whole-pool participation is required. The deposit',
        'is the greater of 10% of the aggregate bid or $100,000.'
      ] },
      { h: 'Pools', p: (sale.pools || []).slice(0, 6).map(function (p) { return '- ' + (p.pool_name || p.pool_id) + ': ' + ((p.summary || {}).loan_count || 0) + ' loans, ' + money((p.summary || {}).aggregate_bpo || (p.summary || {}).aggregate_upb) + ' BPO'; }) }
    ], 'SAMPLE Bidder Information Package - platform demonstration.');
  }
  function generic(sale, loan, title) {
    var blocks = [{ h: 'Document', kv: [['Type', title], ['Sale', sale.sale_name || sale.saleId], ['Program', sale.programType]] }];
    if (loan) blocks.push({ h: 'Asset', kv: [['Property', addr(loan)], ['FHA case number', loan.fha_case_number || '-'], ['BPO value', money(loan.bpo_value)]] });
    blocks.push({ h: 'Contents', p: ['This document is part of the ' + (sale.sale_name || sale.saleId) + ' data room.', 'In a live sale this is the executed/recorded instrument or report.'] });
    return buildPdf(title, head(sale, loan, title), blocks, 'SAMPLE document - platform demonstration.');
  }

  function forDoc(doc, ctx) {
    var sale = ctx.sale || {}, loan = ctx.loan || {};
    _furnished = ctx.entity ? ('Furnished to ' + ctx.entity + ' on ' + new Date().toISOString().slice(0, 10) + '. In production: per-bidder watermark, 5-minute link, access-logged with IP and user agent.') : '';
    var t = (doc.title || doc.name || '').toLowerCase();
    if (/bpo|broker price/.test(t)) return bpo(sale, loan);
    if (/\bavm\b|automated valuation/.test(t)) return avm(sale, loan);
    if (/promissory|(^|[^a-z])note([^a-z]|$)/.test(t)) return note(sale, loan);
    if (/mortgage|deed of trust|security instrument/.test(t)) return mortgage(sale, loan);
    if (/title/.test(t)) return titleDoc(sale, loan);
    if (/occupancy|inspection/.test(t)) return occupancy(sale, loan);
    if (/servicing|payment history|collection/.test(t)) return servicing(sale, loan);
    if (/bidder information|(^|[^a-z])bip([^a-z]|$)|supplement/.test(t)) return bip(sale, loan);
    return generic(sale, loan, doc.title || doc.name || 'Document');
  }

  return { forDoc: forDoc, buildPdf: buildPdf };
})();

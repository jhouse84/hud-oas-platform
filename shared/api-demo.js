/**
 * DEMO MODE — self-contained, no-login twin of the platform API.
 *
 * Activated only when the URL carries ?demo=1 (or a demo session is already
 * active). Replaces HSG.api and HSG.cognito with an in-browser implementation
 * backed by demo/data.js — the exact sales, pools, and loans the live API
 * serves — and REPLICATES the server's bid rules: per-loan % validation,
 * whole-pool participation, $100 derived minimums, HNVLS 175% cap, deposit
 * formula, receipt + completion CODE, in-window supersede, withdraw.
 *
 * Nothing in demo mode touches live systems. Reviewer actions persist in
 * sessionStorage for the visit and reset on a fresh session.
 */
(function () {
  'use strict';

  var qs = new URLSearchParams(window.location.search);
  // Variants: ?demo=1 → the HUD OAS demonstration · ?demo=gnma → the Ginnie Mae
  // demonstration (separate dataset + session store). The variant is sticky;
  // arriving with an explicit ?demo= switches it.
  //
  // ?real=1 is an explicit escape (used by the admin for the live-login smoke):
  // it clears the demo flag so a real sign-in is not bounced back into the demo.
  if (qs.get('real') === '1') {
    try { localStorage.removeItem('hsg.demo.active'); localStorage.removeItem('hsg.demo.variant'); sessionStorage.removeItem('hsg.demo.active'); } catch (e) {}
    return;
  }
  var qsDemo = qs.get('demo');
  if (qsDemo === '1' || qsDemo === 'gnma') {
    var _v = qsDemo === 'gnma' ? 'gnma' : '';
    // Persist in localStorage (not just sessionStorage) so the demo survives new
    // tabs, reloads, and URLs that drop the ?demo param. A non-technical tester
    // cannot accidentally fall out of the demo into a real login wall.
    try { localStorage.setItem('hsg.demo.active', '1'); localStorage.setItem('hsg.demo.variant', _v); } catch (e) {}
    try { sessionStorage.setItem('hsg.demo.active', '1'); sessionStorage.setItem('hsg.demo.variant', _v); } catch (e) {}
  }
  var ACTIVE = false, VARIANT = '';
  try {
    ACTIVE = localStorage.getItem('hsg.demo.active') === '1' || sessionStorage.getItem('hsg.demo.active') === '1';
    VARIANT = localStorage.getItem('hsg.demo.variant') || sessionStorage.getItem('hsg.demo.variant') || '';
  } catch (e) {}
  if (!ACTIVE) return;                       // no-op outside demo sessions
  var D = (VARIANT === 'gnma' && window.HSG_DEMO_DATA_GNMA) ? window.HSG_DEMO_DATA_GNMA : window.HSG_DEMO_DATA;
  if (VARIANT === 'gnma' && !window.HSG_DEMO_DATA_GNMA) console.warn('GNMA demo data missing on this page; using default dataset');
  if (!D) { console.warn('Demo mode active but data.js missing'); return; }

  window.HSG = window.HSG || {};
  window.HSG_DEMO = true;
  window.HSG_DEMO_VARIANT = VARIANT;

  // ---------------------------------------------------------------------
  // Session store — reviewer actions live here for the visit
  // ---------------------------------------------------------------------
  var NS = 'hsg.demo.' + (VARIANT ? VARIANT + '.' : '');   // per-variant session store
  function load(key, fallback) {
    try { var v = sessionStorage.getItem(NS + key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, val) { try { sessionStorage.setItem(NS + key, JSON.stringify(val)); } catch (e) {} }
  function uid(p) { return p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function now() { return new Date().toISOString(); }
  function round2(n) { return Math.round(Number(n) * 100) / 100; }

  var store = {
    bids: load('bids', (D.seedBids || []).slice()),
    staffUploads: load('staffUploads', (D.seedStaffUploads || []).slice()),
    qa: load('qa', (D.qa || []).slice()),
    notifications: load('notifications', [{
      notifId: 'NTF-DEMO-WELCOME', recipientId: 'BDR-DEMO', type: 'welcome',
      title: 'Welcome to the demonstration',
      message: 'You are signed in as a qualified demo bidder. Everything here runs on sample data — explore freely.',
      createdAt: now()
    }]),
    settlements: load('settlements', D.seedSettlements || [{
      awardId: 'AWD-DEMO-1', saleId: 'HLS-2026-DEMO', poolOrDealId: 'HLS-2026-DEMO-P2',
      bidderId: 'BDR-DEMO', programType: 'HLS', awardAmountUSD: 18250000,
      status: 'On track', expectedSettlementDate: new Date(Date.now() + 86400000 * 41).toISOString(),
      milestones: [
        { label: 'Award notice issued', status: 'done', dueOffsetDays: 0 },
        { label: 'Deposit reconciled', status: 'done', dueOffsetDays: 3 },
        { label: 'CAA executed', status: 'active', dueOffsetDays: 10 },
        { label: 'Interim servicing transfer', status: 'upcoming', dueOffsetDays: 30 },
        { label: 'Final settlement & wire', status: 'upcoming', dueOffsetDays: 63 }
      ],
      deliverables: [
        { label: 'Executed CAA', category: 'legal', required: true, completed: false },
        { label: 'Wire instructions acknowledged', category: 'financial', required: true, completed: true },
        { label: 'Servicer designation letter', category: 'operational', required: true, completed: false }
      ]
    }]),
    scenarios: load('scenarios', []),
    bidders: load('bidders', (D.bidders || []).slice()),
    audit: load('audit', []),
    // Sales + loans created via the Sale Setup wizard this session. Merged onto
    // the dataset below so they behave exactly like seeded sales everywhere.
    newSales: load('newSales', []),
    newLoans: load('newLoans', [])
  };
  // Overlay wizard-created sales/loans onto the (freshly reloaded) dataset.
  // D is rebuilt from data.js on every page load, so this concat is idempotent.
  if (store.newSales.length) {
    var haveSale = {}; (D.sales || []).forEach(function (s) { haveSale[s.saleId] = 1; });
    store.newSales.forEach(function (s) { if (!haveSale[s.saleId]) (D.sales = D.sales || []).push(s); });
  }
  if (store.newLoans.length) { D.loans = (D.loans || []).concat(store.newLoans); }
  function persist() {
    save('bids', store.bids); save('qa', store.qa); save('notifications', store.notifications);
    save('settlements', store.settlements); save('scenarios', store.scenarios); save('bidders', store.bidders);
    save('audit', store.audit); save('newSales', store.newSales); save('newLoans', store.newLoans);
  }
  /** Append-only audit trail of everything the reviewer does in the session. */
  function record(action, detail) {
    store.audit.push({ at: now(), actor: (D.demoBidder && D.demoBidder.entityName) || 'Demo Reviewer', action: action, detail: detail || '' });
    if (store.audit.length > 500) store.audit = store.audit.slice(-500);
  }

  // ---------------------------------------------------------------------
  // Data helpers — mirror the server's redaction + derivation rules
  // ---------------------------------------------------------------------
  var ADMIN_ONLY = /reserve|floor|bem|completion_code|completionCode/i;
  function redact(obj) {
    if (Array.isArray(obj)) return obj.map(redact);
    if (obj && typeof obj === 'object') {
      var out = {};
      Object.keys(obj).forEach(function (k) { if (!ADMIN_ONLY.test(k)) out[k] = redact(obj[k]); });
      return out;
    }
    return obj;
  }
  function saleById(id) { return (D.sales || []).find(function (s) { return s.saleId === id; }); }
  function loansFor(id) { return (D.loans || []).filter(function (l) { return l.saleId === id; }); }
  function demoPortalForProgram(p) { return (p === 'MHLS' || p === 'HLS') ? 'commercial' : (p === 'HVLS' || p === 'HNVLS' || p === 'SFLS') ? 'residential' : null; }
  // Bid basis per SALE (sale.bid_basis), with program defaults. Mirrors the server.
  var BASIS_FIELD = { ULB: 'ulb', UPB: 'current_upb', BPO: 'bpo_value', ETD: 'etd_adjusted_bpo' };
  function basisKey(programType, sale) {
    var explicit = sale && (sale.bid_basis || sale.bidBasis);
    if (explicit) return String(explicit).toUpperCase();
    if (programType === 'HNVLS') return 'ETD';
    if (programType === 'SFLS') return 'UPB';
    if (programType === 'HVLS') return 'ULB';
    return 'UPB';
  }
  function loanBasisValue(loan, key) {
    var v = Number(loan[BASIS_FIELD[key]]);
    if (!v) {
      if (key === 'ULB') v = Number(loan.unpaid_loan_balance) || Number(loan.current_upb);
      else if (key === 'ETD') v = Number(loan.etdAdjustedBpo) || Number(loan.bpo_value);
    }
    return v || 0;
  }
  function depositFor(agg, terms) {
    terms = terms || {};
    var rate = terms.deposit_pct_of_aggregate_bid != null ? terms.deposit_pct_of_aggregate_bid : 0.10;
    var floor = terms.minimum_deposit_floor != null ? terms.minimum_deposit_floor : 100000;
    var under = terms.under_floor_pct != null ? terms.under_floor_pct : 0.50;
    if (agg <= 0) return 0;
    if (agg < floor) return Math.ceil(agg * under);
    return Math.max(floor, Math.ceil(agg * rate));
  }
  function fail(msg, code) { var e = new Error(msg); e.statusCode = code || 400; return Promise.reject(e); }

  // ---------------------------------------------------------------------
  // Identity — qualified demo bidder with admin visibility for the console
  // ---------------------------------------------------------------------
  var CLAIMS = {
    email: D.demoBidder.contactEmail,
    'custom:bidderId': D.demoBidder.bidderId,
    'custom:entityName': D.demoBidder.entityName,
    'custom:portalScope': 'both',
    'cognito:groups': ['admin-superuser', 'residential-bidder', 'commercial-bidder']
  };

  HSG.cognito = {
    isAuthenticated: function () { return true; },
    parseIdTokenClaims: function () { return CLAIMS; },
    signIn: function () { return Promise.resolve({ tokens: { demo: true }, claims: CLAIMS }); },
    signOut: function () { try { sessionStorage.clear(); } catch (e) {} },
    completeNewPassword: function () { return Promise.resolve({ tokens: { demo: true }, claims: CLAIMS }); },
    respondMfa: function () { return Promise.resolve({ tokens: { demo: true }, claims: CLAIMS }); }
  };

  // ---------------------------------------------------------------------
  // Demo documents — tiny real PDFs generated in-browser, "watermarked"
  // ---------------------------------------------------------------------
  function demoPdf(title, lines) {
    var content = 'BT /F1 16 Tf 60 740 Td (' + title.replace(/[()\\]/g, '') + ') Tj ET\n';
    var y = 700;
    lines.concat(['', 'CONFIDENTIAL - furnished to ' + D.demoBidder.entityName,
                  'Retrieved ' + now() + ' - demonstration document']).forEach(function (ln) {
      content += 'BT /F1 10 Tf 60 ' + y + ' Td (' + String(ln).replace(/[()\\]/g, '') + ') Tj ET\n';
      y -= 16;
    });
    var pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n' +
      '4 0 obj<</Length ' + content.length + '>>stream\n' + content + 'endstream\nendobj\n' +
      '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Size 6/Root 1 0 R>>\n%%EOF';
    return URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  }
  // -------------------------------------------------------------------
  // Virtual Data Room — modeled on the canonical HUD sale workspace:
  // sale-level documents (BIP + supplements, tape, procedures, forms) plus
  // a per-asset file set split into Due Diligence Files and Collateral
  // Files, named with the real convention: {STATE}_{FHA#}_{DOCTYPE}.pdf
  // -------------------------------------------------------------------
  function hashNum(str, lo, hi) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return lo + (Math.abs(h) % (hi - lo + 1));
  }

  var DOC_SETS = {
    HVLS: {
      dd: ['BPO', 'AVM', 'Title Search', 'Occupancy Inspection', 'Servicing Comments'],
      collateral: ['Note', 'Mortgage', 'Assignment Chain', 'Title Policy', 'HECM Loan Agreement']
    },
    HNVLS: {
      dd: ['BPO', 'ETD-Adjusted BPO Worksheet', 'AVM', 'Title Search', 'Occupancy Inspection', 'Servicing Comments'],
      collateral: ['Note', 'Mortgage', 'Assignment Chain', 'Title Policy', 'HECM Loan Agreement']
    },
    SFLS: {
      dd: ['BPO', 'AVM', 'Payoff Statement', 'Escrow Analysis', 'Servicing Comments'],
      collateral: ['Note', 'Mortgage', 'Assignment Chain', 'Title Policy']
    },
    MHLS: {
      dd: ['Appraisal', 'Phase I Environmental', 'Physical Needs Assessment', 'Site Inspection', 'Rent Roll', 'Operating Statements'],
      collateral: ['Note', 'Mortgage', 'Regulatory Agreement', 'Assignment Chain', 'Title Policy', 'UCC Filings']
    },
    HLS: {
      dd: ['Appraisal', 'Phase I Environmental', 'Physical Needs Assessment', 'Site Inspection', 'Operator Financials', 'CMS Survey Report'],
      collateral: ['Note', 'Mortgage', 'Regulatory Agreement', 'Operator Lease', 'AR Security Agreement', 'Assignment Chain', 'Title Policy']
    }
  };

  function assetDocs(loan, programType, goLive) {
    var set = DOC_SETS[programType] || DOC_SETS.HVLS;
    var st = (loan.property && loan.property.state) || 'XX';
    var fha = (loan.fha_case_number || loan.loan_id || '').replace(/\s+/g, '');
    function files(types, group) {
      return types.map(function (t) {
        var slug = t.replace(/[^A-Za-z0-9]+/g, '-');
        var fname = st + '_' + fha + '_' + slug + '.pdf';
        return {
          docId: group + ':' + fha + ':' + slug,
          key: 'assets/' + (loan.loan_id || loan.loanId) + '/' + group + '/' + fname,
          name: fname,
          title: t,
          group: group,
          contentType: 'PDF',
          size: hashNum(fname, 180, 2400) * 1024,
          modified: goLive
        };
      });
    }
    return { dd: files(set.dd, 'due-diligence'), collateral: files(set.collateral, 'collateral') };
  }

  // ---- Staff document intake: classify a filename into the VDR taxonomy ----
  var COLLATERAL_RE = /(^|[_\-\s])(note|mortgage|deed|dot|assignment|allonge|security[_\-\s]?instrument|recorded|lost[_\-\s]?note|hud[_\-\s]?1|settlement[_\-\s]?statement|modification|power[_\-\s]?of[_\-\s]?attorney|poa|title[_\-\s]?policy)([_\-\s]|$)/i;
  var DOCTYPE_LABEL = {
    note: 'Promissory Note', mortgage: 'Mortgage / Deed of Trust', deed: 'Mortgage / Deed of Trust', dot: 'Deed of Trust',
    assignment: 'Assignment of Mortgage', allonge: 'Allonge', titlepolicy: 'Title Policy', recorded: 'Recorded Instrument',
    lostnote: 'Lost Note Affidavit', hud1: 'HUD-1 Settlement Statement', modification: 'Loan Modification', poa: 'Power of Attorney',
    bpo: 'Broker Price Opinion (BPO)', valuation: 'Valuation', oae: 'Ownership & Encumbrance (O&E)', title: 'Title Search',
    servicing: 'Servicing Comments', paymenthistory: 'Payment History', payhist: 'Payment History', collection: 'Collection Notes',
    occupancy: 'Occupancy / Inspection', inspection: 'Inspection Report', ti: 'Tax & Insurance Advances', tax: 'Tax Records',
    insurance: 'Insurance', lossmit: 'Loss Mitigation', environmental: 'Environmental Report', operator: 'Operator Financials',
    rentroll: 'Rent Roll', ar: 'Accounts Receivable', cms: 'CMS / Regulatory', regulatory: 'Regulatory File'
  };
  var SALE_FOLDER_RULES = [
    [/bidder[_\-\s]?information|(^|[_\-\s])bip([_\-\s]|$)|supplement/i, 'Bidder Information Package'],
    [/(^|[_\-\s])(ald|sald)([_\-\s]|$)|loan[_\-\s]?tape|stratification|(^|[_\-\s])tape([_\-\s]|$)/i, 'Loan Tape'],
    [/procedure|instruction|bid[_\-\s]?day/i, 'Procedures'],
    [/asset[_\-\s]?summar/i, 'Asset Summaries'],
    [/bauf|btaf|caa|conditional[_\-\s]?acceptance|loan[_\-\s]?sale[_\-\s]?agreement|deposit|change[_\-\s]?form|confidential|(^|[_\-\s])(nda|ca)([_\-\s]|$)|(^|[_\-\s])forms?([_\-\s]|$)|agreement/i, 'Forms & Agreements']
  ];
  function prettyDocType(token, group) {
    var k = String(token || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (DOCTYPE_LABEL[k]) return DOCTYPE_LABEL[k];
    var pretty = String(token || '').replace(/[_\-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }).trim();
    return pretty || (group === 'collateral' ? 'Collateral Document' : 'Due Diligence Document');
  }
  function classifyFileName(fileName, assets) {
    var base = String(fileName || '').replace(/\.[^.]+$/, '');
    var spaced = base.replace(/([a-z0-9])([A-Z])/g, '$1 $2');   // split camelCase so keywords are bounded
    // Match an asset by normalized (alphanumeric-only) substring, so the FHA case
    // matches regardless of how the filename delimits it (the case # itself has hyphens).
    var fnNorm = base.toLowerCase().replace(/[^a-z0-9]/g, '');
    var asset = null;
    for (var ai = 0; ai < (assets || []).length; ai++) {
      var a0 = assets[ai];
      var fhaN = String(a0.fhaCase).toLowerCase().replace(/[^a-z0-9]/g, '');
      var loanN = String(a0.loanId).toLowerCase().replace(/[^a-z0-9]/g, '');
      if ((fhaN.length >= 6 && fnNorm.indexOf(fhaN) >= 0) || (loanN.length >= 6 && fnNorm.indexOf(loanN) >= 0)) { asset = a0; break; }
    }
    if (asset) {
      function esc2(x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
      var dt = spaced.replace(/^[A-Za-z]{2}[_\-\s]+/, '')
        .replace(new RegExp(esc2(asset.fhaCase), 'i'), ' ')
        .replace(new RegExp(esc2(asset.loanId), 'i'), ' ')
        .replace(/[_\-\s]+/g, ' ').trim();
      var group = COLLATERAL_RE.test(spaced) ? 'collateral' : 'dd';
      return { scope: 'asset', loanId: asset.loanId, fhaCase: asset.fhaCase, assetLabel: asset.label, state: asset.state,
        group: group, docType: prettyDocType(dt || 'Document', group), confidence: 'high' };
    }
    for (var i = 0; i < SALE_FOLDER_RULES.length; i++) {
      if (SALE_FOLDER_RULES[i][0].test(base)) {
        return { scope: 'sale', folder: SALE_FOLDER_RULES[i][1], docType: prettyDocType((base.replace(SALE_FOLDER_RULES[i][0], ' ').trim()) || SALE_FOLDER_RULES[i][1]), confidence: 'medium' };
      }
    }
    return { scope: 'review', docType: prettyDocType(base), confidence: 'low' };
  }
  // Overlay committed staff uploads onto a clean VDR baseline.
  function mergeStaffUploads(v, saleId, bidderOnly) {
    var saleDocs = v.saleDocs.slice();
    var assets = v.assets.map(function (a) { return Object.assign({}, a, { dd: a.dd.slice(), collateral: a.collateral.slice() }); });
    var byId = {}; assets.forEach(function (a) { byId[a.loanId] = a; byId[a.fhaCase] = a; });
    store.staffUploads.filter(function (u) {
      return u.saleId === saleId && u.status === 'classified' && (!bidderOnly || u.visibility === 'bidder');
    }).forEach(function (u) {
      var f = { docId: u.uploadId, uploadId: u.uploadId, key: u.key, name: u.fileName, title: u.title || u.docType,
        folder: u.folder, contentType: u.contentType || 'PDF', size: u.size || 0,
        group: u.group === 'collateral' ? 'collateral' : (u.scope === 'asset' ? 'due-diligence' : undefined),
        staff: true, visibility: u.visibility };
      if (u.scope === 'asset') { var a = byId[u.loanId] || byId[u.fhaCase]; if (a) { (u.group === 'collateral' ? a.collateral : a.dd).push(f); a.docCount = a.dd.length + a.collateral.length; } else saleDocs.push(f); }
      else saleDocs.push(f);
    });
    return { saleDocs: saleDocs, assets: assets };
  }

  function vdrForSale(saleId) {
    var s = saleById(saleId) || {};
    var name = s.sale_name || saleId;
    var programType = s.programType || s.program;
    var goLive = (s.key_dates && (s.key_dates.go_live_data_room || s.key_dates.bid_day)) || null;
    var saleDocs = [
      { docId: 'bip', key: 'BIP/' + saleId + '-Bidder-Information-Package.pdf', name: name + ' — Bidder Information Package (Go-Live)', folder: 'Bidder Information Package', contentType: 'PDF', size: 2511360, modified: goLive },
      { docId: 'bip-s1', key: 'BIP/Supplement-1/' + saleId + '-BIP-Supplement-1.pdf', name: name + ' — BIP Supplement 1', folder: 'Bidder Information Package', contentType: 'PDF', size: 412672, modified: goLive },
      { docId: 'tape', key: 'Tape/Go-Live/' + saleId + '-' + (programType === 'HLS' || programType === 'MHLS' ? 'SALD' : 'ALD') + '.pdf', name: name + ' — Loan Tape (' + (programType === 'HLS' || programType === 'MHLS' ? 'SALD' : 'ALD') + ', Go-Live)', folder: 'Loan Tape', contentType: 'PDF', size: 1843200, modified: goLive },
      { docId: 'proc', key: 'Procedures/' + saleId + '-Sale-and-Bid-Day-Procedures.pdf', name: name + ' — Sale & Bid-Day Procedures', folder: 'Procedures', contentType: 'PDF', size: 624640, modified: goLive },
      { docId: 'instr', key: 'Procedures/' + saleId + '-Bidder-Instructions.pdf', name: name + ' — Bidder Instructions', folder: 'Procedures', contentType: 'PDF', size: 287744, modified: goLive },
      { docId: 'forms', key: 'Forms/' + saleId + '-BAUF-BTAF-Change-Deposit-Forms.pdf', name: name + ' — BAUF, BTAF, Change & Deposit Forms', folder: 'Forms & Agreements', contentType: 'PDF', size: 198656, modified: goLive },
      { docId: 'agmt', key: 'Forms/' + saleId + (programType === 'HLS' || programType === 'MHLS' ? '-Loan-Sale-Agreement' : '-CAA') + '-Template.pdf', name: name + (programType === 'HLS' || programType === 'MHLS' ? ' — Loan Sale Agreement (template)' : ' — Conditional Acceptance Agreement (template)'), folder: 'Forms & Agreements', contentType: 'PDF', size: 745472, modified: goLive },
      { docId: 'ca', key: 'Qualification/' + saleId + '-Confidentiality-Agreement.pdf', name: name + ' — Confidentiality Agreement (executed)', folder: 'Forms & Agreements', contentType: 'PDF', size: 156672, modified: goLive }
    ];
    if (programType === 'HLS' || programType === 'MHLS') {
      saleDocs.push({ docId: 'asum', key: 'Asset-Summaries/' + saleId + '-Asset-Summaries-Go-Live.pdf', name: name + ' — Asset Summaries (Go-Live)', folder: 'Asset Summaries', contentType: 'PDF', size: 3145728, modified: goLive });
    }
    var assets = loansFor(saleId).map(function (loan) {
      var docs = assetDocs(loan, programType, goLive);
      return {
        loanId: loan.loan_id || loan.loanId,
        fhaCase: loan.fha_case_number || loan.loan_id,
        label: loan.property_name || (loan.loan_id || ''),
        state: (loan.property && loan.property.state) || '—',
        city: (loan.property && loan.property.city) || '',
        assetClass: loan.asset_class || programType,
        dd: docs.dd,
        collateral: docs.collateral,
        docCount: docs.dd.length + docs.collateral.length
      };
    });
    return { saleDocs: saleDocs, assets: assets };
  }

  function findVdrDoc(saleId, docKey) {
    var su = store.staffUploads.find(function (u) { return u.saleId === saleId && u.key === docKey; });
    if (su) return { name: su.fileName, title: su.title || su.docType, folder: su.folder, group: su.group === 'collateral' ? 'collateral' : (su.scope === 'asset' ? 'due-diligence' : undefined) };
    var v = vdrForSale(saleId);
    var hit = v.saleDocs.find(function (d) { return d.key === docKey; });
    if (hit) return hit;
    for (var i = 0; i < v.assets.length; i++) {
      var a = v.assets[i];
      var all = a.dd.concat(a.collateral);
      for (var j = 0; j < all.length; j++) if (all[j].key === docKey) return all[j];
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Bid submission — REPLICATES backend/src/handlers/bids/submit.mjs
  // ---------------------------------------------------------------------
  function submitBids(body) {
    var sale = saleById(body.saleId);
    if (!sale) return fail('Sale not found', 404);
    var programType = sale.programType || sale.program;
    var pools = sale.pools || [];
    var poolById = {};
    pools.forEach(function (p) { poolById[p.pool_id || p.poolId] = p; });
    var receiptId = uid('RCPT');
    var completionCode = sale.completion_code || null;
    var records = [];
    var totalUSD = 0;

    function validatePct(raw, label) {
      var n = Number(raw);
      if (raw == null || raw === '' || isNaN(n)) throw new Error(label + ': BID % must be numeric');
      if (n === 0) throw new Error(label + ': a bid of 0 is not valid — omit the row to decline');
      if (n < 0) throw new Error(label + ': BID % must be positive');
      if (programType === 'HNVLS' && n > 175) throw new Error(label + ': BID % exceeds the HNVLS maximum (175%)');
      return Math.round(n * 1e5) / 1e5;
    }

    try {
      if (Array.isArray(body.poolBids) && body.poolBids.length) {
        var saleLoans = loansFor(body.saleId);
        var loanById = {};
        saleLoans.forEach(function (l) { loanById[l.loan_id || l.loanId] = l; });
        var bKey = basisKey(programType, sale);

        body.poolBids.forEach(function (pb) {
          var pool = poolById[pb.poolId];
          if (!pool) throw new Error('Pool ' + pb.poolId + ' not found on ' + body.saleId);
          var roster = pool.loan_ids || [];
          var entries = {};
          (pb.loans || []).forEach(function (e) { entries[e.loanId] = e.bidPct; });
          var missing = roster.filter(function (id) { return !(id in entries); });
          if (missing.length) throw new Error('Pool ' + pb.poolId + ': whole-pool participation requires a BID % on every loan — missing ' + missing.length);

          var loanBids = [], agg = 0;
          roster.forEach(function (loanId) {
            var loan = loanById[loanId];
            if (!loan) throw new Error('Loan ' + loanId + ' not on the tape');
            var pct = validatePct(entries[loanId], 'Pool ' + pb.poolId + ' · loan ' + loanId);
            var basis = loanBasisValue(loan, bKey);
            var usd = round2((pct / 100) * basis);
            if (usd < 100) throw new Error('Pool ' + pb.poolId + ' · loan ' + loanId + ': derived BID $' + usd + ' is below the $100 minimum');
            loanBids.push({ loanId: loanId, bidPct: pct, basis: basis, bidUsd: usd });
            agg = round2(agg + usd);
          });
          totalUSD = round2(totalUSD + agg);
          records.push({
            bidId: uid('BID'), saleId: body.saleId, poolId: pb.poolId,
            poolLabel: pool.pool_name || pb.poolId, bidderId: 'BDR-DEMO',
            bidderName: D.demoBidder.entityName, programType: programType,
            loanBids: loanBids, loanCount: loanBids.length, aggregateUsd: agg,
            missionBid: !!pb.missionBid, receiptId: receiptId, completionCode: completionCode,
            status: 'live', conformingStatus: 'Conforming', withdrawn: false,
            timestamp: now(), submittedAt: now()
          });
        });
      } else if (Array.isArray(body.assetBids) && body.assetBids.length) {
        body.assetBids.forEach(function (ab) {
          var pool = poolById[ab.assetId];
          if (!pool) throw new Error('Asset ' + ab.assetId + ' not found on ' + body.saleId);
          var pct = validatePct(ab.bidPct, 'Asset ' + ab.assetId);
          var upb = Number(pool.summary && pool.summary.aggregate_upb) || 0;
          var usd = round2((pct / 100) * upb);
          if (usd < 100) throw new Error('Asset ' + ab.assetId + ': derived BID $' + usd + ' is below the $100 minimum');
          totalUSD = round2(totalUSD + usd);
          records.push({
            bidId: uid('BID'), saleId: body.saleId, poolId: ab.assetId,
            poolLabel: pool.pool_name || ab.assetId, bidderId: 'BDR-DEMO',
            bidderName: D.demoBidder.entityName, programType: programType,
            bidPct: pct, upb: upb, aggregateUsd: usd,
            receiptId: receiptId, completionCode: completionCode,
            status: 'live', conformingStatus: 'Conforming', withdrawn: false,
            timestamp: now(), submittedAt: now()
          });
        });
      } else {
        throw new Error('A bid form needs poolBids (residential) or assetBids (commercial)');
      }
    } catch (err) { return fail(err.message); }

    var depositUSD = depositFor(totalUSD, sale.deposit_terms);

    // In-window revision: latest validated form supersedes priors per pool
    records.forEach(function (r) {
      store.bids.forEach(function (b) {
        if (b.saleId === r.saleId && b.poolId === r.poolId && b.status === 'live' && !b.withdrawn) {
          b.status = 'superseded'; b.supersededAt = now(); b.supersededByReceipt = receiptId;
        }
      });
    });
    records.forEach(function (r) { r.totalFormUsd = totalUSD; r.depositUsd = depositUSD; store.bids.push(r); });
    record('bid-form-submitted', body.saleId + ' · receipt ' + receiptId + ' · ' + records.length + ' pool(s) · total $' + totalUSD.toLocaleString());

    store.notifications.unshift({
      notifId: uid('NTF'), recipientId: 'BDR-DEMO', type: 'bid-received',
      title: 'Bid form received',
      message: body.saleId + ': receipt ' + receiptId + (completionCode ? ' · CODE ' + completionCode : '') +
               ' · total $' + totalUSD.toLocaleString() + ' · deposit $' + depositUSD.toLocaleString(),
      createdAt: now()
    });
    persist();

    return Promise.resolve({
      receipt: {
        receiptId: receiptId, completionCode: completionCode, saleId: body.saleId,
        pools: records.map(function (r) { return { poolId: r.poolId, aggregateUsd: r.aggregateUsd }; }),
        totalUSD: totalUSD, depositUSD: depositUSD, submittedAt: now(), emailDelivered: false
      }
    });
  }

  // ---------------------------------------------------------------------
  // The API surface
  // ---------------------------------------------------------------------
  HSG.api = {
    decodeClaims: function () { return CLAIMS; },

    sales: {
      // Mirrors the live backend: residential bidders see HVLS/HNVLS/SFLS, commercial
      // bidders see MHLS/HLS, admin/super see all. The page's data-portal supplies the
      // scope when the caller doesn't pass one (the live API derives it from the token).
      list: function (filter) {
        filter = filter || {};
        var scope = filter.portal || (typeof document !== 'undefined' && document.body && document.body.getAttribute('data-portal')) || 'both';
        if (scope === 'admin' || scope === 'super') scope = 'both';
        var items = (D.sales || []).map(function (s) { return redact(s); });
        if (scope === 'residential' || scope === 'commercial') {
          items = items.filter(function (s) {
            var sp = s.portal || demoPortalForProgram(s.programType || s.program);
            return sp === scope;
          });
        }
        if (filter.programType) items = items.filter(function (s) { return (s.programType || s.program) === filter.programType; });
        return Promise.resolve({ sales: items, count: items.length, portal: scope });
      },
      get: function (saleId) {
        var s = saleById(saleId);
        return s ? Promise.resolve({ sale: redact(s) }) : fail('Sale not found', 404);
      },
      pools: function (saleId) {
        var s = saleById(saleId);
        if (!s) return fail('Sale not found', 404);
        return Promise.resolve({ saleId: saleId, pools: redact(s.pools || []), count: (s.pools || []).length });
      },
      loans: function (saleId, filter) {
        var s = saleById(saleId);
        if (!s) return fail('Sale not found', 404);
        var items = loansFor(saleId);
        filter = filter || {};
        if (filter.poolId) {
          var pool = (s.pools || []).find(function (p) { return (p.pool_id || p.poolId) === filter.poolId; });
          var ids = (pool && pool.loan_ids) || [];
          items = items.filter(function (l) { return ids.indexOf(l.loan_id || l.loanId) >= 0; });
        }
        if (filter.asset_class) items = items.filter(function (l) { return l.asset_class === filter.asset_class; });
        return Promise.resolve({ saleId: saleId, loans: items, count: items.length });
      },
      // ---- Sale Setup wizard: create a sale (writes to the session overlay) ----
      create: function (sale) {
        if (!sale || !sale.saleId) return fail('A sale needs a saleId', 400);
        if (saleById(sale.saleId)) return fail('Sale ' + sale.saleId + ' already exists', 409);
        var rec = Object.assign({}, sale);
        rec.status = rec.status || 'draft'; rec.state = rec.state || rec.status;
        rec.createdAt = now(); rec.demo = true;
        (D.sales = D.sales || []).push(rec);
        store.newSales.push(rec);
        record('sale-created', rec.saleId + ' · ' + (rec.programType || '') + ' · ' + ((rec.summary && rec.summary.loan_count) || 0) + ' loans');
        persist();
        return Promise.resolve({ sale: rec });
      },
      update: function (saleId, patch) {
        var s = saleById(saleId);
        if (!s) return fail('Sale not found', 404);
        Object.assign(s, patch || {});
        var i = store.newSales.findIndex(function (x) { return x.saleId === saleId; });
        if (i >= 0) store.newSales[i] = s;
        record('sale-updated', saleId);
        persist();
        return Promise.resolve({ sale: s });
      }
    },

    loans: {
      get: function (saleId, loanId) {
        var loan = loansFor(saleId).find(function (l) { return (l.loan_id || l.loanId) === loanId; });
        return loan ? Promise.resolve({ loan: loan }) : fail('Loan not found', 404);
      },
      listForSale: function (saleId) { return Promise.resolve({ saleId: saleId, loans: loansFor(saleId), count: loansFor(saleId).length }); },
      // ---- Sale Setup wizard: bulk-insert loans for a sale ----
      bulkPut: function (saleId, loans) {
        if (!saleById(saleId)) return fail('Sale not found — create the sale before loading its tape', 404);
        var existing = {}; loansFor(saleId).forEach(function (l) { existing[l.loan_id || l.loanId] = 1; });
        var added = 0;
        (loans || []).forEach(function (l) {
          var rec = Object.assign({ saleId: saleId }, l);
          rec.loan_id = rec.loan_id || rec.loanId; rec.loanId = rec.loan_id;
          if (existing[rec.loan_id]) return;
          existing[rec.loan_id] = 1;
          D.loans.push(rec); store.newLoans.push(rec); added++;
        });
        record('loans-ingested', saleId + ' · ' + added + ' loan(s)');
        persist();
        return Promise.resolve({ saleId: saleId, count: added });
      }
    },

    qc: {
      listForSale: function (saleId, status) {
        var items = (D.qc || []).filter(function (f) { return f.saleId === saleId && (!status || f.status === status); });
        return Promise.resolve({ saleId: saleId, findings: items, count: items.length });
      },
      get: function (saleId, qcId) {
        var f = (D.qc || []).find(function (x) { return x.saleId === saleId && (x.qcId === qcId || x.qc_id === qcId); });
        return f ? Promise.resolve({ finding: f }) : fail('Finding not found', 404);
      }
    },

    bidders: {
      list: function () { return Promise.resolve({ bidders: store.bidders, count: store.bidders.length }); },
      get: function (bidderId) {
        var b = store.bidders.find(function (x) { return x.bidderId === bidderId; }) ||
                (bidderId === 'BDR-DEMO' ? D.demoBidder : null);
        return b ? Promise.resolve({ bidder: b }) : fail('Bidder not found', 404);
      },
      create: function (form) {
        var bidderId = uid('BDR');
        var rec = {
          bidderId: bidderId, portal: form.portal || 'residential',
          entityName: (form.entity && form.entity.legalName) || form.entityName || 'New Applicant, LLC',
          contactEmail: (form.entity && form.entity.contactEmail) || form.contactEmail || '',
          contactName: (form.entity && form.entity.contactName) || form.contactName || '',
          qualificationStatus: 'Pending - Initial Review',
          submittedAt: now(), demo: true
        };
        store.bidders.unshift(rec); persist();
        return Promise.resolve({ bidder: rec, screening: { ofac: 'clear', sam: 'clear', tin: 'pending' } });
      },
      approve: function (bidderId, body) {
        var b = store.bidders.find(function (x) { return x.bidderId === bidderId; });
        if (!b) return fail('Bidder not found', 404);
        b.qualificationStatus = 'Qualified'; b.approvedAt = now(); record('bidder-approved', b.entityName || bidderId); persist();
        return Promise.resolve({ bidder: b });
      },
      reject: function (bidderId, body) {
        var b = store.bidders.find(function (x) { return x.bidderId === bidderId; });
        if (!b) return fail('Bidder not found', 404);
        b.qualificationStatus = 'Declined'; b.declinedAt = now(); persist();
        return Promise.resolve({ bidder: b });
      },
      requestInfo: function (bidderId, body) {
        var b = store.bidders.find(function (x) { return x.bidderId === bidderId; });
        if (!b) return fail('Bidder not found', 404);
        b.qualificationStatus = 'Pending - Info Requested'; persist();
        return Promise.resolve({ bidder: b });
      }
    },

    bids: {
      submit: submitBids,
      list: function (filter) {
        filter = filter || {};
        var items = store.bids.slice();
        if (filter.saleId) items = items.filter(function (b) { return b.saleId === filter.saleId; });
        if (filter.bidderId) items = items.filter(function (b) { return b.bidderId === filter.bidderId; });
        items.sort(function (a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });
        return Promise.resolve({ bids: items, count: items.length });
      },
      withdraw: function (bidId, reason) {
        var b = store.bids.find(function (x) { return x.bidId === bidId; });
        if (!b) return fail('Bid not found', 404);
        if (b.withdrawn) return Promise.resolve({ bid: b, alreadyWithdrawn: true });
        if (b.status === 'superseded') return fail('This bid was superseded by a later submission — withdraw the live bid instead', 409);
        b.withdrawn = true; b.status = 'withdrawn'; b.withdrawnAt = now(); b.withdrawalReason = reason || '';
        record('bid-withdrawn', (b.poolLabel || b.poolId) + ' (' + b.saleId + ') · ' + (reason || ''));
        store.notifications.unshift({
          notifId: uid('NTF'), recipientId: 'BDR-DEMO', type: 'bid-withdrawn', title: 'Bid withdrawn',
          message: 'Your bid on ' + (b.poolLabel || b.poolId) + ' (' + b.saleId + ') was withdrawn. You may submit a new bid form any time before the window closes.',
          createdAt: now()
        });
        persist();
        return Promise.resolve({ bid: b });
      },
      receipt: function (bidId) {
        var b = store.bids.find(function (x) { return x.bidId === bidId; });
        return b ? Promise.resolve({ bid: b }) : fail('Bid not found', 404);
      }
    },

    docs: {
      listForSale: function (saleId) {
        var v = mergeStaffUploads(vdrForSale(saleId), saleId, true);   // bidders see bidder-visible staff uploads
        // Legacy flat list retained for any caller still expecting `docs`
        var flat = v.saleDocs.slice();
        v.assets.forEach(function (a) { flat = flat.concat(a.dd, a.collateral); });
        return Promise.resolve({ saleId: saleId, saleDocs: v.saleDocs, assets: v.assets, docs: flat, count: flat.length });
      },
      presignDownload: function (saleId, docKey) {
        var doc = findVdrDoc(saleId, docKey) || { name: docKey, title: docKey };
        var sale = saleById(saleId) || { saleId: saleId };
        // Asset documents carry the loan id in the key: assets/{loanId}/{group}/{file}
        var loan = null, m = /^assets\/([^/]+)\//.exec(docKey || '');
        if (m) { var llid = decodeURIComponent(m[1]); loan = loansFor(saleId).find(function (l) { return (l.loan_id || l.loanId) === llid; }); }
        var entity = (D.demoBidder && D.demoBidder.entityName) || 'the qualified bidder';
        var url = (window.HSG && HSG.demoDocs)
          ? HSG.demoDocs.forDoc(doc, { sale: sale, loan: loan, entity: entity })
          : demoPdf(doc.title || doc.name || docKey, ['Sale: ' + saleId, 'File: ' + (doc.name || docKey), 'Demonstration document.']);
        record('document-downloaded', saleId + ' · ' + (doc.name || docKey) + ' · watermarked');
        persist();
        return Promise.resolve({ url: url, expiresIn: 300, watermarked: true, accessId: uid('ACC') });
      },
      logAccess: function () { return Promise.resolve({ ok: true }); },
      presignUpload: function () { return fail('Uploads are disabled in the demonstration', 403); }
    },

    // ---- HSG staff document intake: scan → auto-classify → organize → publish ----
    staffDocs: {
      // Auto-classify a batch of filenames against the sale's assets (no commit).
      classify: function (saleId, fileMetas) {
        var assets = vdrForSale(saleId).assets;
        return Promise.resolve({ results: (fileMetas || []).map(function (m) {
          var c = classifyFileName(m.fileName, assets);
          c.fileName = m.fileName; c.size = m.size || 0; c.contentType = m.contentType || 'PDF';
          c.visibility = c.scope === 'review' ? 'admin' : 'bidder';
          return c;
        }) });
      },
      // Commit reviewed classifications into the data room.
      commit: function (saleId, records, actor) {
        var saved = (records || []).map(function (r) {
          var id = uid('DOC');
          var rec = {
            uploadId: id, saleId: saleId, fileName: r.fileName, title: r.title || r.docType || r.fileName,
            size: r.size || 0, contentType: r.contentType || 'PDF',
            scope: r.scope || 'review', folder: r.folder || null, loanId: r.loanId || null, fhaCase: r.fhaCase || null,
            group: r.group || null, docType: r.docType || null,
            visibility: r.visibility || (r.scope === 'review' ? 'admin' : 'bidder'),
            status: r.scope && r.scope !== 'review' ? 'classified' : 'review',
            key: 'Staff/' + (r.scope || 'review') + '/' + id + '_' + String(r.fileName || 'file').replace(/[^\w.\-]+/g, '_'),
            uploadedBy: actor || 'HSG staff', uploadedAt: now()
          };
          store.staffUploads.unshift(rec);
          return rec;
        });
        record('documents-uploaded', saleId + ' · ' + saved.length + ' file(s) intake');
        persist();
        return Promise.resolve({ saved: saved, count: saved.length });
      },
      // The organized data room as staff see it: baseline + all staff uploads + the review queue + stats.
      overview: function (saleId) {
        var v = mergeStaffUploads(vdrForSale(saleId), saleId, false);
        var mine = store.staffUploads.filter(function (u) { return u.saleId === saleId; });
        var review = mine.filter(function (u) { return u.status === 'review'; });
        var classified = mine.filter(function (u) { return u.status === 'classified'; });
        var assetsCovered = v.assets.filter(function (a) { return (a.dd.length + a.collateral.length) > 0; }).length;
        var stats = {
          saleDocs: v.saleDocs.length, assets: v.assets.length, assetsCovered: assetsCovered,
          totalFiles: v.saleDocs.length + v.assets.reduce(function (s, a) { return s + a.dd.length + a.collateral.length; }, 0),
          staffAdded: classified.length, needsReview: review.length,
          bidderVisible: classified.filter(function (u) { return u.visibility === 'bidder'; }).length,
          adminOnly: classified.filter(function (u) { return u.visibility === 'admin'; }).length
        };
        return Promise.resolve({ saleId: saleId, saleDocs: v.saleDocs, assets: v.assets, review: review, uploads: mine, stats: stats });
      },
      update: function (uploadId, patch) {
        var u = store.staffUploads.find(function (x) { return x.uploadId === uploadId; });
        if (!u) return fail('Upload not found', 404);
        Object.assign(u, patch);
        if (patch.scope && patch.scope !== 'review') u.status = 'classified';
        persist();
        return Promise.resolve({ upload: u });
      },
      remove: function (uploadId) {
        store.staffUploads = store.staffUploads.filter(function (x) { return x.uploadId !== uploadId; });
        persist();
        return Promise.resolve({ ok: true });
      }
    },

    qa: {
      listForSale: function (saleId) {
        var items = store.qa.filter(function (q) { return q.saleId === saleId; });
        return Promise.resolve({ qa: items, count: items.length });
      },
      listInbox: function () { return Promise.resolve({ qa: store.qa, count: store.qa.length }); },
      ask: function (saleId, body) {
        var q = { qaId: uid('QA'), saleId: saleId, question: body.question, bidderId: 'BDR-DEMO',
                  bidderName: D.demoBidder.entityName, status: 'pending', visibility: 'all', askedAt: now() };
        store.qa.unshift(q); record('question-submitted', saleId + ' · "' + String(body.question).slice(0, 80) + '"'); persist();
        return Promise.resolve({ qa: q });
      },
      answer: function (qaId, body) {
        var q = store.qa.find(function (x) { return x.qaId === qaId; });
        if (!q) return fail('Question not found', 404);
        q.answer = body.answer; q.status = 'answered'; q.answeredAt = now(); persist();
        return Promise.resolve({ qa: q });
      }
    },

    settlements: {
      list: function () { return Promise.resolve({ settlements: store.settlements, count: store.settlements.length }); },
      get: function (id) {
        var s = store.settlements.find(function (x) { return x.awardId === id; });
        return s ? Promise.resolve({ settlement: s }) : fail('Settlement not found', 404);
      },
      updateMilestone: function (id, idx, body) {
        var s = store.settlements.find(function (x) { return x.awardId === id; });
        if (!s || !s.milestones[idx]) return fail('Milestone not found', 404);
        s.milestones[idx].status = (body && body.status) || 'done'; persist();
        return Promise.resolve({ settlement: s });
      },
      updateDeliverable: function (id, idx, body) {
        var s = store.settlements.find(function (x) { return x.awardId === id; });
        if (!s || !s.deliverables[idx]) return fail('Deliverable not found', 404);
        s.deliverables[idx].completed = body ? !!body.completed : true; persist();
        return Promise.resolve({ settlement: s });
      }
    },

    bem: {
      listScenarios: function () { return Promise.resolve({ scenarios: store.scenarios, count: store.scenarios.length }); },
      getScenario: function (id) {
        var s = store.scenarios.find(function (x) { return x.scenarioId === id; });
        return s ? Promise.resolve({ scenario: s }) : fail('Scenario not found', 404);
      },
      saveScenario: function (scenario) {
        scenario.scenarioId = scenario.scenarioId || uid('SCN');
        scenario.savedAt = now();
        var i = store.scenarios.findIndex(function (x) { return x.scenarioId === scenario.scenarioId; });
        if (i >= 0) store.scenarios[i] = scenario; else store.scenarios.unshift(scenario);
        persist();
        return Promise.resolve({ scenario: scenario });
      },
      deleteScenario: function (id) {
        store.scenarios = store.scenarios.filter(function (x) { return x.scenarioId !== id; });
        persist();
        return Promise.resolve({ ok: true });
      },
      run: function (body) {
        // Highest conforming bid per pool vs. the scenario's reserves (admin-only here)
        var saleId = body.saleId;
        var reserves = body.reserves || {};
        var live = store.bids.filter(function (b) { return b.saleId === saleId && b.status === 'live' && !b.withdrawn; });
        var byPool = {};
        live.forEach(function (b) { (byPool[b.poolId] = byPool[b.poolId] || []).push(b); });
        var sale = saleById(saleId) || {};
        var results = (sale.pools || []).map(function (p) {
          var pid = p.pool_id || p.poolId;
          var poolBids = (byPool[pid] || []).sort(function (a, b) { return (b.aggregateUsd || 0) - (a.aggregateUsd || 0); });
          var reservePct = reserves[pid];
          var upb = (p.summary && (p.summary.aggregate_upb || p.summary.aggregate_bpo)) || 0;
          var reserveUsd = reservePct != null ? (reservePct / 100) * upb : null;
          var winner = poolBids.find(function (b) { return reserveUsd == null || (b.aggregateUsd || 0) >= reserveUsd; }) || null;
          return { poolId: pid, poolLabel: p.pool_name || pid, bidCount: poolBids.length,
                   reservePct: reservePct != null ? reservePct : null,
                   winner: winner, awardUsd: winner ? winner.aggregateUsd : null,
                   belowReserve: !winner && poolBids.length > 0 };
        });
        return Promise.resolve({ saleId: saleId, results: results, ranAt: now() });
      },
      approveAwards: function (body) {
        var created = [];
        (body.awards || []).forEach(function (a) {
          var s = {
            awardId: uid('AWD'), saleId: a.saleId, poolOrDealId: a.poolId, bidderId: a.bidderId || 'BDR-DEMO',
            programType: a.programType || '', awardAmountUSD: a.amountUSD || a.awardUsd || 0,
            status: 'On track', expectedSettlementDate: new Date(Date.now() + 86400000 * 42).toISOString(),
            milestones: [
              { label: 'Award notice issued', status: 'done', dueOffsetDays: 0 },
              { label: 'Deposit reconciled', status: 'active', dueOffsetDays: 3 },
              { label: 'CAA executed', status: 'upcoming', dueOffsetDays: 10 },
              { label: 'Final settlement & wire', status: 'upcoming', dueOffsetDays: 42 }
            ],
            deliverables: [
              { label: 'Executed CAA', category: 'legal', required: true, completed: false },
              { label: 'Wire instructions acknowledged', category: 'financial', required: true, completed: false }
            ]
          };
          store.settlements.unshift(s); created.push(s);
        });
        persist();
        return Promise.resolve({ settlements: created, count: created.length });
      }
    },

    screening: {
      ofac: function () { return Promise.resolve({ status: 'clear', screenedAt: now(), demo: true }); },
      sam: function () { return Promise.resolve({ status: 'clear', screenedAt: now(), demo: true }); },
      tin: function () { return Promise.resolve({ status: 'pending', screenedAt: now(), demo: true }); }
    },

    notifications: {
      list: function () {
        var unread = store.notifications.filter(function (n) { return !n.readAt; }).length;
        return Promise.resolve({ notifications: store.notifications, count: store.notifications.length, unread: unread });
      },
      markRead: function (id) {
        var n = store.notifications.find(function (x) { return x.notifId === id; });
        if (n) { n.readAt = now(); persist(); }
        return Promise.resolve({ ok: true });
      }
    }
  };

  // ---------------------------------------------------------------------
  // Demo banner + link decoration so the session survives page navigation
  // ---------------------------------------------------------------------
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(function () {
    var bar = document.createElement('div');
    bar.setAttribute('style',
      'position:fixed;bottom:0;left:0;right:0;z-index:9999;display:flex;align-items:center;justify-content:center;gap:14px;' +
      'padding:9px 18px;background:linear-gradient(90deg,#0D1220,#1E1F6B);color:#fff;' +
      'font:600 12px/1 "IBM Plex Mono",monospace;letter-spacing:0.08em;box-shadow:0 -6px 18px rgba(16,24,40,0.25);');
    var label = VARIANT === 'gnma'
      ? 'GINNIE MAE DEMONSTRATION — SYNTHETIC DATA · MARKET RESEARCH (APP-T-2027-125) · NO LIVE SYSTEMS'
      : 'DEMONSTRATION MODE — SAMPLE DATA · NO LIVE SYSTEMS';
    var guide = VARIANT === 'gnma' ? '/demo/gnma/index.html' : '/demo/index.html';
    bar.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:7px;"><span style="width:8px;height:8px;border-radius:50%;background:#7DD3A8;display:inline-block;"></span>' +
      label + '</span>' +
      '<a href="' + guide + '" style="color:#A9B7FF;text-decoration:underline;">DEMO GUIDE</a>' +
      '<a href="#" id="hsg-demo-exit" style="color:rgba(255,255,255,0.65);text-decoration:underline;">EXIT</a>';
    document.body.appendChild(bar);
    document.body.style.paddingBottom = '46px';
    var exit = document.getElementById('hsg-demo-exit');
    if (exit) exit.addEventListener('click', function (e) {
      e.preventDefault();
      if (!window.confirm('Leave the demonstration? You can re-enter any time from your test link.')) return;
      try { localStorage.removeItem('hsg.demo.active'); localStorage.removeItem('hsg.demo.variant'); } catch (err) {}
      try { sessionStorage.clear(); } catch (err) {}
      window.location.href = '/index.html';
    });
  });
})();

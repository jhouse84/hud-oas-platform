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
  if (qs.get('demo') === '1') { try { sessionStorage.setItem('hsg.demo.active', '1'); } catch (e) {} }
  var ACTIVE = false;
  try { ACTIVE = sessionStorage.getItem('hsg.demo.active') === '1'; } catch (e) {}
  if (!ACTIVE) return;                       // no-op outside demo sessions
  if (!window.HSG_DEMO_DATA) { console.warn('Demo mode active but data.js missing'); return; }

  var D = window.HSG_DEMO_DATA;
  window.HSG = window.HSG || {};
  window.HSG_DEMO = true;

  // ---------------------------------------------------------------------
  // Session store — reviewer actions live here for the visit
  // ---------------------------------------------------------------------
  function load(key, fallback) {
    try { var v = sessionStorage.getItem('hsg.demo.' + key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save(key, val) { try { sessionStorage.setItem('hsg.demo.' + key, JSON.stringify(val)); } catch (e) {} }
  function uid(p) { return p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function now() { return new Date().toISOString(); }
  function round2(n) { return Math.round(Number(n) * 100) / 100; }

  var store = {
    bids: load('bids', []),
    qa: load('qa', (D.qa || []).slice()),
    notifications: load('notifications', [{
      notifId: 'NTF-DEMO-WELCOME', recipientId: 'BDR-DEMO', type: 'welcome',
      title: 'Welcome to the demonstration',
      message: 'You are signed in as a qualified demo bidder. Everything here runs on sample data — explore freely.',
      createdAt: now()
    }]),
    settlements: load('settlements', [{
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
    bidders: load('bidders', (D.bidders || []).slice())
  };
  function persist() {
    save('bids', store.bids); save('qa', store.qa); save('notifications', store.notifications);
    save('settlements', store.settlements); save('scenarios', store.scenarios); save('bidders', store.bidders);
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
  function basisField(programType) {
    if (programType === 'HNVLS') return 'etd_adjusted_bpo';
    if (programType === 'SFLS') return 'current_upb';
    return 'bpo_value';
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
  function docsForSale(saleId) {
    var s = saleById(saleId) || {};
    var name = s.sale_name || saleId;
    return [
      { docId: 'bip', key: 'BIP/' + saleId + '-Bidder-Information-Package.pdf', name: name + ' — Bidder Information Package', folder: 'Bidder Information Package', contentType: 'PDF', size: 24576 },
      { docId: 'tape', key: 'Tape/' + saleId + '-ALD-SALD-Tape.pdf', name: name + ' — Loan Tape (ALD/SALD)', folder: 'Loan Tape', contentType: 'PDF', size: 18432 },
      { docId: 'proc', key: 'Procedures/' + saleId + '-Bid-Day-Procedures.pdf', name: name + ' — Sale & Bid-Day Procedures', folder: 'Procedures', contentType: 'PDF', size: 15360 },
      { docId: 'ca', key: 'Qualification/' + saleId + '-Confidentiality-Agreement.pdf', name: name + ' — Confidentiality Agreement (executed)', folder: 'Qualification', contentType: 'PDF', size: 9216 }
    ];
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
        var bf = basisField(programType);

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
            var basis = Number(loan[bf]) || 0;
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
      list: function () {
        var items = (D.sales || []).map(function (s) { return redact(s); });
        return Promise.resolve({ sales: items, count: items.length, portal: 'both' });
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
      }
    },

    loans: {
      get: function (saleId, loanId) {
        var loan = loansFor(saleId).find(function (l) { return (l.loan_id || l.loanId) === loanId; });
        return loan ? Promise.resolve({ loan: loan }) : fail('Loan not found', 404);
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
        b.qualificationStatus = 'Qualified'; b.approvedAt = now(); persist();
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
      listForSale: function (saleId) { return Promise.resolve({ saleId: saleId, docs: docsForSale(saleId) }); },
      presignDownload: function (saleId, docKey) {
        var doc = docsForSale(saleId).find(function (d) { return d.key === docKey; }) || { name: docKey };
        var url = demoPdf(doc.name || docKey, [
          'Sale: ' + saleId,
          'Document class: ' + (doc.folder || 'VDR'),
          'This demonstration document stands in for the real sale file.',
          'In production this download is the per-bidder watermarked copy,',
          'served by a 5-minute presigned URL and access-logged with IP + UA.'
        ]);
        return Promise.resolve({ url: url, expiresIn: 300, watermarked: true, accessId: uid('ACC') });
      },
      logAccess: function () { return Promise.resolve({ ok: true }); },
      presignUpload: function () { return fail('Uploads are disabled in the demonstration', 403); }
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
        store.qa.unshift(q); persist();
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
    bar.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:7px;"><span style="width:8px;height:8px;border-radius:50%;background:#7DD3A8;display:inline-block;"></span>' +
      'DEMONSTRATION MODE — SAMPLE DATA · NO LIVE SYSTEMS</span>' +
      '<a href="/demo/index.html" style="color:#A9B7FF;text-decoration:underline;">DEMO GUIDE</a>' +
      '<a href="#" id="hsg-demo-exit" style="color:rgba(255,255,255,0.65);text-decoration:underline;">EXIT</a>';
    document.body.appendChild(bar);
    document.body.style.paddingBottom = '46px';
    var exit = document.getElementById('hsg-demo-exit');
    if (exit) exit.addEventListener('click', function (e) {
      e.preventDefault();
      try { sessionStorage.clear(); } catch (err) {}
      window.location.href = '/index.html';
    });
  });
})();

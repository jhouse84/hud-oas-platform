/**
 * HSG.api — Portal-aware API client for the HUD OAS Platform.
 *
 * Defaults to live (DDB-backed) mode. The portal context is derived from the
 * Cognito ID token's `custom:portalScope` claim and auto-attached to every
 * request as `?portal=<scope>` (residential | commercial | both). Admin pages
 * may override the scope per-call via the `portal` argument.
 *
 * Offline mode (sessionStorage cache) is a graceful degradation: when a GET
 * fails with a network error, the last-known-good response is returned with
 * a `_stale: true` flag.
 *
 * Requires window.HSG_CONFIG (apiBase, userPoolId, userPoolClientId, region)
 * and HSG.cognito for token management.
 */
window.HSG = window.HSG || {};

HSG.api = (function () {
  'use strict';

  var CACHE_PREFIX = 'hsg.cache.v2.';
  var CACHE_TTL_MS = 60 * 1000; // 60s soft cache for hot reads

  var config = {
    apiBase: (window.HSG_CONFIG && window.HSG_CONFIG.apiBase) || '',
    region:  (window.HSG_CONFIG && window.HSG_CONFIG.region)  || 'us-east-1',
    timeoutMs: 15000
  };

  // ---------------------------------------------------------------------
  //  Token + portal context
  // ---------------------------------------------------------------------
  function getIdToken() {
    try { return sessionStorage.getItem('hsg.idToken') || null; } catch (e) { return null; }
  }

  function decodeClaims() {
    try {
      var t = getIdToken();
      if (!t) return null;
      var p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (p.length % 4) p += '=';
      return JSON.parse(atob(p));
    } catch (e) { return null; }
  }

  function currentPortal() {
    var c = decodeClaims();
    if (c && c['custom:portalScope']) return c['custom:portalScope'];
    // Anonymous + qualification flows: derive from URL (residential.* / commercial.* / admin.*)
    var host = (window.location && window.location.hostname) || '';
    if (host.indexOf('residential') === 0) return 'residential';
    if (host.indexOf('commercial')  === 0) return 'commercial';
    if (host.indexOf('admin')       === 0) return 'admin';
    // Local dev: fall back to URL path
    var path = window.location.pathname || '';
    if (path.indexOf('/residential') === 0) return 'residential';
    if (path.indexOf('/commercial')  === 0) return 'commercial';
    if (path.indexOf('/admin')       === 0) return 'admin';
    return null;
  }

  function isAuthenticated() {
    var t = getIdToken();
    if (!t) return false;
    try {
      var exp = Number(sessionStorage.getItem('hsg.expiresAt') || 0);
      return !exp || (Math.floor(Date.now() / 1000) < exp - 30);
    } catch (e) { return !!t; }
  }

  // ---------------------------------------------------------------------
  //  HTTP core with cache + retry
  // ---------------------------------------------------------------------
  function cacheKey(method, path) { return CACHE_PREFIX + method + ' ' + path; }

  function readCache(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function writeCache(key, data) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data: data }));
    } catch (e) { /* quota exceeded — ignore */ }
  }

  function withTimeout(promise, ms, label) {
    return new Promise(function (resolve, reject) {
      var to = setTimeout(function () { reject(new Error((label || 'Request') + ' timed out')); }, ms);
      promise.then(function (v) { clearTimeout(to); resolve(v); }, function (e) { clearTimeout(to); reject(e); });
    });
  }

  function request(method, path, body, opts) {
    opts = opts || {};
    var portal = opts.portal || currentPortal();
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    var fullPath = path + (portal && !opts.skipPortal ? (sep + 'portal=' + encodeURIComponent(portal)) : '');
    var url = config.apiBase + fullPath;

    var headers = { 'content-type': 'application/json', 'accept': 'application/json' };
    var token = getIdToken();
    if (token && !opts.skipAuth) headers['authorization'] = 'Bearer ' + token;

    var ck = (method === 'GET') ? cacheKey(method, fullPath) : null;

    var fetchPromise = fetch(url, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined,
      mode: 'cors',
      credentials: 'omit'
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
        if (!res.ok) {
          var err = new Error((data && (data.message || data.error)) || ('HTTP ' + res.status));
          err.status = res.status;
          err.code = data && data.code;
          err.data = data;
          throw err;
        }
        if (ck) writeCache(ck, data);
        return data;
      });
    });

    return withTimeout(fetchPromise, opts.timeoutMs || config.timeoutMs, method + ' ' + path)
      .catch(function (err) {
        // GET fallback: serve stale cache when network or 5xx
        if (ck && (!err.status || err.status >= 500)) {
          var hit = readCache(ck);
          if (hit && hit.data) {
            var stale = Object.assign({}, hit.data, { _stale: true, _staleSince: hit.at });
            return stale;
          }
        }
        throw err;
      });
  }

  // ---------------------------------------------------------------------
  //  Resources
  // ---------------------------------------------------------------------
  var sales = {
    list: function (opts) {
      opts = opts || {};
      var qs = [];
      if (opts.status) qs.push('status=' + encodeURIComponent(opts.status));
      if (opts.programType) qs.push('programType=' + encodeURIComponent(opts.programType));
      return request('GET', '/sales' + (qs.length ? '?' + qs.join('&') : ''), null, opts);
    },
    get: function (saleId, opts) {
      return request('GET', '/sales/' + encodeURIComponent(saleId), null, opts);
    },
    pools: function (saleId, opts) {
      return request('GET', '/sales/' + encodeURIComponent(saleId) + '/pools', null, opts);
    },
    deals: function (saleId, opts) {
      return request('GET', '/sales/' + encodeURIComponent(saleId) + '/deals', null, opts);
    },
    loans: function (saleId, filter, opts) {
      filter = filter || {};
      var qs = Object.keys(filter)
        .filter(function (k) { return filter[k] != null && filter[k] !== ''; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(filter[k]); }).join('&');
      return request('GET', '/sales/' + encodeURIComponent(saleId) + '/loans' + (qs ? '?' + qs : ''), null, opts);
    },
    // ---- Sale Setup (admin): create a sale + ingest its tape ----
    create: function (sale, opts) {
      return request('POST', '/sales', sale, opts);
    },
    update: function (saleId, patch, opts) {
      return request('PUT', '/sales/' + encodeURIComponent(saleId), patch, opts);
    }
  };

  var loans = {
    get: function (saleId, loanId, opts) {
      return request('GET', '/loans/' + encodeURIComponent(saleId) + '/' + encodeURIComponent(loanId), null, opts);
    },
    // Bulk-insert loans for a sale (admin tape ingestion). The backend chunks
    // the BatchWrite; the client may also chunk for very large tapes.
    bulkPut: function (saleId, loanRecords, opts) {
      return request('POST', '/sales/' + encodeURIComponent(saleId) + '/loans', { loans: loanRecords }, opts);
    }
  };

  var qc = {
    listForSale: function (saleId, status, opts) {
      var qs = status ? '?status=' + encodeURIComponent(status) : '';
      return request('GET', '/sales/' + encodeURIComponent(saleId) + '/qc' + qs, null, opts);
    },
    get: function (saleId, qcId, opts) {
      return request('GET', '/qc/' + encodeURIComponent(saleId) + '/' + encodeURIComponent(qcId), null, opts);
    }
  };

  var bidders = {
    list: function (opts) {
      opts = opts || {};
      var qs = [];
      if (opts.status) qs.push('status=' + encodeURIComponent(opts.status));
      if (opts.search) qs.push('q=' + encodeURIComponent(opts.search));
      return request('GET', '/bidders' + (qs.length ? '?' + qs.join('&') : ''), null, opts);
    },
    get: function (bidderId, opts) {
      return request('GET', '/bidders/' + encodeURIComponent(bidderId), null, opts);
    },
    create: function (application, opts) {
      // Public endpoint (qualification submission, no JWT required)
      return request('POST', '/bidders', application, Object.assign({ skipAuth: true }, opts || {}));
    },
    approve: function (bidderId, payload, opts) {
      return request('POST', '/bidders/' + encodeURIComponent(bidderId) + '/approve', payload || {}, opts);
    },
    reject: function (bidderId, payload, opts) {
      return request('POST', '/bidders/' + encodeURIComponent(bidderId) + '/reject', payload || {}, opts);
    },
    requestInfo: function (bidderId, payload, opts) {
      return request('POST', '/bidders/' + encodeURIComponent(bidderId) + '/request-info', payload || {}, opts);
    },
    me: function (opts) {
      return request('GET', '/bidders/me', null, opts);
    }
  };

  var bids = {
    submit: function (bid, opts) {
      return request('POST', '/bids', bid, opts);
    },
    list: function (filter, opts) {
      filter = filter || {};
      var qs = Object.keys(filter)
        .filter(function (k) { return filter[k] != null && filter[k] !== ''; })
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(filter[k]); }).join('&');
      return request('GET', '/bids' + (qs ? '?' + qs : ''), null, opts);
    },
    withdraw: function (bidId, reason, opts) {
      return request('POST', '/bids/' + encodeURIComponent(bidId) + '/withdraw', { reason: reason }, opts);
    },
    receipt: function (bidId, opts) {
      return request('GET', '/bids/' + encodeURIComponent(bidId) + '/receipt', null, opts);
    }
  };

  var docs = {
    listForSale: function (saleId, opts) {
      return request('GET', '/sales/' + encodeURIComponent(saleId) + '/docs', null, opts);
    },
    presignDownload: function (saleId, docKey, opts) {
      return request('POST', '/docs/presign-download', { saleId: saleId, docKey: docKey }, opts);
    },
    presignUpload: function (saleId, filename, contentType, opts) {
      opts = opts || {};
      var body = { saleId: saleId, filename: filename, contentType: contentType };
      if (opts.folder) body.folder = opts.folder;   // bulk importer: land the file in a category subfolder
      return request('POST', '/docs/presign-upload', body, opts);
    },
    logAccess: function (entry, opts) {
      return request('POST', '/access-log', entry, opts);
    },
    accessHistory: function (filter, opts) {
      filter = filter || {};
      var qs = Object.keys(filter).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(filter[k]); }).join('&');
      return request('GET', '/access-log' + (qs ? '?' + qs : ''), null, opts);
    }
  };

  // -------------------------------------------------------------------
  //  Staff data room (admin) — real S3-backed intake.
  //  The production data room is a flat object store under
  //  originals/{saleId}/; the rich per-asset view is reconstructed from
  //  filenames via the shared classifier. Uploads stream bytes straight
  //  to S3 with a presigned PUT (KMS-encrypted), no metadata table.
  // -------------------------------------------------------------------
  var _assetCache = {};   // saleId -> assets[]  (cleared per page load)
  function buildAssets(loans) {
    return (loans || []).map(function (l) {
      return {
        loanId: l.loan_id || l.loanId,
        fhaCase: l.fha_case_number || l.loan_id || l.loanId,
        label: l.property_name || (l.loan_id || l.loanId || ''),
        state: (l.property && l.property.state) || '—',
        city: (l.property && l.property.city) || '',
        assetClass: l.asset_class || '',
        dd: [], collateral: [], docCount: 0
      };
    });
  }
  function assetsForSale(saleId, opts) {
    if (_assetCache[saleId]) return Promise.resolve(_assetCache[saleId]);
    return sales.loans(saleId, {}, opts).then(function (r) {
      var a = buildAssets(r.loans || []); _assetCache[saleId] = a; return a;
    }, function () { return []; });
  }

  var staffDocs = {
    // Classify a batch of filenames against the sale's loans (no network write).
    classify: function (saleId, fileMetas, opts) {
      if (!window.HSG.docClassify) return Promise.reject(new Error('Classifier (doc-classify.js) not loaded'));
      return assetsForSale(saleId, opts).then(function (assets) {
        return { results: (fileMetas || []).map(function (m) {
          var c = window.HSG.docClassify.classifyFileName(m.fileName, assets);
          c.fileName = m.fileName; c.size = m.size || 0; c.contentType = m.contentType || 'application/pdf';
          c.visibility = c.scope === 'review' ? 'admin' : 'bidder';
          return c;
        }) };
      });
    },
    // Upload each record's bytes to S3 via a presigned PUT. Each record carries
    // its File on `_file` (set by the UI). Classification persists implicitly
    // through the filename convention, re-derived on listing.
    commit: function (saleId, records, actor, opts) {
      records = records || [];
      var saved = [], skipped = [];
      function next(i) {
        if (i >= records.length) return Promise.resolve({ saved: saved, count: saved.length, skipped: skipped });
        var rec = records[i];
        var file = rec._file;
        if (!file) { skipped.push(rec.fileName); return next(i + 1); }
        var ct = rec.contentType || file.type || 'application/octet-stream';
        var upOpts = rec.folder ? Object.assign({}, opts, { folder: rec.folder }) : opts;
        return docs.presignUpload(saleId, rec.fileName, ct, upOpts).then(function (p) {
          var headers = p.requiredHeaders || { 'content-type': ct };
          return fetch(p.url, { method: 'PUT', headers: headers, body: file }).then(function (res) {
            if (!res.ok) throw new Error('S3 upload failed (' + res.status + ') for ' + rec.fileName);
            saved.push({ fileName: rec.fileName, key: p.key });
            return next(i + 1);
          });
        });
      }
      return next(0);
    },
    // Reconstruct the organized data room from the flat S3 list + the sale's loans.
    overview: function (saleId, opts) {
      return Promise.all([
        docs.listForSale(saleId, opts).catch(function () { return { docs: [] }; }),
        assetsForSale(saleId, opts)
      ]).then(function (rr) {
        var docList = rr[0].docs || rr[0].saleDocs || [];
        var assets = (rr[1] || []).map(function (a) { return Object.assign({}, a, { dd: [], collateral: [], docCount: 0 }); });
        var byId = {}; assets.forEach(function (a) { byId[a.loanId] = a; byId[a.fhaCase] = a; });
        var saleDocs = [], review = [];
        docList.forEach(function (d) {
          var name = d.filename || d.name || String(d.docKey || '').split('/').pop();
          var c = window.HSG.docClassify ? window.HSG.docClassify.classifyFileName(name, assets) : { scope: 'review', docType: name };
          var f = {
            docId: d.docKey || d.docId || name, uploadId: d.docKey || d.docId || name,
            key: d.docKey || d.docId, name: name, title: c.docType || name,
            contentType: 'PDF', size: d.size || 0, modified: d.modified,
            group: c.group === 'collateral' ? 'collateral' : (c.scope === 'asset' ? 'due-diligence' : undefined),
            folder: c.folder, staff: true, visibility: 'bidder'
          };
          if (c.scope === 'asset') { var a = byId[c.loanId] || byId[c.fhaCase]; if (a) { (c.group === 'collateral' ? a.collateral : a.dd).push(f); a.docCount = a.dd.length + a.collateral.length; } else { f.folder = 'Forms & Agreements'; saleDocs.push(f); } }
          else if (c.scope === 'sale') saleDocs.push(f);
          else review.push(f);
        });
        var assetsCovered = assets.filter(function (a) { return (a.dd.length + a.collateral.length) > 0; }).length;
        var stats = {
          saleDocs: saleDocs.length, assets: assets.length, assetsCovered: assetsCovered,
          totalFiles: docList.length, staffAdded: docList.length, needsReview: review.length,
          bidderVisible: docList.length, adminOnly: 0
        };
        return { saleId: saleId, saleDocs: saleDocs, assets: assets, review: review, uploads: [], stats: stats };
      });
    },
    // Re-filing and per-file visibility have no production backend yet (flat
    // store, no metadata table). Surface that honestly rather than fake it.
    update: function () { return Promise.resolve({ ok: false, note: 'In production, re-file by re-uploading under the {STATE}_{FHA#}_{DOCTYPE} name.' }); },
    remove: function () { return Promise.reject(new Error('Removing a published file is not yet wired in production. Replace it by re-uploading the same name.')); }
  };

  var qa = {
    ask: function (saleId, payload, opts) {
      return request('POST', '/sales/' + encodeURIComponent(saleId) + '/qa', payload, opts);
    },
    answer: function (qaId, answerText, opts) {
      return request('POST', '/qa/' + encodeURIComponent(qaId) + '/answer', { answer: answerText }, opts);
    },
    listForSale: function (saleId, opts) {
      return request('GET', '/sales/' + encodeURIComponent(saleId) + '/qa', null, opts);
    },
    listInbox: function (status, opts) {
      var qs = status ? '?status=' + encodeURIComponent(status) : '';
      return request('GET', '/qa/inbox' + qs, null, opts);
    }
  };

  var settlements = {
    list: function (filter, opts) {
      filter = filter || {};
      var qs = Object.keys(filter).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(filter[k]); }).join('&');
      return request('GET', '/settlements' + (qs ? '?' + qs : ''), null, opts);
    },
    get: function (settlementId, opts) {
      return request('GET', '/settlements/' + encodeURIComponent(settlementId), null, opts);
    },
    updateMilestone: function (settlementId, milestoneIdx, payload, opts) {
      return request('POST', '/settlements/' + encodeURIComponent(settlementId) + '/milestones/' + milestoneIdx, payload, opts);
    },
    updateDeliverable: function (settlementId, deliverableId, payload, opts) {
      return request('POST', '/settlements/' + encodeURIComponent(settlementId) + '/deliverables/' + encodeURIComponent(deliverableId), payload, opts);
    }
  };

  var bem = {
    listScenarios: function (saleId, opts) {
      return request('GET', '/bem/scenarios?saleId=' + encodeURIComponent(saleId), null, opts);
    },
    getScenario: function (scenarioId, opts) {
      return request('GET', '/bem/scenarios/' + encodeURIComponent(scenarioId), null, opts);
    },
    saveScenario: function (scenario, opts) {
      var method = scenario.scenarioId ? 'PUT' : 'POST';
      var path = scenario.scenarioId ? ('/bem/scenarios/' + encodeURIComponent(scenario.scenarioId)) : '/bem/scenarios';
      return request(method, path, scenario, opts);
    },
    deleteScenario: function (scenarioId, opts) {
      return request('DELETE', '/bem/scenarios/' + encodeURIComponent(scenarioId), null, opts);
    },
    run: function (scenarioId, opts) {
      return request('POST', '/bem/run', { scenarioId: scenarioId }, opts);
    },
    approveAwards: function (saleId, scenarioId, opts) {
      return request('POST', '/bem/approve-awards', { saleId: saleId, scenarioId: scenarioId }, opts);
    }
  };

  var screening = {
    ofac: function (entityName, opts) {
      return request('POST', '/screenings/ofac', { entityName: entityName }, opts);
    },
    sam: function (uei, opts) {
      return request('POST', '/screenings/sam', { uei: uei }, opts);
    },
    tin: function (ein, legalName, opts) {
      return request('POST', '/screenings/tin', { ein: ein, legalName: legalName }, opts);
    }
  };

  var notifications = {
    list: function (opts) {
      return request('GET', '/notifications', null, opts);
    },
    markRead: function (notifId, opts) {
      return request('POST', '/notifications/' + encodeURIComponent(notifId) + '/read', {}, opts);
    },
    markAllRead: function (opts) {
      return request('POST', '/notifications/mark-all-read', {}, opts);
    }
  };

  // ---------------------------------------------------------------------
  //  AI assist — a secured, server-side Claude injection point. The browser
  //  never holds the model key; POST /ai/assist runs the model inside an
  //  admin-gated Lambda and returns structured JSON. One reusable backbone for
  //  document classification, field extraction, pool suggestions, summaries.
  // ---------------------------------------------------------------------
  var ai = {
    assist: function (task, payload, opts) {
      return request('POST', '/ai/assist', Object.assign({ task: task }, payload || {}), opts);
    },
    // Resolve the importer's ambiguous tail — files the rule engine left Unsorted.
    // files: [{ path, name }]; returns [{ path, category, visibility, confidence, reason }].
    classify: function (saleId, files, categories, opts) {
      return request('POST', '/ai/assist', { task: 'classify', saleId: saleId, files: files || [], categories: categories || null }, opts);
    },
    // Suggest pool cuts from a loan tape — geography, balance band, status, with rationale.
    suggestPools: function (saleId, loans, opts) {
      return request('POST', '/ai/assist', { task: 'pools', saleId: saleId, loans: loans || [] }, opts);
    }
  };

  // ---------------------------------------------------------------------
  //  Public surface
  // ---------------------------------------------------------------------
  return {
    config: config,
    request: request,
    isAuthenticated: isAuthenticated,
    currentPortal: currentPortal,
    decodeClaims: decodeClaims,

    sales: sales,
    loans: loans,
    qc: qc,
    bidders: bidders,
    bids: bids,
    docs: docs,
    staffDocs: staffDocs,
    qa: qa,
    settlements: settlements,
    bem: bem,
    screening: screening,
    notifications: notifications,
    ai: ai
  };
})();

/**
 * HSG.docClassify — filename → VDR classification, shared by the demo twin
 * (api-demo.js) and the real client (api.js / admin dataroom).
 *
 * Given a filename and the sale's assets ([{loanId, fhaCase, label, state}]),
 * decide whether the file is an asset-level document (Due Diligence vs
 * Collateral), a sale-level document (BIP / Loan Tape / Procedures / Forms /
 * Asset Summaries), or needs human review. The real data room stores files
 * flat under originals/{saleId}/; this is how the rich per-asset view is
 * reconstructed from a flat key list, and how staff uploads are pre-sorted.
 *
 * Extracted verbatim from the demo twin so both runtimes classify identically.
 */
window.HSG = window.HSG || {};

HSG.docClassify = (function () {
  'use strict';

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

  return {
    COLLATERAL_RE: COLLATERAL_RE,
    DOCTYPE_LABEL: DOCTYPE_LABEL,
    SALE_FOLDER_RULES: SALE_FOLDER_RULES,
    prettyDocType: prettyDocType,
    classifyFileName: classifyFileName
  };
})();

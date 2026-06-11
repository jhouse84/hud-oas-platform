/**
 * HSG.screening — OFAC SDN, SAM.gov, IRS TIN Match wrappers.
 *
 * All calls go through the backend (HSG.api.screening.*) which is the only
 * place that holds API keys and signed credentials. This module provides
 * client-side helpers for orchestrating the multi-call flow during
 * qualification submission and rendering the result UI.
 *
 * Result shape:
 *   { status: 'clear' | 'hit' | 'pending' | 'error',
 *     evidenceId: 'SCRN-...',
 *     screenedAt: ISO8601,
 *     details: { ... source-specific }, message: string }
 */
window.HSG = window.HSG || {};

HSG.screening = (function () {
  'use strict';

  function ofac(entityName) {
    if (!entityName) return Promise.reject(new Error('entityName required'));
    return HSG.api.screening.ofac(entityName).catch(function (e) {
      return { status: 'error', message: e.message || 'OFAC screening failed', screenedAt: new Date().toISOString() };
    });
  }

  function sam(uei) {
    if (!uei) return Promise.reject(new Error('uei required'));
    return HSG.api.screening.sam(uei).catch(function (e) {
      return { status: 'error', message: e.message || 'SAM.gov lookup failed', screenedAt: new Date().toISOString() };
    });
  }

  function tin(ein, legalName) {
    if (!ein || !legalName) return Promise.reject(new Error('ein and legalName required'));
    return HSG.api.screening.tin(ein, legalName).catch(function (e) {
      return { status: 'error', message: e.message || 'TIN match failed', screenedAt: new Date().toISOString() };
    });
  }

  /**
   * Run all three screenings in parallel for a qualification submission.
   * Resolves to { ofac, sam, tin } regardless of individual failures.
   * Caller is responsible for blocking submission on `status === 'hit'`.
   */
  function runAll(input) {
    var entityName = (input && input.entityName) || '';
    var uei = (input && input.uei) || '';
    var ein = (input && input.ein) || '';
    return Promise.all([
      ofac(entityName),
      sam(uei),
      tin(ein, entityName)
    ]).then(function (r) {
      return { ofac: r[0], sam: r[1], tin: r[2] };
    });
  }

  function isCleared(results) {
    if (!results) return false;
    return results.ofac && results.ofac.status === 'clear'
        && results.sam  && results.sam.status === 'clear'
        && results.tin  && results.tin.status === 'clear';
  }

  function hasAnyHit(results) {
    if (!results) return false;
    return (results.ofac && results.ofac.status === 'hit')
        || (results.sam  && results.sam.status === 'hit')
        || (results.tin  && results.tin.status === 'hit');
  }

  /**
   * Render a screening status row (returns HTML string).
   */
  function renderStatusRow(label, result) {
    var status = (result && result.status) || 'pending';
    var modifier = status === 'clear' ? 'screening--clear'
                 : status === 'hit'   ? 'screening--hit'
                 : 'screening--pending';
    var icon = status === 'clear' ? '✓'
             : status === 'hit'   ? '!'
             : status === 'error' ? '×'
             : '…';
    var detail = (result && result.message) || (status === 'pending' ? 'Awaiting…' : status.toUpperCase());
    return '<div class="screening ' + modifier + '">'
      + '<span class="screening__icon" aria-hidden="true">' + icon + '</span>'
      + '<strong>' + label + ':</strong> '
      + '<span>' + detail + '</span>'
      + '</div>';
  }

  return {
    ofac: ofac,
    sam: sam,
    tin: tin,
    runAll: runAll,
    isCleared: isCleared,
    hasAnyHit: hasAnyHit,
    renderStatusRow: renderStatusRow
  };
})();

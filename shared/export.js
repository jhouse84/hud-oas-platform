/**
 * HUD Loan Sale Platform — Export Engine
 * House Strategies Group LLC
 *
 * Supports:
 *   - CSV (with Excel BOM for encoding)
 *   - JSON
 *   - Print-to-PDF (browser native)
 *   - Bid receipts (formatted PDF via print)
 *   - ICS calendar files
 */
window.HSG = window.HSG || {};

HSG.exporter = (function () {
  'use strict';

  /**
   * Export array of objects as CSV. Includes UTF-8 BOM for Excel compatibility.
   */
  function toCSV(data, filename) {
    if (!data || !data.length) return;
    var keys = Object.keys(data[0]);
    var header = keys.map(escapeCSV).join(',');
    var rows = data.map(function (row) {
      return keys.map(function (k) { return escapeCSV(row[k]); }).join(',');
    });
    var csv = '\uFEFF' + header + '\n' + rows.join('\n');
    downloadBlob(csv, filename || 'export.csv', 'text/csv;charset=utf-8');
  }

  function escapeCSV(val) {
    if (val == null) return '';
    var s = Array.isArray(val) ? val.join('; ') : String(val);
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function toJSON(data, filename) {
    var json = JSON.stringify(data, null, 2);
    downloadBlob(json, filename || 'export.json', 'application/json');
  }

  function downloadBlob(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 100);
  }

  /**
   * Print-to-PDF a specific element. Opens browser print dialog with
   * stylesheet prepared for print (user can "Save as PDF").
   */
  function printElement(elementId, title) {
    var el = document.getElementById(elementId);
    if (!el) return;
    var w = window.open('', '_blank');
    if (!w) return;
    var styles = Array.prototype.slice.call(document.querySelectorAll('link[rel="stylesheet"],style'))
      .map(function (s) { return s.outerHTML; })
      .join('\n');
    w.document.write(
      '<html><head><title>' + (title || 'Print') + '</title>' + styles +
      '<style>body{padding:24px;background:#fff;} .no-print{display:none;}</style>' +
      '</head><body>' + el.outerHTML + '</body></html>'
    );
    w.document.close();
    setTimeout(function () { w.print(); }, 250);
  }

  /**
   * Generate a formatted bid receipt as a printable HTML window.
   */
  function printBidReceipt(receipt) {
    var w = window.open('', '_blank');
    if (!w) return;
    var sandboxBanner = receipt.sandbox
      ? '<div style="background:#FEF3C7;border:1px solid #F59E0B;color:#78350F;padding:12px 16px;border-radius:8px;margin-bottom:24px;text-align:center;font-weight:600;letter-spacing:0.05em;">⚠ SANDBOX MODE — TEST BID, NOT LIVE</div>'
      : '';
    var html =
      '<!DOCTYPE html><html><head><title>Bid Receipt — ' + receipt.confirmationCode + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>' +
      '* { box-sizing: border-box; }' +
      'body { font-family: "DM Sans", sans-serif; max-width: 640px; margin: 40px auto; padding: 32px; color: #1F2937; }' +
      'h1 { font-family: "Cormorant Garamond", serif; font-size: 32px; margin: 0 0 4px; letter-spacing: -0.01em; }' +
      '.sub { color: #6B7280; font-size: 13px; margin-bottom: 28px; }' +
      '.conf { font-family: "IBM Plex Mono", monospace; font-size: 18px; font-weight: 600; background: #F3F4F6; padding: 16px 20px; border-radius: 8px; text-align: center; margin-bottom: 28px; letter-spacing: 0.05em; }' +
      '.row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #E5E7EB; }' +
      '.label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #6B7280; font-family: "IBM Plex Mono", monospace; font-weight: 600; }' +
      '.value { font-weight: 500; text-align: right; }' +
      '.amount { font-size: 28px; font-weight: 600; color: #1E1F6B; font-family: "Cormorant Garamond", serif; }' +
      '.footer { margin-top: 32px; padding-top: 20px; border-top: 2px solid #1F2937; font-size: 11px; color: #6B7280; line-height: 1.6; }' +
      '.logo { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }' +
      '.logo-box { width: 40px; height: 40px; border-radius: 8px; background: linear-gradient(135deg, #1E1F6B 0%, #4338CA 100%); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-family: "IBM Plex Mono", monospace; font-size: 14px; }' +
      '@media print { body { margin: 0; padding: 20px; } }' +
      '</style></head><body>' +
      '<div class="logo"><div class="logo-box">HSG</div><div><strong>HUD Asset Sales Platform</strong><br><span class="sub">House Strategies Group LLC</span></div></div>' +
      '<h1>Bid Confirmation Receipt</h1>' +
      '<div class="sub">Official bid submission record</div>' +
      sandboxBanner +
      '<div class="conf">Confirmation: ' + receipt.confirmationCode + '</div>' +
      '<div class="row"><span class="label">Timestamp</span><span class="value">' + new Date(receipt.timestamp).toLocaleString() + '</span></div>' +
      '<div class="row"><span class="label">Bidder</span><span class="value">' + (receipt.bidder || '—') + '</span></div>' +
      '<div class="row"><span class="label">Sale</span><span class="value">' + receipt.sale + '</span></div>' +
      '<div class="row"><span class="label">Pool / Deal</span><span class="value">' + receipt.pool + '</span></div>' +
      '<div class="row"><span class="label">Bid Amount</span><span class="value amount">' + receipt.amount + (receipt.unit === '% of BPO' || receipt.unit === '% of UPB' || receipt.unit === '% of ETD' ? '%' : '') + '</span></div>' +
      (receipt.impliedDollar ? '<div class="row"><span class="label">Implied $ Value</span><span class="value">$' + Number(receipt.impliedDollar).toLocaleString('en-US', { maximumFractionDigits: 0 }) + '</span></div>' : '') +
      '<div class="row"><span class="label">Status</span><span class="value" style="color:' + (receipt.status === 'Conforming' ? '#059669' : '#DC2626') + ';font-weight:600;">' + receipt.status + '</span></div>' +
      '<div class="footer">' +
      '<strong>This receipt confirms submission only.</strong> Bid acceptance depends on conforming-bid evaluation by HUD and Transaction Specialist. ' +
      'Awards will be announced in writing. Keep this receipt for your records. ' +
      'Bid evaluation follows the Bid Evaluation Methodology (BEM) published in the applicable Federal Register Notice.' +
      '</div>' +
      '<script>setTimeout(function(){window.print();}, 300);</scr' + 'ipt>' +
      '</body></html>';
    w.document.write(html);
    w.document.close();
  }

  /* ========================================================================
     PUBLIC API
     ======================================================================== */
  return {
    toCSV: toCSV,
    toJSON: toJSON,
    printElement: printElement,
    printBidReceipt: printBidReceipt,
    downloadBlob: downloadBlob
  };
})();

/**
 * HSG.vdrRoom — the bidder-facing Virtual Data Room.
 *
 * Modeled on the canonical HUD sale workspace: sale-level documents (BIP +
 * supplements, loan tape, procedures, forms) plus a per-asset file set split
 * into DUE DILIGENCE FILES and COLLATERAL FILES, with the real per-loan
 * naming convention ({STATE}_{FHA#}_{DOCTYPE}.pdf). Searchable by case
 * number, property, city, state, or filename; filterable by state.
 *
 * Accepts the rich manifest shape ({ saleDocs, assets }) and falls back to
 * the legacy flat { docs } listing when per-asset manifests aren't published.
 * Every download is presigned, per-bidder watermarked, and access-logged.
 */
window.HSG = window.HSG || {};

HSG.vdrRoom = (function () {
  'use strict';
  var u = function () { return HSG.utils; };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }
  function kb(size) {
    if (!size) return '—';
    return size >= 1048576 ? (size / 1048576).toFixed(1) + ' MB' : Math.round(size / 1024) + ' KB';
  }

  function fileRow(d) {
    return '<tr data-vdr-file data-text="' + esc(((d.name || '') + ' ' + (d.title || '')).toLowerCase()) + '">' +
      '<td><span style="font-weight: 500;">' + esc(d.title || d.name || d.key) + '</span>' +
        (d.title && d.name && d.title !== d.name ? '<div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted); margin-top: 1px;">' + esc(d.name) + '</div>' : '') + '</td>' +
      '<td style="white-space: nowrap;">' + esc(d.contentType || 'PDF') + '</td>' +
      '<td style="white-space: nowrap;">' + esc(kb(d.size)) + '</td>' +
      '<td style="text-align: right;"><a href="#" data-action="vdr-download" data-key="' + esc(d.key) + '" style="color: var(--color-portal); font-weight: 600;">Download</a></td>' +
    '</tr>';
  }

  function fileTable(rows) {
    return '<table class="data-table" style="margin-top: var(--space-2);">' +
      '<thead><tr><th>Document</th><th>Type</th><th>Size</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  }

  function groupBlock(label, files, badgeColor) {
    if (!files || !files.length) return '';
    return '<div style="margin-top: var(--space-3);">' +
      '<div style="display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: ' + badgeColor + ';">' +
        '<span style="width: 8px; height: 8px; border-radius: 2px; background: ' + badgeColor + '; display: inline-block;"></span>' +
        esc(label) + ' <span style="color: var(--color-text-muted);">· ' + files.length + '</span></div>' +
      fileTable(files.map(fileRow).join('')) +
    '</div>';
  }

  function assetBlock(a) {
    var place = [a.city, a.state].filter(Boolean).join(', ');
    var text = [a.loanId, a.fhaCase, a.label, a.city, a.state]
      .concat((a.dd || []).map(function (d) { return d.name; }))
      .concat((a.collateral || []).map(function (d) { return d.name; }))
      .join(' ').toLowerCase();
    return '<details data-vdr-asset data-state="' + esc(a.state) + '" data-text="' + esc(text) + '" style="margin-bottom: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-sm); overflow: hidden;">' +
      '<summary style="display: flex; align-items: center; gap: 14px; padding: 13px 16px; cursor: pointer; list-style: none;">' +
        '<span style="font-family: var(--font-mono); font-size: 12px; font-weight: 600; color: var(--color-portal); white-space: nowrap;">' + esc(a.fhaCase || a.loanId) + '</span>' +
        '<span style="font-weight: 600; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + esc(a.label || '') + '</span>' +
        '<span style="font-size: 12.5px; color: var(--color-text-muted); white-space: nowrap;">' + esc(place) + '</span>' +
        '<span style="margin-left: auto; font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted); white-space: nowrap;">' + (a.docCount || ((a.dd || []).length + (a.collateral || []).length)) + ' files</span>' +
      '</summary>' +
      '<div style="padding: 4px 16px 16px; border-top: 1px solid var(--color-divider);">' +
        groupBlock('Due Diligence Files', a.dd, 'var(--color-portal)') +
        groupBlock('Collateral Files', a.collateral, '#8C5A00') +
      '</div>' +
    '</details>';
  }

  function render(container, sale, opts) {
    opts = opts || {};
    var saleId = sale.sale_id || sale.saleId;
    container.innerHTML = '<p class="empty">Loading data room…</p>';

    HSG.api.docs.listForSale(saleId).then(function (r) {
      var assets = (r && r.assets) || [];
      var saleDocs = (r && r.saleDocs) || [];
      if (!assets.length && !saleDocs.length) {
        // Legacy flat fallback (live mode before per-asset manifests publish)
        var docs = (r && r.docs) || [];
        if (!docs.length) {
          container.innerHTML = '<div class="empty"><p>No documents published yet for this sale.</p></div>';
          return;
        }
        var folders = {};
        docs.forEach(function (d) { (folders[d.folder || 'Documents'] = folders[d.folder || 'Documents'] || []).push(d); });
        container.innerHTML = Object.keys(folders).sort().map(function (f) {
          return '<details open style="margin-bottom: var(--space-3);"><summary style="font-family: var(--font-mono); font-size: var(--text-sm); padding: var(--space-2); cursor: pointer;">' + esc(f) + ' (' + folders[f].length + ')</summary>' + fileTable(folders[f].map(fileRow).join('')) + '</details>';
        }).join('');
        wireDownloads(container, saleId, opts);
        return;
      }

      var totalFiles = saleDocs.length;
      assets.forEach(function (a) { totalFiles += (a.dd || []).length + (a.collateral || []).length; });
      var states = {};
      assets.forEach(function (a) { if (a.state && a.state !== '—') states[a.state] = true; });

      var saleFolders = {};
      saleDocs.forEach(function (d) { (saleFolders[d.folder || 'Sale Documents'] = saleFolders[d.folder || 'Sale Documents'] || []).push(d); });

      var html =
        '<div style="display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: var(--space-4);">' +
          '<div style="font-family: var(--font-mono); font-size: 12px; color: var(--color-text-muted);">' +
            saleDocs.length + ' SALE DOCUMENTS · ' + assets.length + ' ASSETS · ' + totalFiles + ' FILES</div>' +
          '<div style="margin-left: auto; font-size: 12px; color: var(--color-text-muted);">Downloads are watermarked to your entity and access-logged.</div>' +
        '</div>' +
        '<div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: var(--space-4);">' +
          '<input class="form-input" id="vdr-search" placeholder="Search by case #, property, city, or document…" style="flex: 1; min-width: 240px;" />' +
          '<select class="form-select" id="vdr-state" style="width: auto;"><option value="">All states</option>' +
            Object.keys(states).sort().map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<h3 style="font-family: var(--font-heading); font-size: 19px; color: var(--color-ink); margin: var(--space-4) 0 var(--space-2);">Sale documents</h3>' +
        Object.keys(saleFolders).map(function (f) {
          return '<details open style="margin-bottom: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-surface); box-shadow: var(--shadow-sm); overflow: hidden;">' +
            '<summary style="font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; padding: 12px 16px; cursor: pointer; color: var(--color-text); list-style: none;">' + esc(f) + ' <span style="color: var(--color-text-muted);">· ' + saleFolders[f].length + '</span></summary>' +
            '<div style="padding: 0 16px 14px;">' + fileTable(saleFolders[f].map(fileRow).join('')) + '</div>' +
          '</details>';
        }).join('') +
        '<h3 style="font-family: var(--font-heading); font-size: 19px; color: var(--color-ink); margin: var(--space-6) 0 var(--space-1);">Asset files</h3>' +
        '<p style="font-size: 13px; color: var(--color-text-muted); margin-bottom: var(--space-3);">Every asset carries its own Due Diligence Files and Collateral Files, named ' +
        '<span style="font-family: var(--font-mono); font-size: 12px;">STATE_FHA#_DOCTYPE.pdf</span> — the same convention as the sale workspace.</p>' +
        '<div id="vdr-assets">' + assets.map(assetBlock).join('') + '</div>' +
        '<p id="vdr-noresults" class="empty" style="display: none;">No assets match your search.</p>';

      container.innerHTML = html;
      wireDownloads(container, saleId, opts);

      function applyFilters() {
        var q = (document.getElementById('vdr-search').value || '').toLowerCase().trim();
        var st = document.getElementById('vdr-state').value;
        var visible = 0;
        container.querySelectorAll('[data-vdr-asset]').forEach(function (el) {
          var hit = (!q || el.getAttribute('data-text').indexOf(q) >= 0) &&
                    (!st || el.getAttribute('data-state') === st);
          el.style.display = hit ? '' : 'none';
          if (hit) visible++;
          if (q && hit) el.open = true;
        });
        // Sale-doc rows participate in text search too
        container.querySelectorAll('details [data-vdr-file]').forEach(function (row) {
          if (!row.closest('[data-vdr-asset]')) {
            row.style.display = (!q || row.getAttribute('data-text').indexOf(q) >= 0) ? '' : 'none';
          }
        });
        document.getElementById('vdr-noresults').style.display = visible ? 'none' : '';
      }
      document.getElementById('vdr-search').addEventListener('input', u().debounce(applyFilters, 150));
      document.getElementById('vdr-state').addEventListener('change', applyFilters);
    }).catch(function (err) {
      container.innerHTML = '<div class="auth-error">' + esc(err.message || 'Failed to load the data room') + '</div>';
    });
  }

  function wireDownloads(container, saleId, opts) {
    container.querySelectorAll('[data-action="vdr-download"]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var key = a.getAttribute('data-key');
        HSG.api.docs.presignDownload(saleId, key).then(function (r) {
          if (r && r.url) {
            HSG.api.docs.logAccess({ saleId: saleId, docKey: key, action: 'download', actor: opts.actorEmail || null });
            window.open(r.url, '_blank');
          } else {
            alert('Document not available.');
          }
        }).catch(function (err) { alert(err.message); });
      });
    });
  }

  return { render: render };
})();

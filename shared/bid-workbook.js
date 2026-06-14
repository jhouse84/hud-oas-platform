/**
 * HSG.bidWorkbook — locked Excel bid workbooks for bulk per-loan bidding.
 *
 * The institutional path: a pool can hold hundreds of loans, and no bidder
 * types those one at a time. The platform GENERATES a real .xlsx per pool
 * from the canonical tape — roster and HUD basis pre-filled and read-only,
 * exactly one editable column (BID %), the dollar bid shown by a locked
 * formula. The sheet is structure-protected: you can't add, remove, reorder,
 * re-sort, edit a HUD figure, or change the form. The bidder fills their
 * percentages in Excel, saves, and uploads it back.
 *
 * The lock is convenience + anti-accident, NOT the integrity boundary: on
 * upload the platform re-parses, matches every row to the canonical roster
 * by loan ID, and re-derives every dollar — so a tampered or unprotected
 * sheet buys nothing; anything that doesn't reconcile is rejected. Parsing
 * here yields the same { loanId, bidPct } pairs the per-loan grid produces,
 * which flow through the identical validated submit.
 *
 * ExcelJS is self-hosted (CSP 'self') and lazy-loaded on first use.
 */
window.HSG = window.HSG || {};

HSG.bidWorkbook = (function () {
  'use strict';

  var LIB_URL = '../shared/vendor/exceljs.min.js';
  var WB_PASSWORD = 'HSG-OAS';           // deters accidental edits; server re-validates regardless
  var libPromise = null;

  function ensureLib() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (libPromise) return libPromise;
    libPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = LIB_URL;
      s.onload = function () { window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS failed to initialize')); };
      s.onerror = function () { reject(new Error('Could not load the Excel engine')); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function basisField(programType) {
    if (programType === 'HNVLS') return 'etd_adjusted_bpo';
    if (programType === 'SFLS') return 'current_upb';
    return 'bpo_value';
  }
  function basisLabel(programType) {
    if (programType === 'HNVLS') return 'ETD-Adjusted BPO';
    if (programType === 'SFLS') return 'Unpaid Principal Balance';
    return 'Broker Price Opinion (BPO)';
  }
  function maxPct(programType) { return programType === 'HNVLS' ? 175 : 200; }
  function lid(l) { return l.loan_id || l.loanId; }
  function safeName(s) { return String(s || 'sale').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80); }

  /**
   * Build a locked bid workbook for one pool and return its .xlsx bytes (ArrayBuffer).
   * pool: sale.pools[i] · loans: full sale loan array · sale: sale record
   */
  function buildBuffer(pool, loans, sale, opts) {
    opts = opts || {};
    var programType = sale.programType || sale.program;
    var bf = basisField(programType);
    var poolId = pool.pool_id || pool.poolId;
    var poolName = pool.pool_name || pool.name || poolId;
    var ids = pool.loan_ids || pool.loanIds || [];
    var poolLoans = (loans || []).filter(function (l) { return ids.indexOf(lid(l)) >= 0; });

    return ensureLib().then(function (ExcelJS) {
      var wb = new ExcelJS.Workbook();
      wb.creator = 'HUD OAS Transaction Platform';
      wb.created = new Date(0);

      var ws = wb.addWorksheet('Bid Form', {
        views: [{ state: 'frozen', ySplit: 6, xSplit: 0 }],
        properties: { defaultRowHeight: 16 }
      });

      // ---- Header block (locked) ----
      ws.mergeCells('A1:F1');
      ws.getCell('A1').value = (sale.sale_name || sale.name || sale.saleId) + ' — Bid Form';
      ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1E1F6B' } };
      ws.mergeCells('A2:F2');
      ws.getCell('A2').value = 'Pool ' + poolId + ' · ' + poolName + ' · ' + poolLoans.length + ' loans';
      ws.getCell('A2').font = { bold: true, size: 11, color: { argb: 'FF57595F' } };
      ws.mergeCells('A3:F3');
      ws.getCell('A3').value = 'Enter a BID % (up to 5 decimals) in the highlighted column for EVERY loan to bid this pool, or leave the whole column blank to decline. Leave 0 out — blank means no bid. The BID $ derives automatically and is read-only. Do not add, remove, reorder, or edit any other cell — the platform re-derives and re-validates every figure on upload.';
      ws.getCell('A3').alignment = { wrapText: true, vertical: 'top' };
      ws.getRow(3).height = 46;
      ws.mergeCells('A4:F4');
      ws.getCell('A4').value = 'Bid basis: ' + basisLabel(programType) + ' (HUD-furnished, locked).';
      ws.getCell('A4').font = { italic: true, size: 10, color: { argb: 'FF7F8289' } };

      // ---- Column headers (row 6) ----
      var headerRow = 6;
      var headers = ['Loan ID', 'FHA Case #', 'State', basisLabel(programType) + ' ($)', 'BID %  ▸ enter here', 'BID $ (derived)'];
      var hr = ws.getRow(headerRow);
      headers.forEach(function (h, i) {
        var cell = hr.getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 4 ? 'FF1E7E3E' : 'FF2D2E8F' } };
        cell.alignment = { vertical: 'middle', horizontal: i >= 3 ? 'right' : 'left', wrapText: true };
      });
      hr.height = 26;
      ws.columns = [
        { width: 18 }, { width: 16 }, { width: 8 }, { width: 22 }, { width: 18 }, { width: 20 }
      ];

      // ---- Data rows ----
      var first = headerRow + 1;
      poolLoans.forEach(function (loan, idx) {
        var r = first + idx;
        var row = ws.getRow(r);
        row.getCell(1).value = lid(loan);
        row.getCell(2).value = loan.fha_case_number || loan.fhaCaseNumber || lid(loan);
        row.getCell(3).value = (loan.property && loan.property.state) || loan.propertyState || '';
        row.getCell(4).value = Number(loan[bf]) || 0;
        row.getCell(4).numFmt = '#,##0';
        // BID % — the ONLY editable cell on the row
        var pctCell = row.getCell(5);
        pctCell.numFmt = '0.00000';
        pctCell.protection = { locked: false };
        pctCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAFBF0' } };
        pctCell.border = { top: { style: 'thin', color: { argb: 'FFBBE3C9' } }, bottom: { style: 'thin', color: { argb: 'FFBBE3C9' } }, left: { style: 'thin', color: { argb: 'FF1E7E3E' } }, right: { style: 'thin', color: { argb: 'FF1E7E3E' } } };
        pctCell.dataValidation = {
          type: 'decimal', operator: 'between', allowBlank: true,
          formulae: [0.00001, maxPct(programType)],
          showErrorMessage: true, errorStyle: 'stop',
          errorTitle: 'Invalid BID %',
          error: 'Enter a positive percentage up to ' + maxPct(programType) + ', or leave blank to decline. A literal 0 is not a valid bid.'
        };
        // BID $ — derived, locked formula
        var usd = row.getCell(6);
        usd.value = { formula: 'IF(E' + r + '="","",E' + r + '/100*D' + r + ')' };
        usd.numFmt = '#,##0.00';
      });

      // ---- Summary row ----
      var last = first + poolLoans.length - 1;
      var sumRow = last + 2;
      ws.getCell('D' + sumRow).value = 'Pool aggregate BID $:';
      ws.getCell('D' + sumRow).font = { bold: true };
      ws.getCell('D' + sumRow).alignment = { horizontal: 'right' };
      ws.getCell('F' + sumRow).value = { formula: 'SUM(F' + first + ':F' + last + ')' };
      ws.getCell('F' + sumRow).numFmt = '#,##0.00';
      ws.getCell('F' + sumRow).font = { bold: true };
      ws.getCell('D' + (sumRow + 1)).value = 'Loans bid (of ' + poolLoans.length + '):';
      ws.getCell('D' + (sumRow + 1)).alignment = { horizontal: 'right' };
      ws.getCell('F' + (sumRow + 1)).value = { formula: 'COUNT(E' + first + ':E' + last + ')' };

      // ---- Hidden routing metadata (locked) ----
      var meta = wb.addWorksheet('_meta', { state: 'veryHidden' });
      meta.getCell('A1').value = 'saleId';   meta.getCell('B1').value = sale.saleId || sale.sale_id;
      meta.getCell('A2').value = 'poolId';   meta.getCell('B2').value = poolId;
      meta.getCell('A3').value = 'program';  meta.getCell('B3').value = programType;
      meta.getCell('A4').value = 'firstRow'; meta.getCell('B4').value = first;
      meta.getCell('A5').value = 'generated'; meta.getCell('B5').value = 'HUD OAS Transaction Platform';

      // ---- Protect the sheet (only the unlocked BID % cells are editable) ----
      // spinCount:1 — Excel still prompts for the password to unprotect, but we skip
      // ExcelJS's default 100k-iteration hash spin (≈23s in-browser for a big pool).
      // The protection is anti-accident friction, not the integrity boundary: the
      // server re-derives and re-validates every figure on upload regardless.
      return ws.protect(WB_PASSWORD, {
        spinCount: 1,
        selectLockedCells: true, selectUnlockedCells: true,
        formatCells: false, formatColumns: false, formatRows: false,
        insertColumns: false, insertRows: false, deleteColumns: false, deleteRows: false,
        sort: false, autoFilter: false
      }).then(function () {
        return wb.xlsx.writeBuffer().then(function (buf) {
          return { buffer: buf, fileName: safeName((sale.saleId || sale.sale_id) + '_' + poolId) + '_BidForm.xlsx', poolId: poolId, loanCount: poolLoans.length };
        });
      });
    });
  }

  /**
   * Build and download a locked bid workbook for one pool.
   */
  function download(pool, loans, sale, opts) {
    return buildBuffer(pool, loans, sale, opts).then(function (res) {
      var blob = new Blob([res.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = res.fileName;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return { fileName: res.fileName, poolId: res.poolId, loanCount: res.loanCount };
    });
  }

  /**
   * Parse an uploaded bid workbook back to { saleId, poolId, rows:[{loanId,bidPct}] }.
   * Tries a fast pure-JS reader first (native inflate + XML scan — scales to thousands
   * of loans in well under a second, no Excel engine needed); falls back to the ExcelJS
   * reader if the file is shaped unexpectedly. Blank % rows are omitted (NO BID). Whatever
   * it returns flows through the same validated submit.
   */
  function parse(file) {
    return file.arrayBuffer().then(function (buf) {
      return fastParse(buf).then(function (res) {
        if (res && res.rows) return res;
        return exceljsParse(buf);
      }, function () { return exceljsParse(buf); });
    });
  }

  // ---- Fast path: read the .xlsx zip directly, no ExcelJS ----
  function fastParse(arrayBuffer) {
    return Promise.resolve().then(function () {
      var entries = readZip(new Uint8Array(arrayBuffer));
      function get(path) { return entries[path]; }
      return Promise.all([
        inflateEntry(get('xl/workbook.xml')),
        inflateEntry(get('xl/_rels/workbook.xml.rels')),
        inflateEntry(get('xl/sharedStrings.xml'))
      ]).then(function (p) {
        var shared = parseSharedStrings(p[2]);
        var sheetPaths = mapSheets(p[0], p[1]);
        var bidPath = sheetPaths['Bid Form'] || 'xl/worksheets/sheet1.xml';
        var metaPath = sheetPaths['_meta'];
        return Promise.all([
          inflateEntry(get(bidPath)),
          metaPath ? inflateEntry(get(metaPath)) : Promise.resolve('')
        ]).then(function (s) {
          if (!s[0]) throw new Error('no bid sheet');
          var saleId = null, poolId = null, firstRow = 7;
          if (s[1]) {
            var m = parseSheetCells(s[1], shared);
            if (m['B1'] != null) saleId = String(m['B1']);
            if (m['B2'] != null) poolId = String(m['B2']);
            if (m['B4'] != null && !isNaN(Number(m['B4']))) firstRow = Number(m['B4']);
          }
          var cells = parseSheetCells(s[0], shared);
          var byRow = {};
          Object.keys(cells).forEach(function (addr) {
            var mm = /^([A-Z]+)(\d+)$/.exec(addr); if (!mm) return;
            var rn = Number(mm[2]); if (rn < firstRow) return;
            (byRow[rn] = byRow[rn] || {})[mm[1]] = cells[addr];
          });
          var rows = [];
          Object.keys(byRow).map(Number).sort(function (a, b) { return a - b; }).forEach(function (rn) {
            var rec = byRow[rn];
            var loanId = rec['A'] != null ? String(rec['A']).trim() : '';
            if (!loanId) return;
            var pv = rec['E'];
            if (pv === '' || pv == null) return;          // blank = NO BID
            var pct = Number(pv); if (isNaN(pct)) return;
            rows.push({ loanId: loanId, bidPct: pct });
          });
          return { saleId: saleId, poolId: poolId, rows: rows };
        });
      });
    });
  }

  function readZip(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var i = bytes.length - 22;
    for (; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) break; }
    if (i < 0) throw new Error('not a zip');
    var cdOffset = dv.getUint32(i + 16, true);
    var count = dv.getUint16(i + 10, true);
    var entries = {};
    var p = cdOffset;
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true);
      var compSize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      var localOff = dv.getUint32(p + 42, true);
      var name = utf8(bytes.subarray(p + 46, p + 46 + nameLen));
      entries[name] = { method: method, compSize: compSize, localOff: localOff };
      p += 46 + nameLen + extraLen + commentLen;
    }
    Object.keys(entries).forEach(function (name) {
      var e = entries[name];
      var lnameLen = dv.getUint16(e.localOff + 26, true);
      var lextraLen = dv.getUint16(e.localOff + 28, true);
      var dataStart = e.localOff + 30 + lnameLen + lextraLen;
      e.bytes = bytes.subarray(dataStart, dataStart + e.compSize);
    });
    return entries;
  }

  function inflateEntry(e) {
    if (!e) return Promise.resolve('');
    if (e.method === 0) return Promise.resolve(utf8(e.bytes));   // stored
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('no inflate'));
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter(); w.write(e.bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (ab) { return utf8(new Uint8Array(ab)); });
  }

  function utf8(u8) { return new TextDecoder('utf-8').decode(u8); }

  function parseSharedStrings(xml) {
    if (!xml) return [];
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var sis = doc.getElementsByTagName('si');
    var out = new Array(sis.length);
    for (var i = 0; i < sis.length; i++) {
      var t = '', ts = sis[i].getElementsByTagName('t');
      for (var j = 0; j < ts.length; j++) {
        if (ts[j].parentNode && ts[j].parentNode.nodeName.indexOf('rPh') >= 0) continue;
        t += ts[j].textContent;
      }
      out[i] = t;
    }
    return out;
  }

  function mapSheets(workbookXml, relsXml) {
    var map = {};
    if (!workbookXml || !relsXml) return map;
    try {
      var RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      var wbDoc = new DOMParser().parseFromString(workbookXml, 'application/xml');
      var relDoc = new DOMParser().parseFromString(relsXml, 'application/xml');
      var rid2target = {};
      var rels = relDoc.getElementsByTagName('Relationship');
      for (var i = 0; i < rels.length; i++) rid2target[rels[i].getAttribute('Id')] = rels[i].getAttribute('Target');
      var sheets = wbDoc.getElementsByTagName('sheet');
      for (var k = 0; k < sheets.length; k++) {
        var nm = sheets[k].getAttribute('name');
        var rid = sheets[k].getAttributeNS ? sheets[k].getAttributeNS(RNS, 'id') : null;
        if (!rid) rid = sheets[k].getAttribute('r:id');
        var target = rid2target[rid];
        if (nm && target) map[nm] = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      }
    } catch (e) {}
    return map;
  }

  function parseSheetCells(xml, shared) {
    var cells = {};
    if (!xml) return cells;
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var cs = doc.getElementsByTagName('c');
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], ref = c.getAttribute('r'); if (!ref) continue;
      var t = c.getAttribute('t'), val;
      if (t === 'inlineStr') {
        var is = c.getElementsByTagName('t'); val = is.length ? is[0].textContent : '';
      } else {
        var vs = c.getElementsByTagName('v'); if (!vs.length) continue;
        var raw = vs[0].textContent;
        val = (t === 's') ? (shared[Number(raw)] != null ? shared[Number(raw)] : '') : raw;
      }
      cells[ref] = val;
    }
    return cells;
  }

  /** ExcelJS fallback parser — robust but slower; used only if fastParse can't read the file. */
  function exceljsParse(arrayBuffer) {
    return ensureLib().then(function () {
      var wb = new window.ExcelJS.Workbook();
      return wb.xlsx.load(arrayBuffer).then(function () {
        var meta = wb.getWorksheet('_meta');
        var saleId = meta ? cellText(meta.getCell('B1')) : null;
        var poolId = meta ? cellText(meta.getCell('B2')) : null;
        var firstRow = meta ? Number(cellText(meta.getCell('B4'))) : 7;
        var ws = wb.getWorksheet('Bid Form') || wb.worksheets[0];
        if (!ws) throw new Error('This file is not a platform bid form.');
        var rows = [];
        ws.eachRow(function (row, rowNumber) {
          if (rowNumber < (firstRow || 7)) return;
          var loanId = cellText(row.getCell(1));
          if (!loanId) return;
          var pctRaw = cellValue(row.getCell(5));
          if (pctRaw === '' || pctRaw == null) return;
          var pct = Number(pctRaw);
          if (isNaN(pct)) return;
          rows.push({ loanId: loanId, bidPct: pct });
        });
        return { saleId: saleId, poolId: poolId, rows: rows };
      });
    });
  }

  /**
   * Parse pasted spreadsheet text (TSV/CSV from a copied column or two).
   * Two+ columns → first is loan ID, last numeric is the %. One column → values
   * map to the supplied roster in order. Returns [{loanId, bidPct}].
   */
  function parsePaste(text, roster) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return [];
    var out = [];
    var twoCol = lines[0].split(/\t|,/).length >= 2;
    if (twoCol) {
      lines.forEach(function (line) {
        var parts = line.split(/\t|,/).map(function (p) { return p.trim(); });
        var id = parts[0];
        var num = null;
        for (var i = parts.length - 1; i >= 1; i--) { if (parts[i] !== '' && !isNaN(Number(parts[i]))) { num = Number(parts[i]); break; } }
        if (id && num != null && /[A-Za-z0-9]/.test(id) && !/bid|loan|%|pct/i.test(id)) out.push({ loanId: id, bidPct: num });
      });
    } else {
      var nums = lines.filter(function (l) { return !isNaN(Number(l)); }).map(Number);
      (roster || []).forEach(function (id, i) { if (nums[i] != null) out.push({ loanId: id, bidPct: nums[i] }); });
    }
    return out;
  }

  function cellValue(cell) {
    var v = cell && cell.value;
    if (v == null) return '';
    if (typeof v === 'object') {
      if ('result' in v) return v.result;
      if ('formula' in v) return '';
      if ('text' in v) return v.text;
      if ('richText' in v) return v.richText.map(function (t) { return t.text; }).join('');
    }
    return v;
  }
  function cellText(cell) { var v = cellValue(cell); return v == null ? '' : String(v).trim(); }

  return { ensureLib: ensureLib, buildBuffer: buildBuffer, download: download, parse: parse, parsePaste: parsePaste };
})();

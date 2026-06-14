/**
 * HSG.bidWorkbook — elite, seller-branded locked Excel bid workbooks.
 *
 * A pool can hold hundreds of loans, and no bidder hand-types that many
 * percentages. The platform GENERATES a real .xlsx per pool from the canonical
 * tape, branded to the SELLER (HUD Office of Asset Sales or Ginnie Mae — text
 * wordmarks and distinct palettes, never agency seals). The roster and the
 * HUD-furnished reference balances (UPB, ULB, BPO) are read-only and
 * sheet-protected; exactly one column is editable — BID %. A sale-wide
 * "pricing basis" toggle lets a bidder price against whichever balance they
 * think in (UPB / ULB / BPO); BID $ derives by locked formula, and a
 * "Submitted %" column shows the bid normalized to the sale's OFFICIAL basis —
 * which is what the platform records.
 *
 * The lock is anti-accident convenience, not the integrity boundary: on upload
 * the platform re-reads the bidder's percentages and the chosen basis, then
 * the server re-derives every dollar against the official basis. A tampered or
 * unprotected sheet buys nothing.
 *
 * ExcelJS is self-hosted (CSP 'self') and lazy-loaded on first use. Uploads are
 * parsed by a fast pure-JS reader (native deflate-raw + XML scan); ExcelJS is a
 * fallback only.
 */
window.HSG = window.HSG || {};

HSG.bidWorkbook = (function () {
  'use strict';

  var LIB_URL = '../shared/vendor/exceljs.min.js';
  var WB_PASSWORD = 'HSG-OAS';
  var TOGGLE_CELL = 'C6';
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

  // ---- Basis model (mirrors HSG.bidding.pool) ----
  var BASIS_FIELD = { ULB: 'ulb', UPB: 'current_upb', BPO: 'bpo_value', ETD: 'etd_adjusted_bpo' };
  var BASIS_SHORT = { ULB: 'ULB', UPB: 'UPB', BPO: 'BPO', ETD: 'ETD-adj. BPO' };
  var BASIS_LONG  = { ULB: 'Unpaid Loan Balance', UPB: 'Unpaid Principal Balance', BPO: 'Broker Price Opinion', ETD: 'ETD-Adjusted BPO' };

  function officialKey(sale) {
    var explicit = sale && (sale.bid_basis || sale.bidBasis);
    if (explicit) return String(explicit).toUpperCase();
    var p = sale && (sale.programType || sale.program);
    if (p === 'HNVLS') return 'ETD';
    if (p === 'SFLS') return 'UPB';
    if (p === 'HVLS') return 'ULB';
    return 'UPB';
  }
  function valueForKey(loan, key) {
    var v = Number(loan[BASIS_FIELD[key]]);
    if (!v) {
      if (key === 'ULB') v = Number(loan.unpaid_loan_balance) || Number(loan.current_upb);
      else if (key === 'ETD') v = Number(loan.etdAdjustedBpo) || Number(loan.bpo_value);
      else if (key === 'UPB') v = Number(loan.currentUpb);
      else if (key === 'BPO') v = Number(loan.bpoValue);
    }
    return v || 0;
  }
  function maxPct(sale) {
    if (sale && sale.maxPct != null) return Number(sale.maxPct);
    var p = sale && (sale.programType || sale.program);
    return p === 'HNVLS' ? 175 : 200;
  }

  // ---- Seller branding (text wordmarks + palettes only — NO agency seals) ----
  function sellerBrand(sale) {
    var hay = [(sale && (sale.saleId || sale.sale_id)) || '', (sale && (sale.long_name || sale.name)) || '', (sale && sale.seller) || ''].join(' ').toLowerCase();
    if (/ginnie|gnma|government national/.test(hay)) {
      return {
        key: 'GNMA', wordmark: 'GINNIE  MAE', sub: 'Government National Mortgage Association',
        primary: 'FF0A2A4E', band: 'FF103D6B', accent: 'FF00A39A', accentSoft: 'FFE9F6F4',
        zebra: 'FFF4F9FB', rule: 'FFB7873E', ink: 'FF0A2A4E',
        confidential: 'Confidential — prepared for qualified bidders. Synthetic demonstration data · no live systems · no Ginnie Mae endorsement implied.'
      };
    }
    return {
      key: 'HUD', wordmark: 'OFFICE OF ASSET SALES', sub: 'U.S. Department of Housing and Urban Development',
      primary: 'FF002D72', band: 'FF0A357E', accent: 'FF0073CF', accentSoft: 'FFE9F0FA',
      zebra: 'FFF3F7FC', rule: 'FFB58A3E', ink: 'FF002D72',
      confidential: 'Confidential — prepared for the named qualified bidder. Reference balances are HUD-furnished and read-only.'
    };
  }

  function colLetter(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function lid(l) { return l.loan_id || l.loanId; }
  function safeName(s) { return String(s || 'sale').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80); }

  // ---- Layout: which reference columns appear, and where ----
  function layout(sale, loans) {
    var oKey = officialKey(sale);
    var refKeys = ['UPB', 'ULB', 'BPO'];
    var hasEtd = (loans || []).some(function (l) { return Number(l.etd_adjusted_bpo) || Number(l.etdAdjustedBpo); });
    if (oKey === 'ETD' || hasEtd) refKeys.push('ETD');
    if (refKeys.indexOf(oKey) < 0) refKeys.push(oKey);
    var refCol = {};                         // refKeys start at column D (4)
    refKeys.forEach(function (k, i) { refCol[k] = colLetter(4 + i); });
    var pctIdx = 4 + refKeys.length;
    return {
      oKey: oKey, refKeys: refKeys, refCol: refCol,
      pctCol: colLetter(pctIdx), usdCol: colLetter(pctIdx + 1), subCol: colLetter(pctIdx + 2),
      officialCol: refCol[oKey], lastCol: colLetter(pctIdx + 2), ncols: pctIdx + 2
    };
  }

  /**
   * Build a locked, seller-branded bid workbook for one pool; returns the .xlsx bytes.
   */
  function buildBuffer(pool, loans, sale) {
    var programType = sale.programType || sale.program;
    var poolId = pool.pool_id || pool.poolId;
    var poolName = pool.pool_name || pool.name || poolId;
    var ids = pool.loan_ids || pool.loanIds || [];
    var poolLoans = (loans || []).filter(function (l) { return ids.indexOf(lid(l)) >= 0; });
    var L = layout(sale, poolLoans);
    var brand = sellerBrand(sale);
    var oKey = L.oKey;

    return ensureLib().then(function (ExcelJS) {
      var wb = new ExcelJS.Workbook();
      wb.creator = brand.wordmark.replace(/\s+/g, ' ') + ' — HUD OAS Transaction Platform';
      wb.created = new Date(0);

      var ws = wb.addWorksheet('Bid Form', {
        views: [{ state: 'frozen', ySplit: 8, showGridLines: false }],
        properties: { defaultRowHeight: 15 }
      });
      var last = L.lastCol;
      function merge(range) { ws.mergeCells(range); }
      function cell(addr) { return ws.getCell(addr); }
      function fill(c, argb) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }

      // Column widths
      ws.getColumn(1).width = 18; ws.getColumn(2).width = 16; ws.getColumn(3).width = 8;
      L.refKeys.forEach(function (k, i) { ws.getColumn(4 + i).width = 16; });
      var pIdx = 4 + L.refKeys.length;
      ws.getColumn(pIdx).width = 17; ws.getColumn(pIdx + 1).width = 18; ws.getColumn(pIdx + 2).width = 19;

      // Row 1 — brand band + wordmark
      merge('A1:' + last + '1');
      var c1 = cell('A1');
      c1.value = brand.wordmark + '      ·      BID FORM';
      c1.font = { name: 'Cambria', size: 17, bold: true, color: { argb: 'FFFFFFFF' } };
      c1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      fill(c1, brand.primary); ws.getRow(1).height = 34;

      // Row 2 — agency subtitle (still on the band)
      merge('A2:' + last + '2');
      var c2 = cell('A2');
      c2.value = brand.sub;
      c2.font = { name: 'Calibri', size: 10, color: { argb: 'FFE7EEF8' } };
      c2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      fill(c2, brand.band); ws.getRow(2).height = 18;
      c2.border = { bottom: { style: 'thick', color: { argb: brand.rule } } };

      // Row 3 — sale title
      merge('A3:' + last + '3');
      var c3 = cell('A3');
      c3.value = (sale.sale_name || sale.name || sale.saleId);
      c3.font = { name: 'Cambria', size: 14, bold: true, color: { argb: brand.ink } };
      c3.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(3).height = 24;

      // Row 4 — pool · loans · official basis
      merge('A4:' + last + '4');
      var c4 = cell('A4');
      c4.value = 'Pool ' + poolId + '  ·  ' + poolName + '  ·  ' + poolLoans.length + ' loans  ·  Official bid basis: % of ' + oKey + ' (' + BASIS_LONG[oKey] + ')';
      c4.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF57595F' } };
      c4.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(4).height = 17;

      // Row 5 — instructions
      merge('A5:' + last + '5');
      var c5 = cell('A5');
      c5.value = 'Enter a BID % (up to 5 decimals) for EVERY loan to bid this pool, or leave the whole column blank to decline. Blank = no bid; a literal 0 is invalid. The reference balances and BID $ are locked — only the green BID % column is editable.';
      c5.alignment = { wrapText: true, vertical: 'middle' }; c5.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF6B7077' } };
      ws.getRow(5).height = 42;

      // Row 6 — pricing-basis toggle
      merge('A6:B6');
      var tlabel = cell('A6'); tlabel.value = 'Pricing basis  ▸'; tlabel.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: brand.ink } };
      tlabel.alignment = { vertical: 'middle', horizontal: 'right' };
      var toggle = cell(TOGGLE_CELL);
      toggle.value = oKey;
      toggle.protection = { locked: false };
      toggle.font = { name: 'Calibri', size: 11, bold: true, color: { argb: brand.ink } };
      toggle.alignment = { vertical: 'middle', horizontal: 'center' };
      fill(toggle, 'FFFFF6D8');
      toggle.border = { top: { style: 'medium', color: { argb: brand.rule } }, bottom: { style: 'medium', color: { argb: brand.rule } }, left: { style: 'medium', color: { argb: brand.rule } }, right: { style: 'medium', color: { argb: brand.rule } } };
      toggle.dataValidation = { type: 'list', allowBlank: false, formulae: ['"' + L.refKeys.join(',') + '"'], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Pick a basis', error: 'Choose ' + L.refKeys.join(', ') + '.' };
      merge('D6:' + last + '6');
      var tnote = cell('D6');
      tnote.value = 'Price against whichever balance you think in. Your bid is recorded officially as % of ' + oKey + ' — see the "Submitted %" column.';
      tnote.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF6B7077' } };
      tnote.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(6).height = 22;

      // Row 7 — confidentiality
      merge('A7:' + last + '7');
      var c7 = cell('A7'); c7.value = brand.confidential;
      c7.font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: 'FF9499A0' } };
      ws.getRow(7).height = 14;

      // Row 8 — column headers
      var headerRow = 8, firstRow = 9;
      var headers = ['Loan ID', 'FHA Case #', 'State'];
      L.refKeys.forEach(function (k) { headers.push(BASIS_SHORT[k] + ' ($)'); });
      headers.push('BID %  ▸ enter');
      headers.push('BID $ (derived)');
      headers.push('Submitted %  (of ' + oKey + ')');
      var hr = ws.getRow(headerRow);
      headers.forEach(function (h, i) {
        var c = hr.getCell(i + 1);
        c.value = h;
        var isPct = (i + 1) === pIdx;
        c.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
        fill(c, isPct ? 'FF1E7E3E' : brand.band);
        c.alignment = { vertical: 'middle', horizontal: i >= 3 ? 'right' : 'left', wrapText: true };
        c.border = { bottom: { style: 'thin', color: { argb: brand.rule } } };
      });
      hr.height = 30;

      // Data rows
      poolLoans.forEach(function (loan, idx) {
        var r = firstRow + idx;
        var row = ws.getRow(r);
        var zebra = (idx % 2 === 1);
        row.getCell(1).value = lid(loan);
        row.getCell(2).value = loan.fha_case_number || loan.fhaCaseNumber || lid(loan);
        row.getCell(3).value = (loan.property && loan.property.state) || loan.propertyState || '';
        for (var k = 1; k <= 3; k++) { row.getCell(k).font = { name: 'Consolas', size: 9 }; }
        L.refKeys.forEach(function (key, i) {
          var rc = row.getCell(4 + i);
          rc.value = valueForKey(loan, key);
          rc.numFmt = '#,##0'; rc.font = { name: 'Calibri', size: 10 };
          if (key === oKey) rc.font = { name: 'Calibri', size: 10, bold: true, color: { argb: brand.ink } };
        });
        // BID % — editable
        var pc = row.getCell(pIdx);
        pc.numFmt = '0.00000'; pc.protection = { locked: false };
        fill(pc, 'FFEAFBF0');
        pc.border = { top: { style: 'thin', color: { argb: 'FFBBE3C9' } }, bottom: { style: 'thin', color: { argb: 'FFBBE3C9' } }, left: { style: 'medium', color: { argb: 'FF1E7E3E' } }, right: { style: 'medium', color: { argb: 'FF1E7E3E' } } };
        pc.dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0.00001, maxPct(sale)], showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Invalid BID %', error: 'Enter a positive percentage up to ' + maxPct(sale) + ', or leave blank to decline. A literal 0 is not a valid bid.' };
        // BID $ — derived against the toggle basis
        var nested = L.refCol[L.refKeys[L.refKeys.length - 1]] + r;
        for (var j = L.refKeys.length - 2; j >= 0; j--) {
          nested = 'IF($' + TOGGLE_CELL + '="' + L.refKeys[j] + '",' + L.refCol[L.refKeys[j]] + r + ',' + nested + ')';
        }
        var uc = row.getCell(pIdx + 1);
        uc.value = { formula: 'IF(' + L.pctCol + r + '="","",' + L.pctCol + r + '/100*(' + nested + '))' };
        uc.numFmt = '#,##0.00'; uc.font = { name: 'Calibri', size: 10, bold: true };
        // Submitted % — normalized to the OFFICIAL basis
        var sc = row.getCell(pIdx + 2);
        sc.value = { formula: 'IF(' + L.usdCol + r + '="","",' + L.usdCol + r + '/' + L.officialCol + r + '*100)' };
        sc.numFmt = '0.00000'; sc.font = { name: 'Calibri', size: 10, color: { argb: brand.ink } };
        if (zebra) { for (var z = 1; z <= L.ncols; z++) { if (z === pIdx) continue; fill(row.getCell(z), brand.zebra); } }
      });

      // Summary
      var lastDataRow = firstRow + poolLoans.length - 1;
      var sumRow = lastDataRow + 2;
      merge('A' + sumRow + ':' + L.refCol[L.refKeys[L.refKeys.length - 1]] + sumRow);
      var sl = cell('A' + sumRow);
      sl.value = 'POOL TOTAL — bid $ (whole-pool participation required)';
      sl.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: brand.ink } };
      sl.alignment = { vertical: 'middle', horizontal: 'right' };
      var st = cell(L.usdCol + sumRow);
      st.value = { formula: 'SUM(' + L.usdCol + firstRow + ':' + L.usdCol + lastDataRow + ')' };
      st.numFmt = '#,##0.00'; st.font = { name: 'Calibri', size: 11, bold: true, color: { argb: brand.ink } };
      st.border = { top: { style: 'double', color: { argb: brand.ink } } };
      cell(L.subCol + sumRow).border = { top: { style: 'double', color: { argb: brand.ink } } };
      cell(L.usdCol + (sumRow - 0));
      var cntRow = sumRow + 1;
      merge('A' + cntRow + ':' + L.refCol[L.refKeys[L.refKeys.length - 1]] + cntRow);
      var cl = cell('A' + cntRow); cl.value = 'Loans bid (of ' + poolLoans.length + ')';
      cl.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF6B7077' } }; cl.alignment = { horizontal: 'right' };
      cell(L.usdCol + cntRow).value = { formula: 'COUNT(' + L.pctCol + firstRow + ':' + L.pctCol + lastDataRow + ')' };
      cell(L.usdCol + cntRow).font = { name: 'Calibri', size: 9.5, color: { argb: 'FF6B7077' } };

      // Footer
      var footRow = cntRow + 2;
      merge('A' + footRow + ':' + last + footRow);
      var fc = cell('A' + footRow);
      fc.value = 'Generated by the HUD OAS Transaction Platform on behalf of ' + (brand.key === 'GNMA' ? 'Ginnie Mae' : 'HUD Office of Asset Sales') + '. Submit by uploading this file — the platform re-derives every figure against the official ' + oKey + ' basis and issues your receipt and form-completion CODE.';
      fc.font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: 'FF9499A0' } };
      fc.alignment = { wrapText: true, vertical: 'top' }; ws.getRow(footRow).height = 28;

      // Hidden routing metadata
      var meta = wb.addWorksheet('_meta', { state: 'veryHidden' });
      var M = [['saleId', sale.saleId || sale.sale_id], ['poolId', poolId], ['program', programType],
               ['firstRow', firstRow], ['officialBasis', oKey], ['pctCol', L.pctCol], ['toggleCell', TOGGLE_CELL], ['idCol', 'A']];
      M.forEach(function (kv, i) { meta.getCell('A' + (i + 1)).value = kv[0]; meta.getCell('B' + (i + 1)).value = kv[1]; });

      return ws.protect(WB_PASSWORD, {
        spinCount: 1,
        selectLockedCells: true, selectUnlockedCells: true,
        formatCells: false, formatColumns: false, formatRows: false,
        insertColumns: false, insertRows: false, deleteColumns: false, deleteRows: false,
        sort: false, autoFilter: false
      }).then(function () {
        return wb.xlsx.writeBuffer().then(function (buf) {
          return { buffer: buf, fileName: safeName((sale.saleId || sale.sale_id) + '_' + poolId) + '_BidForm.xlsx', poolId: poolId, loanCount: poolLoans.length, brand: brand.key, officialBasis: oKey };
        });
      });
    });
  }

  function download(pool, loans, sale) {
    return buildBuffer(pool, loans, sale).then(function (res) {
      var blob = new Blob([res.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = res.fileName;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return res;
    });
  }

  /**
   * Parse an uploaded workbook → { saleId, poolId, basis, rows:[{loanId, bidPct}] }.
   * `basis` is the bidder's chosen pricing basis (the toggle); rows carry the raw
   * BID % against that basis. The caller normalizes to the official basis. Fast
   * pure-JS reader first; ExcelJS fallback.
   */
  function parse(file) {
    return file.arrayBuffer().then(function (buf) {
      return fastParse(buf).then(function (res) {
        if (res && res.rows) return res;
        return exceljsParse(buf);
      }, function () { return exceljsParse(buf); });
    });
  }

  function fastParse(arrayBuffer) {
    return Promise.resolve().then(function () {
      var entries = readZip(new Uint8Array(arrayBuffer));
      function get(p) { return entries[p]; }
      return Promise.all([inflateEntry(get('xl/workbook.xml')), inflateEntry(get('xl/_rels/workbook.xml.rels')), inflateEntry(get('xl/sharedStrings.xml'))]).then(function (p) {
        var shared = parseSharedStrings(p[2]);
        var sheetPaths = mapSheets(p[0], p[1]);
        var bidPath = sheetPaths['Bid Form'] || 'xl/worksheets/sheet1.xml';
        var metaPath = sheetPaths['_meta'];
        return Promise.all([inflateEntry(get(bidPath)), metaPath ? inflateEntry(get(metaPath)) : Promise.resolve('')]).then(function (s) {
          if (!s[0]) throw new Error('no bid sheet');
          var saleId = null, poolId = null, firstRow = 9, pctCol = 'G', toggleCell = TOGGLE_CELL, official = 'ULB', idCol = 'A';
          if (s[1]) {
            var m = parseSheetCells(s[1], shared); var kv = {};
            ['1', '2', '3', '4', '5', '6', '7', '8'].forEach(function (r) { if (m['A' + r] != null) kv[String(m['A' + r])] = m['B' + r]; });
            if (kv.saleId != null) saleId = String(kv.saleId);
            if (kv.poolId != null) poolId = String(kv.poolId);
            if (kv.firstRow != null && !isNaN(Number(kv.firstRow))) firstRow = Number(kv.firstRow);
            if (kv.pctCol) pctCol = String(kv.pctCol);
            if (kv.toggleCell) toggleCell = String(kv.toggleCell);
            if (kv.officialBasis) official = String(kv.officialBasis);
            if (kv.idCol) idCol = String(kv.idCol);
          }
          var cells = parseSheetCells(s[0], shared);
          var basis = (cells[toggleCell] != null && String(cells[toggleCell]).trim()) ? String(cells[toggleCell]).trim().toUpperCase() : official;
          var byRow = {};
          Object.keys(cells).forEach(function (addr) {
            var mm = /^([A-Z]+)(\d+)$/.exec(addr); if (!mm) return;
            var rn = Number(mm[2]); if (rn < firstRow) return;
            (byRow[rn] = byRow[rn] || {})[mm[1]] = cells[addr];
          });
          var rows = [];
          Object.keys(byRow).map(Number).sort(function (a, b) { return a - b; }).forEach(function (rn) {
            var rec = byRow[rn];
            var loanId = rec[idCol] != null ? String(rec[idCol]).trim() : '';
            if (!loanId) return;
            var pv = rec[pctCol];
            if (pv === '' || pv == null) return;
            var pct = Number(pv); if (isNaN(pct)) return;
            rows.push({ loanId: loanId, bidPct: pct });
          });
          return { saleId: saleId, poolId: poolId, basis: basis, official: official, rows: rows };
        });
      });
    });
  }

  function readZip(bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var i = bytes.length - 22;
    for (; i >= 0; i--) { if (dv.getUint32(i, true) === 0x06054b50) break; }
    if (i < 0) throw new Error('not a zip');
    var cdOffset = dv.getUint32(i + 16, true), count = dv.getUint16(i + 10, true), entries = {}, p = cdOffset;
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), compSize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      var localOff = dv.getUint32(p + 42, true);
      entries[utf8(bytes.subarray(p + 46, p + 46 + nameLen))] = { method: method, compSize: compSize, localOff: localOff };
      p += 46 + nameLen + extraLen + commentLen;
    }
    Object.keys(entries).forEach(function (name) {
      var e = entries[name];
      var lnameLen = dv.getUint16(e.localOff + 26, true), lextraLen = dv.getUint16(e.localOff + 28, true);
      var dataStart = e.localOff + 30 + lnameLen + lextraLen;
      e.bytes = bytes.subarray(dataStart, dataStart + e.compSize);
    });
    return entries;
  }

  function inflateEntry(e) {
    if (!e) return Promise.resolve('');
    if (e.method === 0) return Promise.resolve(utf8(e.bytes));
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('no inflate'));
    var ds = new DecompressionStream('deflate-raw');
    var w = ds.writable.getWriter(); w.write(e.bytes); w.close();
    return new Response(ds.readable).arrayBuffer().then(function (ab) { return utf8(new Uint8Array(ab)); });
  }
  function utf8(u8) { return new TextDecoder('utf-8').decode(u8); }

  function parseSharedStrings(xml) {
    if (!xml) return [];
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var sis = doc.getElementsByTagName('si'), out = new Array(sis.length);
    for (var i = 0; i < sis.length; i++) {
      var t = '', ts = sis[i].getElementsByTagName('t');
      for (var j = 0; j < ts.length; j++) { if (ts[j].parentNode && ts[j].parentNode.nodeName.indexOf('rPh') >= 0) continue; t += ts[j].textContent; }
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
      var rid2target = {}; var rels = relDoc.getElementsByTagName('Relationship');
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
      if (t === 'inlineStr') { var is = c.getElementsByTagName('t'); val = is.length ? is[0].textContent : ''; }
      else { var vs = c.getElementsByTagName('v'); if (!vs.length) continue; var raw = vs[0].textContent; val = (t === 's') ? (shared[Number(raw)] != null ? shared[Number(raw)] : '') : raw; }
      cells[ref] = val;
    }
    return cells;
  }

  /** Paste: column of % (mapped to roster) or loanID+% pairs. Returns [{loanId,bidPct}]. */
  function parsePaste(text, roster) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return [];
    var out = [], twoCol = lines[0].split(/\t|,/).length >= 2;
    if (twoCol) {
      lines.forEach(function (line) {
        var parts = line.split(/\t|,/).map(function (p) { return p.trim(); });
        var id = parts[0], num = null;
        for (var i = parts.length - 1; i >= 1; i--) { if (parts[i] !== '' && !isNaN(Number(parts[i]))) { num = Number(parts[i]); break; } }
        if (id && num != null && /[A-Za-z0-9]/.test(id) && !/bid|loan|%|pct/i.test(id)) out.push({ loanId: id, bidPct: num });
      });
    } else {
      var nums = lines.filter(function (l) { return !isNaN(Number(l)); }).map(Number);
      (roster || []).forEach(function (id, i) { if (nums[i] != null) out.push({ loanId: id, bidPct: nums[i] }); });
    }
    return out;
  }

  function exceljsParse(arrayBuffer) {
    return ensureLib().then(function () {
      var wb = new window.ExcelJS.Workbook();
      return wb.xlsx.load(arrayBuffer).then(function () {
        var meta = wb.getWorksheet('_meta');
        function mv(addr) { var c = meta && meta.getCell(addr); return c ? c.value : null; }
        var saleId = null, poolId = null, firstRow = 9, pctCol = 'G', toggleCell = TOGGLE_CELL, official = 'ULB', idCol = 'A';
        if (meta) {
          var kv = {}; for (var r = 1; r <= 8; r++) { var k = mv('A' + r); if (k != null) kv[String(k)] = mv('B' + r); }
          if (kv.saleId != null) saleId = String(kv.saleId);
          if (kv.poolId != null) poolId = String(kv.poolId);
          if (kv.firstRow != null) firstRow = Number(kv.firstRow);
          if (kv.pctCol) pctCol = String(kv.pctCol);
          if (kv.toggleCell) toggleCell = String(kv.toggleCell);
          if (kv.officialBasis) official = String(kv.officialBasis);
          if (kv.idCol) idCol = String(kv.idCol);
        }
        var ws = wb.getWorksheet('Bid Form') || wb.worksheets[0];
        if (!ws) throw new Error('This file is not a platform bid form.');
        function txt(v) { if (v == null) return ''; if (typeof v === 'object') { if ('result' in v) return v.result; if ('text' in v) return v.text; if ('richText' in v) return v.richText.map(function (t) { return t.text; }).join(''); } return v; }
        var basis = String(txt(ws.getCell(toggleCell).value) || official).trim().toUpperCase();
        var pctColNum = pctCol.split('').reduce(function (a, ch) { return a * 26 + (ch.charCodeAt(0) - 64); }, 0);
        var idColNum = idCol.split('').reduce(function (a, ch) { return a * 26 + (ch.charCodeAt(0) - 64); }, 0);
        var rows = [];
        ws.eachRow(function (row, rn) {
          if (rn < firstRow) return;
          var loanId = String(txt(row.getCell(idColNum).value) || '').trim();
          if (!loanId) return;
          var pv = txt(row.getCell(pctColNum).value);
          if (pv === '' || pv == null) return;
          var pct = Number(pv); if (isNaN(pct)) return;
          rows.push({ loanId: loanId, bidPct: pct });
        });
        return { saleId: saleId, poolId: poolId, basis: basis, official: official, rows: rows };
      });
    });
  }

  return { ensureLib: ensureLib, sellerBrand: sellerBrand, officialKey: officialKey, valueForKey: valueForKey, buildBuffer: buildBuffer, download: download, parse: parse, parsePaste: parsePaste };
})();

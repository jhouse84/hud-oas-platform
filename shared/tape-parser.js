/**
 * HSG.tape — general-purpose loan-tape (.xlsx) reader + column mapper.
 *
 * The bid workbook reader in bid-workbook.js is specialized to the platform's
 * own bid form. Sale setup needs to ingest an ARBITRARY seller tape, so this
 * module reuses the same proven primitives (central-directory zip read +
 * native DecompressionStream inflate + DOMParser) generalized to:
 *   - list worksheets and read any one of them,
 *   - detect the header row and emit { headers, rows (objects), matrix },
 *   - coerce $ / % / comma-formatted numbers and Excel date serials,
 *   - fuzzy-map detected headers onto the platform's canonical loan fields.
 *
 * Big tapes (thousands of rows) stay fast because the fast path never touches
 * ExcelJS; a lazy ExcelJS fallback (via HSG.bidWorkbook.ensureLib) covers the
 * rare file the fast path can't read.
 *
 * Nothing here is network-bound — it's pure in-browser parsing.
 */
window.HSG = window.HSG || {};

HSG.tape = (function () {
  'use strict';

  // -------------------------------------------------------------------
  // Canonical loan fields. The ingestion UI maps tape columns onto these.
  // `aliases` are normalized (lowercase, alphanumerics only) header guesses.
  // `basisFor` marks the fields that can serve as an official bid basis.
  // -------------------------------------------------------------------
  var CANON = [
    { key: 'loan_id',                 label: 'Loan ID',              group: 'identity', required: true,  type: 'string',
      aliases: ['loanid', 'loannumber', 'loanno', 'loan', 'assetid', 'asset', 'fhaloanid', 'sequenceid', 'seq', 'id'] },
    { key: 'fha_case_number',         label: 'FHA case number',      group: 'identity', required: false, type: 'string',
      aliases: ['fhacasenumber', 'fhacase', 'casenumber', 'caseno', 'fha', 'fhanumber'] },
    { key: 'current_upb',             label: 'Current UPB',          group: 'balances', required: true,  type: 'number', basisFor: 'UPB',
      aliases: ['currentupb', 'upb', 'unpaidprincipalbalance', 'unpaidprincipal', 'principalbalance', 'currentprincipalbalance', 'currbalance', 'balance'] },
    { key: 'unpaid_loan_balance',     label: 'Unpaid loan balance (ULB)', group: 'balances', required: false, type: 'number', basisFor: 'ULB',
      aliases: ['unpaidloanbalance', 'ulb', 'loanbalance', 'totaldebt', 'totalindebtedness', 'payoff', 'totalpayoff'] },
    { key: 'bpo_value',               label: 'BPO value',            group: 'valuation', required: false, type: 'number', basisFor: 'BPO',
      aliases: ['bpovalue', 'bpo', 'brokerpriceopinion', 'asisvalue', 'marketvalue', 'value', 'appraisedvalue', 'appraisal'] },
    { key: 'etd_adjusted_bpo',        label: 'ETD-adjusted BPO',     group: 'valuation', required: false, type: 'number', basisFor: 'ETD',
      aliases: ['etdadjustedbpo', 'etd', 'etdadjusted', 'adjustedbpo', 'etdvalue', 'expectedtimetodisposition'] },
    { key: 'max_claim_amount',        label: 'Max claim amount',     group: 'balances', required: false, type: 'number',
      aliases: ['maxclaimamount', 'maxclaim', 'mca', 'maximumclaim'] },
    { key: 'original_principal_balance', label: 'Original principal balance', group: 'balances', required: false, type: 'number',
      aliases: ['originalprincipalbalance', 'opb', 'originalupb', 'origbalance', 'originalbalance', 'origloanamount', 'originalloanamount'] },
    { key: 'interest_rate',           label: 'Interest rate',        group: 'terms', required: false, type: 'number',
      aliases: ['interestrate', 'noterate', 'rate', 'couponrate', 'coupon'] },
    { key: 'property_address',        label: 'Property address',     group: 'property', required: false, type: 'string',
      aliases: ['propertyaddress', 'address', 'street', 'streetaddress', 'propertystreet', 'siteaddress', 'addressline1'] },
    { key: 'property_city',           label: 'Property city',        group: 'property', required: false, type: 'string',
      aliases: ['propertycity', 'city', 'sitecity'] },
    { key: 'property_state',          label: 'Property state',       group: 'property', required: false, type: 'string',
      aliases: ['propertystate', 'state', 'st', 'sitestate'] },
    { key: 'property_zip',            label: 'Property ZIP',         group: 'property', required: false, type: 'string',
      aliases: ['propertyzip', 'zip', 'zipcode', 'postalcode', 'postal'] },
    { key: 'occupancy_status',        label: 'Occupancy status',     group: 'property', required: false, type: 'string',
      aliases: ['occupancystatus', 'occupancy', 'occupied', 'vacancy', 'occupancycode'] },
    { key: 'property_condition',      label: 'Property condition',   group: 'property', required: false, type: 'string',
      aliases: ['propertycondition', 'condition', 'conditioncode'] },
    { key: 'property_name',           label: 'Property / project name', group: 'property', required: false, type: 'string',
      aliases: ['propertyname', 'projectname', 'propertytitle', 'dealname', 'projecttitle'] },
    { key: 'asset_class',             label: 'Asset class',          group: 'property', required: false, type: 'string',
      aliases: ['assetclass', 'collateraltype', 'propertytype', 'assettype', 'producttype'] },
    { key: 'units',                   label: 'Units',                group: 'property', required: false, type: 'number',
      aliases: ['units', 'unitcount', 'numberofunits', 'numunits', 'beds', 'bedcount'] },
    { key: 'pool',                    label: 'Pool (grouping)',      group: 'grouping', required: false, type: 'string',
      aliases: ['pool', 'poolid', 'poolnumber', 'poolno', 'poolname', 'poolassignment', 'lot', 'tranche'] }
  ];

  function normHeader(h) { return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  // -------------------------------------------------------------------
  // Zip + inflate (mirrors bid-workbook.js, kept self-contained)
  // -------------------------------------------------------------------
  function utf8(u8) { return new TextDecoder('utf-8').decode(u8); }

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

  // Worksheets in file order, each { name, path }.
  function listSheets(workbookXml, relsXml) {
    var sheets = [];
    if (!workbookXml || !relsXml) return sheets;
    try {
      var RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
      var wbDoc = new DOMParser().parseFromString(workbookXml, 'application/xml');
      var relDoc = new DOMParser().parseFromString(relsXml, 'application/xml');
      var rid2target = {}; var rels = relDoc.getElementsByTagName('Relationship');
      for (var i = 0; i < rels.length; i++) rid2target[rels[i].getAttribute('Id')] = rels[i].getAttribute('Target');
      var sh = wbDoc.getElementsByTagName('sheet');
      for (var k = 0; k < sh.length; k++) {
        var nm = sh[k].getAttribute('name');
        var rid = sh[k].getAttributeNS ? sh[k].getAttributeNS(RNS, 'id') : null;
        if (!rid) rid = sh[k].getAttribute('r:id');
        var target = rid2target[rid];
        if (nm && target) sheets.push({ name: nm, path: target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '') });
      }
    } catch (e) {}
    return sheets;
  }

  // Date1904 flag — most files use the 1900 system; honor 1904 if declared.
  function is1904(workbookXml) { return /date1904\s*=\s*"(1|true)"/i.test(workbookXml || ''); }

  function colToNum(letters) { var n = 0; for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64); return n; }
  function addrParts(ref) { var m = /^([A-Z]+)(\d+)$/.exec(ref); return m ? { col: colToNum(m[1]), row: Number(m[2]) } : null; }

  // Read a worksheet's cells into a dense matrix [rowIdx][colIdx] (0-based).
  // Tracks which style indices are dates so serials can be coerced later.
  function parseSheetMatrix(xml, shared, dateStyles) {
    var out = { matrix: [], maxCol: 0 };
    if (!xml) return out;
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var rows = doc.getElementsByTagName('row');
    for (var i = 0; i < rows.length; i++) {
      var rowEl = rows[i];
      var rAttr = rowEl.getAttribute('r');
      var rowIdx = rAttr ? Number(rAttr) - 1 : out.matrix.length;
      var cs = rowEl.getElementsByTagName('c');
      var arr = out.matrix[rowIdx] || (out.matrix[rowIdx] = []);
      for (var j = 0; j < cs.length; j++) {
        var c = cs[j], ref = c.getAttribute('r'); if (!ref) continue;
        var ap = addrParts(ref); if (!ap) continue;
        var colIdx = ap.col - 1;
        var t = c.getAttribute('t'), s = c.getAttribute('s'), val;
        if (t === 'inlineStr') { var is = c.getElementsByTagName('t'); val = is.length ? is[0].textContent : ''; }
        else {
          var vs = c.getElementsByTagName('v'); if (!vs.length) continue;
          var raw = vs[0].textContent;
          if (t === 's') { val = shared[Number(raw)] != null ? shared[Number(raw)] : ''; }
          else if (t === 'b') { val = raw === '1'; }
          else {
            // number — flag as date if its style is a date format
            var num = Number(raw);
            if (!isNaN(num) && s != null && dateStyles[s]) { val = { _serial: num }; }
            else { val = isNaN(num) ? raw : num; }
          }
        }
        arr[colIdx] = val;
        if (ap.col > out.maxCol) out.maxCol = ap.col;
      }
    }
    return out;
  }

  // Map style index -> isDate, by reading numFmt ids from styles.xml.
  function parseDateStyles(stylesXml) {
    var map = {};
    if (!stylesXml) return map;
    try {
      var doc = new DOMParser().parseFromString(stylesXml, 'application/xml');
      // built-in date format ids
      var builtinDate = { 14: 1, 15: 1, 16: 1, 17: 1, 22: 1, 45: 1, 46: 1, 47: 1 };
      var customDate = {};
      var fmts = doc.getElementsByTagName('numFmt');
      for (var i = 0; i < fmts.length; i++) {
        var id = fmts[i].getAttribute('numFmtId'), code = (fmts[i].getAttribute('formatCode') || '').toLowerCase();
        if (/[dmy]/.test(code) && !/[#0]/.test(code.replace(/(\[[^\]]*\]|"[^"]*")/g, ''))) customDate[id] = 1;
      }
      var xfs = doc.getElementsByTagName('cellXfs');
      if (xfs.length) {
        var xfList = xfs[0].getElementsByTagName('xf');
        for (var x = 0; x < xfList.length; x++) {
          var nf = xfList[x].getAttribute('numFmtId');
          if (nf != null && (builtinDate[nf] || customDate[nf])) map[String(x)] = 1;
        }
      }
    } catch (e) {}
    return map;
  }

  function serialToISO(serial, d1904) {
    var base = d1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    var ms = base + Math.round(serial * 86400000);
    var dt = new Date(ms);
    return isNaN(dt.getTime()) ? String(serial) : dt.toISOString().slice(0, 10);
  }

  // -------------------------------------------------------------------
  // Public: read(file, opts) -> { sheetNames, sheetName, headers, rows, matrix, rowCount, colCount }
  //   opts.sheet     — name or 0-based index (default: first sheet with data)
  //   opts.headerRow — 1-based header row override (default: first non-empty row)
  // -------------------------------------------------------------------
  function read(file, opts) {
    opts = opts || {};
    return file.arrayBuffer().then(function (buf) {
      return fastRead(buf, opts).catch(function () { return exceljsRead(buf, opts); });
    });
  }

  function fastRead(arrayBuffer, opts) {
    return Promise.resolve().then(function () {
      var entries = readZip(new Uint8Array(arrayBuffer));
      function get(p) { return entries[p]; }
      return Promise.all([
        inflateEntry(get('xl/workbook.xml')),
        inflateEntry(get('xl/_rels/workbook.xml.rels')),
        inflateEntry(get('xl/sharedStrings.xml')),
        inflateEntry(get('xl/styles.xml'))
      ]).then(function (p) {
        var workbookXml = p[0];
        var shared = parseSharedStrings(p[2]);
        var dateStyles = parseDateStyles(p[3]);
        var d1904 = is1904(workbookXml);
        var sheets = listSheets(workbookXml, p[1]);
        if (!sheets.length) sheets = [{ name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' }];
        var sheetNames = sheets.map(function (s) { return s.name; });

        var chosen = pickSheet(sheets, opts.sheet);
        return inflateEntry(get(chosen.path)).then(function (sheetXml) {
          if (!sheetXml) throw new Error('empty sheet');
          var parsed = parseSheetMatrix(sheetXml, shared, dateStyles);
          var shaped = shapeMatrix(parsed.matrix, parsed.maxCol, opts.headerRow, d1904);
          shaped.sheetNames = sheetNames;
          shaped.sheetName = chosen.name;
          return shaped;
        });
      });
    });
  }

  function pickSheet(sheets, want) {
    if (typeof want === 'number' && sheets[want]) return sheets[want];
    if (typeof want === 'string') {
      var byName = sheets.find(function (s) { return s.name === want; });
      if (byName) return byName;
    }
    return sheets[0];
  }

  // Turn a sparse matrix into { headers, rows(objects keyed by header), matrix(data rows) }.
  function shapeMatrix(matrix, maxCol, headerRowOverride, d1904) {
    // find header row: override, else first row with >= 2 non-empty cells
    var headerIdx = headerRowOverride != null ? headerRowOverride - 1 : -1;
    if (headerIdx < 0) {
      for (var r = 0; r < matrix.length; r++) {
        var row = matrix[r] || [];
        var filled = 0;
        for (var c = 0; c < row.length; c++) if (cellText(row[c], d1904) !== '') filled++;
        if (filled >= 2) { headerIdx = r; break; }
      }
    }
    if (headerIdx < 0) headerIdx = 0;

    var headerRow = matrix[headerIdx] || [];
    var headers = [];
    for (var hc = 0; hc < maxCol; hc++) {
      var h = cellText(headerRow[hc], d1904).trim();
      headers.push(h || ('Column ' + colLetter(hc + 1)));
    }
    // de-duplicate header labels so row objects don't collide
    var seen = {};
    headers = headers.map(function (h) {
      if (seen[h] == null) { seen[h] = 0; return h; }
      seen[h]++; return h + ' (' + seen[h] + ')';
    });

    var rows = [], dataMatrix = [];
    for (var dr = headerIdx + 1; dr < matrix.length; dr++) {
      var raw = matrix[dr] || [];
      var anyVal = false, obj = {}, cells = [];
      for (var dc = 0; dc < headers.length; dc++) {
        var v = normalizeCell(raw[dc], d1904);
        cells.push(v);
        obj[headers[dc]] = v;
        if (v !== '' && v != null) anyVal = true;
      }
      if (!anyVal) continue;
      rows.push(obj);
      dataMatrix.push(cells);
    }
    return { headers: headers, rows: rows, matrix: dataMatrix, rowCount: rows.length, colCount: headers.length, headerRow: headerIdx + 1 };
  }

  function colLetter(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function cellText(v, d1904) {
    if (v == null) return '';
    if (typeof v === 'object' && '_serial' in v) return serialToISO(v._serial, d1904);
    return String(v);
  }
  function normalizeCell(v, d1904) {
    if (v == null) return '';
    if (typeof v === 'object' && '_serial' in v) return serialToISO(v._serial, d1904);
    return v;
  }

  // -------------------------------------------------------------------
  // ExcelJS fallback (rare files the fast path can't handle)
  // -------------------------------------------------------------------
  function exceljsRead(arrayBuffer, opts) {
    var ensure = (HSG.bidWorkbook && HSG.bidWorkbook.ensureLib) ? HSG.bidWorkbook.ensureLib() : Promise.reject(new Error('no ExcelJS'));
    return ensure.then(function () {
      var wb = new window.ExcelJS.Workbook();
      return wb.xlsx.load(arrayBuffer).then(function () {
        var sheetNames = wb.worksheets.map(function (w) { return w.name; });
        var ws = typeof opts.sheet === 'number' ? wb.worksheets[opts.sheet]
               : typeof opts.sheet === 'string' ? (wb.getWorksheet(opts.sheet) || wb.worksheets[0])
               : wb.worksheets[0];
        if (!ws) throw new Error('no worksheet');
        function txt(v) {
          if (v == null) return '';
          if (v instanceof Date) return v.toISOString().slice(0, 10);
          if (typeof v === 'object') { if ('result' in v) return v.result; if ('text' in v) return v.text; if ('richText' in v) return v.richText.map(function (t) { return t.text; }).join(''); }
          return v;
        }
        var matrix = [], maxCol = 0;
        ws.eachRow({ includeEmpty: false }, function (row, rn) {
          var arr = [];
          row.eachCell({ includeEmpty: true }, function (cell, cn) { arr[cn - 1] = txt(cell.value); if (cn > maxCol) maxCol = cn; });
          matrix[rn - 1] = arr;
        });
        var shaped = shapeMatrix(matrix, maxCol, opts.headerRow, false);
        shaped.sheetNames = sheetNames;
        shaped.sheetName = ws.name;
        return shaped;
      });
    });
  }

  // -------------------------------------------------------------------
  // Auto-map detected headers onto canonical fields.
  // Returns { byCanon: {canonKey: headerLabel}, byHeader: {headerLabel: canonKey} }.
  // Exact alias hits win; then "header contains alias" / "alias contains header".
  // -------------------------------------------------------------------
  function autoMap(headers) {
    var byCanon = {}, byHeader = {}, usedHeader = {};
    var normed = headers.map(function (h) { return { label: h, n: normHeader(h) }; });

    function claim(canonKey, headerLabel) {
      if (byCanon[canonKey] || usedHeader[headerLabel]) return;
      byCanon[canonKey] = headerLabel; byHeader[headerLabel] = canonKey; usedHeader[headerLabel] = 1;
    }

    // pass 1: exact normalized alias / key match
    CANON.forEach(function (f) {
      var keys = [normHeader(f.key)].concat(f.aliases);
      for (var i = 0; i < normed.length; i++) {
        if (keys.indexOf(normed[i].n) >= 0) { claim(f.key, normed[i].label); break; }
      }
    });
    // pass 2: substring either direction, longest alias first to avoid greedy mis-hits
    CANON.forEach(function (f) {
      if (byCanon[f.key]) return;
      var keys = [normHeader(f.key)].concat(f.aliases).sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < normed.length; i++) {
        if (usedHeader[normed[i].label]) continue;
        var hn = normed[i].n; if (hn.length < 3) continue;
        for (var k = 0; k < keys.length; k++) {
          var al = keys[k]; if (al.length < 3) continue;
          if (hn.indexOf(al) >= 0 || al.indexOf(hn) >= 0) { claim(f.key, normed[i].label); break; }
        }
        if (byCanon[f.key]) break;
      }
    });
    return { byCanon: byCanon, byHeader: byHeader };
  }

  // Coerce a raw cell to the canonical field's type.
  function coerce(value, type) {
    if (value == null || value === '') return type === 'number' ? null : '';
    if (type === 'number') {
      if (typeof value === 'number') return value;
      var n = parseFloat(String(value).replace(/[$,%\s]/g, ''));
      return isNaN(n) ? null : n;
    }
    if (type === 'date') {
      if (typeof value === 'object' && '_serial' in value) return serialToISO(value._serial, false);
      return String(value);
    }
    return String(value).trim();
  }

  function fieldByKey(key) { return CANON.find(function (f) { return f.key === key; }); }

  return {
    CANON: CANON,
    read: read,
    autoMap: autoMap,
    coerce: coerce,
    fieldByKey: fieldByKey,
    normHeader: normHeader
  };
})();

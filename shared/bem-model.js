/**
 * HSG.bem — the Bid Evaluation Model (BEM) as a live, formula-driven Excel workbook.
 *
 * PWS §5.3.12: the TS runs a fully-automated model that imports all bids and
 * produces winning bids, tie bids, cover bids, and every bid received; the PFA
 * independently QC-tests it. This generates that model as a real .xlsx on one
 * admin click after the bid window closes. Bids are the inputs; every evaluation
 * figure — rank, winner, cover, margin, reserve test, award, recovery,
 * best-execution — is a live Excel formula. Change a sealed reserve and the award
 * recomputes; the PFA can re-foot each result to its source.
 *
 * Co-branded: House Strategies Group (Transaction Specialist / preparer) and the
 * Seller (HUD Office of Asset Sales or Ginnie Mae) — text wordmarks + the HSG mark
 * image, never agency seals. Self-hosted ExcelJS (CSP 'self'), lazy-loaded.
 */
window.HSG = window.HSG || {};

HSG.bem = (function () {
  'use strict';

  var LIB_URL = '../shared/vendor/exceljs.min.js';
  var LOGO_URL = '../shared/assets/hsg-logo.jpg';
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

  var BASIS_FIELD = { ULB: 'ulb', UPB: 'current_upb', BPO: 'bpo_value', ETD: 'etd_adjusted_bpo' };
  var BASIS_LONG = { ULB: 'Unpaid Loan Balance', UPB: 'Unpaid Principal Balance', BPO: 'Broker Price Opinion', ETD: 'ETD-Adjusted BPO' };
  function officialKey(sale) {
    var x = sale && (sale.bid_basis || sale.bidBasis);
    if (x) return String(x).toUpperCase();
    var p = sale && (sale.programType || sale.program);
    return p === 'HNVLS' ? 'ETD' : p === 'SFLS' ? 'UPB' : p === 'HVLS' ? 'ULB' : 'UPB';
  }
  function loanVal(loan, key) {
    var v = Number(loan[BASIS_FIELD[key]]);
    if (!v) { if (key === 'ULB') v = Number(loan.unpaid_loan_balance) || Number(loan.current_upb); else if (key === 'ETD') v = Number(loan.etdAdjustedBpo) || Number(loan.bpo_value); }
    return v || 0;
  }

  // ---- Branding: Seller palette (HUD OAS / Ginnie Mae) + HSG operator mark ----
  var HSG_ROYAL = 'FF3334B8', HSG_GRAY = 'FF6B6E78';
  function sellerBrand(sale) {
    var hay = [(sale && (sale.saleId || sale.sale_id)) || '', (sale && (sale.long_name || sale.name)) || '', (sale && sale.seller) || ''].join(' ').toLowerCase();
    if (/ginnie|gnma|government national/.test(hay)) {
      return { key: 'GNMA', wordmark: 'GINNIE  MAE', sub: 'Government National Mortgage Association', primary: 'FF0A2A4E', band: 'FF103D6B', accent: 'FF00A39A', soft: 'FFEAF6F4', zebra: 'FFF4F9FB', rule: 'FFB7873E', ink: 'FF0A2A4E',
        note: 'Confidential bid-evaluation work product · synthetic demonstration data · no Ginnie Mae endorsement implied.' };
    }
    return { key: 'HUD', wordmark: 'OFFICE OF ASSET SALES', sub: 'U.S. Department of Housing and Urban Development', primary: 'FF002D72', band: 'FF0A357E', accent: 'FF0073CF', soft: 'FFE9F0FA', zebra: 'FFF3F7FC', rule: 'FFB58A3E', ink: 'FF002D72',
      note: 'Confidential bid-evaluation work product · prepared for OAS and the PFA QC team.' };
  }

  function colLetter(n) { var s = ''; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function lid(l) { return l.loan_id || l.loanId; }
  function pid(p) { return p.pool_id || p.poolId; }
  function safe(s) { return String(s || 'sale').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 70); }
  function short(name) { return String(name || '').replace(/,?\s*(LLC|L\.P\.|LP|Inc\.?|Corp\.?|Co\.?|Fund|Capital|Partners|Company).*$/i, '').trim().slice(0, 16) || String(name).slice(0, 16); }
  var MONEY = '#,##0', PCT5 = '0.00000', PCT2 = '0.00';

  function build(sale, pools, loans, bids, opts) {
    opts = opts || {};
    var oKey = officialKey(sale);
    var reserves = opts.reserves || {};
    var defReserve = opts.defaultReservePct != null ? opts.defaultReservePct : 50;
    var brand = sellerBrand(sale);

    // Bidder universe — conforming first
    var byId = {};
    bids.forEach(function (b) { if (!byId[b.bidderId]) byId[b.bidderId] = { bidderId: b.bidderId, name: b.bidderName || b.bidderId, type: b.bidderType || '', conforming: b.conforming !== false }; });
    var bidders = Object.keys(byId).map(function (k) { return byId[k]; }).sort(function (a, b) { return (a.conforming === b.conforming) ? a.name.localeCompare(b.name) : (a.conforming ? -1 : 1); });
    var conf = bidders.filter(function (b) { return b.conforming; });

    var P = pools.map(function (p) {
      var ids = p.loan_ids || p.loanIds || [];
      var pl = loans.filter(function (l) { return ids.indexOf(lid(l)) >= 0; });
      return { id: pid(p), tag: pid(p).replace((sale.saleId || sale.sale_id || '') + '-', ''), name: p.pool_name || p.name || pid(p), loans: pl,
        aggUPB: pl.reduce(function (s, l) { return s + loanVal(l, 'UPB'); }, 0), aggULB: pl.reduce(function (s, l) { return s + loanVal(l, 'ULB'); }, 0),
        aggBPO: pl.reduce(function (s, l) { return s + loanVal(l, 'BPO'); }, 0), aggOff: pl.reduce(function (s, l) { return s + loanVal(l, oKey); }, 0),
        bids: bids.filter(function (b) { return b.poolId === pid(p); }) };
    });

    var logoP = fetch(LOGO_URL).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).catch(function () { return null; });

    return Promise.all([ensureLib(), logoP]).then(function (arr) {
      var ExcelJS = arr[0], logoBuf = arr[1];
      var wb = new ExcelJS.Workbook();
      wb.creator = 'House Strategies Group — Bid Evaluation Model';
      wb.created = new Date(0);

      function fill(c, argb) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }
      function band(ws, range, text, o) {
        o = o || {}; ws.mergeCells(range);
        var c = ws.getCell(range.split(':')[0]);
        c.value = text;
        c.font = { name: o.serif ? 'Cambria' : 'Calibri', size: o.size || 11, bold: o.bold !== false, color: { argb: o.color || 'FFFFFFFF' } };
        c.alignment = { vertical: 'middle', horizontal: o.align || 'left', indent: o.indent != null ? o.indent : 1, wrapText: !!o.wrap };
        if (o.fill) fill(c, o.fill);
        if (o.height) ws.getRow(Number(range.match(/\d+/)[0])).height = o.height;
        return c;
      }
      // Co-branded two-row header used on every analysis sheet.
      function header(ws, sheetTitle, lastCol) {
        ws.views = [{ showGridLines: false }];
        ws.mergeCells('A1:' + lastCol + '1');
        var c1 = ws.getCell('A1');
        c1.value = { richText: [
          { text: brand.wordmark + '   ', font: { name: 'Cambria', size: 14, bold: true, color: { argb: 'FFFFFFFF' } } },
          { text: '· BID EVALUATION MODEL', font: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFD8E1F0' } } }
        ] };
        c1.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        fill(c1, brand.primary); ws.getRow(1).height = 28;
        ws.mergeCells('A2:' + lastCol + '2');
        var c2 = ws.getCell('A2');
        c2.value = { richText: [
          { text: sheetTitle, font: { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } } },
          { text: '      Transaction Specialist · House Strategies Group', font: { name: 'Calibri', size: 9, color: { argb: 'FFAFC0DA' } } }
        ] };
        c2.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        fill(c2, brand.band);
        c2.border = { bottom: { style: 'thick', color: { argb: brand.rule } } };
        ws.getRow(2).height = 17;
      }
      function headRow(ws, row, headers, widths) {
        headers.forEach(function (h, i) {
          var c = ws.getCell(row, i + 1);
          c.value = h;
          c.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
          fill(c, brand.band);
          c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right', wrapText: true };
          c.border = { bottom: { style: 'thin', color: { argb: brand.rule } } };
          if (widths && widths[i]) ws.getColumn(i + 1).width = widths[i];
        });
        ws.getRow(row).height = 26;
        ws.views = [{ state: 'frozen', ySplit: row, showGridLines: false }];
      }
      function zebra(ws, r, ncols) { for (var z = 1; z <= ncols; z++) { var c = ws.getCell(r, z); if (!c.fill) fill(c, brand.zebra); } }

      var S = { cover: 'Summary', award: 'Award Recommendation', tab: 'Bid Tabulation', reserves: 'Reserves & No-Sale', loans: 'Loan-Level Analysis', recovery: 'Recovery', strat: 'Stratification', score: 'Bidder Scorecard', tension: 'Competitive Tension', method: 'Methodology & Audit' };
      var awardRow = function (i) { return 5 + i; };           // pools occupy rows 5.. on Award/Reserves/Recovery/Tension
      var awardTotal = 5 + P.length;

      // ================= BID TABULATION (canonical bid data) =================
      var wsT = wb.addWorksheet(S.tab);
      header(wsT, 'Every bid received — aggregate, rank, winner and cover', 'L');
      headRow(wsT, 4, ['Bid ID', 'Pool', 'Bidder', 'Type', 'Mode', 'Conforming', 'Aggregate bid $', 'Rank', 'Winner', 'Cover', 'WKey', 'CKey'],
        [16, 10, 26, 15, 11, 11, 16, 8, 9, 8, 9, 9]);
      wsT.getColumn(11).hidden = true; wsT.getColumn(12).hidden = true;
      var tFirst = 5, tr = 5;
      bids.forEach(function (b) {
        var r = tr++;
        wsT.getCell(r, 1).value = b.bidId; wsT.getCell(r, 1).font = { name: 'Consolas', size: 8.5 };
        wsT.getCell(r, 2).value = b.poolId.replace((sale.saleId || sale.sale_id || '') + '-', '');
        wsT.getCell(r, 3).value = b.bidderName;
        wsT.getCell(r, 4).value = b.bidderType || '—';
        wsT.getCell(r, 5).value = b.mode || 'pool-level';
        wsT.getCell(r, 6).value = b.conforming !== false ? 'Yes' : 'No';
        wsT.getCell(r, 7).value = Math.round((b.aggregateUsd || 0) * 100) / 100; wsT.getCell(r, 7).numFmt = MONEY; wsT.getCell(r, 7).font = { name: 'Calibri', size: 10, bold: true };
        if ((r - tFirst) % 2 === 1) zebra(wsT, r, 10);
      });
      var tLast = tr - 1;
      var TB = "'" + S.tab + "'!";
      var poolRng = '$B$' + tFirst + ':$B$' + tLast, confRng = '$F$' + tFirst + ':$F$' + tLast, aggRng = '$G$' + tFirst + ':$G$' + tLast, nameRng = '$C$' + tFirst + ':$C$' + tLast, wkRng = '$K$' + tFirst + ':$K$' + tLast, ckRng = '$L$' + tFirst + ':$L$' + tLast;
      for (var r2 = tFirst; r2 <= tLast; r2++) {
        wsT.getCell(r2, 8).value = { formula: 'IF(F' + r2 + '="No","—",SUMPRODUCT((' + poolRng + '=B' + r2 + ')*(' + confRng + '="Yes")*(' + aggRng + '>G' + r2 + '))+1)' };
        wsT.getCell(r2, 8).alignment = { horizontal: 'right' };
        wsT.getCell(r2, 9).value = { formula: 'IF(AND(F' + r2 + '="Yes",H' + r2 + '=1),"WINNER","")' }; wsT.getCell(r2, 9).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF1E7E3E' } };
        wsT.getCell(r2, 10).value = { formula: 'IF(AND(F' + r2 + '="Yes",H' + r2 + '=2),"cover","")' }; wsT.getCell(r2, 10).font = { name: 'Calibri', size: 9.5, color: { argb: brand.accent } };
        wsT.getCell(r2, 11).value = { formula: 'IF(I' + r2 + '="WINNER",B' + r2 + ',"")' };
        wsT.getCell(r2, 12).value = { formula: 'IF(J' + r2 + '="cover",B' + r2 + ',"")' };
      }

      // ================= RESERVES & NO-SALE (inputs) =================
      var wsR = wb.addWorksheet(S.reserves);
      header(wsR, 'Sealed reserves — the only inputs; the award recomputes against these', 'G');
      headRow(wsR, 4, ['Pool', 'Loans', 'Aggregate ' + oKey, 'Reserve (% ' + oKey + ')', 'Reserve $', 'Winning $', 'Meets reserve?'], [24, 8, 16, 15, 16, 16, 14]);
      P.forEach(function (pool, i) {
        var r = awardRow(i);
        wsR.getCell(r, 1).value = pool.name;
        wsR.getCell(r, 2).value = pool.loans.length;
        wsR.getCell(r, 3).value = pool.aggOff; wsR.getCell(r, 3).numFmt = MONEY;
        var rp = wsR.getCell(r, 4); rp.value = reserves[pool.id] != null ? reserves[pool.id] : defReserve; rp.numFmt = PCT2; rp.protection = { locked: false };
        fill(rp, 'FFFFF6D8'); rp.border = { top: { style: 'thin', color: { argb: brand.rule } }, bottom: { style: 'thin', color: { argb: brand.rule } }, left: { style: 'thin', color: { argb: brand.rule } }, right: { style: 'thin', color: { argb: brand.rule } } };
        rp.dataValidation = { type: 'decimal', operator: 'between', allowBlank: false, formulae: [0, 200], showErrorMessage: true, errorTitle: 'Reserve %', error: 'Enter the sealed reserve as a percent of ' + oKey + '.' };
        wsR.getCell(r, 5).value = { formula: 'D' + r + '/100*C' + r }; wsR.getCell(r, 5).numFmt = MONEY;
        wsR.getCell(r, 6).value = { formula: "'" + S.award + "'!E" + r }; wsR.getCell(r, 6).numFmt = MONEY;
        wsR.getCell(r, 7).value = { formula: 'IF(F' + r + '>=E' + r + ',"YES","NO — no-sale")' }; wsR.getCell(r, 7).font = { name: 'Calibri', bold: true };
      });
      band(wsR, 'A' + (awardTotal + 1) + ':G' + (awardTotal + 1), 'The yellow reserve cells are the only inputs in this model. Lower a reserve and the Award sheet flips that pool from no-sale to award automatically.', { fill: brand.soft, color: brand.ink, bold: false, size: 9.5, wrap: true, height: 28 });

      // ================= AWARD RECOMMENDATION =================
      var wsA = wb.addWorksheet(S.award);
      header(wsA, 'Recommended awards — winner, cover, margin, reserve test, recovery (by formula)', 'M');
      headRow(wsA, 4, ['Pool', 'Bids', 'Winning bidder', 'Winning %', 'Winning $', 'Win% (calc)', 'Cover bidder', 'Cover $', 'Margin $', 'Margin %', 'Reserve $', 'Recovery % ' + oKey, 'Disposition'],
        [24, 6, 24, 11, 16, 11, 24, 16, 14, 10, 16, 13, 18]);
      wsA.getColumn(6).hidden = true;
      P.forEach(function (pool, i) {
        var r = awardRow(i), tag = pool.tag;
        wsA.getCell(r, 1).value = pool.name;
        wsA.getCell(r, 2).value = { formula: 'COUNTIF(' + TB + poolRng + ',"' + tag + '")' };
        wsA.getCell(r, 3).value = { formula: 'IFERROR(INDEX(' + TB + nameRng + ',MATCH("' + tag + '",' + TB + wkRng + ',0)),"—")' }; wsA.getCell(r, 3).font = { name: 'Calibri', bold: true, color: { argb: brand.ink } };
        wsA.getCell(r, 5).value = { formula: 'MAXIFS(' + TB + aggRng + ',' + TB + poolRng + ',"' + tag + '",' + TB + confRng + ',"Yes")' }; wsA.getCell(r, 5).numFmt = MONEY; wsA.getCell(r, 5).font = { name: 'Calibri', bold: true, color: { argb: brand.ink } };
        wsA.getCell(r, 6).value = { formula: "IFERROR(E" + r + "/'" + S.reserves + "'!C" + r + "*100,0)" };
        wsA.getCell(r, 4).value = { formula: 'F' + r }; wsA.getCell(r, 4).numFmt = PCT5;
        wsA.getCell(r, 7).value = { formula: 'IFERROR(INDEX(' + TB + nameRng + ',MATCH("' + tag + '",' + TB + ckRng + ',0)),"—")' };
        wsA.getCell(r, 8).value = { formula: 'IFERROR(INDEX(' + TB + aggRng + ',MATCH("' + tag + '",' + TB + ckRng + ',0)),0)' }; wsA.getCell(r, 8).numFmt = MONEY;
        wsA.getCell(r, 9).value = { formula: 'E' + r + '-H' + r }; wsA.getCell(r, 9).numFmt = MONEY;
        wsA.getCell(r, 10).value = { formula: 'IFERROR((E' + r + '-H' + r + ')/H' + r + '*100,0)' }; wsA.getCell(r, 10).numFmt = PCT2;
        wsA.getCell(r, 11).value = { formula: "'" + S.reserves + "'!E" + r }; wsA.getCell(r, 11).numFmt = MONEY;
        wsA.getCell(r, 12).value = { formula: 'IFERROR(E' + r + '/' + pool.aggULB + '*100,0)' }; wsA.getCell(r, 12).numFmt = PCT2;
        wsA.getCell(r, 13).value = { formula: 'IF(B' + r + '=0,"NO BIDS",IF(E' + r + '>=K' + r + ',"AWARD","NO-SALE (below reserve)"))' }; wsA.getCell(r, 13).font = { name: 'Calibri', bold: true };
        if (i % 2 === 1) zebra(wsA, r, 13);
      });
      wsA.getCell(awardTotal, 1).value = 'TOTAL — awarded proceeds'; wsA.getCell(awardTotal, 1).font = { name: 'Calibri', bold: true, color: { argb: brand.ink } }; wsA.getCell(awardTotal, 1).alignment = { horizontal: 'right' };
      wsA.mergeCells('A' + awardTotal + ':D' + awardTotal);
      wsA.getCell(awardTotal, 5).value = { formula: 'SUMIF(M5:M' + (awardTotal - 1) + ',"AWARD",E5:E' + (awardTotal - 1) + ')' }; wsA.getCell(awardTotal, 5).numFmt = MONEY; wsA.getCell(awardTotal, 5).font = { name: 'Calibri', bold: true, size: 11, color: { argb: brand.ink } }; wsA.getCell(awardTotal, 5).border = { top: { style: 'double', color: { argb: brand.ink } } };

      // ================= LOAN-LEVEL ANALYSIS (best execution) =================
      var wsL = wb.addWorksheet(S.loans);
      var lcols = ['Pool', 'Loan ID', 'State', oKey + ' ($)'];
      conf.forEach(function (b) { lcols.push(short(b.name) + ' %'); lcols.push(short(b.name) + ' $'); });
      lcols.push('Best bid $', 'Award $', 'Upside $');
      header(wsL, 'Per-loan bids, best-execution optimization, and the pool award allocated per loan', colLetter(lcols.length));
      headRow(wsL, 4, lcols, [10, 16, 7].concat([14]).concat(conf.map(function () { return 12; })).reduce(function (a, b) { return a.concat(b); }, []));
      var first = 5, firstBid = 5, lr = 5;
      var bidByPB = {};
      bids.forEach(function (b) { var m = bidByPB[b.poolId + '|' + b.bidderId] = {}; (b.loanBids || []).forEach(function (x) { m[x.loanId] = x.bidPct; }); });
      var bestCol = colLetter(4 + conf.length * 2 + 1), awCol = colLetter(4 + conf.length * 2 + 2), upCol = colLetter(4 + conf.length * 2 + 3);
      var firstUsd = colLetter(firstBid + 1), lastUsd = colLetter(firstBid + (conf.length - 1) * 2 + 1);
      P.forEach(function (pool, pIdx) {
        pool.loans.forEach(function (loan, idx) {
          var r = lr++;
          wsL.getCell(r, 1).value = pool.tag; wsL.getCell(r, 2).value = lid(loan); wsL.getCell(r, 3).value = (loan.property && loan.property.state) || '';
          for (var k = 1; k <= 3; k++) wsL.getCell(r, k).font = { name: 'Consolas', size: 8.5 };
          wsL.getCell(r, 4).value = loanVal(loan, oKey); wsL.getCell(r, 4).numFmt = MONEY; wsL.getCell(r, 4).font = { name: 'Calibri', size: 9 };
          conf.forEach(function (b, bi) {
            var pc = firstBid + bi * 2, pv = (bidByPB[pool.id + '|' + b.bidderId] || {})[lid(loan)];
            var pcell = wsL.getCell(r, pc); if (pv != null) { pcell.value = pv; pcell.numFmt = PCT5; } pcell.font = { name: 'Calibri', size: 8.5 };
            var ucell = wsL.getCell(r, pc + 1); ucell.value = { formula: 'IF(' + colLetter(pc) + r + '="","",' + colLetter(pc) + r + '/100*$D' + r + ')' }; ucell.numFmt = MONEY; ucell.font = { name: 'Calibri', size: 8.5 };
          });
          wsL.getCell(bestCol + r).value = { formula: conf.length ? 'MAX(' + firstUsd + r + ':' + lastUsd + r + ')' : '0' }; wsL.getCell(bestCol + r).numFmt = MONEY; wsL.getCell(bestCol + r).font = { name: 'Calibri', size: 8.5, bold: true };
          wsL.getCell(awCol + r).value = { formula: "IFERROR('" + S.award + "'!$F$" + awardRow(pIdx) + '/100*$D' + r + ',0)' }; wsL.getCell(awCol + r).numFmt = MONEY; wsL.getCell(awCol + r).font = { name: 'Calibri', size: 8.5 };
          wsL.getCell(upCol + r).value = { formula: 'MAX(0,' + bestCol + r + '-' + awCol + r + ')' }; wsL.getCell(upCol + r).numFmt = MONEY; wsL.getCell(upCol + r).font = { name: 'Calibri', size: 8.5, color: { argb: brand.accent } };
          if (idx % 2 === 1) zebra(wsL, r, lcols.length);
        });
      });
      var lLast = lr - 1;

      // ================= RECOVERY =================
      var wsRec = wb.addWorksheet(S.recovery);
      header(wsRec, 'Recovery of awarded proceeds against UPB / ULB / BPO', 'I');
      headRow(wsRec, 4, ['Pool', 'Disposition', 'Award $', 'Aggregate UPB', 'Aggregate ULB', 'Aggregate BPO', 'Rec % UPB', 'Rec % ULB', 'Rec % BPO'], [24, 18, 16, 15, 15, 15, 11, 11, 11]);
      P.forEach(function (pool, i) {
        var r = awardRow(i);
        wsRec.getCell(r, 1).value = pool.name;
        var AW = "'" + S.award + "'!";
        wsRec.getCell(r, 2).value = { formula: AW + 'M' + r };
        wsRec.getCell(r, 3).value = { formula: 'IF(LEFT(' + AW + 'M' + r + ',5)="AWARD",' + AW + 'E' + r + ',0)' }; wsRec.getCell(r, 3).numFmt = MONEY;
        wsRec.getCell(r, 4).value = pool.aggUPB; wsRec.getCell(r, 5).value = pool.aggULB; wsRec.getCell(r, 6).value = pool.aggBPO;
        [4, 5, 6].forEach(function (c) { wsRec.getCell(r, c).numFmt = MONEY; });
        wsRec.getCell(r, 7).value = { formula: 'IFERROR(C' + r + '/D' + r + '*100,0)' }; wsRec.getCell(r, 7).numFmt = PCT2;
        wsRec.getCell(r, 8).value = { formula: 'IFERROR(C' + r + '/E' + r + '*100,0)' }; wsRec.getCell(r, 8).numFmt = PCT2;
        wsRec.getCell(r, 9).value = { formula: 'IFERROR(C' + r + '/F' + r + '*100,0)' }; wsRec.getCell(r, 9).numFmt = PCT2;
      });
      var rt = awardTotal;
      wsRec.getCell(rt, 1).value = 'BLENDED'; wsRec.getCell(rt, 1).font = { bold: true };
      [3, 4, 5, 6].forEach(function (c) { wsRec.getCell(rt, c).value = { formula: 'SUM(' + colLetter(c) + '5:' + colLetter(c) + (rt - 1) + ')' }; wsRec.getCell(rt, c).numFmt = MONEY; wsRec.getCell(rt, c).font = { bold: true }; });
      [[7, 'D'], [8, 'E'], [9, 'F']].forEach(function (pr) { wsRec.getCell(rt, pr[0]).value = { formula: 'IFERROR(C' + rt + '/' + pr[1] + rt + '*100,0)' }; wsRec.getCell(rt, pr[0]).numFmt = PCT2; wsRec.getCell(rt, pr[0]).font = { bold: true }; });

      // ================= STRATIFICATION BY STATE =================
      var wsS = wb.addWorksheet(S.strat);
      header(wsS, 'Awarded collateral by state (SUMIF over the loan-level award column)', 'E');
      headRow(wsS, 4, ['State', 'Loans', 'Aggregate ' + oKey, 'Awarded $', 'Recovery %'], [12, 8, 16, 16, 12]);
      var states = {}; P.forEach(function (pool) { pool.loans.forEach(function (l) { var st = (l.property && l.property.state) || '—'; states[st] = (states[st] || 0) + 1; }); });
      var LL = "'" + S.loans + "'!", lStateR = '$C$5:$C$' + lLast, lOffR = '$D$5:$D$' + lLast, lAwR = '$' + awCol + '$5:$' + awCol + '$' + lLast;
      Object.keys(states).sort().forEach(function (st, i) {
        var r = 5 + i;
        wsS.getCell(r, 1).value = st;
        wsS.getCell(r, 2).value = { formula: 'COUNTIF(' + LL + lStateR + ',"' + st + '")' };
        wsS.getCell(r, 3).value = { formula: 'SUMIF(' + LL + lStateR + ',"' + st + '",' + LL + lOffR + ')' }; wsS.getCell(r, 3).numFmt = MONEY;
        wsS.getCell(r, 4).value = { formula: 'SUMIF(' + LL + lStateR + ',"' + st + '",' + LL + lAwR + ')' }; wsS.getCell(r, 4).numFmt = MONEY;
        wsS.getCell(r, 5).value = { formula: 'IFERROR(D' + r + '/C' + r + '*100,0)' }; wsS.getCell(r, 5).numFmt = PCT2;
        if (i % 2 === 1) zebra(wsS, r, 5);
      });

      // ================= BIDDER SCORECARD =================
      var wsB = wb.addWorksheet(S.score);
      header(wsB, 'Per-bidder participation, wins, and proceeds', 'G');
      headRow(wsB, 4, ['Bidder', 'Type', 'Conforming', 'Pools bid', 'Pools won', 'Winning proceeds $', 'Win rate %'], [26, 16, 11, 10, 10, 16, 11]);
      bidders.forEach(function (b, i) {
        var r = 5 + i, nm = b.name.replace(/"/g, '');
        wsB.getCell(r, 1).value = b.name; wsB.getCell(r, 2).value = b.type || '—'; wsB.getCell(r, 3).value = b.conforming ? 'Yes' : 'No';
        wsB.getCell(r, 4).value = { formula: 'COUNTIF(' + TB + nameRng + ',"' + nm + '")' };
        wsB.getCell(r, 5).value = { formula: 'COUNTIFS(' + TB + nameRng + ',"' + nm + '",' + TB + '$I$' + tFirst + ':$I$' + tLast + ',"WINNER")' };
        wsB.getCell(r, 6).value = { formula: 'SUMIFS(' + TB + aggRng + ',' + TB + nameRng + ',"' + nm + '",' + TB + '$I$' + tFirst + ':$I$' + tLast + ',"WINNER")' }; wsB.getCell(r, 6).numFmt = MONEY;
        wsB.getCell(r, 7).value = { formula: 'IFERROR(E' + r + '/D' + r + '*100,0)' }; wsB.getCell(r, 7).numFmt = PCT2;
        if (i % 2 === 1) zebra(wsB, r, 7);
      });

      // ================= COMPETITIVE TENSION =================
      var wsC = wb.addWorksheet(S.tension);
      header(wsC, 'Bid depth, cover margin, spread, and tie detection per pool', 'H');
      headRow(wsC, 4, ['Pool', 'Bids', 'Conforming', 'High $', 'Cover $', 'Cover margin $', 'Spread $', 'Tie at top?'], [24, 7, 12, 16, 16, 15, 15, 11]);
      P.forEach(function (pool, i) {
        var r = awardRow(i), tag = pool.tag;
        wsC.getCell(r, 1).value = pool.name;
        wsC.getCell(r, 2).value = { formula: 'COUNTIF(' + TB + poolRng + ',"' + tag + '")' };
        wsC.getCell(r, 3).value = { formula: 'COUNTIFS(' + TB + poolRng + ',"' + tag + '",' + TB + confRng + ',"Yes")' };
        wsC.getCell(r, 4).value = { formula: "'" + S.award + "'!E" + r }; wsC.getCell(r, 4).numFmt = MONEY;
        wsC.getCell(r, 5).value = { formula: "'" + S.award + "'!H" + r }; wsC.getCell(r, 5).numFmt = MONEY;
        wsC.getCell(r, 6).value = { formula: 'D' + r + '-E' + r }; wsC.getCell(r, 6).numFmt = MONEY;
        wsC.getCell(r, 7).value = { formula: 'IFERROR(MAXIFS(' + TB + aggRng + ',' + TB + poolRng + ',"' + tag + '",' + TB + confRng + ',"Yes")-MINIFS(' + TB + aggRng + ',' + TB + poolRng + ',"' + tag + '",' + TB + confRng + ',"Yes"),0)' }; wsC.getCell(r, 7).numFmt = MONEY;
        wsC.getCell(r, 8).value = { formula: 'IF(COUNTIFS(' + TB + poolRng + ',"' + tag + '",' + TB + confRng + ',"Yes",' + TB + aggRng + ',D' + r + ')>1,"TIE","no")' };
        if (i % 2 === 1) zebra(wsC, r, 8);
      });

      // ================= COVER & EXECUTIVE SUMMARY =================
      var wsCov = wb.addWorksheet(S.cover);
      wb.worksheets.unshift(wb.worksheets.pop());
      wsCov.views = [{ showGridLines: false }];
      wsCov.getColumn(1).width = 3; wsCov.getColumn(2).width = 30; wsCov.getColumn(3).width = 3; wsCov.getColumn(4).width = 22; wsCov.getColumn(5).width = 14; wsCov.getColumn(6).width = 16;
      // brand band
      band(wsCov, 'A1:F1', '', { fill: brand.primary, height: 8, bold: false });
      band(wsCov, 'A2:F2', brand.wordmark, { fill: brand.primary, size: 20, serif: true, height: 40, indent: logoBuf ? 5 : 1 });
      var c3 = band(wsCov, 'A3:F3', 'BID EVALUATION MODEL  ·  ' + brand.sub, { fill: brand.band, size: 11, color: 'FFE7EEF8', height: 22, indent: logoBuf ? 5 : 1 });
      c3.border = { bottom: { style: 'thick', color: { argb: brand.rule } } };
      if (logoBuf) { try { var imgId = wb.addImage({ buffer: logoBuf, extension: 'jpeg' }); wsCov.addImage(imgId, { tl: { col: 0.25, row: 1.15 }, ext: { width: 58, height: 58 } }); } catch (e) {} }
      band(wsCov, 'A5:F5', (sale.sale_name || sale.name || sale.saleId), { size: 15, color: brand.ink, serif: true, height: 24, bold: true });
      band(wsCov, 'A6:F6', 'Program ' + (sale.programType || sale.program) + '  ·  Official bid basis: % of ' + oKey + ' (' + BASIS_LONG[oKey] + ')  ·  Bid window closed ' + (opts.closedAt || (sale.key_dates && sale.key_dates.bid_day) || '—'), { size: 10, color: 'FF57595F', bold: false });

      function kv(r, label, fv, fmt, isF) {
        wsCov.getCell('B' + r).value = label; wsCov.getCell('B' + r).font = { name: 'Calibri', size: 10.5, color: { argb: 'FF6B7077' } };
        var c = wsCov.getCell('D' + r); if (isF) c.value = { formula: fv }; else c.value = fv; if (fmt) c.numFmt = fmt;
        c.font = { name: 'Calibri', size: 12, bold: true, color: { argb: brand.ink } }; wsCov.mergeCells('D' + r + ':F' + r);
      }
      band(wsCov, 'A8:F8', 'HEADLINE RESULTS', { fill: brand.band, size: 10, height: 18 });
      kv(9, 'Pools offered', P.length);
      kv(10, 'Bids received', bids.length);
      kv(11, 'Qualified (conforming) bidders', conf.length);
      kv(12, 'Pools awarded', "COUNTIF('" + S.award + "'!M5:M" + (awardTotal - 1) + ',\"AWARD\")', null, true);
      kv(13, 'Awarded proceeds', "'" + S.award + "'!E" + awardTotal, MONEY, true);
      kv(14, 'Blended recovery (% ' + oKey + ')', "'" + S.recovery + "'!H" + awardTotal, PCT2, true);
      kv(15, 'Best-execution upside identified', 'SUM(\'' + S.loans + '\'!' + upCol + '5:' + upCol + lLast + ')', MONEY, true);
      band(wsCov, 'A17:F17', 'GOVERNANCE', { fill: brand.band, size: 10, height: 18 });
      kv(18, 'Transaction Specialist', 'House Strategies Group LLC');
      kv(19, 'Seller', brand.key === 'GNMA' ? 'Ginnie Mae' : 'HUD Office of Asset Sales');
      kv(20, 'Prepared by', opts.generatedBy || 'HUD OAS Transaction Platform');
      kv(21, 'Form completion CODE', sale.completion_code || sale.completionCode || '—');
      kv(22, 'Generated', opts.generatedAt || '(stamped on download)');
      band(wsCov, 'A24:F26', 'Bids are the inputs; every evaluation figure — rank, winner, cover, margin, reserve test, award, recovery, best-execution — is a live Excel formula. The sealed reserves on the Reserves sheet are the only inputs; change one and the award recomputes. The PFA QC team can re-foot each result to its source. ' + brand.note, { fill: brand.soft, color: brand.ink, bold: false, size: 9.5, wrap: true });

      // ================= METHODOLOGY & AUDIT =================
      var wsM = wb.addWorksheet(S.method);
      header(wsM, 'Evaluation methodology, formula map, and live QC cross-checks', 'F');
      var ml = [
        ['Award rule', 'Each pool is awarded whole-pool to the highest-aggregate CONFORMING bid that meets the sealed reserve. Aggregate bid $ is the bidder’s submitted whole-pool amount; the BEM ranks and awards it.'],
        ['Conformance', 'Only bids from bidders Qualified at bid close are eligible to win. Non-conforming bids are tabulated and shown but excluded from rank, winner, and cover.'],
        ['Rank', 'Rank = count of conforming pool bids strictly greater, + 1 (SUMPRODUCT). Winner = conforming rank 1; cover = conforming rank 2.'],
        ['Ties', 'A tie at the top is flagged on the Competitive Tension sheet (COUNTIFS at the high bid > 1); resolve per the sale tie-breaker before award.'],
        ['Reserve / no-sale', 'A pool with no conforming bid ≥ its sealed reserve is NO-SALE. Reserves are the yellow input cells on the Reserves sheet.'],
        ['Recovery', 'Recovery = awarded $ ÷ aggregate UPB / ULB / BPO; blended recovery weights the awarded pools only.'],
        ['Best execution', 'Per-loan best bid = MAX of conforming bidders’ loan bids; upside = best − the award at the pool’s winning %. Quantifies value foregone by whole-pool award.'],
        ['Provenance', 'Sale ' + (sale.saleId || sale.sale_id) + ' · ' + bids.length + ' live bids imported · basis % of ' + oKey + ' · completion CODE ' + (sale.completion_code || '—') + '.']
      ];
      var mr = 5;
      ml.forEach(function (p) {
        wsM.getCell('A' + mr).value = p[0]; wsM.getCell('A' + mr).font = { name: 'Calibri', bold: true, color: { argb: brand.ink } }; wsM.getCell('A' + mr).alignment = { vertical: 'top' };
        wsM.mergeCells('B' + mr + ':F' + mr); wsM.getCell('B' + mr).value = p[1]; wsM.getCell('B' + mr).alignment = { wrapText: true, vertical: 'top' }; wsM.getCell('B' + mr).font = { name: 'Calibri', size: 10 };
        wsM.getRow(mr).height = 30; mr++;
      });
      wsM.getColumn(1).width = 20; for (var ci = 2; ci <= 6; ci++) wsM.getColumn(ci).width = 18;
      band(wsM, 'A' + (mr + 1) + ':F' + (mr + 1), 'LIVE QC CROSS-CHECKS', { fill: brand.band, size: 10, height: 18 }); mr += 2;
      var checks = [
        ['Awarded proceeds = Σ awarded pool winners', "ROUND('" + S.award + "'!E" + awardTotal + "-SUMIF('" + S.award + "'!M5:M" + (awardTotal - 1) + ",\"AWARD\",'" + S.award + "'!E5:E" + (awardTotal - 1) + "),0)=0"],
        ['Every winner meets its reserve', "SUMPRODUCT((LEFT('" + S.award + "'!M5:M" + (awardTotal - 1) + ",5)=\"AWARD\")*('" + S.award + "'!E5:E" + (awardTotal - 1) + "<'" + S.reserves + "'!E5:E" + (awardTotal - 1) + "))=0"],
        ['Reserve aggregates tie to the tape', "ROUND(SUM('" + S.reserves + "'!C5:C" + (awardTotal - 1) + ')-' + P.reduce(function (s, p) { return s + p.aggOff; }, 0) + ',0)=0']
      ];
      checks.forEach(function (c) {
        wsM.mergeCells('A' + mr + ':D' + mr); wsM.getCell('A' + mr).value = c[0]; wsM.getCell('A' + mr).font = { name: 'Calibri', size: 10 };
        wsM.mergeCells('E' + mr + ':F' + mr); var cc = wsM.getCell('E' + mr); cc.value = { formula: 'IF(' + c[1] + ',"PASS","CHECK")' }; cc.font = { name: 'Calibri', bold: true, color: { argb: 'FF1E7E3E' } }; cc.alignment = { horizontal: 'center' };
        mr++;
      });

      return wb.xlsx.writeBuffer().then(function (buf) {
        return { buffer: buf, fileName: safe(sale.saleId || sale.sale_id) + '_BEM.xlsx', brand: brand.key, bids: bids.length, pools: P.length };
      });
    });
  }

  function download(sale, pools, loans, bids, opts) {
    return build(sale, pools, loans, bids, opts).then(function (res) {
      var blob = new Blob([res.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = res.fileName;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return res;
    });
  }

  return { ensureLib: ensureLib, sellerBrand: sellerBrand, officialKey: officialKey, build: build, download: download };
})();

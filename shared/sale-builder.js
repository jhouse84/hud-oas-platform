/**
 * HSG.saleBuilder — assemble platform-shaped loans, pools, and a sale record
 * from mapped tape rows. Shared by the Sale Setup wizard's demo path (writes to
 * the in-browser twin) and real path (POSTs to the backend), so both produce
 * identical record shapes.
 *
 * The output matches exactly what the rest of the platform reads:
 *   - loans carry ulb + unpaid_loan_balance (ULB basis), current_upb (UPB),
 *     bpo_value (BPO), etd_adjusted_bpo (ETD) so HSG.bem / the bid engine /
 *     the demo twin resolve any official basis,
 *   - pools are { pool_id, pool_name, pool_number, loan_ids, summary, ... },
 *   - the sale carries programType, portal, bid_basis, key_dates, summary.
 */
window.HSG = window.HSG || {};

HSG.saleBuilder = (function () {
  'use strict';

  var BASIS_FIELD = { ULB: 'ulb', UPB: 'current_upb', BPO: 'bpo_value', ETD: 'etd_adjusted_bpo' };
  var PROGRAM_PORTAL = { HVLS: 'residential', HNVLS: 'residential', SFLS: 'residential', MHLS: 'commercial', HLS: 'commercial' };
  var PROGRAM_DEFAULT_BASIS = { HVLS: 'ULB', HNVLS: 'ETD', SFLS: 'UPB', MHLS: 'UPB', HLS: 'UPB' };

  function portalForProgram(p) { return PROGRAM_PORTAL[p] || null; }
  function defaultBasis(p) { return PROGRAM_DEFAULT_BASIS[p] || 'UPB'; }

  function num(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    var n = parseFloat(String(v).replace(/[$,%\s]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function str(v) { return v == null ? '' : String(v).trim(); }

  // -------------------------------------------------------------------
  // Build platform loan records from mapped rows.
  //   rows     — array of row objects keyed by header label (from HSG.tape.read)
  //   mapping  — { canonKey: headerLabel } (from the wizard / HSG.tape.autoMap)
  //   saleId   — owning sale id
  //   opts.programType, opts.startSeq
  // -------------------------------------------------------------------
  function buildLoans(rows, mapping, saleId, opts) {
    opts = opts || {};
    var program = opts.programType || '';
    function val(row, canonKey) {
      var h = mapping[canonKey];
      return h != null ? row[h] : undefined;
    }
    var seq = opts.startSeq || 1;
    return (rows || []).map(function (row, i) {
      var idRaw = str(val(row, 'loan_id'));
      var loanId = idRaw || (saleId + '-' + String(seq + i).padStart(5, '0'));

      var currentUpb = num(val(row, 'current_upb'));
      var ulbMapped = val(row, 'unpaid_loan_balance');
      var ulb = ulbMapped != null && ulbMapped !== '' ? num(ulbMapped) : currentUpb;
      var bpo = num(val(row, 'bpo_value'));
      var etd = num(val(row, 'etd_adjusted_bpo'));
      var mca = num(val(row, 'max_claim_amount'));
      var opb = num(val(row, 'original_principal_balance'));

      var loan = {
        loan_id: loanId,
        loanId: loanId,
        saleId: saleId,
        poolId: null,
        fha_case_number: str(val(row, 'fha_case_number')) || null,
        current_upb: currentUpb || null,
        ulb: ulb || null,
        unpaid_loan_balance: ulb || null,
        bpo_value: bpo || null,
        etd_adjusted_bpo: etd || null,
        max_claim_amount: mca || null,
        original_principal_balance: opb || null,
        interest_rate: num(val(row, 'interest_rate')) || null,
        occupancy_status: str(val(row, 'occupancy_status')) || null,
        property_condition: str(val(row, 'property_condition')) || null,
        asset_class: str(val(row, 'asset_class')) || (program === 'HLS' ? 'Healthcare' : program === 'MHLS' ? 'Multifamily' : null),
        property_name: str(val(row, 'property_name')) || null,
        units: num(val(row, 'units')) || null,
        property: {
          address: str(val(row, 'property_address')) || null,
          city: str(val(row, 'property_city')) || null,
          state: (str(val(row, 'property_state')) || '').toUpperCase().slice(0, 2) || null,
          zip: str(val(row, 'property_zip')) || null
        },
        _poolRaw: str(val(row, 'pool')) || null   // transient grouping hint, stripped before commit
      };
      return loan;
    });
  }

  function poolSummary(loans) {
    return {
      loan_count: loans.length,
      aggregate_upb: loans.reduce(function (s, l) { return s + (Number(l.current_upb) || 0); }, 0),
      aggregate_ulb: loans.reduce(function (s, l) { return s + (Number(l.ulb) || 0); }, 0),
      aggregate_bpo: loans.reduce(function (s, l) { return s + (Number(l.bpo_value) || 0); }, 0),
      aggregate_etd: loans.reduce(function (s, l) { return s + (Number(l.etd_adjusted_bpo) || 0); }, 0),
      states: [].concat.apply([], [Array.from(new Set(loans.map(function (l) { return l.property && l.property.state; }).filter(Boolean))).sort()])
    };
  }

  // -------------------------------------------------------------------
  // Assign pools. strategy: 'column' | 'equal' | 'single'
  //   'column'  — group by each loan's _poolRaw value
  //   'equal'   — split into opts.poolCount contiguous equal pools
  //   'single'  — one pool
  // Mutates each loan's poolId and returns the pools array.
  // -------------------------------------------------------------------
  function assignPools(loans, strategy, saleId, opts) {
    opts = opts || {};
    var program = opts.programType || '';
    var basis = (opts.basis || defaultBasis(program));
    var minLabel = 'Aggregate ' + basis;
    var groups = [];

    if (strategy === 'column') {
      var byKey = {};
      var order = [];
      loans.forEach(function (l) {
        var k = l._poolRaw || 'Unassigned';
        if (!byKey[k]) { byKey[k] = []; order.push(k); }
        byKey[k].push(l);
      });
      order.sort(function (a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true }); });
      order.forEach(function (k) { groups.push({ label: k, loans: byKey[k] }); });
    } else if (strategy === 'equal') {
      var n = Math.max(1, opts.poolCount || 1);
      var per = Math.ceil(loans.length / n);
      for (var p = 0; p < n; p++) {
        var slice = loans.slice(p * per, (p + 1) * per);
        if (slice.length) groups.push({ label: null, loans: slice });
      }
    } else {
      groups.push({ label: null, loans: loans.slice() });
    }

    return groups.map(function (g, i) {
      var poolNum = i + 1;
      var poolId = saleId + '-P' + poolNum;
      var poolName;
      if (strategy === 'column' && g.label != null && String(g.label).trim()) {
        var lbl = String(g.label).trim();
        poolName = /pool/i.test(lbl) ? lbl : ('Pool ' + lbl);   // don't double-prefix "Pool 1"
      } else {
        poolName = 'Pool ' + poolNum;
      }
      g.loans.forEach(function (l) { l.poolId = poolId; });
      return {
        pool_id: poolId,
        poolId: poolId,
        pool_name: poolName,
        pool_number: poolNum,
        minimum_bid_basis: minLabel,
        eligible_bidder_types: ['all'],
        loan_ids: g.loans.map(function (l) { return l.loan_id; }),
        summary: poolSummary(g.loans)
      };
    });
  }

  // -------------------------------------------------------------------
  // Build the sale record. meta carries the wizard's sale-detail form.
  // -------------------------------------------------------------------
  function buildSale(meta, pools, allLoans) {
    var program = meta.programType;
    var basis = (meta.bid_basis || defaultBasis(program)).toUpperCase();
    var summary = poolSummary(allLoans);
    var sale = {
      saleId: meta.saleId,
      programType: program,
      program: program,
      portal: portalForProgram(program),
      seller: meta.seller || 'HUD',
      sale_name: meta.sale_name || meta.saleId,
      long_name: meta.long_name || meta.sale_name || meta.saleId,
      status: meta.status || 'draft',
      state: meta.status || 'draft',
      bid_basis: basis,
      bidBasis: basis,
      key_dates: meta.key_dates || {},
      bidDate: (meta.key_dates && meta.key_dates.bid_day) || null,
      deposit_terms: meta.deposit_terms || { deposit_pct_of_aggregate_bid: 0.10, minimum_deposit_floor: 100000, under_floor_pct: 0.50 },
      pools: pools,
      summary: summary
    };
    if (meta.completion_code) sale.completion_code = meta.completion_code;
    return sale;
  }

  // -------------------------------------------------------------------
  // Validation — returns [{ level:'error'|'warn', msg }]. Errors block commit.
  // -------------------------------------------------------------------
  function validate(loans, sale, mapping) {
    var out = [];
    if (!loans.length) out.push({ level: 'error', msg: 'No loan rows were parsed from the tape.' });
    if (!mapping.loan_id) out.push({ level: 'warn', msg: 'No Loan ID column mapped — loan IDs will be auto-generated from the sale ID.' });

    var basis = (sale.bid_basis || 'UPB').toUpperCase();
    var basisField = BASIS_FIELD[basis];
    var missingBasis = loans.filter(function (l) { return !(Number(l[basisField]) > 0); }).length;
    if (missingBasis) out.push({ level: missingBasis === loans.length ? 'error' : 'warn',
      msg: missingBasis + ' of ' + loans.length + ' loans have no ' + basis + ' value (the official bid basis). Bids on those loans cannot be priced.' });

    // duplicate loan ids
    var seen = {}, dupes = 0;
    loans.forEach(function (l) { if (seen[l.loan_id]) dupes++; else seen[l.loan_id] = 1; });
    if (dupes) out.push({ level: 'error', msg: dupes + ' duplicate loan ID(s) detected. Each loan must be unique.' });

    // UPB / ULB / BPO ordering sanity (informational)
    var disordered = loans.filter(function (l) {
      return Number(l.current_upb) > 0 && Number(l.bpo_value) > 0 && Number(l.bpo_value) < Number(l.current_upb) * 0.2;
    }).length;
    if (disordered) out.push({ level: 'warn', msg: disordered + ' loan(s) have a BPO far below UPB — verify the valuation column mapped correctly.' });

    return out;
  }

  // Strip transient fields before persisting/POSTing.
  function cleanLoans(loans) {
    return loans.map(function (l) { var c = Object.assign({}, l); delete c._poolRaw; return c; });
  }

  return {
    BASIS_FIELD: BASIS_FIELD,
    portalForProgram: portalForProgram,
    defaultBasis: defaultBasis,
    buildLoans: buildLoans,
    assignPools: assignPools,
    poolSummary: poolSummary,
    buildSale: buildSale,
    validate: validate,
    cleanLoans: cleanLoans
  };
})();

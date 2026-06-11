/**
 * Seeds 4 additional sample sales (HVLS, HNVLS, SFLS, HLS) into DDB so a
 * test bidder can exercise the bid flow against every program type.
 *
 * The existing MHLS-2026-DEMO from commercial-seed-data.json is left intact;
 * this script only ADDS sales/loans/qc for the other four programs and bumps
 * MHLS-2026-DEMO into bid_window state so it accepts bids.
 *
 *   AWS_PROFILE=hsg-hudoas node scripts/seed-program-samples.mjs
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const stage = (process.argv.find(a => a.startsWith('--stage=')) || '--stage=dev').split('=')[1];
const region = process.env.AWS_REGION || 'us-east-1';
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false }
});

const TBL = {
  sales: `hsg-${stage}-sales`,
  loans: `hsg-${stage}-loans`,
  qc:    `hsg-${stage}-qc-findings`
};

// ---------------------------------------------------------------------
//  Deterministic PRNG so re-runs produce identical data
// ---------------------------------------------------------------------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
function rangeInt(rng, lo, hi) { return Math.floor(range(rng, lo, hi + 1)); }
function maybe(rng, prob, fn) { return rng() < prob ? fn() : null; }

// ---------------------------------------------------------------------
//  Reference data
// ---------------------------------------------------------------------
const HECM_STATES = ['FL', 'CA', 'TX', 'AZ', 'NV', 'GA', 'NC', 'SC', 'OH', 'PA', 'NJ', 'IL'];
const SF_STATES   = ['FL', 'CA', 'TX', 'GA', 'NC', 'OH', 'MI', 'MO', 'IN', 'AL'];
const HC_STATES   = ['OK', 'TN', 'RI', 'KS', 'MO', 'IL', 'WI', 'PA'];

const HECM_CITIES_BY_STATE = {
  FL: ['Tampa','Orlando','Miami','Jacksonville','Fort Lauderdale','Naples','Sarasota'],
  CA: ['Los Angeles','San Diego','Sacramento','Fresno','Bakersfield','Long Beach'],
  TX: ['Houston','Dallas','San Antonio','Austin','Fort Worth','El Paso'],
  AZ: ['Phoenix','Tucson','Mesa','Chandler','Scottsdale','Gilbert'],
  NV: ['Las Vegas','Henderson','Reno','North Las Vegas'],
  GA: ['Atlanta','Augusta','Savannah','Athens','Columbus','Macon'],
  NC: ['Charlotte','Raleigh','Greensboro','Durham','Fayetteville'],
  SC: ['Columbia','Charleston','Greenville','Mount Pleasant'],
  OH: ['Columbus','Cleveland','Cincinnati','Toledo','Akron'],
  PA: ['Philadelphia','Pittsburgh','Allentown','Erie'],
  NJ: ['Newark','Jersey City','Paterson','Trenton','Camden'],
  IL: ['Chicago','Aurora','Rockford','Naperville']
};
const SF_CITIES_BY_STATE = Object.assign({}, HECM_CITIES_BY_STATE, {
  MI: ['Detroit','Grand Rapids','Warren','Sterling Heights','Ann Arbor'],
  MO: ['Kansas City','St. Louis','Springfield','Columbia','Independence'],
  IN: ['Indianapolis','Fort Wayne','Evansville','South Bend','Carmel'],
  AL: ['Birmingham','Montgomery','Mobile','Huntsville','Tuscaloosa']
});
const HC_CITIES_BY_STATE = {
  OK: ['Oklahoma City','Tulsa','Enid','Lawton'],
  TN: ['Nashville','Memphis','Knoxville','Chattanooga'],
  RI: ['Providence','Warwick','Cranston'],
  KS: ['Wichita','Overland Park','Topeka'],
  MO: ['St. Louis','Kansas City','Springfield'],
  IL: ['Chicago','Peoria','Springfield','Decatur'],
  WI: ['Milwaukee','Madison','Green Bay'],
  PA: ['Philadelphia','Pittsburgh','Scranton']
};

const STREET_NAMES = ['Oak St','Elm Ave','Maple Dr','Pine Ln','Cedar Way','Birch Rd','Sunset Blvd','Park Ave','Main St','Lake Dr','Hill Ct','Ridge Rd','Forest Ave','Meadow Ln','Brook St'];
const HEALTHCARE_NAMES = ['Sunrise Manor','Maplewood Care','Heritage Heights','Cedar Grove Skilled Nursing','Willow Creek Senior Living','Lakeside Rehab Center','Pine Ridge Assisted Living','Oakhaven Healthcare'];
const SECTIONS_232 = ['232/223(f) Skilled Nursing','232/223(f) Assisted Living','232 Intermediate Care','232/223(f) Memory Care'];
const SECTIONS_221 = ['221(d)(4) Mkt. Rate Mod Inc/ Disp Fams', '223(f) Refinance', '221(d)(4) Mkt. Rate'];

function fhaCase(rng, prefix) {
  // Per HUD format: NNN-NNNNNNN with optional letter suffix
  var area = String(prefix || rangeInt(rng, 10, 999)).padStart(3, '0');
  var num = rangeInt(rng, 1000000, 9999999);
  return area + '-' + num;
}

function lastName(rng) {
  return pick(rng, ['JOHNSON','WILLIAMS','BROWN','JONES','GARCIA','MILLER','DAVIS','RODRIGUEZ','MARTINEZ','HERNANDEZ','LOPEZ','GONZALEZ','WILSON','ANDERSON','THOMAS','TAYLOR','MOORE','JACKSON','MARTIN','LEE','PEREZ','THOMPSON','WHITE','HARRIS','SANCHEZ','CLARK','RAMIREZ','LEWIS','ROBINSON','WALKER']);
}

function streetAddr(rng) {
  return rangeInt(rng, 100, 9999) + ' ' + pick(rng, STREET_NAMES);
}

// ---------------------------------------------------------------------
//  HVLS / HNVLS — HECM Vacant / Non-Vacant
// ---------------------------------------------------------------------
function makeHecmLoan(rng, saleId, vacant, idx) {
  var state = pick(rng, HECM_STATES);
  var city = pick(rng, HECM_CITIES_BY_STATE[state]);
  var fha = fhaCase(rng);
  var bpo = Math.round(range(rng, 95000, 485000) / 1000) * 1000;
  var maxClaim = Math.round(bpo * range(rng, 1.05, 1.45) / 1000) * 1000;
  var currentBal = Math.round(maxClaim * range(rng, 0.40, 0.95) / 1000) * 1000;
  var etd = vacant ? null : rangeInt(rng, 6, 36);  // months (HNVLS only)
  var deceasedYearsAgo = rangeInt(rng, 1, 5);
  var lastInspMonths = rangeInt(rng, 1, 14);
  var propertyType = pick(rng, ['Single Family Detached','Condominium','Townhouse','PUD','2-4 Unit']);

  var risks = [];
  if (currentBal / bpo > 1.10) risks.push('upside_down');
  if (lastInspMonths > 9) risks.push('inspection_stale');
  if (rng() < 0.18) risks.push('title_issue');
  if (rng() < 0.10) risks.push('property_damage');
  if (rng() < 0.08) risks.push('hoa_lien');

  return {
    loan_id: fha,
    fha_case_number: fha,
    fha_root: fha.replace(/[A-Z]$/i, ''),
    property_name: streetAddr(rng).toUpperCase(),
    asset_class: 'HECM',
    program: vacant ? 'HVLS' : 'HNVLS',
    property_type: propertyType,
    property_subtype: propertyType,
    bpo_value: bpo,
    max_claim_amount: maxClaim,
    current_upb: currentBal,
    original_principal_balance: maxClaim,
    estimated_time_to_disposition_months: etd,
    occupancy_status: vacant ? 'VACANT' : 'OCCUPIED_BY_HEIRS',
    deceased_borrower: vacant,
    deceased_year: vacant ? new Date().getFullYear() - deceasedYearsAgo : null,
    last_property_inspection_months_ago: lastInspMonths,
    property_condition: pick(rng, ['GOOD','GOOD','FAIR','FAIR','POOR']),
    borrower: {
      name: 'ESTATE OF ' + lastName(rng) + (rng() < 0.4 ? ', ' + lastName(rng) : ''),
      tax_id_masked: 'XXX-XX-' + rangeInt(rng, 1000, 9999),
      city: city,
      state: state
    },
    property: {
      street1: streetAddr(rng),
      city: city,
      state: state,
      zip: String(rangeInt(rng, 10001, 99999)).padStart(5, '0'),
      year_built: rangeInt(rng, 1948, 2008),
      gross_sf: rangeInt(rng, 850, 3200),
      bedrooms: rangeInt(rng, 2, 5),
      bathrooms: rangeInt(rng, 1, 3),
      lot_acres: Math.round(range(rng, 0.10, 0.95) * 100) / 100
    },
    metrics: {
      current_balance_to_bpo: bpo > 0 ? Math.round((currentBal / bpo) * 10000) / 100 : null,
      negative_equity: currentBal > bpo
    },
    related_loans: { has_related: false, related_fha: null, related_name: null },
    risk_flags: risks,
    saleId: saleId,
    loanId: fha,
    portal: 'residential'
  };
}

function makeHvlsSale() {
  var rng = mulberry32(1001);
  var saleId = 'HVLS-2026-DEMO';
  var loans = Array.from({ length: 14 }, function (_, i) { return makeHecmLoan(rng, saleId, true, i); });

  // 2 pools by state cluster
  var sunbelt = loans.filter(function (l) { return ['FL','GA','NC','SC','TX'].indexOf(l.property.state) >= 0; });
  var rest = loans.filter(function (l) { return sunbelt.indexOf(l) < 0; });
  if (rest.length === 0 && sunbelt.length > 0) { rest.push(sunbelt.pop()); }

  function poolSummary(arr) {
    var aggBpo = arr.reduce(function (s, l) { return s + l.bpo_value; }, 0);
    var aggMca = arr.reduce(function (s, l) { return s + l.max_claim_amount; }, 0);
    var aggBal = arr.reduce(function (s, l) { return s + l.current_upb; }, 0);
    var states = Array.from(new Set(arr.map(function (l) { return l.property.state; }))).sort();
    return { loan_count: arr.length, aggregate_bpo: aggBpo, aggregate_upb: aggBal, aggregate_max_claim_amount: aggMca, states: states };
  }

  return {
    sale: {
      saleId: saleId, sale_id: saleId, portal: 'residential',
      program: 'HVLS', programType: 'HVLS',
      sale_name: 'HVLS 2026-DEMO', name: 'HVLS 2026-DEMO',
      long_name: 'HUD HECM Vacant Loan Sale 2026-DEMO',
      sale_type: 'Sealed Bid, Competitive',
      qualification_form: 'HUD-9611',
      transaction_specialist: 'House Strategies Group, LLC',
      state: 'bid_window', status: 'bid_window',
      summary: {
        loan_count: loans.length,
        aggregate_bpo: loans.reduce(function (s, l) { return s + l.bpo_value; }, 0),
        aggregate_upb: loans.reduce(function (s, l) { return s + l.current_upb; }, 0),
        aggregate_max_claim_amount: loans.reduce(function (s, l) { return s + l.max_claim_amount; }, 0),
        asset_classes: ['HECM'],
        pool_count: 2,
        geographic_footprint: Array.from(new Set(loans.map(function (l) { return l.property.state; }))).sort()
      },
      key_dates: {
        federal_register_published: '2026-04-25',
        qualification_opens:        '2026-04-28',
        qualification_closes:       '2026-05-15',
        go_live_data_room:          '2026-05-18',
        bid_day:                    '2026-05-28',
        bid_window_open_eastern:    '10:00 AM',
        bid_window_close_eastern:   '12:00 PM',
        award_date:                 '2026-05-29',
        expected_settlement:        '2026-07-09'
      },
      deposit_terms: { minimum_deposit_floor: 100000, deposit_pct_of_aggregate_bid: 0.10 },
      pools: [
        {
          pool_id: saleId + '-P1', pool_name: 'Pool 1 — Sunbelt HECM Vacant',
          pool_number: 1,
          stratification_basis: 'Vacant HECM properties in FL/GA/NC/SC/TX',
          loan_ids: sunbelt.map(function (l) { return l.loan_id; }),
          summary: poolSummary(sunbelt),
          minimum_bid_basis: 'Aggregate BPO',
          eligible_bidder_types: ['all']
        },
        {
          pool_id: saleId + '-P2', pool_name: 'Pool 2 — Mountain & Heartland',
          pool_number: 2,
          stratification_basis: 'Vacant HECM properties in AZ/NV/IL/OH/PA/NJ/CA',
          loan_ids: rest.map(function (l) { return l.loan_id; }),
          summary: poolSummary(rest),
          minimum_bid_basis: 'Aggregate BPO',
          eligible_bidder_types: ['all']
        }
      ]
    },
    loans: loans,
    qc: loans.map(function (l) {
      var status = l.last_property_inspection_months_ago > 9 ? 'needs_review' : 'verified';
      return {
        qcId: 'QC-' + l.loan_id, qc_id: 'QC-' + l.loan_id,
        saleId: l.saleId, loanId: l.loan_id, loan_id: l.loan_id,
        property_name: l.property_name,
        reconciliation_target: 'BPO vs OPIIS Inspection',
        fields_checked: ['BPO Date','BPO Value','Last Inspection Date','Property Condition'],
        status: status,
        severity: status === 'needs_review' ? 'medium' : 'low',
        finding: status === 'verified' ? 'BPO and inspection records reconcile' : 'Inspection > 9 months stale; refresh recommended',
        checked_at: '2026-04-30',
        checked_by: 'qc-engine-v1',
        portal: 'residential'
      };
    })
  };
}

function makeHnvlsSale() {
  var rng = mulberry32(2002);
  var saleId = 'HNVLS-2026-DEMO';
  var loans = Array.from({ length: 12 }, function (_, i) { return makeHecmLoan(rng, saleId, false, i); });

  // 2 pools by ETD bucket
  var quick = loans.filter(function (l) { return l.estimated_time_to_disposition_months <= 18; });
  var slow = loans.filter(function (l) { return l.estimated_time_to_disposition_months > 18; });
  if (slow.length === 0 && quick.length > 1) slow.push(quick.pop());

  function poolSummary(arr) {
    var aggBpo = arr.reduce(function (s, l) { return s + l.bpo_value; }, 0);
    var aggBal = arr.reduce(function (s, l) { return s + l.current_upb; }, 0);
    var aggMca = arr.reduce(function (s, l) { return s + l.max_claim_amount; }, 0);
    var avgEtd = arr.length ? arr.reduce(function (s, l) { return s + l.estimated_time_to_disposition_months; }, 0) / arr.length : null;
    var states = Array.from(new Set(arr.map(function (l) { return l.property.state; }))).sort();
    return { loan_count: arr.length, aggregate_bpo: aggBpo, aggregate_upb: aggBal, aggregate_max_claim_amount: aggMca, avg_etd_months: avgEtd ? Math.round(avgEtd) : null, states: states };
  }

  return {
    sale: {
      saleId: saleId, sale_id: saleId, portal: 'residential',
      program: 'HNVLS', programType: 'HNVLS',
      sale_name: 'HNVLS 2026-DEMO', name: 'HNVLS 2026-DEMO',
      long_name: 'HUD HECM Non-Vacant Loan Sale 2026-DEMO',
      sale_type: 'Sealed Bid, Competitive',
      qualification_form: 'HUD-9611',
      transaction_specialist: 'House Strategies Group, LLC',
      state: 'bid_window', status: 'bid_window',
      summary: {
        loan_count: loans.length,
        aggregate_bpo: loans.reduce(function (s, l) { return s + l.bpo_value; }, 0),
        aggregate_upb: loans.reduce(function (s, l) { return s + l.current_upb; }, 0),
        aggregate_max_claim_amount: loans.reduce(function (s, l) { return s + l.max_claim_amount; }, 0),
        asset_classes: ['HECM'],
        pool_count: 2,
        geographic_footprint: Array.from(new Set(loans.map(function (l) { return l.property.state; }))).sort()
      },
      key_dates: {
        federal_register_published: '2026-04-25',
        qualification_opens:        '2026-04-28',
        qualification_closes:       '2026-05-15',
        go_live_data_room:          '2026-05-18',
        bid_day:                    '2026-05-28',
        bid_window_open_eastern:    '10:00 AM',
        bid_window_close_eastern:   '12:00 PM',
        award_date:                 '2026-05-29',
        expected_settlement:        '2026-07-09'
      },
      pools: [
        {
          pool_id: saleId + '-P1', pool_name: 'Pool 1 — Quick Disposition (ETD ≤ 18mo)',
          pool_number: 1, loan_ids: quick.map(function (l) { return l.loan_id; }),
          summary: poolSummary(quick), minimum_bid_basis: 'Aggregate ETD-Adjusted BPO', eligible_bidder_types: ['all']
        },
        {
          pool_id: saleId + '-P2', pool_name: 'Pool 2 — Extended Workout (ETD > 18mo)',
          pool_number: 2, loan_ids: slow.map(function (l) { return l.loan_id; }),
          summary: poolSummary(slow), minimum_bid_basis: 'Aggregate ETD-Adjusted BPO', eligible_bidder_types: ['all']
        }
      ]
    },
    loans: loans,
    qc: loans.map(function (l) {
      return {
        qcId: 'QC-' + l.loan_id, qc_id: 'QC-' + l.loan_id,
        saleId: l.saleId, loanId: l.loan_id, loan_id: l.loan_id,
        property_name: l.property_name, status: 'verified', severity: 'low',
        finding: 'BPO + occupancy record reconciled',
        reconciliation_target: 'BPO + occupancy verification',
        fields_checked: ['BPO Date','Occupancy Status','Heirs Contact'],
        checked_at: '2026-04-30', checked_by: 'qc-engine-v1', portal: 'residential'
      };
    })
  };
}

// ---------------------------------------------------------------------
//  SFLS — Single Family Forward
// ---------------------------------------------------------------------
function makeSflsLoan(rng, saleId, idx) {
  var state = pick(rng, SF_STATES);
  var city = pick(rng, SF_CITIES_BY_STATE[state]);
  var fha = fhaCase(rng);
  var origBalance = Math.round(range(rng, 110000, 365000) / 1000) * 1000;
  var upb = Math.round(origBalance * range(rng, 0.55, 0.97) / 1000) * 1000;
  var rate = Math.round(range(rng, 3.25, 6.75) * 1000) / 1000;
  var delinquencyMonths = pick(rng, [3, 4, 6, 9, 12, 18, 24, 36, 48]);
  var nsoEligible = rng() < 0.55;
  var fclStatus = pick(rng, ['NONE','PRE_FCL','PRE_FCL','FCL_INITIATED','JUDGMENT_GRANTED']);

  var risks = [];
  if (delinquencyMonths >= 24) risks.push('chronic_delinquent');
  if (fclStatus === 'JUDGMENT_GRANTED') risks.push('foreclosure_judgment');
  if (rng() < 0.22) risks.push('property_damage');
  if (rng() < 0.15) risks.push('insurance_lapse');

  return {
    loan_id: fha,
    fha_case_number: fha,
    fha_root: fha.replace(/[A-Z]$/i, ''),
    property_name: streetAddr(rng).toUpperCase(),
    asset_class: 'SF Forward',
    program: 'SFLS',
    property_type: pick(rng, ['Single Family Detached','Condominium','Townhouse']),
    current_upb: upb,
    original_principal_balance: origBalance,
    current_interest_rate: rate / 100,
    current_interest_rate_type: 'Fixed',
    delinquency_months: delinquencyMonths,
    last_paid_date: new Date(Date.now() - delinquencyMonths * 30 * 86400 * 1000).toISOString().slice(0, 10),
    foreclosure_status: fclStatus,
    nso_eligible: nsoEligible,
    borrower: {
      name: lastName(rng) + ', ' + pick(rng, ['JOHN','MARY','ROBERT','LINDA','MICHAEL','PATRICIA','DAVID','BARBARA','JAMES','SUSAN']),
      tax_id_masked: 'XXX-XX-' + rangeInt(rng, 1000, 9999),
      city: city, state: state
    },
    property: {
      street1: streetAddr(rng),
      city: city, state: state,
      zip: String(rangeInt(rng, 10001, 99999)).padStart(5, '0'),
      year_built: rangeInt(rng, 1955, 2015),
      gross_sf: rangeInt(rng, 1000, 2800)
    },
    metrics: {
      ltv_at_origination: origBalance > 0 ? Math.round((origBalance / (origBalance / range(rng, 0.85, 0.97))) * 100) / 100 : null,
      months_delinquent: delinquencyMonths
    },
    related_loans: { has_related: false, related_fha: null, related_name: null },
    risk_flags: risks,
    saleId: saleId, loanId: fha, portal: 'residential'
  };
}

function makeSflsSale() {
  var rng = mulberry32(3003);
  var saleId = 'SFLS-2026-DEMO';
  var loans = Array.from({ length: 18 }, function (_, i) { return makeSflsLoan(rng, saleId, i); });

  var nso = loans.filter(function (l) { return l.nso_eligible; });
  var nonNso = loans.filter(function (l) { return !l.nso_eligible; });
  // Splits non-NSO further by delinquency for 3 pools total
  var deepDelinq = nonNso.filter(function (l) { return l.delinquency_months >= 18; });
  var earlyDelinq = nonNso.filter(function (l) { return l.delinquency_months < 18; });

  function poolSummary(arr) {
    var aggUpb = arr.reduce(function (s, l) { return s + l.current_upb; }, 0);
    var avgRate = arr.length ? arr.reduce(function (s, l) { return s + l.current_interest_rate; }, 0) / arr.length : null;
    var states = Array.from(new Set(arr.map(function (l) { return l.property.state; }))).sort();
    return { loan_count: arr.length, aggregate_upb: aggUpb, avg_interest_rate: avgRate, states: states };
  }

  return {
    sale: {
      saleId: saleId, sale_id: saleId, portal: 'residential',
      program: 'SFLS', programType: 'SFLS',
      sale_name: 'SFLS 2026-DEMO', name: 'SFLS 2026-DEMO',
      long_name: 'HUD Single Family Forward Loan Sale 2026-DEMO',
      sale_type: 'Sealed Bid, Competitive',
      qualification_form: 'HUD-9611',
      transaction_specialist: 'House Strategies Group, LLC',
      state: 'bid_window', status: 'bid_window',
      summary: {
        loan_count: loans.length,
        aggregate_upb: loans.reduce(function (s, l) { return s + l.current_upb; }, 0),
        asset_classes: ['SF Forward'],
        pool_count: 3,
        geographic_footprint: Array.from(new Set(loans.map(function (l) { return l.property.state; }))).sort(),
        nso_eligible_count: nso.length
      },
      key_dates: {
        federal_register_published: '2026-04-22',
        qualification_opens:        '2026-04-25',
        qualification_closes:       '2026-05-12',
        go_live_data_room:          '2026-05-15',
        bid_day:                    '2026-05-26',
        bid_window_open_eastern:    '10:00 AM',
        bid_window_close_eastern:   '12:00 PM',
        award_date:                 '2026-05-27',
        expected_settlement:        '2026-07-10'
      },
      post_sale_terms: { first_look: true, mission_outcome_required: true, servicing_released: true },
      pools: [
        {
          pool_id: saleId + '-P1', pool_name: 'Pool 1 — NSO-Eligible (Mission)',
          pool_number: 1, loan_ids: nso.map(function (l) { return l.loan_id; }),
          summary: poolSummary(nso),
          minimum_bid_basis: 'Aggregate UPB',
          mission_eligible: true,
          eligible_bidder_types: ['nonprofit','government','community_development']
        },
        {
          pool_id: saleId + '-P2', pool_name: 'Pool 2 — Early Delinquency (< 18 mo)',
          pool_number: 2, loan_ids: earlyDelinq.map(function (l) { return l.loan_id; }),
          summary: poolSummary(earlyDelinq),
          minimum_bid_basis: 'Aggregate UPB', eligible_bidder_types: ['all']
        },
        {
          pool_id: saleId + '-P3', pool_name: 'Pool 3 — Deep Delinquency (≥ 18 mo)',
          pool_number: 3, loan_ids: deepDelinq.map(function (l) { return l.loan_id; }),
          summary: poolSummary(deepDelinq),
          minimum_bid_basis: 'Aggregate UPB', eligible_bidder_types: ['all']
        }
      ]
    },
    loans: loans,
    qc: loans.map(function (l) {
      var status = l.delinquency_months >= 36 ? 'needs_review' : 'verified';
      return {
        qcId: 'QC-' + l.loan_id, qc_id: 'QC-' + l.loan_id,
        saleId: l.saleId, loanId: l.loan_id, loan_id: l.loan_id,
        property_name: l.property_name, status: status,
        severity: status === 'needs_review' ? 'medium' : 'low',
        finding: status === 'needs_review' ? 'Long-running delinquency; payment history incomplete' : 'Servicing records reconcile',
        reconciliation_target: 'Servicer payment history vs FHA Connection',
        fields_checked: ['Last paid date','Delinquency months','Foreclosure status'],
        checked_at: '2026-04-30', checked_by: 'qc-engine-v1', portal: 'residential'
      };
    })
  };
}

// ---------------------------------------------------------------------
//  HLS — Healthcare (Section 232)
// ---------------------------------------------------------------------
function makeHlsLoan(rng, saleId, idx) {
  var state = pick(rng, HC_STATES);
  var city = pick(rng, HC_CITIES_BY_STATE[state]);
  var fha = fhaCase(rng);
  var name = pick(rng, HEALTHCARE_NAMES);
  var beds = rangeInt(rng, 60, 240);
  var congregateBeds = Math.floor(beds * range(rng, 0, 0.35));
  var upb = Math.round(range(rng, 1.8e6, 14e6) / 1000) * 1000;
  var origBalance = Math.round(upb * range(rng, 1.05, 1.35) / 1000) * 1000;
  var rate = Math.round(range(rng, 4.5, 6.8) * 1000) / 1000;
  var revenue = Math.round(beds * range(rng, 78000, 165000));
  var expenses = Math.round(revenue * range(rng, 0.85, 1.10));
  var noi = revenue - expenses;
  var occupancy = Math.round(range(rng, 0.62, 0.92) * 100) / 100;
  var dscr = noi > 0 && upb > 0 ? Math.round(((noi) / (upb * rate / 100)) * 100) / 100 : 0;

  var selfPay = Math.round(range(rng, 8, 22));
  var medicare = Math.round(range(rng, 18, 32));
  var medicaid = Math.round(range(rng, 38, 60));
  var stateAid = Math.round(range(rng, 0, 8));
  var vaOther = 100 - selfPay - medicare - medicaid - stateAid;
  if (vaOther < 0) vaOther = 0;

  var risks = [];
  if (noi < 0) risks.push('negative_noi');
  if (dscr > 0 && dscr < 1.0) risks.push('dscr_below_1x');
  if (occupancy < 0.75) risks.push('low_occupancy');
  if (rng() < 0.18) risks.push('cms_complaint_history');
  if (rng() < 0.10) risks.push('survey_findings');

  return {
    loan_id: fha,
    fha_case_number: fha,
    fha_root: fha,
    property_name: name + ' (' + city + ')',
    asset_class: 'Healthcare',
    program: 'HLS',
    section_of_act: pick(rng, SECTIONS_232),
    property_type: pick(rng, ['Nursing Home','Assisted Living','Intermediate Care']),
    property_subtype: pick(rng, ['Skilled Nursing','Memory Care','Independent + AL','SNF + Rehab']),
    current_upb: upb,
    original_principal_balance: origBalance,
    current_interest_rate: rate / 100,
    current_interest_rate_type: 'Fixed',
    current_payment_type: 'Fully Amortizing',
    current_monthly_pi: Math.round((upb * rate / 100) / 12),
    cms_ccn: String(rangeInt(rng, 100000, 999999)),
    cms_star_rating: rangeInt(rng, 1, 5),
    chow_required: true,
    borrower: {
      name: pick(rng, ['Heritage Healthcare Holdings','Sunbelt Senior Care LLC','Midwest Care Operations LP','Atlantic Health Properties Inc','Cornerstone Healthcare Trust']),
      tax_id_masked: 'XX-XXX' + rangeInt(rng, 1000, 9999),
      city: city, state: state
    },
    property: {
      street1: streetAddr(rng),
      city: city, state: state,
      zip: String(rangeInt(rng, 10001, 99999)).padStart(5, '0'),
      year_built: rangeInt(rng, 1972, 2010),
      year_renovated: rangeInt(rng, 1995, 2022),
      gross_sf: rangeInt(rng, 35000, 95000),
      land_acres: Math.round(range(rng, 1.5, 8.5) * 100) / 100,
      occupancy_opiis_pct: occupancy,
      hc_unit_mix: { total_units: beds, total_beds: beds, congregate_units: congregateBeds, congregate_beds: congregateBeds, total_sf: rangeInt(rng, 35000, 95000) },
      hc_payor_mix: { self_pay_pct: selfPay, medicare_pct: medicare, medicaid_pct: medicaid, state_aid_pct: stateAid, va_other_pct: vaOther, occupancy_pct: occupancy }
    },
    financials: {
      latest_year:        { afs_date: '2025-12-31', months_reported: 12, total_revenue: revenue, total_expenses: expenses, noi: noi },
      second_latest_year: { afs_date: '2024-12-31', months_reported: 12, total_revenue: Math.round(revenue * range(rng, 0.92, 1.05)), total_expenses: Math.round(expenses * range(rng, 0.92, 1.05)), noi: Math.round(noi * range(rng, 0.85, 1.10)) },
      third_latest_year:  { afs_date: '2023-12-31', months_reported: 12, total_revenue: Math.round(revenue * range(rng, 0.85, 1.00)), total_expenses: Math.round(expenses * range(rng, 0.88, 1.00)), noi: Math.round(noi * range(rng, 0.70, 1.05)) }
    },
    metrics: {
      annual_debt_service: Math.round((upb * rate / 100)),
      dscr_latest_year: dscr,
      debt_yield_latest_year: upb > 0 ? Math.round((noi / upb) * 10000) / 100 : null,
      noi_to_upb_latest_year: upb > 0 ? Math.round((noi / upb) * 10000) / 100 : null
    },
    related_loans: { has_related: false, related_fha: null, related_name: null },
    risk_flags: risks,
    saleId: saleId, loanId: fha, portal: 'commercial'
  };
}

function makeHlsSale() {
  var rng = mulberry32(4004);
  var saleId = 'HLS-2026-DEMO';
  var loans = Array.from({ length: 8 }, function (_, i) { return makeHlsLoan(rng, saleId, i); });

  var snf = loans.filter(function (l) { return /Skilled|Nursing|SNF/i.test(l.property_subtype + l.property_type); });
  var al = loans.filter(function (l) { return snf.indexOf(l) < 0; });
  if (al.length === 0) al.push(snf.pop());

  function poolSummary(arr) {
    var aggUpb = arr.reduce(function (s, l) { return s + l.current_upb; }, 0);
    var totalBeds = arr.reduce(function (s, l) { return s + (l.property.hc_unit_mix.total_beds || 0); }, 0);
    var avgDscr = arr.length ? arr.reduce(function (s, l) { return s + (l.metrics.dscr_latest_year || 0); }, 0) / arr.length : null;
    var states = Array.from(new Set(arr.map(function (l) { return l.property.state; }))).sort();
    return { loan_count: arr.length, aggregate_upb: aggUpb, total_beds: totalBeds, avg_dscr: avgDscr ? Math.round(avgDscr * 100) / 100 : null, states: states };
  }

  return {
    sale: {
      saleId: saleId, sale_id: saleId, portal: 'commercial',
      program: 'HLS', programType: 'HLS',
      sale_name: 'HLS 2026-DEMO', name: 'HLS 2026-DEMO',
      long_name: 'HUD Healthcare Loan Sale 2026-DEMO',
      sale_type: 'Sealed Bid, Competitive',
      qualification_form: 'HUD-90092',
      transaction_specialist: 'House Strategies Group, LLC',
      state: 'bid_window', status: 'bid_window',
      summary: {
        loan_count: loans.length,
        aggregate_upb: loans.reduce(function (s, l) { return s + l.current_upb; }, 0),
        asset_classes: ['Healthcare'],
        pool_count: 2,
        geographic_footprint: Array.from(new Set(loans.map(function (l) { return l.property.state; }))).sort(),
        total_beds: loans.reduce(function (s, l) { return s + (l.property.hc_unit_mix.total_beds || 0); }, 0)
      },
      key_dates: {
        federal_register_published: '2026-04-20',
        qualification_opens:        '2026-04-23',
        qualification_closes:       '2026-05-13',
        go_live_data_room:          '2026-05-16',
        bid_day:                    '2026-05-29',
        bid_window_open_eastern:    '10:00 AM',
        bid_window_close_eastern:   '12:00 PM',
        award_date:                 '2026-05-30',
        expected_settlement:        '2026-07-31'
      },
      post_sale_terms: { first_look: false, mission_outcome_required: false, servicing_released: true, fha_insurance: false, chow_required: true },
      pools: [
        {
          pool_id: saleId + '-P1', pool_name: 'Pool 1 — Skilled Nursing',
          pool_number: 1, loan_ids: snf.map(function (l) { return l.loan_id; }),
          summary: poolSummary(snf),
          minimum_bid_basis: 'Per-deal $', eligible_bidder_types: ['healthcare_qualified']
        },
        {
          pool_id: saleId + '-P2', pool_name: 'Pool 2 — Assisted Living & Memory Care',
          pool_number: 2, loan_ids: al.map(function (l) { return l.loan_id; }),
          summary: poolSummary(al),
          minimum_bid_basis: 'Per-deal $', eligible_bidder_types: ['healthcare_qualified']
        }
      ]
    },
    loans: loans,
    qc: loans.map(function (l) {
      var status = l.metrics.dscr_latest_year < 1.0 ? 'verified_negative_noi' : 'verified';
      return {
        qcId: 'QC-' + l.loan_id, qc_id: 'QC-' + l.loan_id,
        saleId: l.saleId, loanId: l.loan_id, loan_id: l.loan_id,
        property_name: l.property_name, status: status,
        severity: status === 'verified_negative_noi' ? 'medium' : 'low',
        finding: status === 'verified_negative_noi' ? 'DSCR below 1.0x; financials confirmed but property is distressed' : 'SALD financials reconcile to OPIIS',
        reconciliation_target: 'SALD vs CMS OSCAR + OPIIS',
        fields_checked: ['Total Revenue','Total Expenses','NOI','Occupancy','Bed count'],
        checked_at: '2026-04-30', checked_by: 'qc-engine-v1', portal: 'commercial'
      };
    })
  };
}

// ---------------------------------------------------------------------
//  Write helpers
// ---------------------------------------------------------------------
async function batchWrite(table, items) {
  for (var i = 0; i < items.length; i += 25) {
    var batch = items.slice(i, i + 25).map(function (Item) { return { PutRequest: { Item: Item } }; });
    var req = { RequestItems: {} }; req.RequestItems[table] = batch;
    var attempts = 0;
    while (true) {
      var res = await ddb.send(new BatchWriteCommand(req));
      var unprocessed = res.UnprocessedItems && res.UnprocessedItems[table];
      if (!unprocessed || unprocessed.length === 0) break;
      req = { RequestItems: {} }; req.RequestItems[table] = unprocessed;
      attempts++;
      if (attempts > 5) throw new Error('Too many retries on ' + table);
      await new Promise(function (r) { setTimeout(r, 200 * attempts); });
    }
  }
}

async function main() {
  console.log('Generating program-sample seeds for stage=' + stage + '...');
  var bundles = [makeHvlsSale(), makeHnvlsSale(), makeSflsSale(), makeHlsSale()];

  for (var b of bundles) {
    console.log('  ' + b.sale.saleId + ': ' + b.loans.length + ' loans, ' + b.sale.pools.length + ' pools');
    await batchWrite(TBL.sales, [b.sale]);
    await batchWrite(TBL.loans, b.loans);
    if (b.qc.length) await batchWrite(TBL.qc, b.qc);
  }

  // Bump MHLS-2026-DEMO into bid_window state so it can accept bids
  console.log('Updating MHLS-2026-DEMO state -> bid_window');
  await ddb.send(new UpdateCommand({
    TableName: TBL.sales,
    Key: { saleId: 'MHLS-2026-DEMO' },
    UpdateExpression: 'SET #s = :s, #st = :st',
    ExpressionAttributeNames: { '#s': 'state', '#st': 'status' },
    ExpressionAttributeValues: { ':s': 'bid_window', ':st': 'bid_window' }
  }));

  console.log('Done. Verify counts with: aws dynamodb scan --table-name hsg-' + stage + '-sales --select COUNT');
}

main().catch(function (err) { console.error(err); process.exit(1); });

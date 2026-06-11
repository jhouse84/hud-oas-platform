/**
 * HSG.formsCommercialQS — Commercial Qualification Statement (MHLS / HLS)
 *
 * The commercial QS is sale-specific and carries NO public form number —
 * it is modeled on the Qualification Statement published with each BIP.
 * Schema, defaults, and validators for the commercial portal qualification
 * wizard: multifamily and healthcare bidders, Section 232 operator
 * track-record disclosures, plus the CA/NDA and BTAF/BAUF steps that
 * complete the qualification stack.
 *
 * Steps:
 *   1. Entity & contact information
 *   2. Ownership / beneficial owners
 *   3. Financial capacity & investment track record
 *   4. Operator capacity (Section 232 healthcare only)
 *   5. Related Party disclosures
 *   6. Certifications & signature
 */
window.HSG = window.HSG || {};

HSG.formsCommercialQS = (function () {
  'use strict';

  var ENTITY_TYPES = [
    { value: 'LLC',         label: 'Limited Liability Company (LLC)' },
    { value: 'CORP',        label: 'Corporation' },
    { value: 'LP',          label: 'Limited Partnership' },
    { value: 'GP',          label: 'General Partnership' },
    { value: 'REIT',        label: 'Real Estate Investment Trust (REIT)' },
    { value: 'JV',          label: 'Joint Venture' },
    { value: 'FUND',        label: 'Investment Fund' },
    { value: 'NONPROFIT',   label: '501(c)(3) Nonprofit' },
    { value: 'GOVT',        label: 'Government / Quasi-Government' }
  ];

  var STEPS = [
    { key: 'ca',         label: '1. CA / NDA', desc: 'Confidentiality Agreement' },
    { key: 'entity',     label: '2. Entity', desc: 'Legal name, organization, contact' },
    { key: 'ownership',  label: '3. Ownership', desc: 'Beneficial owners (25%+)' },
    { key: 'financial',  label: '4. Financial', desc: 'Capital, AUM, track record' },
    { key: 'operator',   label: '5. Operator', desc: 'Healthcare operations (HLS only)' },
    { key: 'related',    label: '6. Related Parties', desc: 'Disclosures' },
    { key: 'bauf',       label: '7. Bid Terms & User', desc: 'BTAF + authorized user (BAUF)' },
    { key: 'certify',    label: '8. Certify', desc: 'Signature + submit' }
  ];

  function defaults() {
    return {
      portal: 'commercial',
      programTypes: [],
      ca: {
        acknowledged: false,        // executes the sale Confidentiality Agreement / NDA
        signerName: '',
        signerTitle: ''
      },
      bauf: {
        btafAcknowledged: false,    // Bid Terms Acknowledgement Form — BIP terms as published
        authorizedUserName: '',     // BAUF — the single authorized submitter for this bidder
        authorizedUserTitle: '',
        authorizedUserEmail: '',
        authorizedUserPhone: ''
      },
      entity: {
        legalName: '',
        dba: '',
        entityType: '',
        stateOfFormation: '',
        yearFormed: '',
        ein: '',
        uei: '',
        cage: '',
        physicalAddress: { line1: '', line2: '', city: '', state: '', zip: '' },
        mailingAddress: { line1: '', line2: '', city: '', state: '', zip: '' },
        contactName: '',
        contactTitle: '',
        contactEmail: '',
        contactPhone: ''
      },
      ownership: {
        owners: [],
        ctaCompliant: false,
        confirmedNoForeignAdversary: false
      },
      financial: {
        liquidCapitalUSD: 0,
        totalAUMUSD: 0,
        commercialPortfolioUSD: 0,
        priorMHLSPurchases: '',     // narrative
        priorHLSPurchases: '',      // narrative
        commercialServicerName: '',
        bankReferenceName: '',
        bankReferenceContact: '',
        auditedFinancialsAttached: false,
        // Track record table
        completedTransactions: []   // [{ year, dollarsUSD, assetType, role, notes }]
      },
      operator: {
        // Required only when programTypes includes 'HLS'
        operatorEntityName: '',
        operatorYearsExperience: 0,
        cmsCcn: '',                              // CMS Certification Number for facilities
        cmsStarRating: '',
        section232ExperienceYearsAvg: 0,
        priorHUDChowApprovals: 0,                // Change of Ownership approvals
        operatorCertNoExclusion: false,          // OIG/GSA exclusion list
        operatorCertCMSCompliant: false,
        operatorCertHIPAACompliant: false
      },
      related: {
        relationshipsDisclosed: false,
        relationships: [],
        priorHUDStaffRelationships: '',
        commonOwnershipWithOtherBidders: ''
      },
      certify: {
        certifierName: '',
        certifierTitle: '',
        certifierDate: '',
        certifierSignature: '',
        attestNoFalseStatements: false,
        attestComplyWithLSA: false,    // Loan Sale Agreement (commercial uses LSA, not CAA)
        attestUnderstandsBidderResponsibilities: false
      },
      screening: {
        ofacResult: null,
        samResult: null,
        tinResult: null
      }
    };
  }

  function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function isEIN(v)   { return /^\d{2}-?\d{7}$/.test(v); }
  function isUEI(v)   { return /^[A-Z0-9]{12}$/.test(v); }
  function isZip(v)   { return /^\d{5}(-\d{4})?$/.test(v); }
  function isYear(v)  { var n = +v; return n >= 1850 && n <= new Date().getFullYear(); }
  function isCAGE(v)  { return !v || /^[A-Z0-9]{5}$/.test(v); }

  function validateEntity(e) {
    var errors = {};
    if (!e.legalName || e.legalName.length < 2) errors['entity.legalName'] = 'Legal name is required';
    if (!e.entityType) errors['entity.entityType'] = 'Select entity type';
    if (!e.stateOfFormation) errors['entity.stateOfFormation'] = 'State of formation is required';
    if (!isYear(e.yearFormed)) errors['entity.yearFormed'] = 'Enter a valid year';
    if (!isEIN(e.ein)) errors['entity.ein'] = 'EIN format must be 12-3456789';
    if (!isUEI(e.uei)) errors['entity.uei'] = 'UEI must be 12 alphanumeric characters';
    if (!isCAGE(e.cage)) errors['entity.cage'] = 'CAGE must be 5 alphanumeric characters';
    if (!e.physicalAddress.line1) errors['entity.physicalAddress.line1'] = 'Street is required';
    if (!e.physicalAddress.city) errors['entity.physicalAddress.city'] = 'City is required';
    if (!e.physicalAddress.state) errors['entity.physicalAddress.state'] = 'State is required';
    if (!isZip(e.physicalAddress.zip)) errors['entity.physicalAddress.zip'] = 'Enter a valid ZIP';
    if (!e.contactName) errors['entity.contactName'] = 'Contact name is required';
    if (!isEmail(e.contactEmail)) errors['entity.contactEmail'] = 'Enter a valid email';
    if (!e.contactPhone) errors['entity.contactPhone'] = 'Phone is required';
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  function validateOwnership(o) {
    var errors = {};
    if (!o.ctaCompliant) errors['ownership.ctaCompliant'] = 'Must affirm Corporate Transparency Act compliance';
    if (!o.confirmedNoForeignAdversary) errors['ownership.confirmedNoForeignAdversary'] = 'Must affirm no foreign-adversary ownership';
    var sum = 0;
    (o.owners || []).forEach(function (own, i) {
      if (!own.name) errors['ownership.owners[' + i + '].name'] = 'Owner name required';
      if (!own.ownershipPct || own.ownershipPct < 0 || own.ownershipPct > 100) errors['ownership.owners[' + i + '].ownershipPct'] = 'Must be 0–100';
      if (!own.citizenship) errors['ownership.owners[' + i + '].citizenship'] = 'Citizenship required';
      sum += Number(own.ownershipPct || 0);
    });
    if ((o.owners || []).length === 0) errors['ownership.owners'] = 'List all beneficial owners holding 25% or more';
    if (sum > 100.5) errors['ownership.owners'] = 'Total ownership exceeds 100%';
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  function validateFinancial(f) {
    var errors = {};
    if (!f.liquidCapitalUSD || f.liquidCapitalUSD <= 0) errors['financial.liquidCapitalUSD'] = 'Liquid capital must be > 0';
    if (!f.totalAUMUSD || f.totalAUMUSD <= 0) errors['financial.totalAUMUSD'] = 'AUM must be > 0';
    if (!f.commercialServicerName) errors['financial.commercialServicerName'] = 'Commercial servicer is required';
    if (!f.bankReferenceName) errors['financial.bankReferenceName'] = 'Bank reference is required';
    if (!f.bankReferenceContact) errors['financial.bankReferenceContact'] = 'Bank reference contact is required';
    if (!f.completedTransactions || f.completedTransactions.length === 0) {
      errors['financial.completedTransactions'] = 'List at least one completed comparable transaction';
    }
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  function validateOperator(op, programTypes) {
    var errors = {};
    var requiresOperator = (programTypes || []).indexOf('HLS') >= 0;
    if (!requiresOperator) return { valid: true, errors: errors };
    if (!op.operatorEntityName) errors['operator.operatorEntityName'] = 'Operator entity name is required';
    if (!op.operatorYearsExperience || op.operatorYearsExperience < 3) errors['operator.operatorYearsExperience'] = 'Minimum 3 years operator experience';
    if (!op.section232ExperienceYearsAvg || op.section232ExperienceYearsAvg < 3) errors['operator.section232ExperienceYearsAvg'] = 'Minimum 3 years Section 232 experience';
    if (!op.operatorCertNoExclusion) errors['operator.operatorCertNoExclusion'] = 'Must certify no OIG/GSA exclusion';
    if (!op.operatorCertCMSCompliant) errors['operator.operatorCertCMSCompliant'] = 'Must certify CMS compliance';
    if (!op.operatorCertHIPAACompliant) errors['operator.operatorCertHIPAACompliant'] = 'Must certify HIPAA compliance';
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  function validateRelated(r) {
    var errors = {};
    if (!r.relationshipsDisclosed) errors['related.relationshipsDisclosed'] = 'Must affirm Related Party disclosure';
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  function validateCA(ca) {
    var errors = {};
    if (!ca.acknowledged) errors['ca.acknowledged'] = 'The Confidentiality Agreement must be executed before sale materials open';
    if (!ca.signerName) errors['ca.signerName'] = 'Signer name is required';
    if (!ca.signerTitle) errors['ca.signerTitle'] = 'Signer title is required';
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  function validateBAUF(b) {
    var errors = {};
    if (!b.btafAcknowledged) errors['bauf.btafAcknowledged'] = 'The Bid Terms Acknowledgement is required';
    if (!b.authorizedUserName) errors['bauf.authorizedUserName'] = 'Designate the authorized user who will submit the bid';
    if (!b.authorizedUserTitle) errors['bauf.authorizedUserTitle'] = 'Authorized user title is required';
    if (!isEmail(b.authorizedUserEmail)) errors['bauf.authorizedUserEmail'] = 'Enter a valid email for the authorized user';
    if (!b.authorizedUserPhone) errors['bauf.authorizedUserPhone'] = 'Authorized user phone is required';
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  function validateCertify(c) {
    var errors = {};
    if (!c.certifierName) errors['certify.certifierName'] = 'Name is required';
    if (!c.certifierTitle) errors['certify.certifierTitle'] = 'Title is required';
    if (!c.certifierDate) errors['certify.certifierDate'] = 'Date is required';
    if (!c.certifierSignature) errors['certify.certifierSignature'] = 'Type your full legal name as signature';
    if (!c.attestNoFalseStatements) errors['certify.attestNoFalseStatements'] = 'Must attest';
    if (!c.attestComplyWithLSA) errors['certify.attestComplyWithLSA'] = 'Must attest';
    if (!c.attestUnderstandsBidderResponsibilities) errors['certify.attestUnderstandsBidderResponsibilities'] = 'Must attest';
    return { valid: Object.keys(errors).length === 0, errors: errors };
  }

  function validateAll(form) {
    var allErrors = {};
    var v;
    v = validateCA(form.ca || {});                              Object.assign(allErrors, v.errors);
    v = validateEntity(form.entity);                            Object.assign(allErrors, v.errors);
    v = validateOwnership(form.ownership);                      Object.assign(allErrors, v.errors);
    v = validateFinancial(form.financial);                      Object.assign(allErrors, v.errors);
    v = validateOperator(form.operator, form.programTypes);     Object.assign(allErrors, v.errors);
    v = validateRelated(form.related);                          Object.assign(allErrors, v.errors);
    v = validateBAUF(form.bauf || {});                          Object.assign(allErrors, v.errors);
    v = validateCertify(form.certify);                          Object.assign(allErrors, v.errors);
    if (!form.programTypes || form.programTypes.length === 0) {
      allErrors['programTypes'] = 'Select at least one program (MHLS or HLS)';
    }
    return { valid: Object.keys(allErrors).length === 0, errors: allErrors };
  }

  return {
    ENTITY_TYPES: ENTITY_TYPES,
    STEPS: STEPS,
    defaults: defaults,
    validateCA: validateCA,
    validateEntity: validateEntity,
    validateOwnership: validateOwnership,
    validateFinancial: validateFinancial,
    validateOperator: validateOperator,
    validateRelated: validateRelated,
    validateBAUF: validateBAUF,
    validateCertify: validateCertify,
    validateAll: validateAll,
    isEmail: isEmail, isEIN: isEIN, isUEI: isUEI, isZip: isZip
  };
})();

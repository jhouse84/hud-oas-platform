/**
 * HUD Loan Sale Platform — Settlement Tracking Engine
 * House Strategies Group LLC
 *
 * Inspired by S&P ClearPar's post-award settlement workflow.
 * Handles:
 *   - Program-specific settlement timelines
 *   - Deliverables checklist tracking
 *   - Wire instructions & escrow coordination
 *   - Document execution tracking (CAA, ISA, PSA)
 *   - Post-closing compliance obligations
 *   - Settlement calendar & deadlines
 *
 * Future integration points (TODO: [AWS/API/SendGrid]):
 *   - Automated email reminders via SendGrid for missed deadlines
 *   - Document e-signature integration (DocuSign/HelloSign)
 *   - Wire instruction secure delivery (encrypted PDF via S3)
 *   - Calendar sync (ICS export, Google/Outlook integration)
 */
window.HSG = window.HSG || {};

HSG.settlement = (function () {
  'use strict';

  var state = HSG.state;
  var u = HSG.utils;

  /* ========================================================================
     TIMELINE DEFINITIONS PER PROGRAM
     ======================================================================== */

  var TIMELINES = {
    HVLS: {
      label: 'HECM Vacant Loan Sale',
      totalDays: 42,
      milestones: [
        { id: 'ms-award', label: 'Award Letter', day: 0, required: true, icon: 'mail' },
        { id: 'ms-deposit', label: 'Good-Faith Deposit (10%)', day: 3, required: true, icon: 'wire' },
        { id: 'ms-caa', label: 'CAA Execution', day: 14, required: true, icon: 'signature' },
        { id: 'ms-isa', label: 'ISA Execution', day: 14, required: true, icon: 'signature' },
        { id: 'ms-title', label: 'Title Assignment Prep', day: 21, required: true, icon: 'file' },
        { id: 'ms-file-prep', label: 'Loan File Preparation', day: 28, required: true, icon: 'folder' },
        { id: 'ms-final-wire', label: 'Final Payment Wire (90%)', day: 40, required: true, icon: 'wire' },
        { id: 'ms-settle', label: 'Settlement', day: 42, required: true, icon: 'check' },
        { id: 'ms-post', label: 'First Quarterly Report', day: 90, required: true, icon: 'report' }
      ]
    },
    HNVLS: {
      label: 'HECM Non-Vacant Loan Sale',
      totalDays: 45,
      milestones: [
        { id: 'ms-award', label: 'Award Letter', day: 0, required: true, icon: 'mail' },
        { id: 'ms-deposit', label: 'Good-Faith Deposit (10%)', day: 3, required: true, icon: 'wire' },
        { id: 'ms-occ-verify', label: 'Occupancy Verification (re-check)', day: 7, required: true, icon: 'shield' },
        { id: 'ms-caa', label: 'CAA Execution', day: 15, required: true, icon: 'signature' },
        { id: 'ms-isa', label: 'ISA Execution', day: 15, required: true, icon: 'signature' },
        { id: 'ms-borrower-notice', label: 'Borrower Transfer Notices', day: 21, required: true, icon: 'mail' },
        { id: 'ms-file-prep', label: 'Loan File Preparation', day: 30, required: true, icon: 'folder' },
        { id: 'ms-final-wire', label: 'Final Payment Wire (90%)', day: 43, required: true, icon: 'wire' },
        { id: 'ms-settle', label: 'Settlement', day: 45, required: true, icon: 'check' },
        { id: 'ms-post', label: 'First Quarterly Report', day: 90, required: true, icon: 'report' }
      ]
    },
    SFLS: {
      label: 'Single Family Loan Sale',
      totalDays: 45,
      milestones: [
        { id: 'ms-award', label: 'Award Letter', day: 0, required: true, icon: 'mail' },
        { id: 'ms-deposit', label: 'Good-Faith Deposit (10%)', day: 3, required: true, icon: 'wire' },
        { id: 'ms-caa', label: 'CAA Execution', day: 14, required: true, icon: 'signature' },
        { id: 'ms-isa', label: 'ISA Execution', day: 14, required: true, icon: 'signature' },
        { id: 'ms-servicer', label: 'Designated Servicer Certification', day: 17, required: true, icon: 'shield' },
        { id: 'ms-mers', label: 'MERS Assignment Batch', day: 21, required: true, icon: 'file' },
        { id: 'ms-borrower-notice', label: 'RESPA Borrower Notice (15-day window)', day: 25, required: true, icon: 'mail' },
        { id: 'ms-file-prep', label: 'Loan File Preparation', day: 32, required: true, icon: 'folder' },
        { id: 'ms-final-wire', label: 'Final Payment Wire (90%)', day: 43, required: true, icon: 'wire' },
        { id: 'ms-settle', label: 'Settlement & Transfer', day: 45, required: true, icon: 'check' },
        { id: 'ms-nso', label: 'Post-Sale NSO Reporting Begins', day: 60, required: true, icon: 'report' }
      ]
    },
    MHLS: {
      label: 'Multifamily Loan Sale',
      totalDays: 56,
      milestones: [
        { id: 'ms-award', label: 'Award Letter (per deal)', day: 0, required: true, icon: 'mail' },
        { id: 'ms-deposit', label: 'Good-Faith Deposit (10%)', day: 5, required: true, icon: 'wire' },
        { id: 'ms-lsa', label: 'Loan Sale Agreement Execution', day: 20, required: true, icon: 'signature' },
        { id: 'ms-reg-agreement', label: 'Regulatory Agreement Assignment', day: 28, required: true, icon: 'shield' },
        { id: 'ms-hap-assign', label: 'HAP Contract Assignment (if applicable)', day: 35, required: false, icon: 'file' },
        { id: 'ms-borrower-notice', label: 'Borrower Notification', day: 40, required: true, icon: 'mail' },
        { id: 'ms-file-prep', label: 'Loan File & Collateral Package', day: 45, required: true, icon: 'folder' },
        { id: 'ms-final-wire', label: 'Final Payment Wire (90%)', day: 54, required: true, icon: 'wire' },
        { id: 'ms-settle', label: 'Settlement & Note Assignment', day: 56, required: true, icon: 'check' },
        { id: 'ms-ongoing', label: 'Ongoing Regulatory Compliance', day: 90, required: true, icon: 'report' }
      ]
    },
    HLS: {
      label: 'Healthcare Loan Sale',
      totalDays: 63,
      milestones: [
        { id: 'ms-award', label: 'Award Letter (per deal)', day: 0, required: true, icon: 'mail' },
        { id: 'ms-deposit', label: 'Good-Faith Deposit (10%)', day: 5, required: true, icon: 'wire' },
        { id: 'ms-licensing', label: 'Healthcare Operator Licensing Review', day: 14, required: true, icon: 'shield' },
        { id: 'ms-cms-change', label: 'CMS Provider Change of Ownership', day: 28, required: true, icon: 'shield' },
        { id: 'ms-lsa', label: 'Loan Sale Agreement Execution', day: 35, required: true, icon: 'signature' },
        { id: 'ms-reg-assign', label: 'Regulatory Agreement Assignment', day: 42, required: true, icon: 'file' },
        { id: 'ms-file-prep', label: 'Loan File & Collateral Package', day: 49, required: true, icon: 'folder' },
        { id: 'ms-final-wire', label: 'Final Payment Wire (90%)', day: 60, required: true, icon: 'wire' },
        { id: 'ms-settle', label: 'Settlement & Note Assignment', day: 63, required: true, icon: 'check' },
        { id: 'ms-ongoing', label: 'Ongoing Healthcare Compliance', day: 90, required: true, icon: 'report' }
      ]
    }
  };

  var DELIVERABLES_BY_PROGRAM = {
    HVLS: [
      { id: 'dv-caa', label: 'Signed CAA (Conveyance, Assignment & Assumption)', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-isa', label: 'Signed ISA (Interim Servicing Agreement)', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-psa', label: 'Signed PSA (if applicable for mission pools)', category: 'legal', required: false, responsibleParty: 'Purchaser' },
      { id: 'dv-wire-deposit', label: 'Deposit Wire Confirmation (10%)', category: 'financial', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-wire-final', label: 'Final Payment Wire (90%)', category: 'financial', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-collateral-receipt', label: 'Collateral File Receipt Acknowledgment', category: 'operational', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-servicer-cert', label: 'Servicer Certification (HUD-form)', category: 'operational', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-assignment-chain', label: 'Full Assignment Chain Delivered', category: 'operational', required: true, responsibleParty: 'TS' },
      { id: 'dv-title-policy', label: 'Title Insurance Policy Transfer', category: 'operational', required: false, responsibleParty: 'Purchaser' },
      { id: 'dv-closing-stmt', label: 'Final Closing Statement', category: 'financial', required: true, responsibleParty: 'TS' }
    ],
    HNVLS: [
      { id: 'dv-caa', label: 'Signed CAA', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-isa', label: 'Signed ISA', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-occ-recheck', label: 'Occupancy Re-verification Report', category: 'operational', required: true, responsibleParty: 'TS' },
      { id: 'dv-borrower-notice', label: 'Borrower Notice of Transfer', category: 'operational', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-wire-deposit', label: 'Deposit Wire Confirmation', category: 'financial', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-wire-final', label: 'Final Payment Wire', category: 'financial', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-servicer-cert', label: 'Servicer Certification', category: 'operational', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-closing-stmt', label: 'Final Closing Statement', category: 'financial', required: true, responsibleParty: 'TS' }
    ],
    SFLS: [
      { id: 'dv-caa', label: 'Signed CAA', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-isa', label: 'Signed ISA', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-wire-deposit', label: 'Deposit Wire Confirmation', category: 'financial', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-wire-final', label: 'Final Payment Wire', category: 'financial', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-servicer-cert', label: 'Designated Servicer Certification', category: 'operational', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-mers-assignment', label: 'MERS Assignment Complete', category: 'operational', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-respa-notice', label: 'RESPA Borrower Notices Sent', category: 'operational', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-loss-mit', label: 'Loss Mitigation Transfer Package', category: 'operational', required: true, responsibleParty: 'TS' },
      { id: 'dv-nso-plan', label: 'NSO Plan (if mission pool)', category: 'operational', required: false, responsibleParty: 'Purchaser' },
      { id: 'dv-closing-stmt', label: 'Final Closing Statement', category: 'financial', required: true, responsibleParty: 'TS' }
    ],
    MHLS: [
      { id: 'dv-lsa', label: 'Signed Loan Sale Agreement', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-assignment-note', label: 'Note Endorsement & Assignment', category: 'legal', required: true, responsibleParty: 'TS' },
      { id: 'dv-reg-assignment', label: 'HUD Regulatory Agreement Assignment', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-hap-assign', label: 'HAP Contract Assignment', category: 'operational', required: false, responsibleParty: 'Purchaser' },
      { id: 'dv-lihtc-assign', label: 'LIHTC Extended Use Agreement Assignment', category: 'operational', required: false, responsibleParty: 'Purchaser' },
      { id: 'dv-wire-deposit', label: 'Deposit Wire Confirmation', category: 'financial', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-wire-final', label: 'Final Payment Wire', category: 'financial', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-collateral', label: 'Collateral File Delivery', category: 'operational', required: true, responsibleParty: 'TS' },
      { id: 'dv-borrower-notice', label: 'Borrower Transfer Notice', category: 'operational', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-title-assign', label: 'Title Insurance Assignment', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-closing-stmt', label: 'Final Closing Statement', category: 'financial', required: true, responsibleParty: 'TS' }
    ],
    HLS: [
      { id: 'dv-lsa', label: 'Signed Loan Sale Agreement', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-healthcare-license', label: 'Healthcare Operator License Transfer', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-cms-coo', label: 'CMS Change of Ownership Approval', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-state-approval', label: 'State DOH Approval', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-reg-assignment', label: 'HUD Regulatory Agreement Assignment', category: 'legal', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-wire-deposit', label: 'Deposit Wire Confirmation', category: 'financial', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-wire-final', label: 'Final Payment Wire', category: 'financial', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-collateral', label: 'Collateral File Delivery', category: 'operational', required: true, responsibleParty: 'TS' },
      { id: 'dv-operations-transfer', label: 'Operations Transition Plan', category: 'operational', required: true, responsibleParty: 'Purchaser' },
      { id: 'dv-closing-stmt', label: 'Final Closing Statement', category: 'financial', required: true, responsibleParty: 'TS' }
    ]
  };

  /* ========================================================================
     INIT SETTLEMENT FROM AWARD
     ======================================================================== */

  /**
   * Create a settlement record from an award.
   * @param {Object} award — { awardId, saleId, poolId, winningBid, purchaser, awardDate }
   */
  function initFromAward(award) {
    var sale = findSale(award.saleId);
    // Infer program from sale or from explicit award.program
    var program = (sale && sale.programType) || award.program || 'HVLS';
    var timeline = TIMELINES[program] || TIMELINES.HVLS;
    var deliverables = DELIVERABLES_BY_PROGRAM[program] || DELIVERABLES_BY_PROGRAM.HVLS;

    var awardDate = award.awardDate ? new Date(award.awardDate) : new Date();

    // Build dated milestones
    var milestones = timeline.milestones.map(function (m, idx) {
      var dueDate = new Date(awardDate.getTime() + m.day * 86400000);
      return Object.assign({}, m, {
        dueDate: dueDate.toISOString(),
        status: idx === 0 ? 'completed' : (idx === 1 ? 'active' : 'upcoming'),
        completedAt: idx === 0 ? awardDate.toISOString() : null
      });
    });

    // Build deliverables
    var dvs = deliverables.map(function (d) {
      return Object.assign({}, d, {
        completed: false,
        completedAt: null,
        notes: null
      });
    });

    var settlement = state.settlements.init(award.saleId, award.awardId, {
      poolId: award.poolId,
      poolLabel: award.poolLabel,
      program: program,
      programLabel: timeline.label,
      awardDate: awardDate.toISOString(),
      targetSettlementDate: new Date(awardDate.getTime() + timeline.totalDays * 86400000).toISOString(),
      totalDays: timeline.totalDays,
      milestones: milestones,
      deliverables: dvs,
      purchaser: award.purchaser,
      purchaserId: award.purchaserId,
      winningBidAmount: award.winningBidAmount,
      winningBidPct: award.winningBidPct,
      impliedDollar: award.impliedDollar,
      depositRequired: award.impliedDollar * 0.1,
      finalPaymentRequired: award.impliedDollar * 0.9,
      wireInstructions: generateWireInstructions(award),
      status: 'open'
    });

    return settlement;
  }

  function generateWireInstructions(award) {
    // Demo wire instructions
    return {
      bankName: 'Federal Reserve Bank of New York',
      aba: '021001088',
      accountName: 'U.S. Department of Housing and Urban Development — OAS Escrow',
      accountNumber: '1234-5678-9012 (placeholder)',
      ref: 'HUD-OAS-' + award.saleId + '-' + award.poolId,
      swift: 'FRNYUS33',
      deliveryNote: 'Wire must reference award code to be credited correctly. Deposit due within 72 hours of award letter; final payment due 48 hours before settlement.',
      secureDeliveryNote: 'Actual wire instructions delivered via encrypted PDF. Contact Transaction Specialist at wire-instructions@hud-oas.gov to request credentials.'
    };
  }

  function findSale(saleId) {
    if (!window.HSG_DATA || !window.HSG_DATA.sales) return null;
    return window.HSG_DATA.sales.find(function (s) { return s.id === saleId; });
  }

  /* ========================================================================
     PROGRESS CALCULATIONS
     ======================================================================== */

  function getProgress(awardId) {
    var settlement = state.settlements.getById(awardId);
    if (!settlement) return null;

    var ms = settlement.milestones || [];
    var dv = settlement.deliverables || [];

    var msCompleted = ms.filter(function (m) { return m.status === 'completed'; }).length;
    var dvCompleted = dv.filter(function (d) { return d.completed; }).length;
    var dvRequired = dv.filter(function (d) { return d.required; }).length;
    var dvRequiredDone = dv.filter(function (d) { return d.required && d.completed; }).length;

    var now = new Date();
    var target = new Date(settlement.targetSettlementDate);
    var daysRemaining = Math.ceil((target - now) / 86400000);

    // Overdue milestones
    var overdue = ms.filter(function (m) {
      return m.status !== 'completed' && new Date(m.dueDate) < now;
    });

    return {
      milestoneProgress: ms.length > 0 ? (msCompleted / ms.length) * 100 : 0,
      milestonesCompleted: msCompleted,
      milestonesTotal: ms.length,
      deliverableProgress: dv.length > 0 ? (dvCompleted / dv.length) * 100 : 0,
      deliverablesCompleted: dvCompleted,
      deliverablesTotal: dv.length,
      requiredDeliverableProgress: dvRequired > 0 ? (dvRequiredDone / dvRequired) * 100 : 0,
      daysRemaining: daysRemaining,
      overdue: overdue,
      overdueCount: overdue.length,
      onTrack: overdue.length === 0 && daysRemaining >= 0,
      currentMilestone: ms.find(function (m) { return m.status === 'active'; })
    };
  }

  /* ========================================================================
     SEED DEMO SETTLEMENTS
     ======================================================================== */

  /**
   * Seed some example settlements for demo purposes.
   */
  function seedDemo() {
    // Seed settlements for HVLS-2025-2 (closed, mostly done) and HVLS-2026-2 (in progress)
    var existing = state.settlements.getAll();
    if (existing.length > 0) return; // already seeded

    // 1. HVLS-2025-2 — mostly complete settlement (9 days until final)
    var ex1 = initFromAward({
      awardId: 'AWD-HVLS-2025-2-A',
      saleId: 'HVLS-2025-2',
      program: 'HVLS',
      poolId: 'HVLS-2025-2-A',
      poolLabel: 'Pool A - Midwest',
      awardDate: new Date(Date.now() - 33 * 86400000).toISOString(),
      purchaser: 'Lone Star Capital Partners LLC',
      purchaserId: 'BDR-001',
      winningBidAmount: 74.2,
      winningBidPct: 74.2,
      impliedDollar: 12850000
    });
    if (ex1) {
      // Mark first 6 milestones complete
      ex1.milestones.forEach(function (m, i) {
        if (i < 6) { m.status = 'completed'; m.completedAt = new Date(Date.now() - (30 - i * 4) * 86400000).toISOString(); }
        else if (i === 6) m.status = 'active';
      });
      // Complete several deliverables
      ex1.deliverables.forEach(function (d, i) {
        if (i < 5) { d.completed = true; d.completedAt = new Date().toISOString(); }
      });
      state.settlements.update(ex1.awardId, ex1);
    }

    // 2. HVLS-2026-2 Pool A — early stage
    var ex2 = initFromAward({
      awardId: 'AWD-HVLS-2026-2-A',
      saleId: 'HVLS-2026-2',
      poolId: 'HVLS-2026-2-A',
      poolLabel: 'Pool A - Southeast',
      awardDate: new Date(Date.now() - 2 * 86400000).toISOString(),
      purchaser: 'Lone Star Capital Partners LLC',
      purchaserId: 'BDR-001',
      winningBidAmount: 72.5,
      winningBidPct: 72.5,
      impliedDollar: 12216250
    });

    // 3. HVLS-2026-2 Pool B — early stage, different bidder
    var ex3 = initFromAward({
      awardId: 'AWD-HVLS-2026-2-B',
      saleId: 'HVLS-2026-2',
      poolId: 'HVLS-2026-2-B',
      poolLabel: 'Pool B - Northeast',
      awardDate: new Date(Date.now() - 2 * 86400000).toISOString(),
      purchaser: 'Atlantic Residential Mortgage Trust',
      purchaserId: 'BDR-002',
      winningBidAmount: 75.4,
      winningBidPct: 75.4,
      impliedDollar: 12991420
    });

    // 4. HVLS-2026-2 Pool C — early stage
    var ex4 = initFromAward({
      awardId: 'AWD-HVLS-2026-2-C',
      saleId: 'HVLS-2026-2',
      poolId: 'HVLS-2026-2-C',
      poolLabel: 'Pool C - National',
      awardDate: new Date(Date.now() - 2 * 86400000).toISOString(),
      purchaser: 'Lone Star Capital Partners LLC',
      purchaserId: 'BDR-001',
      winningBidAmount: 78.1,
      winningBidPct: 78.1,
      impliedDollar: 11629090
    });

    // 5. MHLS 2025-1 Deal 2 — fully closed
    var ex5 = initFromAward({
      awardId: 'AWD-MHLS-2025-1-D2',
      saleId: 'MHLS-2025-1',
      program: 'MHLS',
      poolId: 'MHLS-2025-1-D2',
      poolLabel: 'Deal 2 - Oakwood Manor Apartments',
      awardDate: new Date(Date.now() - 85 * 86400000).toISOString(),
      purchaser: 'Atlantic Residential Mortgage Trust',
      purchaserId: 'BDR-002',
      winningBidAmount: 18750000,
      winningBidPct: 82.4,
      impliedDollar: 18750000
    });
    if (ex5) {
      ex5.milestones.forEach(function (m) { m.status = 'completed'; m.completedAt = new Date(Date.now() - 60 * 86400000).toISOString(); });
      ex5.deliverables.forEach(function (d) { d.completed = true; d.completedAt = new Date(Date.now() - 60 * 86400000).toISOString(); });
      ex5.status = 'closed';
      state.settlements.update(ex5.awardId, ex5);
    }

    // 6. Upcoming SFLS settlement (pre-award, planning mode)
    var ex6 = initFromAward({
      awardId: 'AWD-SFLS-2026-1-P1-PREVIEW',
      saleId: 'SFLS-2026-1',
      poolId: 'SFLS-2026-1-P1',
      poolLabel: 'Pool 1 - Eastern (Projected)',
      awardDate: new Date(Date.now() + 20 * 86400000).toISOString(), // future
      purchaser: 'TBD — Awaiting Bid Day',
      purchaserId: 'BDR-PENDING',
      winningBidAmount: 0,
      winningBidPct: 0,
      impliedDollar: 47200000
    });
    if (ex6) {
      ex6.milestones.forEach(function (m) { m.status = 'upcoming'; m.completedAt = null; });
      ex6.status = 'planning';
      state.settlements.update(ex6.awardId, ex6);
    }
  }

  /* ========================================================================
     EXPORTS & CALENDAR
     ======================================================================== */

  /**
   * Generate ICS (iCalendar) file content for a settlement's milestones.
   * Users can import into Outlook / Google Calendar.
   */
  function toICS(awardId) {
    var settlement = state.settlements.getById(awardId);
    if (!settlement) return '';

    var lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//HSG//HUD OAS Platform//EN',
      'CALSCALE:GREGORIAN'
    ];

    (settlement.milestones || []).forEach(function (m) {
      var dt = icsDate(m.dueDate);
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + m.id + '-' + awardId + '@hud-oas.gov',
        'DTSTAMP:' + dt,
        'DTSTART:' + dt,
        'DTEND:' + dt,
        'SUMMARY:' + escapeIcs(settlement.program + ' · ' + m.label + ' (' + settlement.poolLabel + ')'),
        'DESCRIPTION:' + escapeIcs((m.description || '') + '\\nAward: ' + awardId + '\\nPurchaser: ' + settlement.purchaser),
        'STATUS:' + (m.status === 'completed' ? 'CONFIRMED' : 'TENTATIVE'),
        'END:VEVENT'
      );
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function icsDate(iso) {
    var d = new Date(iso);
    return d.getUTCFullYear() +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      String(d.getUTCDate()).padStart(2, '0') +
      'T' +
      String(d.getUTCHours()).padStart(2, '0') +
      String(d.getUTCMinutes()).padStart(2, '0') +
      '00Z';
  }

  function escapeIcs(s) {
    return (s || '').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }

  function downloadICS(awardId) {
    var ics = toICS(awardId);
    var blob = new Blob([ics], { type: 'text/calendar' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'settlement-' + awardId + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 100);
  }

  /* ========================================================================
     PUBLIC API
     ======================================================================== */
  return {
    TIMELINES: TIMELINES,
    DELIVERABLES_BY_PROGRAM: DELIVERABLES_BY_PROGRAM,
    initFromAward: initFromAward,
    getProgress: getProgress,
    seedDemo: seedDemo,
    toICS: toICS,
    downloadICS: downloadICS,
    generateWireInstructions: generateWireInstructions
  };
})();

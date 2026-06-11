/**
 * HUD Office of Asset Sales - Bid Data
 * 12 HVLS 2026-2 bids (active sale) from 6 bidders across 4 pools
 * 3 historical MHLS bids for reference
 * HVLS bids expressed as % of aggregate BPO
 */
window.HSG_DATA = window.HSG_DATA || {};

window.HSG_DATA.bids = {

  // ── HVLS 2026-2 Bids (Active Sale) ─────────────────────────────────────
  hvls: [
    // Pool A - Southeast ($16.85M aggregate BPO)
    {
      bidId: "BID-HVLS-2026-2-001",
      visibleId: "HVLS-A-001",
      bidderId: "BDR-001",
      bidderName: "Lone Star Capital Partners LLC",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-A",
      poolLabel: "Pool A - Southeast",
      bidAmount: 72.5,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 12216250,
      timestamp: "2026-04-22T10:02:14-04:00",
      conformingStatus: "Conforming",
      nonConformingReason: null
    },
    {
      bidId: "BID-HVLS-2026-2-002",
      visibleId: "HVLS-A-002",
      bidderId: "BDR-003",
      bidderName: "Pinnacle Asset Recovery Group",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-A",
      poolLabel: "Pool A - Southeast",
      bidAmount: 68.2,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 11487700,
      timestamp: "2026-04-22T10:05:42-04:00",
      conformingStatus: "Conforming",
      nonConformingReason: null
    },
    {
      bidId: "BID-HVLS-2026-2-003",
      visibleId: "HVLS-A-003",
      bidderId: "BDR-005",
      bidderName: "National Community Stabilization Trust",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-A",
      poolLabel: "Pool A - Southeast",
      bidAmount: 62.8,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 10581800,
      timestamp: "2026-04-22T10:08:31-04:00",
      conformingStatus: "Conforming",
      nonConformingReason: null,
      missionBid: true
    },

    // Pool B - Northeast ($17.23M aggregate BPO)
    {
      bidId: "BID-HVLS-2026-2-004",
      visibleId: "HVLS-B-001",
      bidderId: "BDR-002",
      bidderName: "Atlantic Residential Mortgage Trust",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-B",
      poolLabel: "Pool B - Northeast",
      bidAmount: 75.4,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 12991420,
      timestamp: "2026-04-22T10:01:08-04:00",
      conformingStatus: "Conforming",
      nonConformingReason: null
    },
    {
      bidId: "BID-HVLS-2026-2-005",
      visibleId: "HVLS-B-002",
      bidderId: "BDR-001",
      bidderName: "Lone Star Capital Partners LLC",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-B",
      poolLabel: "Pool B - Northeast",
      bidAmount: 71.0,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 12233300,
      timestamp: "2026-04-22T10:03:55-04:00",
      conformingStatus: "Conforming",
      nonConformingReason: null
    },
    {
      bidId: "BID-HVLS-2026-2-006",
      visibleId: "HVLS-B-003",
      bidderId: "BDR-003",
      bidderName: "Pinnacle Asset Recovery Group",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-B",
      poolLabel: "Pool B - Northeast",
      bidAmount: 55.3,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 9528190,
      timestamp: "2026-04-22T10:06:18-04:00",
      conformingStatus: "Non-Conforming",
      nonConformingReason: "Bid deposit received after 10:00 AM ET deadline. Wire confirmation timestamp 10:04 AM ET, 4 minutes past cutoff per BIP Section 4.2(a)."
    },

    // Pool C - National ($14.89M aggregate BPO)
    {
      bidId: "BID-HVLS-2026-2-007",
      visibleId: "HVLS-C-001",
      bidderId: "BDR-001",
      bidderName: "Lone Star Capital Partners LLC",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-C",
      poolLabel: "Pool C - National",
      bidAmount: 78.1,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 11629090,
      timestamp: "2026-04-22T10:02:48-04:00",
      conformingStatus: "Conforming",
      nonConformingReason: null
    },
    {
      bidId: "BID-HVLS-2026-2-008",
      visibleId: "HVLS-C-002",
      bidderId: "BDR-002",
      bidderName: "Atlantic Residential Mortgage Trust",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-C",
      poolLabel: "Pool C - National",
      bidAmount: 74.6,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 11107940,
      timestamp: "2026-04-22T10:04:22-04:00",
      conformingStatus: "Conforming",
      nonConformingReason: null
    },
    {
      bidId: "BID-HVLS-2026-2-009",
      visibleId: "HVLS-C-003",
      bidderId: "BDR-007",
      bidderName: "Cook County Land Bank Authority",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-C",
      poolLabel: "Pool C - National",
      bidAmount: 58.5,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 8710650,
      timestamp: "2026-04-22T10:09:15-04:00",
      conformingStatus: "Conforming",
      nonConformingReason: null,
      missionBid: true
    },

    // Pool D - Metro Targeted ($6.45M aggregate BPO)
    {
      bidId: "BID-HVLS-2026-2-010",
      visibleId: "HVLS-D-001",
      bidderId: "BDR-005",
      bidderName: "National Community Stabilization Trust",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-D",
      poolLabel: "Pool D - Metro Targeted",
      bidAmount: 65.0,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 4192500,
      timestamp: "2026-04-22T10:07:02-04:00",
      conformingStatus: "Conforming",
      nonConformingReason: null,
      missionBid: true
    },
    {
      bidId: "BID-HVLS-2026-2-011",
      visibleId: "HVLS-D-002",
      bidderId: "BDR-007",
      bidderName: "Cook County Land Bank Authority",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-D",
      poolLabel: "Pool D - Metro Targeted",
      bidAmount: 60.2,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 3882900,
      timestamp: "2026-04-22T10:08:48-04:00",
      conformingStatus: "Conforming",
      nonConformingReason: null,
      missionBid: true
    },
    {
      bidId: "BID-HVLS-2026-2-012",
      visibleId: "HVLS-D-003",
      bidderId: "BDR-002",
      bidderName: "Atlantic Residential Mortgage Trust",
      saleId: "HVLS-2026-2",
      poolId: "HVLS-2026-2-D",
      poolLabel: "Pool D - Metro Targeted",
      bidAmount: 70.8,
      bidAmountUnit: "% of BPO",
      impliedDollarAmount: 4566600,
      timestamp: "2026-04-22T10:03:10-04:00",
      conformingStatus: "Non-Conforming",
      nonConformingReason: "Bidder submitted modification to servicing transfer timeline in Exhibit B, deviating from standard 60-day requirement per BIP Section 6.1(c). Modification not pre-approved."
    }
  ],

  // ── MHLS Historical Bids (Reference) ──────────────────────────────────
  mhls: [
    {
      bidId: "BID-MHLS-2025-1-001",
      visibleId: "MHLS-25-D2-001",
      bidderId: "BDR-002",
      bidderName: "Atlantic Residential Mortgage Trust",
      saleId: "MHLS-2025-1",
      dealId: "MHLS-2025-1-D2",
      dealName: "Oakwood Manor Apartments (216 units, Atlanta GA)",
      bidAmount: 18750000,
      bidAmountUnit: "dollars",
      bidAsPercentOfUPB: 82.4,
      upb: 22750000,
      timestamp: "2025-11-18T10:01:45-05:00",
      conformingStatus: "Conforming",
      nonConformingReason: null,
      awardStatus: "Awarded"
    },
    {
      bidId: "BID-MHLS-2025-1-002",
      visibleId: "MHLS-25-D2-002",
      bidderId: "BDR-001",
      bidderName: "Lone Star Capital Partners LLC",
      saleId: "MHLS-2025-1",
      dealId: "MHLS-2025-1-D2",
      dealName: "Oakwood Manor Apartments (216 units, Atlanta GA)",
      bidAmount: 17200000,
      bidAmountUnit: "dollars",
      bidAsPercentOfUPB: 75.6,
      upb: 22750000,
      timestamp: "2025-11-18T10:03:22-05:00",
      conformingStatus: "Conforming",
      nonConformingReason: null,
      awardStatus: "Not Awarded"
    },
    {
      bidId: "BID-MHLS-2025-1-003",
      visibleId: "MHLS-25-D5-001",
      bidderId: "BDR-002",
      bidderName: "Atlantic Residential Mortgage Trust",
      saleId: "MHLS-2025-1",
      dealId: "MHLS-2025-1-D5",
      dealName: "Greenfield Health Center (120 beds, Nashville TN)",
      bidAmount: 11400000,
      bidAmountUnit: "dollars",
      bidAsPercentOfUPB: 71.3,
      upb: 15990000,
      timestamp: "2025-11-18T10:02:18-05:00",
      conformingStatus: "Conforming",
      nonConformingReason: null,
      awardStatus: "Awarded"
    }
  ]
};

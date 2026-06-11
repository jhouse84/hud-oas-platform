/**
 * HUD Loan Sale Platform — Virtual Data Room (VDR) Engine
 * House Strategies Group LLC
 *
 * Handles:
 *   - Document tree building (folder hierarchy per sale)
 *   - Access logging (who viewed what, when)
 *   - Download tracking
 *   - Q&A threads (integrated with HSG.state.qa)
 *   - Watermarked preview (simulated client-side)
 *   - Search/filter
 *   - Access permissions by bidder qualification status
 *
 * Future integration points (TODO: [AWS/S3]):
 *   - Actual file storage in AWS S3 with signed URLs (presigned URLs expire in 5-10 min)
 *   - PDF watermarking done server-side (Lambda + PDFKit)
 *   - Download analytics persisted to DynamoDB
 *   - Access control via AWS Cognito / custom JWT
 */
window.HSG = window.HSG || {};

HSG.vdr = (function () {
  'use strict';

  var state = HSG.state;
  var u = HSG.utils;

  /* ========================================================================
     DOCUMENT TREE
     Builds a hierarchical folder structure from flat document manifest.
     ======================================================================== */

  /**
   * Get the complete document tree for a sale, organized by category.
   * Returns: { folders: [{id, label, docs, subFolders}], totalDocs, totalSize }
   */
  function getTree(saleId) {
    var sale = findSale(saleId);
    if (!sale) return { folders: [], totalDocs: 0, totalSize: '0 MB' };

    var program = sale.programType;
    var tree = buildTreeForProgram(program, saleId);

    // Always populate synthetic docs on leaf folders so tree has content.
    // When real documents manifest is wired (production), it will layer on top.
    var allFolders = flattenFolders(tree.folders);
    allFolders.forEach(function (f) {
      if (f.docs.length === 0 && (!f.subFolders || !f.subFolders.length)) {
        f.docs = generateSyntheticDocs(f);
      }
    });

    // Compute totals
    var totals = countTree(tree.folders);
    tree.totalDocs = totals.count;
    tree.totalSize = totals.size;

    return tree;
  }

  function buildTreeForProgram(program, saleId) {
    var common = [
      folder('fo-fr', 'Federal Register Notice', []),
      folder('fo-bip', 'Bidder Information Package (BIP)', []),
      folder('fo-cert', 'Qualification Certification Forms', []),
      folder('fo-nda', 'Confidentiality Agreement (NDA)', [])
    ];

    var programSpecific;
    if (program === 'HVLS' || program === 'HNVLS') {
      programSpecific = [
        folder('fo-loan-tape', 'Loan Tape & ALD', []),
        folder('fo-loan-files', 'Individual Loan Files', [
          folder('fo-bpo', 'Broker Price Opinions (BPO)', []),
          folder('fo-occ', 'Occupancy Inspection Reports', []),
          folder('fo-photos', 'Property Photos', []),
          folder('fo-env', 'Environmental Reports', []),
          folder('fo-col', 'Collateral Documents', []),
          folder('fo-serv', 'Servicing History', []),
          folder('fo-ass', 'Assignment Chains', []),
          folder('fo-title', 'Title & Lien Reports', []),
          folder('fo-tax', 'Tax Status', []),
          folder('fo-ins', 'Insurance Records', [])
        ]),
        folder('fo-caa', 'Draft CAA Template', []),
        folder('fo-psa', 'Draft PSA Template', []),
        folder('fo-desk', 'Desk Guide', [])
      ];
    } else if (program === 'SFLS') {
      programSpecific = [
        folder('fo-loan-tape', 'Loan Tape & ALD', []),
        folder('fo-loan-files', 'Individual Loan Files', [
          folder('fo-servicing', 'Complete Servicing History', []),
          folder('fo-default', 'Default & Forbearance History', []),
          folder('fo-loss-mit', 'Loss Mitigation Activity', []),
          folder('fo-bpo-sfls', 'Property BPOs', []),
          folder('fo-col-sfls', 'Collateral Files', []),
          folder('fo-borrower', 'Borrower Correspondence', [])
        ]),
        folder('fo-nso', 'Neighborhood Stabilization Outcome (NSO) Docs', []),
        folder('fo-caa', 'Draft CAA Template', []),
        folder('fo-isa', 'Draft ISA Template', []),
        folder('fo-desk', 'Desk Guide', [])
      ];
    } else if (program === 'MHLS' || program === 'HLS') {
      programSpecific = [
        folder('fo-deals', 'Deal-Level Documents', [
          folder('fo-loan-docs', 'Loan Documents', []),
          folder('fo-property-docs', 'Property Documents', []),
          folder('fo-regulatory', 'Regulatory Agreements', []),
          folder('fo-hap', 'HAP Contracts', []),
          folder('fo-lihtc', 'LIHTC Documents', []),
          folder('fo-operational', 'Operational & Financial', []),
          folder('fo-environmental', 'Environmental Reports', []),
          folder('fo-legal', 'Legal & Compliance', [])
        ]),
        folder('fo-bip-mhls', 'MHLS-Specific BIP Addendum', []),
        folder('fo-caa', 'Draft Loan Sale Agreement', []),
        folder('fo-desk', 'Desk Guide', [])
      ];
    } else {
      programSpecific = [];
    }

    return {
      saleId: saleId,
      program: program,
      folders: common.concat(programSpecific)
    };
  }

  function folder(id, label, subFolders) {
    return {
      id: id,
      label: label,
      docs: [],
      subFolders: subFolders || []
    };
  }

  function findManifestForSale(saleId, program) {
    var docs = window.HSG_DATA.documents;
    if (program === 'HVLS' || program === 'HNVLS') return docs.hvls || docs.HVLS || null;
    if (program === 'MHLS' || program === 'HLS') return docs.mhlsVol1 || docs.MHLS || null;
    return null;
  }

  function enrichTreeWithManifest(tree, manifest) {
    // Stub — for demo, just generate synthetic docs per folder
    var folders = flattenFolders(tree.folders);
    folders.forEach(function (f) {
      if (f.docs.length === 0) {
        f.docs = generateSyntheticDocs(f);
      }
    });
  }

  function flattenFolders(folders) {
    var out = [];
    folders.forEach(function (f) {
      out.push(f);
      if (f.subFolders && f.subFolders.length) {
        out = out.concat(flattenFolders(f.subFolders));
      }
    });
    return out;
  }

  function generateSyntheticDocs(folder) {
    // For demo: generate 3-8 realistic doc entries per leaf folder
    if (folder.subFolders && folder.subFolders.length > 0) return [];
    var count = 3 + Math.floor(Math.random() * 6);
    var docs = [];
    var docTypes = docTypesForFolder(folder);
    for (var i = 0; i < count; i++) {
      var dt = docTypes[i % docTypes.length];
      docs.push({
        docId: 'DOC-' + folder.id + '-' + (i + 1).toString().padStart(3, '0'),
        name: dt.name + (count > 1 ? ' (' + (i + 1) + ')' : ''),
        type: dt.ext,
        size: dt.size,
        uploadedAt: randomDate(-90, -1),
        version: 1,
        pages: dt.pages || null,
        watermarked: true,
        restricted: dt.restricted || false
      });
    }
    return docs;
  }

  function docTypesForFolder(folder) {
    var label = (folder.label || '').toLowerCase();
    if (label.indexOf('bpo') >= 0) {
      return [
        { name: 'BPO Report', ext: 'pdf', size: '2.4 MB', pages: 12 },
        { name: 'BPO Addendum', ext: 'pdf', size: '1.1 MB', pages: 4 },
        { name: 'BPO Valuation Methodology', ext: 'pdf', size: '820 KB', pages: 6 }
      ];
    }
    if (label.indexOf('photo') >= 0) {
      return [
        { name: 'Exterior Photos', ext: 'zip', size: '18.2 MB' },
        { name: 'Interior Photos', ext: 'zip', size: '24.6 MB' }
      ];
    }
    if (label.indexOf('environmental') >= 0) {
      return [
        { name: 'Phase I Environmental Site Assessment', ext: 'pdf', size: '8.4 MB', pages: 62 },
        { name: 'Asbestos Survey', ext: 'pdf', size: '2.1 MB', pages: 18 }
      ];
    }
    if (label.indexOf('title') >= 0) {
      return [
        { name: 'Title Commitment', ext: 'pdf', size: '1.8 MB', pages: 22 },
        { name: 'Prior Title Policy', ext: 'pdf', size: '1.2 MB', pages: 14 },
        { name: 'Lien Search', ext: 'pdf', size: '640 KB', pages: 8 }
      ];
    }
    if (label.indexOf('occ') >= 0) {
      return [
        { name: 'Vacancy Confirmation Report', ext: 'pdf', size: '1.3 MB', pages: 6 },
        { name: 'Inspector Affidavit', ext: 'pdf', size: '420 KB', pages: 2 }
      ];
    }
    if (label.indexOf('loan tape') >= 0 || label.indexOf('ald') >= 0) {
      return [
        { name: 'Aggregate Loan Data (ALD)', ext: 'xlsx', size: '4.8 MB', restricted: true },
        { name: 'Loan Tape — Complete', ext: 'xlsx', size: '12.6 MB', restricted: true },
        { name: 'Data Dictionary', ext: 'pdf', size: '1.2 MB', pages: 24 }
      ];
    }
    if (label.indexOf('fr') >= 0 || label.indexOf('federal') >= 0) {
      return [
        { name: 'Federal Register Notice', ext: 'pdf', size: '620 KB', pages: 8 },
        { name: 'FRN Amendment', ext: 'pdf', size: '240 KB', pages: 3 }
      ];
    }
    if (label.indexOf('bip') >= 0 || label.indexOf('bidder') >= 0) {
      return [
        { name: 'Bidder Information Package', ext: 'pdf', size: '6.4 MB', pages: 84 },
        { name: 'BIP Exhibits A-D', ext: 'pdf', size: '2.8 MB', pages: 36 },
        { name: 'Bid Submission Form', ext: 'pdf', size: '180 KB', pages: 2 }
      ];
    }
    if (label.indexOf('cert') >= 0 || label.indexOf('qualification') >= 0) {
      return [
        { name: 'HUD-9611 (SF/HVLS Qualification)', ext: 'pdf', size: '240 KB', pages: 4 },
        { name: 'HUD-90092 (MHLS Qualification)', ext: 'pdf', size: '280 KB', pages: 6 },
        { name: 'OFAC Certification', ext: 'pdf', size: '120 KB', pages: 1 }
      ];
    }
    if (label.indexOf('nda') >= 0 || label.indexOf('confidentiality') >= 0) {
      return [
        { name: 'Confidentiality & Non-Disclosure Agreement', ext: 'pdf', size: '340 KB', pages: 12 }
      ];
    }
    if (label.indexOf('caa') >= 0 || label.indexOf('psa') >= 0 || label.indexOf('isa') >= 0 || label.indexOf('loan sale') >= 0) {
      return [
        { name: 'Draft Agreement Template', ext: 'pdf', size: '1.8 MB', pages: 64 },
        { name: 'Agreement Exhibits', ext: 'pdf', size: '980 KB', pages: 22 }
      ];
    }
    if (label.indexOf('desk') >= 0) {
      return [
        { name: 'Transaction Desk Guide', ext: 'pdf', size: '2.2 MB', pages: 48 }
      ];
    }
    if (label.indexOf('servicing') >= 0) {
      return [
        { name: 'Full Servicing History', ext: 'pdf', size: '4.2 MB', pages: 86 },
        { name: 'Payment Ledger', ext: 'xlsx', size: '840 KB' },
        { name: 'Servicing Notes', ext: 'pdf', size: '1.4 MB', pages: 24 }
      ];
    }
    if (label.indexOf('hap') >= 0) {
      return [
        { name: 'HAP Contract', ext: 'pdf', size: '1.6 MB', pages: 28 },
        { name: 'HAP Renewal Documentation', ext: 'pdf', size: '820 KB', pages: 12 }
      ];
    }
    if (label.indexOf('lihtc') >= 0) {
      return [
        { name: 'LIHTC Regulatory Agreement', ext: 'pdf', size: '2.1 MB', pages: 36 },
        { name: 'Extended Use Agreement', ext: 'pdf', size: '1.4 MB', pages: 22 }
      ];
    }
    if (label.indexOf('regulatory') >= 0) {
      return [
        { name: 'HUD Regulatory Agreement', ext: 'pdf', size: '1.8 MB', pages: 32 },
        { name: 'Use Agreement', ext: 'pdf', size: '920 KB', pages: 16 }
      ];
    }
    // Default
    return [
      { name: 'Document', ext: 'pdf', size: '1.2 MB', pages: 12 }
    ];
  }

  function randomDate(minDaysAgo, maxDaysAgo) {
    var days = minDaysAgo + Math.random() * (maxDaysAgo - minDaysAgo);
    return new Date(Date.now() + days * 86400000).toISOString();
  }

  function countTree(folders) {
    var count = 0;
    var totalBytes = 0;
    function walk(fs) {
      fs.forEach(function (f) {
        count += f.docs.length;
        f.docs.forEach(function (d) {
          totalBytes += parseSize(d.size);
        });
        if (f.subFolders && f.subFolders.length) walk(f.subFolders);
      });
    }
    walk(folders);
    return { count: count, size: formatBytes(totalBytes) };
  }

  function parseSize(s) {
    if (!s) return 0;
    var m = s.match(/^([\d.]+)\s*(KB|MB|GB)?$/i);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    var unit = (m[2] || 'MB').toUpperCase();
    if (unit === 'KB') return n * 1024;
    if (unit === 'MB') return n * 1024 * 1024;
    if (unit === 'GB') return n * 1024 * 1024 * 1024;
    return n;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function findSale(saleId) {
    if (!window.HSG_DATA || !window.HSG_DATA.sales) return null;
    return window.HSG_DATA.sales.find(function (s) { return s.id === saleId; });
  }

  /* ========================================================================
     DOCUMENT ACCESS
     ======================================================================== */

  /**
   * Log a document view/download.
   * TODO: [AWS/API] POST to /api/vdr/access for server-side audit trail.
   */
  function recordAccess(entry) {
    return state.docAccess.log({
      docId: entry.docId,
      docName: entry.docName,
      saleId: entry.saleId,
      bidderId: entry.bidderId || state.userPrefs.get('currentBidderId'),
      bidderName: entry.bidderName || 'Current User',
      action: entry.action || 'view', // 'view' | 'download'
      folder: entry.folder
    });
  }

  /**
   * Get a watermarked preview URL for a document.
   * TODO: [AWS/S3] This should return a presigned S3 URL with server-side
   * watermark Lambda applied (bidder ID + timestamp overlay).
   */
  function previewUrl(docId, bidderId) {
    // Client-side placeholder — shows a watermarked viewer
    return '#preview/' + docId + '?watermark=' + encodeURIComponent(bidderId || 'guest');
  }

  /**
   * Simulate a download (for demo).
   * TODO: [AWS/S3] Trigger download of presigned S3 URL.
   */
  function downloadDoc(doc, saleId, bidderId) {
    recordAccess({
      docId: doc.docId,
      docName: doc.name,
      saleId: saleId,
      bidderId: bidderId,
      action: 'download'
    });
    // For demo, create a dummy text file to trigger browser download
    var content = '[HUD Asset Sales VDR]\n' +
      'Document: ' + doc.name + '\n' +
      'Doc ID: ' + doc.docId + '\n' +
      'Sale: ' + saleId + '\n' +
      'Bidder: ' + (bidderId || 'Guest') + '\n' +
      'Watermark: ' + (bidderId || 'Guest') + ' · ' + new Date().toISOString() + '\n\n' +
      '[In production, this would download the actual S3-stored file with watermark applied]';
    var blob = new Blob([content], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = doc.name.replace(/[^a-z0-9.-]/gi, '_') + '.' + (doc.type || 'pdf');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 100);
  }

  /* ========================================================================
     SEARCH / FILTER
     ======================================================================== */

  function searchTree(saleId, query) {
    if (!query) return [];
    var q = query.toLowerCase();
    var tree = getTree(saleId);
    var results = [];
    function walk(folders, path) {
      folders.forEach(function (f) {
        var currentPath = path ? path + ' / ' + f.label : f.label;
        f.docs.forEach(function (d) {
          if (d.name.toLowerCase().indexOf(q) >= 0 || d.docId.toLowerCase().indexOf(q) >= 0) {
            results.push({ doc: d, folder: f.label, path: currentPath });
          }
        });
        if (f.subFolders && f.subFolders.length) walk(f.subFolders, currentPath);
      });
    }
    walk(tree.folders, '');
    return results;
  }

  /* ========================================================================
     PERMISSIONS
     ======================================================================== */

  /**
   * Check if a bidder can access a restricted document.
   * Restricted docs (ALD, loan tape) require full qualification.
   */
  function canAccess(bidderId, doc) {
    if (!doc.restricted) return true;
    // Check bidder qualification
    var bidders = window.HSG_DATA && window.HSG_DATA.bidders || [];
    var bidder = bidders.find(function (b) { return b.bidderId === bidderId; });
    if (!bidder) return false;
    return bidder.qualificationStatus.indexOf('Qualified') >= 0;
  }

  /* ========================================================================
     PUBLIC API
     ======================================================================== */
  return {
    getTree: getTree,
    recordAccess: recordAccess,
    previewUrl: previewUrl,
    downloadDoc: downloadDoc,
    searchTree: searchTree,
    canAccess: canAccess,
    formatBytes: formatBytes,
    flattenFolders: flattenFolders
  };
})();

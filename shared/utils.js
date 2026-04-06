// === HSG Platform — Utilities ===
window.HSG = window.HSG || {};

HSG.utils = {
  // Format currency: 1234567 → "$1,234,567"
  currency: function(val, decimals) {
    if (val == null || isNaN(val)) return '—';
    decimals = decimals !== undefined ? decimals : 0;
    return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  },

  // Compact currency: 1234567 → "$1.2M"
  currencyCompact: function(val) {
    if (val == null || isNaN(val)) return '—';
    var n = Number(val);
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
  },

  // Format number with commas
  number: function(val) {
    if (val == null || isNaN(val)) return '—';
    return Number(val).toLocaleString('en-US');
  },

  // Format percentage: 0.654 → "65.4%"
  percent: function(val, decimals) {
    if (val == null || isNaN(val)) return '—';
    decimals = decimals !== undefined ? decimals : 1;
    // If value > 1, assume it's already a percentage
    var pct = Number(val) > 1 ? Number(val) : Number(val) * 100;
    return pct.toFixed(decimals) + '%';
  },

  // Format date: ISO string → "Mar 15, 2026"
  date: function(val) {
    if (!val) return '—';
    var d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  // Format date short: "Mar 15"
  dateShort: function(val) {
    if (!val) return '—';
    var d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },

  // Relative date: "3 days ago", "in 5 days"
  dateRelative: function(val) {
    if (!val) return '—';
    var d = new Date(val);
    var now = new Date();
    var diff = Math.floor((d - now) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 0) return 'in ' + diff + ' days';
    return Math.abs(diff) + ' days ago';
  },

  // Days until a date
  daysUntil: function(val) {
    if (!val) return null;
    var d = new Date(val);
    var now = new Date();
    return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
  },

  // Truncate text
  truncate: function(str, len) {
    if (!str) return '';
    len = len || 80;
    return str.length > len ? str.substring(0, len) + '...' : str;
  },

  // Get initials from name
  initials: function(name) {
    if (!name) return '??';
    return name.split(' ').map(function(p) { return p[0]; }).join('').toUpperCase().substring(0, 2);
  },

  // Generate a simple unique ID
  uid: function() {
    return 'id_' + Math.random().toString(36).substring(2, 9);
  },

  // Debounce
  debounce: function(fn, ms) {
    var timer;
    return function() {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function() { fn.apply(ctx, args); }, ms || 300);
    };
  },

  // Set innerHTML safely and return the container
  render: function(selector, html) {
    var el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (el) el.innerHTML = html;
    return el;
  },

  // Create element from HTML string
  createElement: function(html) {
    var div = document.createElement('div');
    div.innerHTML = html.trim();
    return div.firstChild;
  },

  // Simple CSV export from array of objects
  exportCSV: function(data, filename) {
    if (!data || !data.length) return;
    var headers = Object.keys(data[0]);
    var csv = headers.join(',') + '\n';
    data.forEach(function(row) {
      csv += headers.map(function(h) {
        var val = (row[h] != null ? row[h] : '').toString();
        return val.indexOf(',') >= 0 || val.indexOf('"') >= 0 || val.indexOf('\n') >= 0
          ? '"' + val.replace(/"/g, '""') + '"' : val;
      }).join(',') + '\n';
    });
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || 'export.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  },

  // Program type display info
  programInfo: {
    HVLS:  { label: 'HVLS',  full: 'HECM Vacant Loan Sale',       color: 'hvls',  valueLabel: 'BPO' },
    HNVLS: { label: 'HNVLS', full: 'HECM Non-Vacant Loan Sale',   color: 'hnvls', valueLabel: 'ETD' },
    SFLS:  { label: 'SFLS',  full: 'Single Family Loan Sale',      color: 'sfls',  valueLabel: 'UPB' },
    MHLS:  { label: 'MHLS',  full: 'Multifamily & Healthcare',     color: 'mhls',  valueLabel: 'UPB' },
    HLS:   { label: 'HLS',   full: 'Healthcare Loan Sale',         color: 'hls',   valueLabel: 'UPB' }
  }
};

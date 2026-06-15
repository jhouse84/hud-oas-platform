/**
 * HSG.geo — tiny self-contained US geography helper for the pool map.
 *
 * No external tiles, scripts, or API keys (the platform CSP is img-src 'self'
 * and blocks external map tiles + iframes). We project property locations onto
 * an inline SVG of the continental US using state centroids plus a deterministic
 * per-loan jitter, so a pool's geographic spread is visible. Exact street-level
 * detail is provided per property via a Google Maps link (a new-tab navigation,
 * which CSP does not restrict), not an embed.
 */
window.HSG = window.HSG || {};

HSG.geo = (function () {
  'use strict';

  // Approximate geographic center of each state (lat, lng).
  var C = {
    AL: [32.8, -86.8], AZ: [34.2, -111.7], AR: [34.9, -92.4], CA: [37.2, -119.4], CO: [39.0, -105.5],
    CT: [41.6, -72.7], DE: [39.0, -75.5], DC: [38.9, -77.0], FL: [28.6, -82.4], GA: [32.9, -83.4],
    ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3], IA: [42.0, -93.5], KS: [38.5, -98.4],
    KY: [37.6, -85.3], LA: [31.0, -92.0], ME: [45.4, -69.2], MD: [39.0, -76.8], MA: [42.3, -71.8],
    MI: [44.0, -85.4], MN: [46.3, -94.3], MS: [32.7, -89.7], MO: [38.4, -92.5], MT: [46.9, -110.0],
    NE: [41.5, -99.8], NV: [39.3, -116.6], NH: [43.7, -71.6], NJ: [40.1, -74.7], NM: [34.4, -106.1],
    NY: [42.9, -75.5], NC: [35.5, -79.4], ND: [47.5, -100.5], OH: [40.3, -82.8], OK: [35.6, -97.5],
    OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.5], SC: [33.9, -80.9], SD: [44.4, -100.2],
    TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7], VT: [44.1, -72.7], VA: [37.6, -78.8],
    WA: [47.4, -120.5], WV: [38.6, -80.6], WI: [44.6, -89.9], WY: [43.0, -107.5]
  };

  // Continental-US bounds for an equirectangular fit.
  var LNG0 = -125, LNG1 = -66, LAT0 = 24.0, LAT1 = 49.6;

  function project(lat, lng, w, h) {
    var x = (lng - LNG0) / (LNG1 - LNG0) * w;
    var y = (LAT1 - lat) / (LAT1 - LAT0) * h;
    return { x: Math.max(6, Math.min(w - 6, x)), y: Math.max(6, Math.min(h - 6, y)) };
  }

  // Deterministic small jitter from a string, so multiple pins in one state spread out.
  function jitter(seed) {
    var h = 0;
    for (var i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
    var a = (Math.abs(h) % 1000) / 1000, b = (Math.abs(h >> 7) % 1000) / 1000;
    return { dlat: (a - 0.5) * 1.6, dlng: (b - 0.5) * 2.4 };   // up to ~0.8 deg lat / 1.2 deg lng
  }

  function centroid(state) { return C[(state || '').toUpperCase()] || null; }

  // Position for a loan: its state centroid plus a stable jitter. Returns {x,y,state} or null.
  function pointFor(loan, w, h) {
    var st = (loan.property && loan.property.state) || loan.state;
    var c = centroid(st);
    if (!c) return null;
    var j = jitter(loan.loan_id || loan.loanId || (st + Math.random()));
    return Object.assign(project(c[0] + j.dlat, c[1] + j.dlng, w, h), { state: st });
  }

  // Labelled state centroids for the states present, for map orientation.
  function stateLabels(states, w, h) {
    return (states || []).map(function (st) {
      var c = centroid(st); if (!c) return null;
      var p = project(c[0], c[1], w, h);
      return { state: st, x: p.x, y: p.y };
    }).filter(Boolean);
  }

  // Build a Google Maps link to the property (opens in a new tab; CSP-safe).
  function mapsUrl(loan) {
    var p = loan.property || {};
    var q = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q || (p.city + ' ' + p.state));
  }

  return { centroid: centroid, project: project, pointFor: pointFor, stateLabels: stateLabels, mapsUrl: mapsUrl, BOUNDS: { LNG0: LNG0, LNG1: LNG1, LAT0: LAT0, LAT1: LAT1 } };
})();

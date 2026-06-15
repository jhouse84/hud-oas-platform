// === HSG Platform — Simple Hash Router ===
// Usage: HSG.router.on('/sales', renderSales); HSG.router.start();

window.HSG = window.HSG || {};

HSG.router = (function() {
  var routes = {};
  var notFound = null;
  var currentRoute = null;

  function getHash() {
    var h = window.location.hash.replace(/^#\/?/, '/');
    return h || '/';
  }

  function matchRoute(path) {
    // Exact match first
    if (routes[path]) return { handler: routes[path], params: {} };

    // Parameterized match (e.g., /data-room/:saleId)
    for (var pattern in routes) {
      var parts = pattern.split('/');
      var pathParts = path.split('/');
      if (parts.length !== pathParts.length) continue;

      var params = {};
      var match = true;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].charAt(0) === ':') {
          params[parts[i].substring(1)] = decodeURIComponent(pathParts[i]);
        } else if (parts[i] !== pathParts[i]) {
          match = false;
          break;
        }
      }
      if (match) return { handler: routes[pattern], params: params };
    }

    return null;
  }

  function resolve() {
    var path = getHash();
    if (path === currentRoute) return;
    currentRoute = path;

    var result = matchRoute(path);
    if (result) {
      result.handler(result.params);
    } else if (notFound) {
      notFound(path);
    }

    // Update active nav items. data-route values may carry a leading '#'
    // (e.g. "#/settlements"); getHash() returns a bare path ("/settlements"),
    // so normalize before comparing or nothing ever matches.
    document.querySelectorAll('[data-route]').forEach(function(el) {
      var route = (el.getAttribute('data-route') || '').replace(/^#/, '');
      if (route && (path === route || (route !== '/' && path.indexOf(route) === 0))) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });
  }

  function on(path, handler) {
    routes[path] = handler;
    return HSG.router;
  }

  function onNotFound(handler) {
    notFound = handler;
    return HSG.router;
  }

  function navigate(path) {
    window.location.hash = '#' + path;
  }

  function start() {
    window.addEventListener('hashchange', resolve);
    resolve();
    return HSG.router;
  }

  function getParams() {
    var path = getHash();
    var result = matchRoute(path);
    return result ? result.params : {};
  }

  function currentPortal() {
    var host = (window.location && window.location.hostname) || '';
    if (host.indexOf('residential') === 0) return 'residential';
    if (host.indexOf('commercial')  === 0) return 'commercial';
    if (host.indexOf('admin')       === 0) return 'admin';
    var path = window.location.pathname || '';
    if (path.indexOf('/residential') === 0) return 'residential';
    if (path.indexOf('/commercial')  === 0) return 'commercial';
    if (path.indexOf('/admin')       === 0) return 'admin';
    return null;
  }

  function portalHome(portal) {
    portal = portal || currentPortal();
    if (portal === 'residential') return '/residential/index.html';
    if (portal === 'commercial')  return '/commercial/index.html';
    if (portal === 'admin')       return '/admin/index.html';
    return '/';
  }

  function requireAuth(redirectTo) {
    if (!HSG.cognito || !HSG.cognito.isAuthenticated()) {
      var portal = currentPortal();
      var login = portal ? ('/' + portal + '/login.html') : '/';
      window.location.href = login + (redirectTo ? ('?next=' + encodeURIComponent(redirectTo)) : '');
      return false;
    }
    return true;
  }

  return {
    on: on,
    onNotFound: onNotFound,
    navigate: navigate,
    start: start,
    getHash: getHash,
    getParams: getParams,
    currentPortal: currentPortal,
    portalHome: portalHome,
    requireAuth: requireAuth
  };
})();

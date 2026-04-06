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

    // Update active nav items
    document.querySelectorAll('[data-route]').forEach(function(el) {
      var route = el.getAttribute('data-route');
      if (path === route || (route !== '/' && path.indexOf(route) === 0)) {
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

  return {
    on: on,
    onNotFound: onNotFound,
    navigate: navigate,
    start: start,
    getHash: getHash,
    getParams: getParams
  };
})();

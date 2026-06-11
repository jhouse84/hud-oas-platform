/**
 * HSG.state — In-memory cache + pub/sub layer over HSG.api.
 *
 * Production v1: NO localStorage as primary store. Source of truth is the
 * backend (DDB via HSG.api). HSG.state.cache holds the most recent fetched
 * snapshot and notifies subscribers on change so views can re-render without
 * re-fetching.
 *
 * Pages that need a list:
 *   await HSG.state.sales.refresh();           // pulls + caches
 *   const list = HSG.state.sales.snapshot();   // sync read of cache
 *   HSG.state.sales.subscribe(view.render);    // reactive view
 *
 * Mutations are wrappers over HSG.api that refresh affected caches:
 *   await HSG.state.bidders.approve(id, { note });
 */
window.HSG = window.HSG || {};

HSG.state = (function () {
  'use strict';

  function makeStore(fetchFn) {
    var data = null;
    var loading = false;
    var error = null;
    var subscribers = [];
    var lastFetchedAt = null;

    function notify() {
      subscribers.forEach(function (fn) {
        try { fn(data, { loading: loading, error: error, fetchedAt: lastFetchedAt }); } catch (e) {}
      });
    }

    function refresh(args) {
      loading = true; error = null; notify();
      return Promise.resolve(fetchFn(args)).then(function (res) {
        data = res; loading = false; lastFetchedAt = Date.now(); notify();
        return res;
      }).catch(function (e) {
        error = e; loading = false; notify();
        throw e;
      });
    }

    return {
      snapshot: function () { return data; },
      isLoading: function () { return loading; },
      lastError: function () { return error; },
      lastFetchedAt: function () { return lastFetchedAt; },
      subscribe: function (fn) {
        subscribers.push(fn);
        if (data) try { fn(data, { loading: false, error: null, fetchedAt: lastFetchedAt }); } catch (e) {}
        return function () { subscribers = subscribers.filter(function (s) { return s !== fn; }); };
      },
      refresh: refresh,
      reset: function () { data = null; loading = false; error = null; lastFetchedAt = null; notify(); }
    };
  }

  var sales = makeStore(function (args) {
    return HSG.api.sales.list(args || {}).then(function (r) {
      return r && r.sales ? r.sales : (Array.isArray(r) ? r : []);
    });
  });

  var bidders = Object.assign(makeStore(function (args) {
    return HSG.api.bidders.list(args || {}).then(function (r) {
      return r && r.bidders ? r.bidders : (Array.isArray(r) ? r : []);
    });
  }), {
    approve: function (bidderId, payload) {
      return HSG.api.bidders.approve(bidderId, payload).then(function (res) {
        return bidders.refresh().then(function () { return res; });
      });
    },
    reject: function (bidderId, payload) {
      return HSG.api.bidders.reject(bidderId, payload).then(function (res) {
        return bidders.refresh().then(function () { return res; });
      });
    },
    requestInfo: function (bidderId, payload) {
      return HSG.api.bidders.requestInfo(bidderId, payload).then(function (res) {
        return bidders.refresh().then(function () { return res; });
      });
    }
  });

  var bids = Object.assign(makeStore(function (args) {
    return HSG.api.bids.list(args || {}).then(function (r) {
      return r && r.bids ? r.bids : (Array.isArray(r) ? r : []);
    });
  }), {
    submit: function (bid) {
      return HSG.api.bids.submit(bid).then(function (res) {
        return bids.refresh().then(function () { return res; });
      });
    },
    withdraw: function (bidId, reason) {
      return HSG.api.bids.withdraw(bidId, reason).then(function (res) {
        return bids.refresh().then(function () { return res; });
      });
    }
  });

  var settlements = Object.assign(makeStore(function (args) {
    return HSG.api.settlements.list(args || {}).then(function (r) {
      return r && r.settlements ? r.settlements : (Array.isArray(r) ? r : []);
    });
  }), {
    updateMilestone: function (settlementId, idx, payload) {
      return HSG.api.settlements.updateMilestone(settlementId, idx, payload).then(function (res) {
        return settlements.refresh().then(function () { return res; });
      });
    },
    updateDeliverable: function (settlementId, deliverableId, payload) {
      return HSG.api.settlements.updateDeliverable(settlementId, deliverableId, payload).then(function (res) {
        return settlements.refresh().then(function () { return res; });
      });
    }
  });

  var qa = Object.assign(makeStore(function (args) {
    if (args && args.saleId) return HSG.api.qa.listForSale(args.saleId).then(function (r) { return r && r.qa ? r.qa : (Array.isArray(r) ? r : []); });
    return HSG.api.qa.listInbox(args && args.status).then(function (r) { return r && r.qa ? r.qa : (Array.isArray(r) ? r : []); });
  }), {
    ask: function (saleId, payload) {
      return HSG.api.qa.ask(saleId, payload).then(function (res) {
        return qa.refresh({ saleId: saleId }).then(function () { return res; });
      });
    },
    answer: function (qaId, answerText, refreshArgs) {
      return HSG.api.qa.answer(qaId, answerText).then(function (res) {
        return qa.refresh(refreshArgs || {}).then(function () { return res; });
      });
    }
  });

  var notifications = Object.assign(makeStore(function () {
    return HSG.api.notifications.list().then(function (r) {
      return r && r.notifications ? r.notifications : (Array.isArray(r) ? r : []);
    });
  }), {
    markRead: function (notifId) {
      return HSG.api.notifications.markRead(notifId).then(function (res) {
        return notifications.refresh().then(function () { return res; });
      });
    },
    markAllRead: function () {
      return HSG.api.notifications.markAllRead().then(function (res) {
        return notifications.refresh().then(function () { return res; });
      });
    },
    unreadCount: function () {
      var snap = notifications.snapshot() || [];
      return snap.filter(function (n) { return !n.readAt; }).length;
    }
  });

  var me = {
    claims: function () { return HSG.api.decodeClaims(); },
    bidderId: function () {
      var c = HSG.api.decodeClaims() || {};
      return c['custom:bidderId'] || null;
    },
    portal: function () { return HSG.api.currentPortal(); },
    isAdmin: function () {
      var c = HSG.api.decodeClaims() || {};
      var groups = c['cognito:groups'] || [];
      return groups.some(function (g) { return /^admin/.test(g); });
    }
  };

  return {
    sales: sales,
    bidders: bidders,
    bids: bids,
    settlements: settlements,
    qa: qa,
    notifications: notifications,
    me: me,
    resetAll: function () {
      sales.reset(); bidders.reset(); bids.reset();
      settlements.reset(); qa.reset(); notifications.reset();
    }
  };
})();

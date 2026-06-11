/**
 * HUD Loan Sale Platform — Notifications System
 * House Strategies Group LLC
 *
 * Handles:
 *   - Toast notifications (ephemeral, bottom-right)
 *   - Notification center (persistent, tied to HSG.state.notifs)
 *   - Connection health monitoring
 *
 * Future integration points:
 *   - TODO: [SendGrid] Server-side email notifications for critical events
 *     (bid confirmations, award notifications, deadline reminders)
 *   - TODO: [AWS SNS] Push notifications for mobile app
 *   - TODO: [WebSockets] Real-time admin alerts for new bids
 */
window.HSG = window.HSG || {};

HSG.notify = (function () {
  'use strict';

  // Lazy-resolve HSG.state because this file may load before state.js and the
  // new state shape (per-store subscribe) differs from the legacy global API.
  function state() { return window.HSG && window.HSG.state; }
  var toastContainer = null;
  var TOAST_ID_SEQ = 0;

  /* ========================================================================
     TOAST SYSTEM
     ======================================================================== */

  function ensureContainer() {
    if (toastContainer) return toastContainer;
    toastContainer = document.createElement('div');
    toastContainer.className = 'hsg-toast-container';
    toastContainer.style.cssText = [
      'position: fixed',
      'bottom: 20px',
      'right: 20px',
      'z-index: 9999',
      'display: flex',
      'flex-direction: column',
      'gap: 10px',
      'max-width: 380px',
      'pointer-events: none'
    ].join(';');
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function injectStyles() {
    if (document.getElementById('hsg-toast-styles')) return;
    var style = document.createElement('style');
    style.id = 'hsg-toast-styles';
    style.textContent = [
      '.hsg-toast {',
      '  pointer-events: auto;',
      '  background: #fff;',
      '  border: 1px solid rgba(0,0,0,0.08);',
      '  border-radius: 10px;',
      '  box-shadow: 0 12px 32px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.06);',
      '  padding: 14px 16px;',
      '  display: flex;',
      '  gap: 12px;',
      '  align-items: flex-start;',
      '  min-width: 320px;',
      '  max-width: 380px;',
      '  font-family: "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif;',
      '  font-size: 13px;',
      '  line-height: 1.45;',
      '  animation: hsg-toast-in 300ms cubic-bezier(0.16, 1, 0.3, 1);',
      '  position: relative;',
      '  overflow: hidden;',
      '}',
      '.hsg-toast.closing { animation: hsg-toast-out 240ms ease forwards; }',
      '.hsg-toast::before { content: ""; position: absolute; top: 0; left: 0; bottom: 0; width: 4px; }',
      '.hsg-toast.success::before { background: #10B981; }',
      '.hsg-toast.error::before { background: #EF4444; }',
      '.hsg-toast.warning::before { background: #F59E0B; }',
      '.hsg-toast.info::before { background: #3B82F6; }',
      '.hsg-toast-icon {',
      '  width: 28px; height: 28px; border-radius: 8px;',
      '  display: flex; align-items: center; justify-content: center;',
      '  flex-shrink: 0; margin-top: 1px;',
      '  font-weight: 700;',
      '}',
      '.hsg-toast.success .hsg-toast-icon { background: #ECFDF5; color: #059669; }',
      '.hsg-toast.error .hsg-toast-icon { background: #FEE2E2; color: #DC2626; }',
      '.hsg-toast.warning .hsg-toast-icon { background: #FEF3C7; color: #D97706; }',
      '.hsg-toast.info .hsg-toast-icon { background: #DBEAFE; color: #1E40AF; }',
      '.hsg-toast-body { flex: 1; min-width: 0; }',
      '.hsg-toast-title { font-weight: 600; color: #111827; margin-bottom: 2px; }',
      '.hsg-toast-msg { font-size: 12.5px; color: #4B5563; }',
      '.hsg-toast-close {',
      '  width: 24px; height: 24px; flex-shrink: 0;',
      '  background: transparent; border: none; cursor: pointer;',
      '  color: #9CA3AF; font-size: 18px; line-height: 1;',
      '  border-radius: 6px;',
      '}',
      '.hsg-toast-close:hover { background: #F3F4F6; color: #111827; }',
      '@keyframes hsg-toast-in {',
      '  from { opacity: 0; transform: translateX(100%) scale(0.9); }',
      '  to { opacity: 1; transform: translateX(0) scale(1); }',
      '}',
      '@keyframes hsg-toast-out {',
      '  to { opacity: 0; transform: translateX(100%) scale(0.9); }',
      '}',
      '.hsg-toast-action {',
      '  margin-top: 8px; display: inline-flex; gap: 8px;',
      '}',
      '.hsg-toast-action button {',
      '  background: transparent; border: 1px solid #E5E7EB;',
      '  padding: 4px 10px; border-radius: 6px; font-size: 12px;',
      '  cursor: pointer; font-family: inherit; color: #374151;',
      '  font-weight: 500;',
      '}',
      '.hsg-toast-action button:hover { background: #F9FAFB; }',
      '.hsg-toast-action button.primary { background: #1E1F6B; color: #fff; border-color: #1E1F6B; }',
      '.hsg-toast-action button.primary:hover { background: #1A1A5C; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function toast(opts) {
    injectStyles();
    var container = ensureContainer();
    var t = document.createElement('div');
    var id = 'toast-' + (++TOAST_ID_SEQ);
    t.id = id;
    t.className = 'hsg-toast ' + (opts.type || 'info');

    var iconChar = { success: '✓', error: '✕', warning: '!', info: 'i' }[opts.type || 'info'] || 'i';

    var actionHtml = '';
    if (opts.actions && opts.actions.length) {
      actionHtml = '<div class="hsg-toast-action">' + opts.actions.map(function (a, i) {
        return '<button data-action="' + i + '" class="' + (a.primary ? 'primary' : '') + '">' + escape(a.label) + '</button>';
      }).join('') + '</div>';
    }

    t.innerHTML =
      '<div class="hsg-toast-icon">' + iconChar + '</div>' +
      '<div class="hsg-toast-body">' +
        (opts.title ? '<div class="hsg-toast-title">' + escape(opts.title) + '</div>' : '') +
        (opts.message ? '<div class="hsg-toast-msg">' + escape(opts.message) + '</div>' : '') +
        actionHtml +
      '</div>' +
      '<button class="hsg-toast-close" aria-label="Close">×</button>';

    container.appendChild(t);

    var duration = opts.duration || (opts.type === 'error' ? 7000 : 4500);
    var timer = setTimeout(function () { close(); }, duration);

    t.querySelector('.hsg-toast-close').addEventListener('click', function () {
      clearTimeout(timer);
      close();
    });

    if (opts.actions && opts.actions.length) {
      t.querySelectorAll('.hsg-toast-action button').forEach(function (btn, i) {
        btn.addEventListener('click', function () {
          var action = opts.actions[i];
          if (typeof action.onClick === 'function') action.onClick();
          clearTimeout(timer);
          close();
        });
      });
    }

    function close() {
      t.classList.add('closing');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }

    return { id: id, close: close };
  }

  function escape(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Shortcut methods
  var success = function (title, message, opts) { return toast(Object.assign({ type: 'success', title: title, message: message }, opts)); };
  var error = function (title, message, opts) { return toast(Object.assign({ type: 'error', title: title, message: message }, opts)); };
  var warning = function (title, message, opts) { return toast(Object.assign({ type: 'warning', title: title, message: message }, opts)); };
  var info = function (title, message, opts) { return toast(Object.assign({ type: 'info', title: title, message: message }, opts)); };

  /* ========================================================================
     NOTIFICATION CENTER (panel)
     ======================================================================== */

  function renderNotifBadge() {
    var s = state();
    if (!s) return;
    // New API: HSG.state.notifications.unreadCount(). Legacy: state.notifs.unreadCount().
    var count = (s.notifications && typeof s.notifications.unreadCount === 'function')
      ? s.notifications.unreadCount()
      : (s.notifs && typeof s.notifs.unreadCount === 'function' ? s.notifs.unreadCount() : 0);
    document.querySelectorAll('[data-notif-count]').forEach(function (el) {
      if (count > 0) {
        el.style.display = '';
        el.textContent = count > 9 ? '9+' : String(count);
      } else {
        el.style.display = 'none';
      }
    });
  }

  // Auto-update badge when notifs change.
  // New state.js exposes per-store subscribe; legacy state had a global
  // event-based subscribe(eventName, cb). Wire whichever is available.
  function wireBadgeSubscriptions() {
    var s = state();
    if (!s) return;
    if (s.notifications && typeof s.notifications.subscribe === 'function') {
      s.notifications.subscribe(renderNotifBadge);
    } else if (typeof s.subscribe === 'function') {
      try { s.subscribe('notifs.pushed', renderNotifBadge); } catch (e) {}
      try { s.subscribe('notifs.read', renderNotifBadge); } catch (e) {}
      try { s.subscribe('notifs.allRead', renderNotifBadge); } catch (e) {}
    }
  }
  // Defer until DOM ready / state initialized
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireBadgeSubscriptions);
  } else {
    wireBadgeSubscriptions();
  }

  function renderNotifPanel(containerId) {
    var container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!container) return;

    var s = state();
    var notifs = (s && s.notifications && s.notifications.snapshot && s.notifications.snapshot()) ||
                 (s && s.notifs && s.notifs.getAll && s.notifs.getAll()) || [];
    if (!notifs.length) {
      container.innerHTML = '<div style="text-align:center;padding:40px 20px;color:#9CA3AF;font-size:13px;">No notifications yet.</div>';
      return;
    }

    var html = notifs.map(function (n) {
      var icon = iconForKind(n.kind);
      var time = relativeTime(n.timestamp);
      return (
        '<div class="notif-item ' + (n.read ? '' : 'unread') + '" data-notif-id="' + n.notifId + '">' +
          '<div class="notif-icon">' + icon + '</div>' +
          '<div class="notif-body">' +
            '<div class="notif-title">' + escape(n.title || 'Notification') + '</div>' +
            '<div class="notif-msg">' + escape(n.body || '') + '</div>' +
            '<div class="notif-time">' + time + '</div>' +
          '</div>' +
          (n.read ? '' : '<span class="notif-dot"></span>') +
        '</div>'
      );
    }).join('');

    container.innerHTML = html;

    container.addEventListener('click', function (e) {
      var item = e.target.closest('.notif-item');
      if (!item) return;
      var id = item.getAttribute('data-notif-id');
      var s = state();
      if (s && s.notifications && typeof s.notifications.markRead === 'function') s.notifications.markRead(id);
      else if (s && s.notifs && typeof s.notifs.markRead === 'function') s.notifs.markRead(id);
      item.classList.remove('unread');
      var dot = item.querySelector('.notif-dot');
      if (dot) dot.remove();
    });
  }

  function iconForKind(kind) {
    var icons = {
      'bid-confirmed': '✓',
      'bid-outbid': '⚠',
      'sale': '$',
      'deadline': '!',
      'award': '★',
      'qa': '?',
      'settlement': '◎',
      'document': '📄'
    };
    return icons[kind] || '•';
  }

  function relativeTime(iso) {
    var now = Date.now();
    var then = new Date(iso).getTime();
    var diff = now - then;
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' minute' + (mins === 1 ? '' : 's') + ' ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + ' hour' + (hrs === 1 ? '' : 's') + ' ago';
    var days = Math.floor(hrs / 24);
    if (days < 7) return days + ' day' + (days === 1 ? '' : 's') + ' ago';
    return new Date(iso).toLocaleDateString();
  }

  function injectNotifStyles() {
    if (document.getElementById('hsg-notif-styles')) return;
    var style = document.createElement('style');
    style.id = 'hsg-notif-styles';
    style.textContent = [
      '.notif-item {',
      '  display: flex; gap: 12px; padding: 12px 16px;',
      '  border-bottom: 1px solid #F3F4F6;',
      '  cursor: pointer; position: relative;',
      '  transition: background 150ms ease;',
      '}',
      '.notif-item:hover { background: #F9FAFB; }',
      '.notif-item.unread { background: #EFF6FF; }',
      '.notif-item.unread:hover { background: #DBEAFE; }',
      '.notif-icon {',
      '  width: 32px; height: 32px; border-radius: 8px;',
      '  background: #F3F4F6; display: flex; align-items: center;',
      '  justify-content: center; color: #6B7280; font-weight: 600;',
      '  flex-shrink: 0;',
      '}',
      '.notif-item.unread .notif-icon { background: #DBEAFE; color: #1E40AF; }',
      '.notif-body { flex: 1; min-width: 0; }',
      '.notif-title { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.3; }',
      '.notif-msg { font-size: 12.5px; color: #4B5563; line-height: 1.5; margin-top: 2px; }',
      '.notif-time { font-size: 11px; color: #9CA3AF; margin-top: 4px; font-family: "IBM Plex Mono", monospace; }',
      '.notif-dot { position: absolute; top: 16px; right: 16px; width: 8px; height: 8px; border-radius: 50%; background: #3B82F6; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ========================================================================
     CONNECTION HEALTH
     ======================================================================== */

  var connectionState = 'connected';

  function setConnectionState(newState) {
    connectionState = newState;
    document.querySelectorAll('[data-connection-status]').forEach(function (el) {
      el.setAttribute('data-state', newState);
      el.textContent = {
        connected: 'SECURE',
        degraded: 'DEGRADED',
        offline: 'OFFLINE'
      }[newState] || newState.toUpperCase();
    });
  }

  function monitorConnection() {
    window.addEventListener('online', function () {
      setConnectionState('connected');
      success('Connection Restored', 'Your connection to HUD Asset Sales is live.');
    });
    window.addEventListener('offline', function () {
      setConnectionState('offline');
      error('Connection Lost', 'Your connection to HUD Asset Sales is offline. Your bids will be queued.');
    });
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      injectNotifStyles();
      monitorConnection();
      renderNotifBadge();
    });
  } else {
    injectNotifStyles();
    monitorConnection();
    renderNotifBadge();
  }

  /* ========================================================================
     PUBLIC API
     ======================================================================== */
  return {
    toast: toast,
    success: success,
    error: error,
    warning: warning,
    info: info,
    renderNotifPanel: renderNotifPanel,
    renderNotifBadge: renderNotifBadge,
    setConnectionState: setConnectionState,
    getConnectionState: function () { return connectionState; },
    iconForKind: iconForKind,
    relativeTime: relativeTime
  };
})();

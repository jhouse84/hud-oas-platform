/**
 * HUD Loan Sale Platform — Component Library
 * House Strategies Group LLC
 *
 * Vanilla JS renderers returning HTML strings.
 * Depends on: design-system.css, HSG.utils (shared/utils.js)
 *
 * All renderers are attached to window.HSG.components.
 */
window.HSG = window.HSG || {};

HSG.components = (function () {
  var u = HSG.utils;

  /* ========================================================================
     renderStatBar(stats)
     stats: [{value, label, trend?}]
     ======================================================================== */
  function renderStatBar(stats) {
    if (!stats || !stats.length) return '';
    var cards = stats.map(function (s) {
      var trendHtml = '';
      if (s.trend) {
        var dir = s.trend > 0 ? 'up' : 'down';
        var arrow = s.trend > 0 ? '&#9650;' : '&#9660;';
        trendHtml =
          '<span class="stat-card__trend stat-card__trend--' + dir + '">' +
            arrow + ' ' + Math.abs(s.trend) + '%' +
          '</span>';
      }
      return (
        '<div class="stat-card">' +
          '<div class="stat-card__value">' + (s.value != null ? s.value : '—') + '</div>' +
          '<div class="stat-card__label">' + (s.label || '') + '</div>' +
          trendHtml +
        '</div>'
      );
    }).join('');
    return '<div class="stat-grid">' + cards + '</div>';
  }

  /* ========================================================================
     renderBadge(type, label?)
     ======================================================================== */
  function renderBadge(type, label) {
    var t = (type || '').toLowerCase();
    var text = label || type;
    return '<span class="badge badge--' + t + '">' + esc(text) + '</span>';
  }

  /* ========================================================================
     renderSaleCard(sale)
     ======================================================================== */
  function renderSaleCard(sale) {
    var statusBadge = renderBadge(saleStatusKey(sale.status), sale.status);
    var programBadge = renderBadge(sale.programType);
    var value = u.currencyCompact(sale.aggregateValue);
    var bidDateDisplay = sale.bidDate ? u.date(sale.bidDate) : 'TBD';
    var bidRelative = sale.bidDate ? u.dateRelative(sale.bidDate) : '';
    var qualDeadline = sale.qualificationDeadline
      ? u.date(sale.qualificationDeadline) : 'TBD';
    var biddersLabel = sale.qualifiedBidders != null
      ? sale.qualifiedBidders + ' qualified' : '';

    return (
      '<div class="card" data-sale-id="' + esc(sale.id) + '" style="cursor:pointer;">' +
        '<div class="card-header">' +
          '<div class="card-header__title">' +
            programBadge + ' ' + esc(sale.name) +
          '</div>' +
          '<div class="card-header__actions">' +
            statusBadge +
          '</div>' +
        '</div>' +
        '<div class="card-body">' +
          '<div class="stat-grid">' +
            '<div class="stat-card">' +
              '<div class="stat-card__value">' + u.number(sale.loanCount) + '</div>' +
              '<div class="stat-card__label">Loans</div>' +
            '</div>' +
            '<div class="stat-card">' +
              '<div class="stat-card__value">' + value + '</div>' +
              '<div class="stat-card__label">' + esc(sale.valueLabel || 'Value') + '</div>' +
            '</div>' +
            '<div class="stat-card">' +
              '<div class="stat-card__value">' + bidDateDisplay + '</div>' +
              '<div class="stat-card__label">Bid Day ' + (bidRelative ? '<small class="text-muted">' + bidRelative + '</small>' : '') + '</div>' +
            '</div>' +
            '<div class="stat-card">' +
              '<div class="stat-card__value">' + biddersLabel + '</div>' +
              '<div class="stat-card__label">Bidders</div>' +
            '</div>' +
          '</div>' +
          '<div style="margin-top:var(--space-3);display:flex;gap:var(--space-4);font-size:var(--text-sm);color:var(--color-text-muted);">' +
            '<span>' + sale.poolCount + ' pool' + (sale.poolCount !== 1 ? 's' : '') + '</span>' +
            '<span>Qual Deadline: ' + qualDeadline + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ========================================================================
     renderDataTable(config)
     config: { columns, data, id?, onRowClick?, emptyMessage? }
     ======================================================================== */
  function renderDataTable(config) {
    var cols = config.columns || [];
    var data = config.data || [];
    var tableId = config.id || u.uid();
    var clickable = !!config.onRowClick;
    var emptyMsg = config.emptyMessage || 'No data available';

    // Build header
    var thead = '<thead><tr>';
    cols.forEach(function (col) {
      var cls = '';
      var attrs = ' data-key="' + col.key + '"';
      if (col.sortable) {
        cls += ' sortable';
        attrs += ' data-sortable="true"';
      }
      if (col.align === 'right') cls += ' cell-number';
      thead += '<th class="' + cls.trim() + '"' + attrs + '>' + esc(col.label) + '</th>';
    });
    thead += '</tr></thead>';

    // Build body
    var tbody = buildTbody(cols, data, clickable);

    // Empty state
    if (!data.length) {
      tbody = '<tbody><tr><td colspan="' + cols.length + '" style="text-align:center;padding:var(--space-8);color:var(--color-text-muted);">' +
        esc(emptyMsg) + '</td></tr></tbody>';
    }

    var tableClass = 'data-table data-table--striped' + (clickable ? ' data-table--clickable' : '');

    return (
      '<div class="table-toolbar" data-table-toolbar="' + tableId + '"></div>' +
      '<table class="' + tableClass + '" id="' + tableId + '" data-table-config=\'' + miniSerialize(config) + '\'>' +
        thead + tbody +
      '</table>'
    );
  }

  function buildTbody(cols, data, clickable) {
    if (!data.length) return '<tbody></tbody>';
    var rows = data.map(function (row, idx) {
      var cells = cols.map(function (col) {
        var val = row[col.key];
        var formatted = formatCell(val, col.format);
        var align = col.align === 'right' ? ' class="cell-number"' : '';
        return '<td' + align + '>' + formatted + '</td>';
      }).join('');
      return '<tr data-row-index="' + idx + '">' + cells + '</tr>';
    }).join('');
    return '<tbody>' + rows + '</tbody>';
  }

  function formatCell(val, fmt) {
    if (typeof fmt === 'function') return fmt(val);
    if (!fmt) return val != null ? esc(String(val)) : '—';
    switch (fmt) {
      case 'currency':        return u.currency(val);
      case 'currencyCompact': return u.currencyCompact(val);
      case 'percent':         return u.percent(val);
      case 'date':            return u.date(val);
      case 'number':          return u.number(val);
      default:                return val != null ? esc(String(val)) : '—';
    }
  }

  /* ========================================================================
     renderTimeline(milestones)
     milestones: [{date, label, status, description?}]
     ======================================================================== */
  function renderTimeline(milestones) {
    if (!milestones || !milestones.length) return '';

    var items = milestones.map(function (m) {
      var dotClass = 'timeline-dot';
      switch (m.status) {
        case 'completed': dotClass += ' timeline-dot--success'; break;
        case 'active':    dotClass += ' timeline-dot--active';  break;
        case 'overdue':   dotClass += ' timeline-dot--error';   break;
        // upcoming uses default (grey)
      }
      var dateStr = m.date ? u.date(m.date) : 'TBD';
      var desc = m.description
        ? '<p class="timeline-content__body">' + esc(m.description) + '</p>' : '';
      return (
        '<div class="timeline-item" data-status="' + (m.status || '') + '">' +
          '<div class="' + dotClass + '"></div>' +
          '<div class="timeline-content">' +
            '<div class="timeline-content__title">' + esc(m.label) + '</div>' +
            '<div class="timeline-content__time">' + dateStr + '</div>' +
            desc +
          '</div>' +
        '</div>'
      );
    }).join('');

    return '<div class="timeline">' + items + '</div>';
  }

  /* ========================================================================
     renderTabs(tabs, activeId)
     tabs: [{id, label, count?}]
     ======================================================================== */
  function renderTabs(tabs, activeId) {
    if (!tabs || !tabs.length) return '';
    var btns = tabs.map(function (t) {
      var active = t.id === activeId ? ' active' : '';
      var countHtml = t.count != null
        ? ' <span class="tab__count">' + t.count + '</span>' : '';
      return '<button class="tab' + active + '" data-tab-id="' + esc(t.id) + '">' +
        esc(t.label) + countHtml +
      '</button>';
    }).join('');
    return '<div class="tabs">' + btns + '</div>';
  }

  /* ========================================================================
     renderModal(config)
     config: {title, body, footer?, size?, id?}
     ======================================================================== */
  function renderModal(config) {
    var id = config.id || u.uid();
    var sizeClass = config.size ? ' modal--' + config.size : '';
    var footer = config.footer
      ? '<div class="modal-footer">' + config.footer + '</div>' : '';
    return (
      '<div class="modal-overlay" id="' + id + '-overlay">' +
        '<div class="modal' + sizeClass + '" id="' + id + '">' +
          '<div class="modal-header">' +
            '<h4 class="modal-header__title">' + esc(config.title || '') + '</h4>' +
            '<button class="modal-header__close modal-close" aria-label="Close">&times;</button>' +
          '</div>' +
          '<div class="modal-body">' +
            (config.body || '') +
          '</div>' +
          footer +
        '</div>' +
      '</div>'
    );
  }

  /* ========================================================================
     renderAlert(type, message, dismissible?)
     type: info|success|warning|error
     ======================================================================== */
  function renderAlert(type, message, dismissible) {
    var iconMap = {
      info:    '&#9432;',
      success: '&#10003;',
      warning: '&#9888;',
      error:   '&#10007;'
    };
    var icon = iconMap[type] || iconMap.info;
    var dismiss = dismissible
      ? '<button class="alert__dismiss" aria-label="Dismiss">&times;</button>' : '';
    return (
      '<div class="alert alert--' + (type || 'info') + '">' +
        '<span class="alert__icon">' + icon + '</span>' +
        '<div class="alert__content">' + esc(message || '') + '</div>' +
        dismiss +
      '</div>'
    );
  }

  /* ========================================================================
     renderBidInput(config)
     config: {saleId, poolId, programType, currentBid?, bpoAggregate?}
     ======================================================================== */
  function renderBidInput(config) {
    var program = (config.programType || '').toUpperCase();
    var label, placeholder, helpText, calcHtml;

    if (program === 'HVLS' || program === 'HNVLS' || program === 'SFLS') {
      var valueLabel = program === 'HVLS' ? 'BPO' : (program === 'HNVLS' ? 'ETD' : 'UPB');
      label = 'Bid as % of Aggregate ' + valueLabel;
      placeholder = '0.00%';
      helpText = 'Enter your bid as a percentage of aggregate ' + valueLabel + ' for this pool.';

      if (config.bpoAggregate) {
        var bidPct = config.currentBid || 0;
        var implied = config.bpoAggregate * (bidPct / 100);
        calcHtml =
          '<div class="bid-calculator">' +
            '<div class="bid-calculator__title">Bid Calculator</div>' +
            '<div class="bid-calculator__row">' +
              '<span class="bid-calculator__label">Aggregate ' + valueLabel + '</span>' +
              '<span class="bid-calculator__value">' + u.currency(config.bpoAggregate) + '</span>' +
            '</div>' +
            '<div class="bid-calculator__row">' +
              '<span class="bid-calculator__label">Bid Percentage</span>' +
              '<span class="bid-calculator__value">' + (bidPct || '—') + '%</span>' +
            '</div>' +
            '<div class="bid-calculator__row bid-calculator__row--total">' +
              '<span class="bid-calculator__label">Implied Bid Amount</span>' +
              '<span class="bid-calculator__value">' + u.currency(implied) + '</span>' +
            '</div>' +
          '</div>';
      } else {
        calcHtml = '';
      }
    } else {
      // MHLS / HLS — dollar per loan or per deal
      label = 'Bid Amount ($)';
      placeholder = '$0';
      helpText = 'Enter your bid as a dollar amount for this deal.';
      calcHtml = '';
    }

    var currentVal = config.currentBid != null ? config.currentBid : '';

    return (
      '<div class="bid-input" data-sale-id="' + esc(config.saleId || '') + '" data-pool-id="' + esc(config.poolId || '') + '">' +
        '<div class="bid-input__label">' + label + '</div>' +
        '<input type="text" class="bid-input__field" placeholder="' + placeholder + '" value="' + currentVal + '" />' +
        '<div class="bid-input__help">' + helpText + '</div>' +
        calcHtml +
      '</div>'
    );
  }

  /* ========================================================================
     renderEmptyState(icon, title, message)
     ======================================================================== */
  function renderEmptyState(icon, title, message) {
    return (
      '<div style="text-align:center;padding:var(--space-12) var(--space-6);color:var(--color-text-muted);">' +
        '<div style="font-size:3rem;margin-bottom:var(--space-4);">' + (icon || '') + '</div>' +
        '<h4 style="margin-bottom:var(--space-2);color:var(--color-text);">' + esc(title || '') + '</h4>' +
        '<p class="text-body-sm">' + esc(message || '') + '</p>' +
      '</div>'
    );
  }


  /* ========================================================================
     Initializers (attach event handlers post-render)
     ======================================================================== */

  /**
   * initTableSort()
   * Adds click handlers to all .data-table th[data-sortable] elements.
   */
  function initTableSort() {
    var headers = document.querySelectorAll('.data-table th[data-sortable]');
    headers.forEach(function (th) {
      if (th._sortBound) return; // avoid double-binding
      th._sortBound = true;
      th.addEventListener('click', function () {
        var table = th.closest('table');
        if (!table) return;
        var key = th.getAttribute('data-key');
        var allTh = table.querySelectorAll('th[data-sortable]');

        // Determine direction
        var currentDir = th.classList.contains('sort-asc') ? 'asc' : (th.classList.contains('sort-desc') ? 'desc' : null);
        var newDir = currentDir === 'asc' ? 'desc' : 'asc';

        // Clear other headers
        allTh.forEach(function (h) {
          h.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add('sort-' + newDir);

        // Sort tbody rows
        var tbody = table.querySelector('tbody');
        var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
        rows.sort(function (a, b) {
          var colIdx = Array.prototype.indexOf.call(th.parentNode.children, th);
          var aText = a.children[colIdx] ? a.children[colIdx].textContent.trim() : '';
          var bText = b.children[colIdx] ? b.children[colIdx].textContent.trim() : '';

          // Try numeric sort
          var aNum = parseFloat(aText.replace(/[$,%,]/g, ''));
          var bNum = parseFloat(bText.replace(/[$,%,]/g, ''));
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return newDir === 'asc' ? aNum - bNum : bNum - aNum;
          }
          // Fallback string sort
          return newDir === 'asc'
            ? aText.localeCompare(bText)
            : bText.localeCompare(aText);
        });
        rows.forEach(function (row) { tbody.appendChild(row); });
      });
    });
  }

  /**
   * initModals()
   * Close modals when clicking overlay or close button.
   */
  function initModals() {
    // Close button
    document.querySelectorAll('.modal-close').forEach(function (btn) {
      if (btn._modalBound) return;
      btn._modalBound = true;
      btn.addEventListener('click', function () {
        var overlay = btn.closest('.modal-overlay');
        if (overlay) overlay.classList.remove('is-open');
      });
    });

    // Overlay background click
    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
      if (overlay._modalBound) return;
      overlay._modalBound = true;
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          overlay.classList.remove('is-open');
        }
      });
    });
  }

  /**
   * initTabs(containerId, callback)
   * Adds click handlers to .tab elements within the container.
   * Toggles .active and calls callback(tabId).
   */
  function initTabs(containerId, callback) {
    var container = document.getElementById(containerId);
    if (!container) container = document.querySelector(containerId);
    if (!container) return;

    var tabs = container.querySelectorAll('.tab');
    tabs.forEach(function (tab) {
      if (tab._tabBound) return;
      tab._tabBound = true;
      tab.addEventListener('click', function () {
        // Toggle active
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');

        // Toggle tab panels if they exist
        var tabId = tab.getAttribute('data-tab-id');
        var panels = container.querySelectorAll('.tab-panel');
        panels.forEach(function (p) {
          p.classList.toggle('active', p.getAttribute('data-tab-id') === tabId || p.id === tabId);
        });

        if (typeof callback === 'function') {
          callback(tabId);
        }
      });
    });
  }


  /* ========================================================================
     Internal helpers
     ======================================================================== */

  function esc(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function saleStatusKey(status) {
    if (!status) return 'pending';
    var s = status.toLowerCase();
    if (s.indexOf('active') >= 0)    return 'active';
    if (s.indexOf('upcoming') >= 0)  return 'pending';
    if (s.indexOf('postponed') >= 0) return 'warning';
    if (s.indexOf('closed') >= 0)    return 'closed';
    if (s.indexOf('awarded') >= 0)   return 'approved';
    return 'info';
  }

  /** Minimal JSON serialize — strips functions so we can stash config on DOM. */
  function miniSerialize(config) {
    try {
      var safe = {
        columns: (config.columns || []).map(function (c) {
          return { key: c.key, label: c.label, sortable: c.sortable, align: c.align, format: typeof c.format === 'string' ? c.format : undefined };
        }),
        id: config.id,
        emptyMessage: config.emptyMessage
      };
      return esc(JSON.stringify(safe));
    } catch (e) {
      return '{}';
    }
  }


  /* ========================================================================
     Public API
     ======================================================================== */
  return {
    renderStatBar:    renderStatBar,
    renderBadge:      renderBadge,
    renderSaleCard:   renderSaleCard,
    renderDataTable:  renderDataTable,
    renderTimeline:   renderTimeline,
    renderTabs:       renderTabs,
    renderModal:      renderModal,
    renderAlert:      renderAlert,
    renderBidInput:   renderBidInput,
    renderEmptyState: renderEmptyState,
    initTableSort:    initTableSort,
    initModals:       initModals,
    initTabs:         initTabs
  };
})();

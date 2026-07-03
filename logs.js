(function () {
  var db = window.MVB_DB;

  var PAGE_SIZE = 50;
  var EXPORT_CAP = 5000;

  // UI convenience lists — the audit_logs schema itself stays free-text so
  // new modules/actions work immediately without touching this file. Add a
  // new entry here whenever a new module starts logging so it's filterable.
  var MODULES = [
    'Auth', 'Products', 'Suppliers', 'Customers', 'Supplier Orders',
    'GRN', 'Inbound', 'Outbound', 'Customer Orders', 'Inventory', 'System',
  ];
  var ACTIONS = [
    'Login', 'Logout', 'Invite Accepted', 'Create', 'Update', 'Delete',
    'GRN Saved', 'GRN Confirmed', 'GRN Rejected', 'Stock Received',
    'Stock Quantity Updated', 'Stock Deducted', 'Dispatch Confirmed',
    'Dispatch Rejected', 'Payment Status Changed', 'Export Generated',
  ];
  var RECORD_TYPES = [
    'Customer', 'Supplier', 'Product', 'Supplier Order', 'GRN', 'Customer Order',
  ];

  // ── Human-readable field rendering for the old/new value diff ──────
  // Raw column names never surface to the user — every field shown in the
  // expanded row goes through FIELD_LABELS + formatFieldValue first.

  var HIDDEN_FIELDS = ['id', 'created_at', 'updated_at'];

  var FIELD_LABELS = {
    client: 'Client', contact: 'Contact', phone: 'Phone',
    name: 'Name', supplier: 'Supplier',
    unit_cost: 'Unit Cost', unit_price: 'Unit Price', variant_price: 'Variant Price',
    stock_quantity: 'Stock Quantity',
    supplier_name: 'Supplier', reference: 'Reference', order_date: 'Order Date',
    net_total: 'Net Total', total_quantity: 'Total Quantity', vat_enabled: 'VAT Enabled',
    grn_id: 'GRN ID', supplier_order_id: 'Supplier Order ID', status: 'Status',
    confirmed_at: 'Confirmed At', batch_date: 'Batch Date', total_items: 'Total Items',
    order_number: 'Order Number', invoice_number: 'Invoice Number', invoice_date: 'Invoice Date',
    due_date: 'Due Date', billed_to: 'Billed To', total_amount: 'Total Amount',
    item_count: 'Item Count', outbound_confirmed: 'Dispatch Confirmed',
  };

  var MONEY_FIELDS = ['unit_cost', 'unit_price', 'variant_price', 'net_total', 'total_amount', 'subtotal', 'vat_total'];
  var QUANTITY_FIELDS = ['stock_quantity', 'total_quantity', 'item_count', 'total_items'];
  var DATE_FIELDS = ['order_date', 'invoice_date', 'due_date', 'confirmed_at'];

  function labelForField(key) {
    return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function formatFieldValue(key, value) {
    if (value == null || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (MONEY_FIELDS.indexOf(key) !== -1) {
      var n = Number(value);
      return isNaN(n) ? String(value) : n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (QUANTITY_FIELDS.indexOf(key) !== -1) {
      var q = Number(value);
      return isNaN(q) ? String(value) : q.toLocaleString('en-LK');
    }
    if (DATE_FIELDS.indexOf(key) !== -1) {
      var d = new Date(value);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('en-LK', { year: 'numeric', month: 'short', day: '2-digit' });
      }
    }
    return String(value);
  }

  var state = {
    page: 0,
    sortField: 'created_at',
    sortDir: 'desc',
    filters: {
      keyword: '', dateFrom: '', dateTo: '', userId: '', role: '',
      module: '', action: '', recordType: '', success: '',
    },
    totalCount: 0,
    rows: [],
    expandedId: null,
  };

  var els = {
    tbody: document.getElementById('log-tbody'),
    thead: document.getElementById('log-thead'),
    keyword: document.getElementById('log-keyword'),
    dateFrom: document.getElementById('log-date-from'),
    dateTo: document.getElementById('log-date-to'),
    user: document.getElementById('log-user'),
    role: document.getElementById('log-role'),
    module: document.getElementById('log-module'),
    action: document.getElementById('log-action'),
    recordType: document.getElementById('log-record-type'),
    success: document.getElementById('log-success'),
    clearFilters: document.getElementById('log-clear-filters'),
    exportBtn: document.getElementById('log-export'),
    pageSummary: document.getElementById('log-page-summary'),
    prevBtn: document.getElementById('log-prev-page'),
    nextBtn: document.getElementById('log-next-page'),
    metricTotal: document.getElementById('log-metric-total'),
    metricToday: document.getElementById('log-metric-today'),
    metricFailed: document.getElementById('log-metric-failed'),
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTimestamp(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-LK', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  function roleLabel(role) {
    if (!role) return '—';
    return role.replace('_', ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function populateStaticOptions() {
    function fill(select, values) {
      values.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
      });
    }
    fill(els.module, MODULES);
    fill(els.action, ACTIONS);
    fill(els.recordType, RECORD_TYPES);
  }

  async function populateUserFilter() {
    try {
      var result = await db.from('user_roles').select('id, name, role').order('name');
      if (result.error || !result.data) return;
      result.data.forEach(function (u) {
        var opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name + ' (' + roleLabel(u.role) + ')';
        els.user.appendChild(opt);
      });
    } catch (err) {
      console.error('Failed to load users for filter:', err);
    }
  }

  // ── Query builder ──────────────────────────────────────────────────

  function buildQuery(withRange) {
    var f = state.filters;
    var query = db.from('audit_logs').select('*', { count: 'exact' });

    if (f.dateFrom) query = query.gte('created_at', f.dateFrom + 'T00:00:00.000Z');
    if (f.dateTo) query = query.lte('created_at', f.dateTo + 'T23:59:59.999Z');
    if (f.userId) query = query.eq('user_id', f.userId);
    if (f.role) query = query.eq('user_role', f.role);
    if (f.module) query = query.eq('module', f.module);
    if (f.action) query = query.eq('action', f.action);
    if (f.recordType) query = query.eq('record_type', f.recordType);
    if (f.success) query = query.eq('success', f.success === 'true');
    if (f.keyword) {
      var kw = f.keyword.replace(/[%,()]/g, '');
      query = query.or(
        'description.ilike.%' + kw + '%,' +
        'user_name.ilike.%' + kw + '%,' +
        'module.ilike.%' + kw + '%,' +
        'action.ilike.%' + kw + '%,' +
        'record_id.ilike.%' + kw + '%'
      );
    }

    query = query.order(state.sortField, { ascending: state.sortDir === 'asc' });

    if (withRange) {
      var offset = state.page * PAGE_SIZE;
      query = query.range(offset, offset + PAGE_SIZE - 1);
    } else {
      query = query.limit(EXPORT_CAP);
    }

    return query;
  }

  // ── Render ────────────────────────────────────────────────────────

  function updateSortHeaders() {
    els.thead.querySelectorAll('.pdash-th-sort').forEach(function (th) {
      var active = th.dataset.col === state.sortField;
      th.classList.toggle('pdash-th-sort--active', active);
      var icon = th.querySelector('.pdash-sort-icon');
      icon.textContent = active ? (state.sortDir === 'asc' ? '↑' : '↓') : '';
    });
  }

  var NO_DETAILS_HTML = '<p class="log-diff-empty">No additional details recorded for this entry.</p>';

  function buildDiffHtml(row) {
    var oldData = row.old_data || null;
    var newData = row.new_data || null;

    if (!oldData && !newData) return NO_DETAILS_HTML;

    // Both sides present → show only the fields that actually changed.
    if (oldData && newData) {
      var keySet = {};
      Object.keys(oldData).concat(Object.keys(newData)).forEach(function (k) { keySet[k] = true; });

      var rows = Object.keys(keySet)
        .filter(function (k) { return HIDDEN_FIELDS.indexOf(k) === -1; })
        .filter(function (k) { return JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]); })
        .map(function (k) {
          return (
            '<li class="log-diff-row">' +
              '<span class="log-diff-field">' + escapeHtml(labelForField(k)) + '</span>' +
              '<span class="log-diff-old">' + escapeHtml(formatFieldValue(k, oldData[k])) + '</span>' +
              '<span class="log-diff-arrow">&rarr;</span>' +
              '<span class="log-diff-new">' + escapeHtml(formatFieldValue(k, newData[k])) + '</span>' +
            '</li>'
          );
        });

      if (!rows.length) return NO_DETAILS_HTML;
      return '<ul class="log-diff-list">' + rows.join('') + '</ul>';
    }

    // Only one side present (create or delete/reject) → show a plain snapshot.
    var data = oldData || newData;
    var snapshotRows = Object.keys(data)
      .filter(function (k) { return HIDDEN_FIELDS.indexOf(k) === -1; })
      .map(function (k) {
        return (
          '<li class="log-diff-row log-diff-row--single">' +
            '<span class="log-diff-field">' + escapeHtml(labelForField(k)) + '</span>' +
            '<span class="log-diff-value">' + escapeHtml(formatFieldValue(k, data[k])) + '</span>' +
          '</li>'
        );
      });

    if (!snapshotRows.length) return NO_DETAILS_HTML;
    return '<ul class="log-diff-list">' + snapshotRows.join('') + '</ul>';
  }

  function renderTable() {
    updateSortHeaders();

    if (!state.rows.length) {
      els.tbody.innerHTML = '<tr><td colspan="9" class="pdash-empty">No log entries match the current filters.</td></tr>';
      return;
    }

    els.tbody.innerHTML = state.rows.map(function (row) {
      var recordLabel = row.record_type
        ? escapeHtml(row.record_type) + (row.record_id ? ' #' + escapeHtml(row.record_id) : '')
        : '—';

      var summaryRow =
        '<tr data-log-id="' + row.id + '">' +
        '<td>' +
          '<button class="log-expand-btn" data-action="expand-log" data-log-id="' + row.id + '" aria-label="Expand details">' +
            '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>' +
          '</button>' +
        '</td>' +
        '<td>' + formatTimestamp(row.created_at) + '</td>' +
        '<td>' + escapeHtml(row.user_name || '—') + '</td>' +
        '<td>' + escapeHtml(roleLabel(row.user_role)) + '</td>' +
        '<td>' + escapeHtml(row.module) + '</td>' +
        '<td>' + escapeHtml(row.action) + '</td>' +
        '<td>' + recordLabel + '</td>' +
        '<td>' + escapeHtml(row.description || '—') + '</td>' +
        '<td>' +
          (row.success
            ? '<span class="log-badge log-badge--success">OK</span>'
            : '<span class="log-badge log-badge--failed">Failed</span>') +
        '</td>' +
        '</tr>';

      var detailRow =
        '<tr class="log-detail-row log-detail-row--hidden" data-detail-for="' + row.id + '">' +
          '<td colspan="9" class="log-detail-cell">' + buildDiffHtml(row) + '</td>' +
        '</tr>';

      return summaryRow + detailRow;
    }).join('');
  }

  function updateMetrics() {
    els.metricTotal.textContent = String(state.totalCount);

    var todayStr = new Date().toISOString().slice(0, 10);
    var todayCount = state.rows.filter(function (r) {
      return (r.created_at || '').slice(0, 10) === todayStr;
    }).length;
    els.metricToday.textContent = String(todayCount);

    var failedCount = state.rows.filter(function (r) { return r.success === false; }).length;
    els.metricFailed.textContent = String(failedCount);
  }

  function updatePagination() {
    var start = state.totalCount === 0 ? 0 : state.page * PAGE_SIZE + 1;
    var end = Math.min(state.totalCount, (state.page + 1) * PAGE_SIZE);
    els.pageSummary.textContent = 'Showing ' + start + '–' + end + ' of ' + state.totalCount;
    els.prevBtn.disabled = state.page === 0;
    els.nextBtn.disabled = end >= state.totalCount;
  }

  // ── Load ──────────────────────────────────────────────────────────

  async function loadLogs() {
    els.tbody.innerHTML = '<tr><td colspan="9" class="pdash-empty">Loading…</td></tr>';
    try {
      var result = await buildQuery(true);
      if (result.error) throw result.error;

      state.rows = result.data || [];
      state.totalCount = result.count || 0;
      renderTable();
      updateMetrics();
      updatePagination();
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      els.tbody.innerHTML = '<tr><td colspan="9" class="pdash-empty">Could not load the activity log. Please refresh.</td></tr>';
    }
  }

  function resetToFirstPage() {
    state.page = 0;
    loadLogs();
  }

  // ── Export ────────────────────────────────────────────────────────

  var xlsxLoaded = false;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.body.appendChild(s);
    });
  }

  async function exportToExcel() {
    els.exportBtn.disabled = true;
    els.exportBtn.textContent = 'Exporting…';
    try {
      if (!xlsxLoaded) {
        await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
        xlsxLoaded = true;
      }

      var result = await buildQuery(false);
      if (result.error) throw result.error;

      var rows = (result.data || []).map(function (row) {
        return {
          Timestamp: formatTimestamp(row.created_at),
          User: row.user_name || '',
          Role: roleLabel(row.user_role),
          Module: row.module,
          Action: row.action,
          'Record Type': row.record_type || '',
          'Record ID': row.record_id || '',
          Description: row.description || '',
          Success: row.success ? 'Yes' : 'No',
          'Old Value': row.old_data ? JSON.stringify(row.old_data) : '',
          'New Value': row.new_data ? JSON.stringify(row.new_data) : '',
        };
      });

      var ws = window.XLSX.utils.json_to_sheet(rows);
      var wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Activity Log');

      var dateStr = new Date().toISOString().slice(0, 10);
      window.XLSX.writeFile(wb, 'audit-log-export-' + dateStr + '.xlsx');

      window.MVB_AUDIT_LOG.log({
        module: 'System',
        action: 'Export Generated',
        recordType: 'Activity Log',
        description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' exported ' + rows.length + ' activity log entries to Excel.',
      });
    } catch (err) {
      console.error('Failed to export activity log:', err);
      window.alert('Could not export the activity log. Please try again.');
    } finally {
      els.exportBtn.disabled = false;
      els.exportBtn.textContent = 'Export to Excel';
    }
  }

  // ── Events ────────────────────────────────────────────────────────

  var keywordDebounce = null;
  els.keyword.addEventListener('input', function () {
    clearTimeout(keywordDebounce);
    keywordDebounce = setTimeout(function () {
      state.filters.keyword = els.keyword.value.trim();
      resetToFirstPage();
    }, 300);
  });

  [
    ['dateFrom', els.dateFrom], ['dateTo', els.dateTo], ['userId', els.user],
    ['role', els.role], ['module', els.module], ['action', els.action],
    ['recordType', els.recordType], ['success', els.success],
  ].forEach(function (pair) {
    var key = pair[0], el = pair[1];
    el.addEventListener('change', function () {
      state.filters[key] = el.value;
      resetToFirstPage();
    });
  });

  els.clearFilters.addEventListener('click', function () {
    state.filters = { keyword: '', dateFrom: '', dateTo: '', userId: '', role: '', module: '', action: '', recordType: '', success: '' };
    els.keyword.value = '';
    els.dateFrom.value = '';
    els.dateTo.value = '';
    els.user.value = '';
    els.role.value = '';
    els.module.value = '';
    els.action.value = '';
    els.recordType.value = '';
    els.success.value = '';
    resetToFirstPage();
  });

  els.thead.addEventListener('click', function (e) {
    var th = e.target.closest('[data-col]');
    if (!th) return;
    var col = th.dataset.col;
    if (col === state.sortField) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortField = col;
      state.sortDir = col === 'created_at' ? 'desc' : 'asc';
    }
    resetToFirstPage();
  });

  els.tbody.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="expand-log"]');
    if (!btn) return;
    var logId = Number(btn.dataset.logId);
    var detailRow = els.tbody.querySelector('[data-detail-for="' + logId + '"]');
    if (!detailRow) return;
    var isHidden = detailRow.classList.contains('log-detail-row--hidden');
    detailRow.classList.toggle('log-detail-row--hidden', !isHidden);
    btn.classList.toggle('log-expand-btn--open', isHidden);
  });

  els.prevBtn.addEventListener('click', function () {
    if (state.page === 0) return;
    state.page -= 1;
    loadLogs();
  });

  els.nextBtn.addEventListener('click', function () {
    if ((state.page + 1) * PAGE_SIZE >= state.totalCount) return;
    state.page += 1;
    loadLogs();
  });

  els.exportBtn.addEventListener('click', exportToExcel);

  populateStaticOptions();
  populateUserFilter();
  loadLogs();
})();

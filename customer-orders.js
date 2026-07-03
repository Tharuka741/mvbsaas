(function () {
  var db = window.MVB_DB;
  var allOrders          = [];
  var currentFilter      = '';
  var currentMonthFilter = '';
  var pdfDepsLoaded = false;
  var loadedItems   = {}; // orderId -> customer_order_items[]

  var COLSPAN = 9;

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

  async function loadPdfDeps() {
    if (pdfDepsLoaded) return;
    await loadScript('assets/vendor/pdf-lib.min.js');
    await loadScript('logo-data.js');
    await loadScript('invoice-pdf.js');
    pdfDepsLoaded = true;
  }

  var tbody        = document.getElementById('co-table-body');
  var filterSelect = document.getElementById('co-status-filter');
  var monthSelect  = document.getElementById('co-month-filter');
  var metricOrders  = document.getElementById('co-metric-orders');
  var metricUnits   = document.getElementById('co-metric-units');
  var metricRevenue = document.getElementById('co-metric-revenue');
  var metricPaid    = document.getElementById('co-metric-paid');
  var metricUnpaid  = document.getElementById('co-metric-unpaid');

  function formatAmount(amount) {
    return Number(amount || 0).toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(dateString) {
    if (!dateString) return '—';
    var parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    return parts[0] + '/' + parts[1] + '/' + parts[2];
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function updateMetrics(orders) {
    var totalUnits    = orders.reduce(function (s, o) { return s + (o.item_count || 0); }, 0);
    var totalRevenue  = orders.reduce(function (s, o) { return s + Number(o.total_amount || 0); }, 0);
    var paidRevenue   = orders.filter(function (o) { return o.status === 'Paid'; })
                              .reduce(function (s, o) { return s + Number(o.total_amount || 0); }, 0);
    var unpaidRevenue = orders.filter(function (o) { return o.status !== 'Paid'; })
                              .reduce(function (s, o) { return s + Number(o.total_amount || 0); }, 0);
    metricOrders.textContent  = String(orders.length);
    metricUnits.textContent   = String(totalUnits);
    metricRevenue.textContent = formatAmount(totalRevenue);
    metricPaid.textContent    = formatAmount(paidRevenue);
    metricUnpaid.textContent  = formatAmount(unpaidRevenue);
  }

  // ── Detail content ────────────────────────────────────────────────

  function buildDetailHtml(items, order) {
    var rows = items.map(function (item) {
      return (
        '<tr>' +
        '<td>' + escapeHtml(item.product_name) + '</td>' +
        '<td style="text-align:right;">' + formatAmount(item.unit_price) + '</td>' +
        '<td style="text-align:right;">' + (item.quantity || 0) + '</td>' +
        '<td style="text-align:right;">' + (item.foc || 0) + '</td>' +
        '<td style="text-align:right;">' + formatAmount(item.amount) + '</td>' +
        '</tr>'
      );
    }).join('');

    return (
      '<div class="order-card__table-wrap">' +
        '<table class="order-card__table">' +
          '<thead><tr>' +
            '<th>Product</th>' +
            '<th style="text-align:right;">Unit Price (LKR)</th>' +
            '<th style="text-align:right;">Qty.</th>' +
            '<th style="text-align:right;">FOC</th>' +
            '<th style="text-align:right;">Amount (LKR)</th>' +
          '</tr></thead>' +
          '<tbody>' + (rows || '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:16px;">No items found.</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div class="order-card__summary">' +
        '<div class="order-card__summary-card"><span>Total (LKR)</span><strong>' + formatAmount(order.total_amount) + '</strong></div>' +
        '<div class="order-card__summary-card"><span>Due Date</span><strong>' + formatDate(order.due_date) + '</strong></div>' +
      '</div>'
    );
  }

  async function fetchItems(orderId) {
    if (loadedItems[orderId]) return loadedItems[orderId];
    var result = await db.from('customer_order_items').select('*').eq('order_id', orderId);
    if (result.error) throw result.error;
    loadedItems[orderId] = result.data || [];
    return loadedItems[orderId];
  }

  // ── Render ────────────────────────────────────────────────────────

  function renderTable(orders) {
    updateMetrics(orders);

    if (!orders.length) {
      tbody.innerHTML = '<tr><td colspan="' + COLSPAN + '" class="co-empty">No orders found.</td></tr>';
      return;
    }

    tbody.innerHTML = orders.map(function (order) {
      var customer  = (order.billed_to || '').split('\n')[0] || '—';
      var orderRef  = escapeHtml(order.order_number || order.invoice_number || '#' + order.id);

      var summaryRow = (
        '<tr class="so-order-row" data-order-id="' + order.id + '">' +
        '<td class="co-cell-id">' + orderRef + '</td>' +
        '<td>' + formatDate(order.invoice_date) + '</td>' +
        '<td class="co-cell-customer"><span title="' + escapeHtml(order.billed_to || '') + '">' + escapeHtml(customer) + '</span></td>' +
        '<td>' + escapeHtml(String(order.item_count || 0)) + '</td>' +
        '<td class="co-cell-amount">' + formatAmount(order.total_amount) + '</td>' +
        '<td>' +
          '<select class="co-status-select" data-order-id="' + order.id + '">' +
            '<option value="Unpaid"' + (order.status !== 'Paid' ? ' selected' : '') + '>Unpaid</option>' +
            '<option value="Paid"' + (order.status === 'Paid' ? ' selected' : '') + '>Paid</option>' +
          '</select>' +
        '</td>' +
        '<td>' +
          (order.outbound_confirmed
            ? '<span class="co-badge co-badge--paid">Dispatched</span>'
            : '<span class="co-badge co-badge--unpaid">Pending Dispatch</span>') +
        '</td>' +
        '<td style="text-align:center;">' +
          '<button class="co-download-btn" data-order-id="' + order.id + '" title="Download invoice PDF" aria-label="Download invoice">' +
            '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          '</button>' +
        '</td>' +
        '<td>' +
          '<div class="so-row-actions">' +
            '<button class="so-expand-btn" data-action="expand-order" data-order-id="' + order.id + '" aria-label="Expand order details">' +
              '<svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>' +
            '</button>' +
            '<button class="order-card__compact-delete" data-action="delete-order" data-order-id="' + order.id + '" title="Delete order" aria-label="Delete order">' +
              '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>' +
            '</button>' +
          '</div>' +
        '</td>' +
        '</tr>'
      );

      var detailRow = (
        '<tr class="so-detail-row so-detail-row--hidden" data-detail-for="' + order.id + '">' +
          '<td colspan="' + COLSPAN + '" class="so-detail-cell" data-items-loaded="false">' +
            '<p style="padding:12px 0;color:var(--ink-soft);font-size:0.83rem;">Loading items…</p>' +
          '</td>' +
        '</tr>'
      );

      return summaryRow + detailRow;
    }).join('');
  }

  function populateMonthFilter() {
    var seen = {};
    allOrders.forEach(function (o) {
      var ym = (o.invoice_date || '').slice(0, 7);
      if (ym) seen[ym] = true;
    });
    var months = Object.keys(seen).sort().reverse();

    monthSelect.innerHTML = '<option value="">All months</option>';
    months.forEach(function (ym) {
      var parts = ym.split('-');
      var d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
      var label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      var opt = document.createElement('option');
      opt.value = ym;
      opt.textContent = label;
      if (ym === currentMonthFilter) opt.selected = true;
      monthSelect.appendChild(opt);
    });

  }

  function applyFilter() {
    var filtered = allOrders.filter(function (o) {
      var monthMatch  = !currentMonthFilter || (o.invoice_date || '').slice(0, 7) === currentMonthFilter;
      var statusMatch = !currentFilter || o.status === currentFilter;
      return monthMatch && statusMatch;
    });
    renderTable(filtered);
  }

  // ── Actions ───────────────────────────────────────────────────────

  async function expandOrder(orderId, expandBtn) {
    var detailRow = tbody.querySelector('[data-detail-for="' + orderId + '"]');
    if (!detailRow) return;

    var isHidden = detailRow.classList.contains('so-detail-row--hidden');

    // Close
    if (!isHidden) {
      detailRow.classList.add('so-detail-row--hidden');
      expandBtn.classList.remove('so-expand-btn--open');
      return;
    }

    // Open
    detailRow.classList.remove('so-detail-row--hidden');
    expandBtn.classList.add('so-expand-btn--open');

    var td = detailRow.querySelector('td');
    if (td.dataset.itemsLoaded === 'true') return;

    try {
      var order = allOrders.find(function (o) { return o.id === orderId; });
      var items = await fetchItems(orderId);
      td.innerHTML     = buildDetailHtml(items, order || {});
      td.dataset.itemsLoaded = 'true';
    } catch (err) {
      console.error('Failed to load order items:', err);
      td.innerHTML = '<p style="padding:12px 0;color:#991b1b;font-size:0.83rem;">Could not load items. Please try again.</p>';
    }
  }

  async function deleteOrder(orderId) {
    var order = allOrders.find(function (o) { return o.id === orderId; });
    if (!order) return;
    if (order.outbound_confirmed) {
      window.alert('This order has been confirmed for dispatch and cannot be deleted.');

      window.MVB_AUDIT_LOG.log({
        module: 'Customer Orders',
        action: 'Delete',
        recordType: 'Customer Order',
        recordId: orderId,
        description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' attempted to delete Customer Order ' +
          (order.order_number || order.invoice_number || ('#' + orderId)) + ' but failed — it has already been confirmed for dispatch.',
        success: false,
      });

      return;
    }
    if (!window.confirm('Delete this order? This cannot be undone.')) return;

    try {
      await db.from('customer_order_items').delete().eq('order_id', orderId);
      var res = await db.from('customer_orders').delete().eq('id', orderId);
      if (res.error) throw res.error;
      delete loadedItems[orderId];
      allOrders = allOrders.filter(function (o) { return o.id !== orderId; });
      applyFilter();

      window.MVB_AUDIT_LOG.log({
        module: 'Customer Orders',
        action: 'Delete',
        recordType: 'Customer Order',
        recordId: orderId,
        description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' deleted Customer Order ' + (order.order_number || order.invoice_number || ('#' + orderId)) + '.',
        oldData: order,
      });
    } catch (err) {
      console.error('Failed to delete order:', err);
      window.alert('Could not delete the order. Please try again.');
    }
  }

  async function loadOrders() {
    tbody.innerHTML = '<tr><td colspan="' + COLSPAN + '" class="co-empty">Loading orders…</td></tr>';
    try {
      var result = await db
        .from('customer_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (result.error) throw result.error;

      allOrders = result.data || [];
      populateMonthFilter();
      applyFilter();
    } catch (err) {
      console.error('Failed to load customer orders:', err);
      tbody.innerHTML = '<tr><td colspan="' + COLSPAN + '" class="co-empty">Could not load orders. Please refresh.</td></tr>';
    }
  }

  async function regenerateInvoice(orderId) {
    var order = allOrders.find(function (o) { return o.id === orderId; });
    if (!order) return;

    try {
      var items = await fetchItems(orderId);

      var invoiceData = {
        invoiceNumber:    order.invoice_number || 'MED/------',
        invoiceDateValue: order.invoice_date || '',
        invoiceDateLabel: formatDate(order.invoice_date),
        dueDateValue:     order.due_date || '',
        dueDateLabel:     formatDate(order.due_date),
        billedTo:         order.billed_to || '',
        billedToLabel:    order.billed_to || 'Customer details not provided.',
        lineItems: items.map(function (item) {
          return {
            product: { name: item.product_name, unitPrice: Number(item.unit_price) },
            quantity: item.quantity,
            foc:      item.foc || 0,
            amount:   Number(item.amount),
          };
        }),
        subtotal:      items.reduce(function (s, i) { return s + Number(i.amount); }, 0),
        total:         Number(order.total_amount),
        totalQuantity: items.reduce(function (s, i) { return s + i.quantity; }, 0),
      };

      await loadPdfDeps();
      await window.MEDIVEX_PDF_GENERATOR.download(invoiceData);
    } catch (err) {
      console.error('Failed to regenerate invoice:', err);
      window.alert('Could not generate the invoice PDF. Please try again.');
    }
  }

  async function updateOrderStatus(orderId, newStatus) {
    var order = allOrders.find(function (o) { return o.id === orderId; });
    var oldStatus = order ? order.status : null;
    try {
      var result = await db
        .from('customer_orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (result.error) throw result.error;

      if (order) order.status = newStatus;

      window.MVB_AUDIT_LOG.log({
        module: 'Customer Orders',
        action: 'Payment Status Changed',
        recordType: 'Customer Order',
        recordId: orderId,
        description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' changed payment status of Customer Order ' +
          (order ? (order.order_number || order.invoice_number || ('#' + orderId)) : ('#' + orderId)) + ' from ' + oldStatus + ' to ' + newStatus + '.',
        oldData: { status: oldStatus },
        newData: { status: newStatus },
      });
    } catch (err) {
      console.error('Failed to update order status:', err);
      window.alert('Could not update the order status. Please try again.');
      loadOrders();
    }
  }

  // ── Events ────────────────────────────────────────────────────────

  monthSelect.addEventListener('change', function () {
    currentMonthFilter = monthSelect.value;
    applyFilter();
  });

  filterSelect.addEventListener('change', function () {
    currentFilter = filterSelect.value;
    applyFilter();
  });

  tbody.addEventListener('click', function (event) {
    var expandBtn = event.target.closest('[data-action="expand-order"]');
    if (expandBtn) {
      expandOrder(Number(expandBtn.dataset.orderId), expandBtn);
      return;
    }

    var deleteBtn = event.target.closest('[data-action="delete-order"]');
    if (deleteBtn) {
      deleteOrder(Number(deleteBtn.dataset.orderId));
      return;
    }

    var downloadBtn = event.target.closest('.co-download-btn');
    if (!downloadBtn) return;
    var orderId = Number(downloadBtn.dataset.orderId);
    downloadBtn.disabled = true;
    regenerateInvoice(orderId).finally(function () { downloadBtn.disabled = false; });
  });

  tbody.addEventListener('change', function (event) {
    var select = event.target.closest('.co-status-select');
    if (!select) return;
    updateOrderStatus(Number(select.dataset.orderId), select.value);
  });

  loadOrders();
})();

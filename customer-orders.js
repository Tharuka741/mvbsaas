(function () {
  var db = window.MVB_DB;
  var allOrders = [];
  var currentFilter = '';
  var pdfDepsLoaded = false;

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

  var tbody = document.getElementById('co-table-body');
  var filterSelect = document.getElementById('co-status-filter');
  var metricOrders = document.getElementById('co-metric-orders');
  var metricUnits = document.getElementById('co-metric-units');
  var metricRevenue = document.getElementById('co-metric-revenue');

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

  function statusBadgeClass(status) {
    return status === 'Paid' ? 'co-badge--paid' : 'co-badge--unpaid';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateMetrics(orders) {
    var totalUnits = orders.reduce(function (sum, o) { return sum + (o.item_count || 0); }, 0);
    var totalRevenue = orders.reduce(function (sum, o) { return sum + Number(o.total_amount || 0); }, 0);
    metricOrders.textContent = String(orders.length);
    metricUnits.textContent = String(totalUnits);
    metricRevenue.textContent = formatAmount(totalRevenue);
  }

  function renderTable(orders) {
    updateMetrics(orders);

    if (!orders.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="co-empty">No orders found.</td></tr>';
      return;
    }

    tbody.innerHTML = orders.map(function (order) {
      var badgeClass = statusBadgeClass(order.status);
      var customer = (order.billed_to || '').split('\n')[0] || '—';
      var orderRef = escapeHtml(order.order_number || order.invoice_number || '#' + order.id);
      return (
        '<tr>' +
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
        '<td style="text-align:center;">' +
          '<button class="co-download-btn" data-order-id="' + order.id + '" title="Download invoice PDF" aria-label="Download invoice">' +
            '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
          '</button>' +
        '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function applyFilter() {
    var filtered = currentFilter
      ? allOrders.filter(function (o) { return o.status === currentFilter; })
      : allOrders;
    renderTable(filtered);
  }

  async function loadOrders() {
    tbody.innerHTML = '<tr><td colspan="7" class="co-empty">Loading orders…</td></tr>';
    try {
      var result = await db
        .from('customer_orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (result.error) throw result.error;

      allOrders = result.data || [];
      applyFilter();
    } catch (err) {
      console.error('Failed to load customer orders:', err);
      tbody.innerHTML = '<tr><td colspan="7" class="co-empty">Could not load orders. Please refresh.</td></tr>';
    }
  }

  async function regenerateInvoice(orderId) {
    var order = allOrders.find(function (o) { return o.id === orderId; });
    if (!order) return;

    try {
      var itemsResult = await db
        .from('customer_order_items')
        .select('*')
        .eq('order_id', orderId);

      if (itemsResult.error) throw itemsResult.error;

      var items = itemsResult.data || [];

      var invoiceData = {
        invoiceNumber: order.invoice_number || 'MED/------',
        invoiceDateValue: order.invoice_date || '',
        invoiceDateLabel: formatDate(order.invoice_date),
        dueDateValue: order.due_date || '',
        dueDateLabel: formatDate(order.due_date),
        billedTo: order.billed_to || '',
        billedToLabel: order.billed_to || 'Customer details not provided.',
        lineItems: items.map(function (item) {
          return {
            product: {
              name: item.product_name,
              unitPrice: Number(item.unit_price),
            },
            quantity: item.quantity,
            foc: item.foc || 0,
            amount: Number(item.amount),
          };
        }),
        subtotal: items.reduce(function (sum, item) { return sum + Number(item.amount); }, 0),
        total: Number(order.total_amount),
        totalQuantity: items.reduce(function (sum, item) { return sum + item.quantity; }, 0),
      };

      await loadPdfDeps();

      await window.MEDIVEX_PDF_GENERATOR.download(invoiceData);
    } catch (err) {
      console.error('Failed to regenerate invoice:', err);
      window.alert('Could not generate the invoice PDF. Please try again.');
    }
  }

  async function updateOrderStatus(orderId, newStatus) {
    try {
      var result = await db
        .from('customer_orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (result.error) throw result.error;

      var order = allOrders.find(function (o) { return o.id === orderId; });
      if (order) order.status = newStatus;
    } catch (err) {
      console.error('Failed to update order status:', err);
      window.alert('Could not update the order status. Please try again.');
      loadOrders();
    }
  }

  filterSelect.addEventListener('change', function () {
    currentFilter = filterSelect.value;
    applyFilter();
  });

  tbody.addEventListener('click', function (event) {
    var btn = event.target.closest('.co-download-btn');
    if (!btn) return;

    var orderId = Number(btn.dataset.orderId);
    btn.disabled = true;
    regenerateInvoice(orderId).finally(function () {
      btn.disabled = false;
    });
  });

  tbody.addEventListener('change', function (event) {
    var select = event.target.closest('.co-status-select');
    if (!select) return;

    var orderId = Number(select.dataset.orderId);
    updateOrderStatus(orderId, select.value);
  });

  loadOrders();
})();

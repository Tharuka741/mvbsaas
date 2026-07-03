(function () {
  var db = window.MVB_DB;
  var pendingOrders = [];
  var orderItemsMap = {};

  var elCount   = document.getElementById('outbound-pending-count');
  var orderList = document.getElementById('outbound-order-list');

  function formatAmount(amount) {
    return Number(amount || 0).toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function formatDate(dateString) {
    if (!dateString) return '—';
    var parts = String(dateString).split('T')[0].split('-');
    if (parts.length !== 3) return dateString;
    return parts[0] + '/' + parts[1] + '/' + parts[2];
  }

  function formatQuantity(qty) {
    return Number(qty || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Render ────────────────────────────────────────────────────────

  function isAdminViewer() {
    return !!(window.MVB_USER && window.MVB_USER.role === 'admin');
  }

  function updateSidebarBadge() {
    var badge = document.getElementById('sidebar-badge-outbound');
    if (!badge) return;
    if (pendingOrders.length > 0) {
      badge.textContent = pendingOrders.length > 99 ? '99+' : String(pendingOrders.length);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  function renderOrders() {
    elCount.textContent = String(pendingOrders.length);
    updateSidebarBadge();

    if (!pendingOrders.length) {
      orderList.innerHTML =
        '<div class="orders-empty">No orders awaiting dispatch. ' +
        '<a href="invoice-generator.html">Create an invoice</a> to add a pending order.</div>';
      return;
    }

    orderList.innerHTML = pendingOrders.map(function (order) {
      var items    = orderItemsMap[order.id] || [];
      var customer = (order.billed_to || '').split('\n')[0] || '—';
      var orderRef = escapeHtml(order.order_number || order.invoice_number || '#' + order.id);

      return (
        '<article class="order-card" data-order-id="' + order.id + '">' +
        '<div class="order-card__header">' +
        '<div class="order-card__head-main">' +
        '<div>' +
        '<p class="section-kicker">Customer Order</p>' +
        '<h3>' + orderRef + '</h3>' +
        '<div class="order-card__meta">' +
        '<span class="order-badge">' + escapeHtml(customer) + '</span>' +
        '<span class="order-badge">Date: ' + escapeHtml(formatDate(order.invoice_date)) + '</span>' +
        '<span class="order-badge">' + formatQuantity(order.item_count) + ' lines</span>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="order-card__table-wrap"><table class="order-card__table">' +
        '<thead><tr><th>Product</th><th>Unit Price</th><th>Qty.</th><th>FOC</th><th>Amount</th></tr></thead>' +
        '<tbody>' +
        items.map(function (item) {
          return (
            '<tr>' +
            '<td>' + escapeHtml(item.product_name) + '</td>' +
            '<td>' + formatAmount(item.unit_price) + '</td>' +
            '<td>' + formatQuantity(item.quantity) + '</td>' +
            '<td>' + formatQuantity(item.foc || 0) + '</td>' +
            '<td>' + formatAmount(item.amount) + '</td>' +
            '</tr>'
          );
        }).join('') +
        '</tbody></table></div>' +
        '<div class="order-card__summary">' +
        '<div class="order-card__summary-card"><span>Total (LKR)</span><strong>' + formatAmount(order.total_amount) + '</strong></div>' +
        '</div>' +
        '<div class="outbound-stock-error" data-stock-error style="display:none;"></div>' +
        '<div class="inbound-card__footer">' +
        (isAdminViewer()
          ? '<span class="co-badge co-badge--unpaid">Pending manager approval</span>'
          : '<button class="button button--danger" data-action="reject">Reject</button>' +
            '<button class="button button--primary" data-action="confirm">Confirm Dispatch</button>') +
        '</div>' +
        '</article>'
      );
    }).join('');
  }

  // ── Load ──────────────────────────────────────────────────────────

  async function loadOrders() {
    try {
      var result = await db
        .from('customer_orders')
        .select('*')
        .or('outbound_confirmed.is.null,outbound_confirmed.eq.false')
        .order('created_at', { ascending: true });

      if (result.error) throw result.error;

      pendingOrders   = result.data || [];
      orderItemsMap   = {};

      if (pendingOrders.length) {
        var ids = pendingOrders.map(function (o) { return o.id; });
        var itemsRes = await db.from('customer_order_items').select('*').in('order_id', ids);
        if (!itemsRes.error && itemsRes.data) {
          itemsRes.data.forEach(function (item) {
            if (!orderItemsMap[item.order_id]) orderItemsMap[item.order_id] = [];
            orderItemsMap[item.order_id].push(item);
          });
        }
      }

      renderOrders();
    } catch (err) {
      console.error('Failed to load pending orders:', err && (err.message || err.details || err));
      orderList.innerHTML = '<div class="orders-empty">Could not load orders. Please refresh.</div>';
    }
  }

  // ── Confirm dispatch ──────────────────────────────────────────────

  async function confirmOrder(orderId, card) {
    var confirmBtn = card.querySelector('[data-action="confirm"]');
    var rejectBtn  = card.querySelector('[data-action="reject"]');
    var errorDiv   = card.querySelector('[data-stock-error]');

    confirmBtn.disabled    = true;
    confirmBtn.textContent = 'Checking stock…';
    rejectBtn.disabled     = true;

    try {
      var items = orderItemsMap[orderId] || [];

      // ── Stock check ──────────────────────────────────────────────
      var shortfalls = [];
      for (var i = 0; i < items.length; i++) {
        var item   = items[i];
        var needed = item.quantity + (item.foc || 0);
        if (needed <= 0) continue;

        var fetchRes = await db.from('products')
          .select('id, name, stock_quantity')
          .eq('name', item.product_name);

        if (fetchRes.error || !fetchRes.data || !fetchRes.data.length) continue;
        var available = fetchRes.data[0].stock_quantity || 0;
        if (available < needed) {
          shortfalls.push({
            name:     item.product_name,
            available: available,
            needed:   needed,
            shortBy:  needed - available,
          });
        }
      }

      if (shortfalls.length) {
        var html = '<p class="outbound-stock-error__title">Cannot confirm — insufficient stock for the following items:</p><ul class="outbound-stock-error__list">';
        shortfalls.forEach(function (s) {
          html +=
            '<li><strong>' + escapeHtml(s.name) + '</strong>' +
            ' — need <strong>' + s.needed + '</strong>' +
            ', have <strong>' + s.available + '</strong>' +
            ' (short by <strong>' + s.shortBy + '</strong> units)</li>';
        });
        html += '</ul>';
        errorDiv.innerHTML  = html;
        errorDiv.style.display = '';
        confirmBtn.disabled    = false;
        confirmBtn.textContent = 'Confirm Dispatch';
        rejectBtn.disabled     = false;

        var orderForFailure = pendingOrders.find(function (o) { return o.id === orderId; });
        var shortfallSummary = shortfalls.map(function (s) {
          return s.name + ' (need ' + s.needed + ', have ' + s.available + ')';
        }).join(', ');

        window.MVB_AUDIT_LOG.log({
          module: 'Outbound',
          action: 'Dispatch Confirmed',
          recordType: 'Customer Order',
          recordId: orderId,
          description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' attempted to confirm dispatch for Customer Order ' +
            (orderForFailure ? (orderForFailure.order_number || orderForFailure.invoice_number || ('#' + orderId)) : ('#' + orderId)) +
            ' but failed — insufficient stock for ' + shortfallSummary + '.',
          success: false,
        });

        return;
      }

      // All stock OK — hide any previous error
      errorDiv.style.display = 'none';
      confirmBtn.textContent = 'Confirming…';

      // ── Deduct stock ─────────────────────────────────────────────
      for (var j = 0; j < items.length; j++) {
        var item2    = items[j];
        var reduceBy = item2.quantity + (item2.foc || 0);
        if (reduceBy <= 0) continue;

        var fetchRes2 = await db.from('products')
          .select('id, stock_quantity')
          .eq('name', item2.product_name);

        if (!fetchRes2.error && fetchRes2.data) {
          for (var k = 0; k < fetchRes2.data.length; k++) {
            var prod   = fetchRes2.data[k];
            var oldQty = prod.stock_quantity || 0;
            var newQty = oldQty - reduceBy;
            await db.from('products').update({
              stock_quantity: newQty,
            }).eq('id', prod.id);

            window.MVB_AUDIT_LOG.log({
              module: 'Outbound',
              action: 'Stock Deducted',
              recordType: 'Product',
              recordId: prod.id,
              description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' deducted stock for Product "' + item2.product_name + '" on dispatch, updating quantity from ' + oldQty + ' to ' + newQty + '.',
              oldData: { stock_quantity: oldQty },
              newData: { stock_quantity: newQty },
            });
          }
        }
      }

      // ── Mark order as confirmed ───────────────────────────────────
      var orderBeingConfirmed = pendingOrders.find(function (o) { return o.id === orderId; });
      var updRes = await db.from('customer_orders')
        .update({ outbound_confirmed: true })
        .eq('id', orderId);
      if (updRes.error) throw updRes.error;

      pendingOrders = pendingOrders.filter(function (o) { return o.id !== orderId; });
      delete orderItemsMap[orderId];
      renderOrders();

      window.MVB_AUDIT_LOG.log({
        module: 'Outbound',
        action: 'Dispatch Confirmed',
        recordType: 'Customer Order',
        recordId: orderId,
        description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' confirmed dispatch for Customer Order ' +
          (orderBeingConfirmed ? (orderBeingConfirmed.order_number || orderBeingConfirmed.invoice_number || ('#' + orderId)) : ('#' + orderId)) + '.',
        oldData: { outbound_confirmed: false },
        newData: { outbound_confirmed: true },
      });
    } catch (err) {
      console.error('Failed to confirm order:', err && (err.message || err.details || err));
      window.alert('Could not confirm the order. Please try again.');
      confirmBtn.disabled    = false;
      confirmBtn.textContent = 'Confirm Dispatch';
      rejectBtn.disabled     = false;
    }
  }

  // ── Reject order ──────────────────────────────────────────────────

  async function rejectOrder(orderId, card) {
    if (!window.confirm('Reject this order? It will be deleted and cannot be undone.')) return;

    var confirmBtn = card.querySelector('[data-action="confirm"]');
    var rejectBtn  = card.querySelector('[data-action="reject"]');
    rejectBtn.disabled    = true;
    rejectBtn.textContent = 'Rejecting…';
    confirmBtn.disabled   = true;

    var orderBeingRejected = pendingOrders.find(function (o) { return o.id === orderId; });

    try {
      await db.from('customer_order_items').delete().eq('order_id', orderId);
      var delRes = await db.from('customer_orders').delete().eq('id', orderId);
      if (delRes.error) throw delRes.error;

      pendingOrders = pendingOrders.filter(function (o) { return o.id !== orderId; });
      delete orderItemsMap[orderId];
      renderOrders();

      window.MVB_AUDIT_LOG.log({
        module: 'Outbound',
        action: 'Dispatch Rejected',
        recordType: 'Customer Order',
        recordId: orderId,
        description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' rejected dispatch for Customer Order ' +
          (orderBeingRejected ? (orderBeingRejected.order_number || orderBeingRejected.invoice_number || ('#' + orderId)) : ('#' + orderId)) + '.',
        oldData: orderBeingRejected,
      });
    } catch (err) {
      console.error('Failed to reject order:', err && (err.message || err.details || err));
      window.alert('Could not reject the order. Please try again.');
      rejectBtn.disabled    = false;
      rejectBtn.textContent = 'Reject';
      confirmBtn.disabled   = false;
    }
  }

  // ── Events ────────────────────────────────────────────────────────

  orderList.addEventListener('click', function (e) {
    var btn  = e.target.closest('[data-action]');
    if (!btn) return;
    var card = btn.closest('[data-order-id]');
    if (!card) return;
    var orderId = Number(card.dataset.orderId);

    if (btn.dataset.action === 'confirm') {
      confirmOrder(orderId, card);
    } else if (btn.dataset.action === 'reject') {
      rejectOrder(orderId, card);
    }
  });

  // ── Init ──────────────────────────────────────────────────────────
  loadOrders();
})();

(function () {
  var db = window.MVB_DB;

  function esc(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtCurrency(v) {
    var n = Number(v || 0);
    if (n >= 1000000) return 'Rs ' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000)    return 'Rs ' + (n / 1000).toFixed(0) + 'K';
    return 'Rs ' + n.toLocaleString('en-LK', { maximumFractionDigits: 0 });
  }

  function statusBadge(status) {
    var s = (status || '').toLowerCase();
    var cls = s === 'paid'     ? 'dash-badge--paid'     :
              s === 'unpaid'   ? 'dash-badge--pending'   :
              s === 'received' ? 'dash-badge--received'  :
              s === 'partial'  ? 'dash-badge--partial'   :
              s === 'ordered'  ? 'dash-badge--ordered'   :
                                 'dash-badge--draft';
    return '<span class="dash-badge ' + cls + '">' + esc(status || '—') + '</span>';
  }

  async function loadDashboard() {
    var now        = new Date();
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    var monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    var results = await Promise.all([
      // Revenue this month
      db.from('customer_orders').select('total_amount').gte('invoice_date', monthStart).lte('invoice_date', monthEnd),
      // Unpaid count
      db.from('customer_orders').select('id', { count: 'exact', head: true }).eq('status', 'Unpaid'),
      // Total orders count
      db.from('customer_orders').select('id', { count: 'exact', head: true }),
      // Pending GRNs count
      db.from('grns').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      // Recent customer orders
      db.from('customer_orders').select('invoice_number, billed_to, total_amount, status').order('id', { ascending: false }).limit(5),
      // Recent supplier orders
      db.from('supplier_orders').select('order_number, supplier, total_amount, status').order('id', { ascending: false }).limit(5),
      // Products with lowest stock
      db.from('products').select('name, stock_quantity').order('stock_quantity', { ascending: true }).limit(6),
      // Pending GRNs detail
      db.from('grns').select('id, supplier_orders(order_number, supplier)').eq('status', 'pending').order('id', { ascending: false }).limit(6),
    ]);

    var revenueRes       = results[0];
    var unpaidRes        = results[1];
    var totalOrdersRes   = results[2];
    var pendingGrnCntRes = results[3];
    var coRes            = results[4];
    var soRes            = results[5];
    var productsRes      = results[6];
    var pendingGrnsRes   = results[7];

    // ── Stat cards ────────────────────────────────────────────────
    var revenue = (revenueRes.data || []).reduce(function (s, r) { return s + (r.total_amount || 0); }, 0);
    document.getElementById('dash-revenue').textContent      = fmtCurrency(revenue);
    document.getElementById('dash-unpaid').textContent       = String(unpaidRes.count || 0);
    document.getElementById('dash-total-orders').textContent = String(totalOrdersRes.count || 0);
    document.getElementById('dash-grns-pending').textContent = String(pendingGrnCntRes.count || 0);

    // ── Recent customer orders ────────────────────────────────────
    var coTbody = document.getElementById('dash-co-tbody');
    var coRows  = coRes.data || [];
    if (!coRows.length) {
      coTbody.innerHTML = '<tr><td colspan="4" class="pdash-empty">No customer orders yet.</td></tr>';
    } else {
      coTbody.innerHTML = coRows.map(function (o) {
        return '<tr>' +
          '<td class="dash-cell-id">' + esc(o.invoice_number || '—') + '</td>' +
          '<td>' + esc(o.billed_to || '—') + '</td>' +
          '<td class="dash-cell-amount">' + fmtCurrency(o.total_amount) + '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
          '</tr>';
      }).join('');
    }

    // ── Recent supplier orders ────────────────────────────────────
    var soTbody = document.getElementById('dash-so-tbody');
    var soRows  = soRes.data || [];
    if (!soRows.length) {
      soTbody.innerHTML = '<tr><td colspan="4" class="pdash-empty">No supplier orders yet.</td></tr>';
    } else {
      soTbody.innerHTML = soRows.map(function (o) {
        return '<tr>' +
          '<td class="dash-cell-id">' + esc(o.order_number || '—') + '</td>' +
          '<td>' + esc(o.supplier || '—') + '</td>' +
          '<td class="dash-cell-amount">' + fmtCurrency(o.total_amount) + '</td>' +
          '<td>' + statusBadge(o.status) + '</td>' +
          '</tr>';
      }).join('');
    }

    // ── Stock levels ──────────────────────────────────────────────
    var stockList = document.getElementById('dash-stock-list');
    var products  = productsRes.data || [];
    if (!products.length) {
      stockList.innerHTML = '<p class="pdash-empty" style="padding:12px 0;">No products found.</p>';
    } else {
      var maxQty = Math.max.apply(null, products.map(function (p) { return p.stock_quantity || 0; }));
      if (maxQty === 0) maxQty = 1;
      stockList.innerHTML = products.map(function (p) {
        var qty     = p.stock_quantity || 0;
        var pct     = Math.round((qty / maxQty) * 100);
        var fillCls = qty <= 0 ? 'stock-bar-fill--crit' : qty < 10 ? 'stock-bar-fill--low' : 'stock-bar-fill--ok';
        return '<div class="stock-row">' +
          '<span class="stock-row__name">' + esc(p.name) + '</span>' +
          '<div class="stock-bar-track"><div class="stock-bar-fill ' + fillCls + '" style="width:' + pct + '%"></div></div>' +
          '<span class="stock-row__units">' + qty + '</span>' +
          '</div>';
      }).join('');
    }

    // ── Pending inbound GRNs ──────────────────────────────────────
    var activityList = document.getElementById('dash-activity-list');
    var pendingGrns  = pendingGrnsRes.data || [];
    if (!pendingGrns.length) {
      activityList.innerHTML = '<p class="pdash-empty" style="padding:16px 0;">No pending GRNs — all clear.</p>';
    } else {
      activityList.innerHTML = pendingGrns.map(function (g) {
        var so = g.supplier_orders || {};
        return '<div class="activity-item">' +
          '<div class="activity-dot activity-dot--amber"></div>' +
          '<span class="activity-item__text">GRN #' + g.id + ' — ' + esc(so.supplier || '—') + ' (' + esc(so.order_number || '—') + ')</span>' +
          '</div>';
      }).join('');
    }
  }

  loadDashboard().catch(function (err) {
    console.error('Dashboard load error:', err && (err.message || err));
  });
})();

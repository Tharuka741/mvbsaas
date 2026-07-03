(function () {
  var db = window.MVB_DB;
  var G  = window.GrnPdf;

  var pdfDepsLoaded = false;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.body.appendChild(s);
    });
  }

  async function loadPdfDeps() {
    if (pdfDepsLoaded) return;
    await loadScript('assets/vendor/pdf-lib.min.js');
    await loadScript('grn-template-data.js');
    pdfDepsLoaded = true;
  }

  // ── State ─────────────────────────────────────────────────────────
  var pendingGrns = [];

  // ── DOM refs ──────────────────────────────────────────────────────
  var elCount  = document.getElementById('inbound-pending-count');
  var grnList  = document.getElementById('inbound-grn-list');

  // ── Render ────────────────────────────────────────────────────────

  function renderPendingGrns() {
    elCount.textContent = String(pendingGrns.length);

    if (!pendingGrns.length) {
      grnList.innerHTML =
        '<div class="orders-empty">No GRNs awaiting confirmation. ' +
        '<a href="grn.html">Generate a GRN</a> from a pending supplier order.</div>';
      return;
    }

    grnList.innerHTML = pendingGrns.map(function (grn) {
      var ord      = (grn.supplier_orders && grn.supplier_orders[0]) || {};
      var items    = ord.supplier_order_items || [];
      var grnNo    = grn.batch_date
        ? 'GRN-' + grn.batch_date + '-' + String(grn.id).padStart(3, '0')
        : 'GRN-' + grn.id;

      return (
        '<article class="order-card" data-grn-id="' + grn.id + '" data-order-id="' + (ord.id || '') + '">' +
        '<div class="order-card__header">' +
        '<div class="order-card__head-main">' +
        '<div>' +
        '<p class="section-kicker">GRN</p>' +
        '<h3>' + G.escapeHtml(grnNo) + '</h3>' +
        '<div class="order-card__meta">' +
        '<span class="order-badge">' + G.escapeHtml(ord.supplier_name || '—') + '</span>' +
        (ord.reference ? '<span class="order-badge">Ref: ' + G.escapeHtml(ord.reference) + '</span>' : '') +
        '<span class="order-badge">Date: ' + G.escapeHtml(G.formatDisplayDate(ord.order_date)) + '</span>' +
        '<span class="order-badge">' + G.formatQuantity(ord.total_quantity) + ' units</span>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="order-card__table-wrap"><table class="order-card__table">' +
        '<thead><tr><th>Product</th><th>Unit Cost</th><th>Qty.</th><th>FOC</th><th>Total</th><th>VAT</th><th>Net</th></tr></thead>' +
        '<tbody>' +
        items.map(function (item) {
          return (
            '<tr>' +
            '<td>' + G.escapeHtml(item.product_name) + '</td>' +
            '<td>' + G.formatAmount(item.unit_cost) + '</td>' +
            '<td>' + G.formatQuantity(item.quantity) + '</td>' +
            '<td>' + G.formatQuantity(item.foc || 0) + '</td>' +
            '<td>' + G.formatAmount(item.subtotal) + '</td>' +
            '<td>' + G.formatAmount(item.vat) + '</td>' +
            '<td>' + G.formatAmount(item.net) + '</td>' +
            '</tr>'
          );
        }).join('') +
        '</tbody></table></div>' +
        '<div class="order-card__summary">' +
        '<div class="order-card__summary-card"><span>Net Total</span><strong>' + G.formatAmount(ord.net_total) + '</strong></div>' +
        '</div>' +
        '<div class="inbound-card__footer">' +
        '<button class="button button--soft" data-action="download" title="Download GRN PDF">Download PDF</button>' +
        '<button class="button button--danger" data-action="reject" title="Reject and delete this GRN">Reject</button>' +
        '<button class="button button--primary" data-action="confirm" title="Confirm GRN and update stock">Confirm GRN</button>' +
        '</div>' +
        '</article>'
      );
    }).join('');
  }

  // ── Load ──────────────────────────────────────────────────────────

  async function loadPendingGrns() {
    try {
      var result = await db
        .from('grns')
        .select('*, supplier_orders(*, supplier_order_items(*))')
        .eq('status', 'pending')
        .order('id', { ascending: true });

      if (result.error) throw result.error;

      pendingGrns = result.data || [];
      renderPendingGrns();
    } catch (err) {
      console.error('Failed to load pending GRNs:', err && (err.message || err.details || err));
      grnList.innerHTML = '<div class="orders-empty">Could not load GRNs. Please refresh.</div>';
    }
  }

  // ── Confirm GRN ───────────────────────────────────────────────────

  async function confirmGrn(grnId, card) {
    var confirmBtn  = card.querySelector('[data-action="confirm"]');
    var downloadBtn = card.querySelector('[data-action="download"]');
    var orderId     = Number(card.dataset.orderId);

    confirmBtn.disabled  = true;
    confirmBtn.textContent = 'Confirming…';
    downloadBtn.disabled = true;

    try {
      // 1. Mark GRN as confirmed
      var now = new Date().toISOString();
      var updRes = await db.from('grns')
        .update({ status: 'confirmed', confirmed_at: now })
        .eq('id', grnId);
      if (updRes.error) throw updRes.error;

      // 2. Update product stock quantities
      var grn   = pendingGrns.find(function (g) { return g.id === grnId; });
      var ord   = grn && grn.supplier_orders && grn.supplier_orders[0];
      var items = ord ? (ord.supplier_order_items || []) : [];

      window.MVB_AUDIT_LOG.log({
        module: 'GRN',
        action: 'GRN Confirmed',
        recordType: 'GRN',
        recordId: grnId,
        description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' confirmed GRN #' + grnId + '.',
        oldData: { status: 'pending' },
        newData: { status: 'confirmed', confirmed_at: now },
      });

      var stockMap = {};
      items.forEach(function (item) {
        stockMap[item.product_name] = (stockMap[item.product_name] || 0) + item.quantity + (item.foc || 0);
      });

      var productNames = Object.keys(stockMap);
      for (var i = 0; i < productNames.length; i++) {
        var name    = productNames[i];
        var qty     = stockMap[name];
        var fetchRes = await db.from('products').select('id, stock_quantity').eq('name', name);
        if (!fetchRes.error && fetchRes.data) {
          for (var j = 0; j < fetchRes.data.length; j++) {
            var prod   = fetchRes.data[j];
            var oldQty = prod.stock_quantity || 0;
            var newQty = oldQty + qty;
            await db.from('products').update({
              stock_quantity: newQty,
            }).eq('id', prod.id);

            window.MVB_AUDIT_LOG.log({
              module: 'Inbound',
              action: 'Stock Received',
              recordType: 'Product',
              recordId: prod.id,
              description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' received stock for Product "' + name + '" via GRN #' + grnId + ', updating quantity from ' + oldQty + ' to ' + newQty + '.',
              oldData: { stock_quantity: oldQty },
              newData: { stock_quantity: newQty },
            });
          }
        }
      }

      // 3. Remove from list
      pendingGrns = pendingGrns.filter(function (g) { return g.id !== grnId; });
      renderPendingGrns();
    } catch (err) {
      console.error('Failed to confirm GRN:', err);
      window.alert('Could not confirm the GRN. Please try again.');
      confirmBtn.disabled  = false;
      confirmBtn.textContent = 'Confirm GRN';
      downloadBtn.disabled = false;
    }
  }

  // ── Reject GRN ───────────────────────────────────────────────────

  async function rejectGrn(grnId, card) {
    if (!window.confirm('Reject this GRN? It will be deleted and the supplier order will return to pending.')) return;

    var rejectBtn  = card.querySelector('[data-action="reject"]');
    var confirmBtn = card.querySelector('[data-action="confirm"]');
    var downloadBtn = card.querySelector('[data-action="download"]');
    var orderId = Number(card.dataset.orderId);

    rejectBtn.disabled  = true;
    rejectBtn.textContent = 'Rejecting…';
    confirmBtn.disabled = true;
    downloadBtn.disabled = true;

    var grnToReject = pendingGrns.find(function (g) { return g.id === grnId; });

    try {
      // Mark the supplier order as GRN rejected (stays out of pending list)
      var remarkRes = await db.from('supplier_orders')
        .update({ grn_id: null, grn_remark: 'GRN Rejected' })
        .eq('grn_id', grnId);
      if (remarkRes.error) throw remarkRes.error;

      // Delete the GRN record
      var deleteRes = await db.from('grns').delete().eq('id', grnId);
      if (deleteRes.error) throw deleteRes.error;

      pendingGrns = pendingGrns.filter(function (g) { return g.id !== grnId; });
      renderPendingGrns();

      window.MVB_AUDIT_LOG.log({
        module: 'GRN',
        action: 'GRN Rejected',
        recordType: 'GRN',
        recordId: grnId,
        description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' rejected GRN #' + grnId + '.',
        oldData: grnToReject ? {
          batch_date: grnToReject.batch_date,
          status: grnToReject.status,
          net_total: grnToReject.net_total,
          total_items: grnToReject.total_items,
        } : null,
      });
    } catch (err) {
      console.error('Failed to reject GRN:', err && (err.message || err.details || err));
      window.alert('Could not reject the GRN. Please try again.');
      rejectBtn.disabled   = false;
      rejectBtn.textContent = 'Reject';
      confirmBtn.disabled  = false;
      downloadBtn.disabled = false;
    }
  }

  // ── Download GRN PDF ──────────────────────────────────────────────

  async function downloadGrn(grnId) {
    try {
      var result = await db
        .from('supplier_orders')
        .select('*, supplier_order_items(*)')
        .eq('grn_id', grnId)
        .single();

      if (result.error) throw result.error;

      await loadPdfDeps();
      var pdfResults = await G.buildAllGrnPdfs([G.normalizeOrder(result.data)]);
      var blob = new Blob([pdfResults[0].bytes], { type: 'application/pdf' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href = url; a.download = pdfResults[0].filename; a.click();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (err) {
      console.error('Failed to download GRN:', err);
      window.alert('Could not generate the GRN PDF. Please try again.');
    }
  }

  // ── Events ────────────────────────────────────────────────────────

  grnList.addEventListener('click', function (e) {
    var btn  = e.target.closest('[data-action]');
    if (!btn) return;
    var card  = btn.closest('[data-grn-id]');
    if (!card) return;
    var grnId = Number(card.dataset.grnId);

    if (btn.dataset.action === 'confirm') {
      confirmGrn(grnId, card);
    } else if (btn.dataset.action === 'reject') {
      rejectGrn(grnId, card);
    } else if (btn.dataset.action === 'download') {
      downloadGrn(grnId);
    }
  });

  // ── Init ──────────────────────────────────────────────────────────
  loadPendingGrns();
})();

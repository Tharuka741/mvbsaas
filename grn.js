(function () {
  var db = window.MVB_DB;
  var G  = window.GrnPdf;   // shared helpers from grn-pdf.js

  var pdfDepsLoaded = false;
  var zipDepLoaded  = false;

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

  async function loadZipDep() {
    if (zipDepLoaded) return;
    await loadScript('https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js');
    zipDepLoaded = true;
  }

  // ── State ─────────────────────────────────────────────────────────
  var pendingOrders   = [];
  var selectedOrderIds = new Set();
  var grnList         = [];
  var pendingGrnState = null;

  // ── DOM refs ──────────────────────────────────────────────────────
  var pendingList      = document.getElementById('grn-pending-list');
  var elPendingCount   = document.getElementById('grn-pending-count');
  var elPendingUnits   = document.getElementById('grn-pending-units');
  var elPendingTotal   = document.getElementById('grn-pending-total');
  var elSelectedCount  = document.getElementById('grn-selected-count');
  var btnSelectAll     = document.getElementById('grn-select-all');
  var btnClearAll      = document.getElementById('grn-clear-all');
  var btnGenerate      = document.getElementById('grn-generate-btn');
  var confirmBar       = document.getElementById('grn-confirm-bar');
  var btnConfirm       = document.getElementById('grn-confirm-btn');
  var btnDiscard       = document.getElementById('grn-discard-btn');
  var grnTbody         = document.getElementById('grn-register-tbody');
  var elRegCount       = document.getElementById('grn-reg-count');

  function setButtonBusy(btn, busy, idleLabel, busyLabel) {
    btn.disabled = busy;
    btn.textContent = busy ? busyLabel : idleLabel;
  }

  // ── Render pending orders ─────────────────────────────────────────

  function renderPendingOrders() {
    var totalUnits = pendingOrders.reduce(function (s, o) { return s + (o.total_quantity || 0); }, 0);
    var totalNet   = G.roundCurrency(pendingOrders.reduce(function (s, o) { return s + Number(o.net_total || 0); }, 0));
    var selCount   = selectedOrderIds.size;

    elPendingCount.textContent  = String(pendingOrders.length);
    elPendingUnits.textContent  = G.formatQuantity(totalUnits);
    elPendingTotal.textContent  = G.formatAmount(totalNet);
    elSelectedCount.textContent = selCount + ' order' + (selCount === 1 ? '' : 's') + ' selected';
    btnSelectAll.disabled = !pendingOrders.length;
    btnClearAll.disabled  = !selCount;
    btnGenerate.disabled  = !selCount;

    if (!pendingOrders.length) {
      pendingList.innerHTML =
        '<div class="orders-empty">No pending supplier orders. ' +
        '<a href="supplier-orders.html">Create a supplier order</a> to get started.</div>';
      return;
    }

    pendingList.innerHTML = pendingOrders.map(function (order) {
      var isSelected = selectedOrderIds.has(order.id);
      return (
        '<article class="order-card' + (isSelected ? ' order-card--selected' : '') +
        '" data-order-id="' + order.id + '">' +
        '<div class="order-card__header">' +
        '<div class="order-card__head-main">' +
        '<input class="order-card__select" type="checkbox" data-action="toggle-order"' +
        (isSelected ? ' checked' : '') + ' aria-label="Select order" />' +
        '<div>' +
        '<p class="section-kicker">Supplier Order</p>' +
        '<h3>' + G.escapeHtml(order.supplier_name) + '</h3>' +
        '<div class="order-card__meta">' +
        '<span class="order-badge">Date: ' + G.escapeHtml(G.formatDisplayDate(order.order_date)) + '</span>' +
        (order.reference ? '<span class="order-badge">Ref: ' + G.escapeHtml(order.reference) + '</span>' : '') +
        '<span class="order-badge">VAT: ' + (order.vat_enabled ? 'On' : 'Off') + '</span>' +
        '<span class="order-badge">' + G.formatQuantity(order.total_quantity) + ' units</span>' +
        '</div></div></div></div>' +
        '<div class="order-card__table-wrap"><table class="order-card__table">' +
        '<thead><tr><th>Product</th><th>Unit Cost</th><th>Qty.</th><th>Total</th><th>VAT</th><th>Net</th></tr></thead>' +
        '<tbody>' +
        (order.supplier_order_items || []).map(function (item) {
          return (
            '<tr>' +
            '<td>' + G.escapeHtml(item.product_name) + '</td>' +
            '<td>' + G.formatAmount(item.unit_cost) + '</td>' +
            '<td>' + G.formatQuantity(item.quantity) + '</td>' +
            '<td>' + G.formatAmount(item.subtotal) + '</td>' +
            '<td>' + G.formatAmount(item.vat) + '</td>' +
            '<td>' + G.formatAmount(item.net) + '</td>' +
            '</tr>'
          );
        }).join('') +
        '</tbody></table></div>' +
        '<div class="order-card__summary">' +
        '<div class="order-card__summary-card"><span>Subtotal</span><strong>' + G.formatAmount(order.subtotal) + '</strong></div>' +
        '<div class="order-card__summary-card"><span>' + (order.vat_enabled ? 'VAT 18%' : 'VAT 0%') + '</span><strong>' + G.formatAmount(order.vat_total) + '</strong></div>' +
        '<div class="order-card__summary-card"><span>Total Qty.</span><strong>' + G.formatQuantity(order.total_quantity) + '</strong></div>' +
        '<div class="order-card__summary-card"><span>' + (order.vat_enabled ? 'Net Total Incl VAT' : 'Net Total') + '</span><strong>' + G.formatAmount(order.net_total) + '</strong></div>' +
        '</div></article>'
      );
    }).join('');
  }

  // ── Render GRN register (confirmed GRNs only) ─────────────────────

  function renderGrnRegister() {
    elRegCount.textContent = String(grnList.length);

    if (!grnList.length) {
      grnTbody.innerHTML = '<tr><td colspan="6" class="pdash-empty">No confirmed GRNs yet.</td></tr>';
      return;
    }

    grnTbody.innerHTML = grnList.map(function (grn) {
      var ord      = (grn.supplier_orders && grn.supplier_orders[0]) || {};
      var grnNo    = grn.batch_date ? 'GRN-' + grn.batch_date + '-' + String(grn.id).padStart(3, '0') : 'GRN-' + grn.id;
      var supplier = ord.supplier_name || '—';
      var reference = ord.reference   || '—';
      var orderDate = G.formatDisplayDate(ord.order_date);
      var netTotal  = G.formatAmount(ord.net_total != null ? ord.net_total : grn.net_total);
      return (
        '<tr>' +
        '<td><strong>' + G.escapeHtml(grnNo) + '</strong></td>' +
        '<td>' + G.escapeHtml(supplier) + '</td>' +
        '<td>' + G.escapeHtml(reference) + '</td>' +
        '<td>' + orderDate + '</td>' +
        '<td class="co-cell-amount">' + netTotal + '</td>' +
        '<td style="text-align:center;">' +
        '<button class="co-download-btn" data-grn-id="' + grn.id + '" title="Download GRN PDF" aria-label="Download GRN">' +
        '<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
        '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        '</button>' +
        '</td>' +
        '</tr>'
      );
    }).join('');
  }

  // ── Load data ─────────────────────────────────────────────────────

  async function loadPendingOrders() {
    try {
      var result = await db
        .from('supplier_orders')
        .select('*, supplier_order_items(*)')
        .is('grn_id', null)
        .is('grn_remark', null)
        .order('created_at', { ascending: false });

      if (result.error) throw result.error;

      pendingOrders = (result.data || []).map(G.normalizeOrder);

      var validIds = new Set(pendingOrders.map(function (o) { return o.id; }));
      selectedOrderIds.forEach(function (id) { if (!validIds.has(id)) selectedOrderIds.delete(id); });

      renderPendingOrders();
    } catch (err) {
      console.error('Failed to load pending orders:', err);
      pendingList.innerHTML = '<div class="orders-empty">Could not load orders. Please refresh.</div>';
    }
  }

  async function loadGrnList() {
    try {
      var result = await db
        .from('grns')
        .select('*, supplier_orders(supplier_name, reference, order_date, net_total, total_quantity)')
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: false });

      if (result.error) throw result.error;

      grnList = result.data || [];
      renderGrnRegister();
    } catch (err) {
      console.error('Failed to load GRN list:', err);
    }
  }

  // ── Generate GRN flow ─────────────────────────────────────────────

  async function handleGenerate() {
    var selected = pendingOrders.filter(function (o) { return selectedOrderIds.has(o.id); });
    if (!selected.length) {
      window.alert('Select at least one supplier order to generate a GRN.');
      return;
    }

    setButtonBusy(btnGenerate, true, 'Generate GRN', 'Generating…');

    try {
      await loadPdfDeps();
      if (selected.length > 1) await loadZipDep();
    } catch (e) {
      window.alert('Could not load the GRN template. Please refresh and try again.');
      setButtonBusy(btnGenerate, false, 'Generate GRN', 'Generating…');
      return;
    }

    try {
      var pdfResults = await G.buildAllGrnPdfs(selected);

      if (pdfResults.length === 1) {
        var blob = new Blob([pdfResults[0].bytes], { type: 'application/pdf' });
        var url  = URL.createObjectURL(blob);
        window.open(url, '_blank');
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 8000);
      } else {
        var zip = new window.JSZip();
        pdfResults.forEach(function (r) { zip.file(r.filename, r.bytes); });
        var now     = new Date();
        var zipName = 'GRNs-' + String(now.getFullYear()).slice(2) + G.pad(now.getMonth() + 1) + G.pad(now.getDate()) + '.zip';
        var zipBlob = await zip.generateAsync({ type: 'blob' });
        var zipUrl  = URL.createObjectURL(zipBlob);
        var a = document.createElement('a');
        a.href = zipUrl; a.download = zipName; a.click();
        window.setTimeout(function () { URL.revokeObjectURL(zipUrl); }, 8000);
      }

      pendingGrnState = { selectedOrders: selected };
      confirmBar.classList.remove('grn-confirm-bar--hidden');
      confirmBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      console.error('GRN generation failed:', err);
      window.alert('Could not generate the GRN PDF. Please try again.');
    } finally {
      setButtonBusy(btnGenerate, false, 'Generate GRN', 'Generating…');
    }
  }

  // ── Save to Inbound ───────────────────────────────────────────────
  // Saves GRN records as status='pending'. Stock is updated later on the Inbound page.

  async function handleSaveToInbound() {
    if (!pendingGrnState) return;

    setButtonBusy(btnConfirm, true, 'Save to Inbound', 'Saving…');
    btnDiscard.disabled = true;

    try {
      var selectedOrders = pendingGrnState.selectedOrders;
      var now       = new Date();
      var batchDate = String(now.getFullYear()).slice(2) + G.pad(now.getMonth() + 1) + G.pad(now.getDate());

      for (var oi = 0; oi < selectedOrders.length; oi++) {
        var ord    = selectedOrders[oi];
        var grnRes = await db.from('grns').insert([{
          batch_date:  batchDate,
          order_count: 1,
          total_items: ord.total_quantity || 0,
          net_total:   G.roundCurrency(Number(ord.net_total || 0)),
          status:      'pending',
        }]).select('id');

        if (grnRes.error) throw grnRes.error;

        var linkRes = await db.from('supplier_orders')
          .update({ grn_id: grnRes.data[0].id })
          .eq('id', ord.id);
        if (linkRes.error) throw linkRes.error;

        window.MVB_AUDIT_LOG.log({
          module: 'GRN',
          action: 'GRN Saved',
          recordType: 'GRN',
          recordId: grnRes.data[0].id,
          description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' saved GRN #' + grnRes.data[0].id + ' for Supplier Order "' + (ord.supplier_name || ord.id) + '" to Inbound.',
          newData: { grn_id: grnRes.data[0].id, supplier_order_id: ord.id, status: 'pending' },
        });
      }

      pendingGrnState = null;
      confirmBar.classList.add('grn-confirm-bar--hidden');
      selectedOrderIds.clear();

      await loadPendingOrders();
      await loadGrnList();
    } catch (err) {
      console.error('Failed to save GRN:', err);
      window.alert('Could not save the GRN. Please try again.');
    } finally {
      setButtonBusy(btnConfirm, false, 'Save to Inbound', 'Saving…');
      btnDiscard.disabled = false;
    }
  }

  function handleDiscard() {
    pendingGrnState = null;
    confirmBar.classList.add('grn-confirm-bar--hidden');
  }

  // ── Download GRN from register ────────────────────────────────────

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

  btnSelectAll.addEventListener('click', function () {
    pendingOrders.forEach(function (o) { selectedOrderIds.add(o.id); });
    renderPendingOrders();
  });

  btnClearAll.addEventListener('click', function () {
    selectedOrderIds.clear();
    renderPendingOrders();
  });

  btnGenerate.addEventListener('click', handleGenerate);
  btnConfirm.addEventListener('click', handleSaveToInbound);
  btnDiscard.addEventListener('click', handleDiscard);

  pendingList.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-action="toggle-order"]');
    if (!toggle) return;
    var card = toggle.closest('[data-order-id]');
    if (!card) return;
    var id = Number(card.dataset.orderId);
    if (toggle.checked) { selectedOrderIds.add(id); } else { selectedOrderIds.delete(id); }
    renderPendingOrders();
  });

  grnTbody.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-grn-id]');
    if (btn) downloadGrn(Number(btn.dataset.grnId));
  });

  // ── Init ──────────────────────────────────────────────────────────
  loadPendingOrders();
  loadGrnList();
})();

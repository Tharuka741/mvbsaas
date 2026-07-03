(function () {
  var db = window.MVB_DB;

  var allProducts        = [];
  var pendingChanges     = {}; // productId (number) -> new qty (number)
  var currentStockFilter = '';
  var sortCol            = 'name';
  var sortDir            = 'asc';

  var tbody         = document.getElementById('sl-tbody');
  var searchEl      = document.getElementById('sl-search');
  var stockFilterEl = document.getElementById('sl-stock-filter');
  var saveAllBtn    = document.getElementById('sl-save-all');
  var thead         = document.getElementById('sl-thead');
  var elTotal      = document.getElementById('sl-total-products');
  var elTotalUnits = document.getElementById('sl-total-units');
  var elLowStock   = document.getElementById('sl-low-stock');
  var elOutOfStock = document.getElementById('sl-out-of-stock');

  function isAdminViewer() {
    return !!(window.MVB_USER && window.MVB_USER.role === 'admin');
  }

  function esc(v) {
    return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtQty(v) {
    return Number(v || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 });
  }

  // ── Save bar ──────────────────────────────────────────────────────

  function updateSaveBar() {
    var count = Object.keys(pendingChanges).length;
    if (count > 0) {
      saveAllBtn.textContent = 'Save ' + count + ' change' + (count !== 1 ? 's' : '');
      saveAllBtn.style.display = '';
    } else {
      saveAllBtn.style.display = 'none';
    }
  }

  // ── Render ────────────────────────────────────────────────────────

  function sortProducts(arr) {
    return arr.slice().sort(function (a, b) {
      var av, bv;
      if (sortCol === 'stock_quantity') {
        av = a.stock_quantity || 0;
        bv = b.stock_quantity || 0;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      av = (a[sortCol] || '').toLowerCase();
      bv = (b[sortCol] || '').toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  function updateSortHeaders() {
    thead.querySelectorAll('.sl-th-sort').forEach(function (th) {
      var icon = th.querySelector('.sl-sort-icon');
      if (th.dataset.col === sortCol) {
        icon.textContent = sortDir === 'asc' ? '↑' : '↓';
        icon.classList.add('sl-sort-icon--active');
      } else {
        icon.textContent = '↕';
        icon.classList.remove('sl-sort-icon--active');
      }
    });
  }

  function stockCategory(qty) {
    if ((qty || 0) <= 0)            return 'out';
    if (qty > 0 && qty < 10)        return 'low';
    return 'in';
  }

  function renderTable() {
    var q = (searchEl.value || '').trim().toLowerCase();
    var filtered = sortProducts(allProducts.filter(function (p) {
      var nameMatch  = !q || p.name.toLowerCase().indexOf(q) !== -1 ||
                       (p.supplier || '').toLowerCase().indexOf(q) !== -1;
      var stockMatch = !currentStockFilter || stockCategory(p.stock_quantity) === currentStockFilter;
      return nameMatch && stockMatch;
    }));

    updateSortHeaders();

    var totalUnits = filtered.reduce(function (s, p) { return s + (p.stock_quantity || 0); }, 0);
    var lowCount   = filtered.filter(function (p) { return p.stock_quantity > 0 && p.stock_quantity < 10; }).length;
    var emptyCount = filtered.filter(function (p) { return (p.stock_quantity || 0) <= 0; }).length;

    elTotal.textContent      = String(filtered.length);
    elTotalUnits.textContent = fmtQty(totalUnits);
    elLowStock.textContent   = String(lowCount);
    elOutOfStock.textContent = String(emptyCount);

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="pdash-empty">No products found.</td></tr>';
      return;
    }

    var readOnly = isAdminViewer();
    if (readOnly) {
      saveAllBtn.style.display = 'none';
      var slCopy = document.querySelector('.pdash-header__copy p:last-child');
      if (slCopy) slCopy.textContent = 'View-only — stock quantities are managed by your manager.';
    }

    tbody.innerHTML = filtered.map(function (p) {
      var savedQty  = p.stock_quantity || 0;
      var hasPending = Object.prototype.hasOwnProperty.call(pendingChanges, p.id);
      var displayQty = hasPending ? pendingChanges[p.id] : savedQty;
      var isDirty    = hasPending && pendingChanges[p.id] !== savedQty;

      return (
        '<tr data-product-id="' + p.id + '" class="' + (isDirty ? 'sl-row--dirty' : '') + '">' +
        '<td>' + esc(p.name) + '</td>' +
        '<td>' + esc(p.supplier || '—') + '</td>' +
        '<td style="text-align:right;">' +
        '<input type="number" class="pdash-cell-input sl-qty-input" ' +
               'value="' + displayQty + '" min="0" step="1" ' +
               'data-original="' + savedQty + '" ' +
               (readOnly ? 'disabled ' : '') +
               'style="width:90px;text-align:right;" />' +
        '</td>' +
        '</tr>'
      );
    }).join('');

    if (readOnly) return;

    tbody.querySelectorAll('.sl-qty-input').forEach(function (input) {
      input.addEventListener('input', function () {
        var row       = input.closest('tr');
        var productId = Number(row.dataset.productId);
        var original  = Number(input.dataset.original);
        var newVal    = parseInt(input.value, 10);

        if (!isNaN(newVal) && newVal >= 0 && newVal !== original) {
          pendingChanges[productId] = newVal;
          row.classList.add('sl-row--dirty');
        } else {
          delete pendingChanges[productId];
          row.classList.remove('sl-row--dirty');
        }

        updateSaveBar();
      });

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && Object.keys(pendingChanges).length > 0) {
          saveAllBtn.click();
        }
      });
    });
  }

  // ── Load ──────────────────────────────────────────────────────────

  async function loadProducts() {
    try {
      var result = await db
        .from('products')
        .select('id, name, supplier, stock_quantity')
        .order('name');

      if (result.error) throw result.error;

      allProducts = result.data || [];
      renderTable();
    } catch (err) {
      console.error('Failed to load stock levels:', err && (err.message || err));
      tbody.innerHTML = '<tr><td colspan="3" class="pdash-empty">Could not load stock levels. Please refresh.</td></tr>';
    }
  }

  // ── Save all pending changes ───────────────────────────────────────

  saveAllBtn.addEventListener('click', async function () {
    var ids = Object.keys(pendingChanges).map(Number);
    if (!ids.length) return;

    saveAllBtn.disabled    = true;
    saveAllBtn.textContent = 'Saving…';

    var failed = [];

    await Promise.all(ids.map(async function (productId) {
      var newQty = pendingChanges[productId];
      try {
        var res = await db.from('products').update({ stock_quantity: newQty }).eq('id', productId);
        if (res.error) throw res.error;

        var prod = allProducts.find(function (p) { return p.id === productId; });
        var oldQty = prod ? prod.stock_quantity : null;
        if (prod) prod.stock_quantity = newQty;

        delete pendingChanges[productId];

        window.MVB_AUDIT_LOG.log({
          module: 'Inventory',
          action: 'Stock Quantity Updated',
          recordType: 'Product',
          recordId: productId,
          description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' updated stock quantity of Product "' +
            (prod ? prod.name : productId) + '" from ' + oldQty + ' to ' + newQty + '.',
          oldData: { stock_quantity: oldQty },
          newData: { stock_quantity: newQty },
        });

        // Update the input's original marker and clear dirty state without full re-render
        var row = tbody.querySelector('[data-product-id="' + productId + '"]');
        if (row) {
          var input = row.querySelector('.sl-qty-input');
          if (input) input.dataset.original = String(newQty);
          row.classList.remove('sl-row--dirty');
        }
      } catch (err) {
        console.error('Failed to update product ' + productId + ':', err && (err.message || err));
        failed.push(productId);
      }
    }));

    // Refresh summary counts
    var totalUnits = allProducts.reduce(function (s, p) { return s + (p.stock_quantity || 0); }, 0);
    var lowCount   = allProducts.filter(function (p) { return p.stock_quantity > 0 && p.stock_quantity < 10; }).length;
    var emptyCount = allProducts.filter(function (p) { return (p.stock_quantity || 0) <= 0; }).length;
    elTotalUnits.textContent = fmtQty(totalUnits);
    elLowStock.textContent   = String(lowCount);
    elOutOfStock.textContent = String(emptyCount);

    saveAllBtn.disabled = false;
    updateSaveBar();

    if (failed.length) {
      window.alert('Some updates failed. Please try saving again.');
    }
  });

  thead.addEventListener('click', function (e) {
    var th = e.target.closest('[data-col]');
    if (!th) return;
    var col = th.dataset.col;
    if (col === sortCol) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortCol = col;
      sortDir = col === 'stock_quantity' ? 'desc' : 'asc';
    }
    renderTable();
  });

  searchEl.addEventListener('input', renderTable);

  stockFilterEl.addEventListener('change', function () {
    currentStockFilter = stockFilterEl.value;
    renderTable();
  });

  loadProducts();
})();

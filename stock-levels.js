(function () {
  var db = window.MVB_DB;

  var allProducts    = [];

  var tbody          = document.getElementById('sl-tbody');
  var searchEl       = document.getElementById('sl-search');
  var elTotal        = document.getElementById('sl-total-products');
  var elTotalUnits   = document.getElementById('sl-total-units');
  var elLowStock     = document.getElementById('sl-low-stock');
  var elOutOfStock   = document.getElementById('sl-out-of-stock');

  function esc(v) {
    return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtQty(v) {
    return Number(v || 0).toLocaleString('en-LK', { maximumFractionDigits: 0 });
  }

  function stockClass(qty) {
    if (qty <= 0)  return 'sl-stock--empty';
    if (qty < 10)  return 'sl-stock--low';
    return '';
  }

  // ── Render ────────────────────────────────────────────────────────

  function renderTable() {
    var q = (searchEl.value || '').trim().toLowerCase();
    var filtered = q
      ? allProducts.filter(function (p) {
          return p.name.toLowerCase().indexOf(q) !== -1 ||
                 (p.supplier || '').toLowerCase().indexOf(q) !== -1;
        })
      : allProducts.slice();

    var totalUnits  = filtered.reduce(function (s, p) { return s + (p.stock_quantity || 0); }, 0);
    var lowCount    = filtered.filter(function (p) { return p.stock_quantity > 0 && p.stock_quantity < 10; }).length;
    var emptyCount  = filtered.filter(function (p) { return (p.stock_quantity || 0) <= 0; }).length;

    elTotal.textContent      = String(filtered.length);
    elTotalUnits.textContent = fmtQty(totalUnits);
    elLowStock.textContent   = String(lowCount);
    elOutOfStock.textContent = String(emptyCount);

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="pdash-empty">No products found.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(function (p) {
      var qty = p.stock_quantity || 0;
      var sc  = stockClass(qty);
      return (
        '<tr data-product-id="' + p.id + '">' +
        '<td>' + esc(p.name) + '</td>' +
        '<td>' + esc(p.supplier || '—') + '</td>' +
        '<td style="text-align:right;">' +
        '<input type="number" class="pdash-cell-input sl-qty-input" ' +
               'value="' + qty + '" min="0" step="1" ' +
               'data-original="' + qty + '" ' +
               'style="width:90px;text-align:right;" />' +
        '</td>' +
        '<td>' +
        '<button class="button button--soft sl-save-btn" ' +
                'data-product-id="' + p.id + '" ' +
                'style="display:none;padding:5px 12px;font-size:0.78rem;">Save</button>' +
        '</td>' +
        '</tr>'
      );
    }).join('');

    // Reveal Save button only when value differs from original
    tbody.querySelectorAll('.sl-qty-input').forEach(function (input) {
      input.addEventListener('input', function () {
        var saveBtn = input.closest('tr').querySelector('.sl-save-btn');
        saveBtn.style.display = input.value !== input.dataset.original ? '' : 'none';
      });
      // Allow saving with Enter key
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var saveBtn = input.closest('tr').querySelector('.sl-save-btn');
          if (saveBtn && saveBtn.style.display !== 'none') saveBtn.click();
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
      tbody.innerHTML = '<tr><td colspan="4" class="pdash-empty">Could not load stock levels. Please refresh.</td></tr>';
    }
  }

  // ── Save stock adjustment ─────────────────────────────────────────

  tbody.addEventListener('click', async function (e) {
    var btn = e.target.closest('.sl-save-btn');
    if (!btn) return;

    var row       = btn.closest('tr');
    var productId = Number(row.dataset.productId);
    var input     = row.querySelector('.sl-qty-input');
    var newQty    = parseInt(input.value, 10);

    if (isNaN(newQty) || newQty < 0) {
      window.alert('Please enter a valid stock quantity (0 or more).');
      return;
    }

    btn.disabled    = true;
    btn.textContent = 'Saving…';

    try {
      var res = await db.from('products').update({ stock_quantity: newQty }).eq('id', productId);
      if (res.error) throw res.error;

      // Update local cache
      var prod = allProducts.find(function (p) { return p.id === productId; });
      if (prod) prod.stock_quantity = newQty;

      // Update input state without full re-render
      input.dataset.original = String(newQty);
      btn.style.display = 'none';

      // Update summary counts
      var totalUnits = allProducts.reduce(function (s, p) { return s + (p.stock_quantity || 0); }, 0);
      var lowCount   = allProducts.filter(function (p) { return p.stock_quantity > 0 && p.stock_quantity < 10; }).length;
      var emptyCount = allProducts.filter(function (p) { return (p.stock_quantity || 0) <= 0; }).length;
      elTotalUnits.textContent = fmtQty(totalUnits);
      elLowStock.textContent   = String(lowCount);
      elOutOfStock.textContent = String(emptyCount);
    } catch (err) {
      console.error('Failed to update stock:', err && (err.message || err));
      window.alert('Could not update stock quantity. Please try again.');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Save';
    }
  });

  searchEl.addEventListener('input', renderTable);

  loadProducts();
})();

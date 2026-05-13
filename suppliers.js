(function () {
  var db = window.MVB_DB;
  var allSuppliers = [];
  var addingNew = false;
  var searchQuery = '';
  var sortField = 'name';
  var sortDir = 'asc';

  var tbody = document.getElementById('suppliers-tbody');
  var searchInput = document.getElementById('suppliers-search');
  var btnAdd = document.getElementById('btn-add-supplier');

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Sort ──────────────────────────────────────────────────────────

  function sortedSuppliers(list) {
    return list.slice().sort(function (a, b) {
      var av = a[sortField] || '';
      var bv = b[sortField] || '';
      var cmp = String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  function updateSortHeaders() {
    document.querySelectorAll('.pdash-th-sort').forEach(function (th) {
      var active = th.dataset.sort === sortField;
      th.classList.toggle('pdash-th-sort--active', active);
      th.querySelector('.pdash-sort-icon').textContent = active
        ? (sortDir === 'asc' ? ' ↑' : ' ↓')
        : '';
    });
  }

  // ── Render ────────────────────────────────────────────────────────

  function render() {
    var q = searchQuery.toLowerCase();
    var filtered = sortedSuppliers(allSuppliers.filter(function (s) {
      return (
        !q ||
        (s.name && s.name.toLowerCase().indexOf(q) !== -1) ||
        (s.contact && s.contact.toLowerCase().indexOf(q) !== -1) ||
        (s.phone && s.phone.toLowerCase().indexOf(q) !== -1)
      );
    }));

    var html = '';

    if (addingNew) {
      html +=
        '<tr class="pdash-new-row" id="new-supplier-row">' +
        '<td><input class="pdash-cell-input" id="new-name" type="text" placeholder="Supplier name *" autocomplete="off"></td>' +
        '<td><input class="pdash-cell-input" id="new-contact" type="text" placeholder="Contact person (optional)" autocomplete="off"></td>' +
        '<td><input class="pdash-cell-input" id="new-phone" type="tel" placeholder="Phone (optional)" autocomplete="off"></td>' +
        '<td><div class="pdash-row-actions">' +
          '<button class="pdash-add-confirm-btn" id="confirm-add-supplier">Add</button>' +
          '<button class="pdash-cancel-add-btn" id="cancel-add-supplier">&#x2715;</button>' +
        '</div></td>' +
        '</tr>';
    }

    for (var i = 0; i < filtered.length; i++) {
      var s = filtered[i];
      html +=
        '<tr data-id="' + s.id + '">' +
        '<td><strong>' + esc(s.name) + '</strong></td>' +
        '<td>' + esc(s.contact || '—') + '</td>' +
        '<td>' + esc(s.phone || '—') + '</td>' +
        '<td><button class="pdash-delete-btn" data-id="' + s.id + '" title="Delete">&#x2715;</button></td>' +
        '</tr>';
    }

    if (!addingNew && filtered.length === 0) {
      html = '<tr><td colspan="4" class="pdash-empty">' +
        (allSuppliers.length === 0 ? 'No suppliers yet. Click "+ Add Supplier" to create the first one.' : 'No suppliers match your search.') +
        '</td></tr>';
    }

    tbody.innerHTML = html;
    attachListeners();
    updateSortHeaders();
  }

  // ── Listeners ─────────────────────────────────────────────────────

  function attachListeners() {
    tbody.querySelectorAll('.pdash-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        deleteSupplier(parseInt(this.dataset.id));
      });
    });

    var confirmBtn = document.getElementById('confirm-add-supplier');
    var cancelBtn = document.getElementById('cancel-add-supplier');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmAdd);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelAdd);

    var newRow = document.getElementById('new-supplier-row');
    if (newRow) {
      newRow.querySelectorAll('input').forEach(function (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') confirmAdd();
          if (e.key === 'Escape') cancelAdd();
        });
      });
      var nameInput = document.getElementById('new-name');
      if (nameInput) setTimeout(function () { nameInput.focus(); }, 0);
    }
  }

  // ── Add ───────────────────────────────────────────────────────────

  function cancelAdd() {
    addingNew = false;
    render();
    btnAdd.disabled = false;
  }

  async function confirmAdd() {
    var nameEl = document.getElementById('new-name');
    var contactEl = document.getElementById('new-contact');
    var phoneEl = document.getElementById('new-phone');

    var name = nameEl ? nameEl.value.trim() : '';
    var contact = contactEl ? contactEl.value.trim() : '';
    var phone = phoneEl ? phoneEl.value.trim() : '';

    if (!name) {
      if (nameEl) { nameEl.focus(); nameEl.style.outline = '2px solid #c82828'; }
      return;
    }

    var confirmBtn = document.getElementById('confirm-add-supplier');
    var cancelBtn = document.getElementById('cancel-add-supplier');
    if (confirmBtn) confirmBtn.disabled = true;
    if (confirmBtn) confirmBtn.textContent = '…';
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      var result = await db.from('suppliers').insert([{
        name: name,
        contact: contact || null,
        phone: phone || null,
      }]).select('*');

      if (result.error) throw result.error;

      allSuppliers.push(result.data[0]);
      addingNew = false;
      btnAdd.disabled = false;
      render();
    } catch (err) {
      console.error('Failed to add supplier:', err);
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Add'; }
      if (cancelBtn) cancelBtn.disabled = false;
      window.alert('Could not save supplier. Please try again.');
    }
  }

  // ── Delete ────────────────────────────────────────────────────────

  async function deleteSupplier(id) {
    if (!window.confirm('Remove this supplier from the directory?')) return;
    try {
      var result = await db.from('suppliers').delete().eq('id', id);
      if (result.error) throw result.error;
      allSuppliers = allSuppliers.filter(function (s) { return s.id !== id; });
      render();
    } catch (err) {
      console.error('Failed to delete supplier:', err);
      window.alert('Could not remove supplier. Please try again.');
    }
  }

  // ── Load ──────────────────────────────────────────────────────────

  async function loadSuppliers() {
    tbody.innerHTML = '<tr><td colspan="4" class="pdash-empty">Loading…</td></tr>';
    try {
      var result = await db.from('suppliers').select('*').order('name');
      if (result.error) throw result.error;
      allSuppliers = result.data || [];
      render();
    } catch (err) {
      console.error('Failed to load suppliers:', err);
      tbody.innerHTML = '<tr><td colspan="4" class="pdash-empty">Could not load suppliers. Please refresh.</td></tr>';
    }
  }

  // ── Events ────────────────────────────────────────────────────────

  btnAdd.addEventListener('click', function () {
    if (addingNew) return;
    addingNew = true;
    btnAdd.disabled = true;
    render();
  });

  searchInput.addEventListener('input', function () {
    searchQuery = this.value;
    render();
  });

  document.querySelectorAll('.pdash-th-sort').forEach(function (th) {
    th.addEventListener('click', function () {
      var field = this.dataset.sort;
      if (sortField === field) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortField = field;
        sortDir = 'asc';
      }
      render();
    });
  });

  loadSuppliers();
})();

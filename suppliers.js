(function () {
  var db = window.MVB_DB;
  var allSuppliers = [];
  var pendingUpdates = {}; // id -> { name, contact, phone }
  var addingNew = false;
  var searchQuery = '';
  var sortField = 'name';
  var sortDir = 'asc';

  var tbody = document.getElementById('suppliers-tbody');
  var searchInput = document.getElementById('suppliers-search');
  var btnAdd = document.getElementById('btn-add-supplier');
  var btnSave = document.getElementById('btn-save-suppliers');

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function get(id, field, fallback) {
    return pendingUpdates[id] && Object.prototype.hasOwnProperty.call(pendingUpdates[id], field)
      ? pendingUpdates[id][field]
      : fallback;
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

  // ── Save button ───────────────────────────────────────────────────

  function updateSaveButton() {
    var count = Object.keys(pendingUpdates).length;
    if (count > 0) {
      btnSave.style.display = '';
      btnSave.textContent = 'Save ' + count + ' change' + (count !== 1 ? 's' : '');
    } else {
      btnSave.style.display = 'none';
    }
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
      var dirty = !!pendingUpdates[s.id];
      var name = get(s.id, 'name', s.name);
      var contact = get(s.id, 'contact', s.contact);
      var phone = get(s.id, 'phone', s.phone);
      html +=
        '<tr class="' + (dirty ? 'is-modified' : '') + '" data-id="' + s.id + '">' +
        '<td><input class="pdash-cell-input" type="text" value="' + esc(name) + '" data-field="name" placeholder="Supplier name" autocomplete="off"></td>' +
        '<td><input class="pdash-cell-input" type="text" value="' + esc(contact) + '" data-field="contact" placeholder="Contact person" autocomplete="off"></td>' +
        '<td><input class="pdash-cell-input" type="tel" value="' + esc(phone) + '" data-field="phone" placeholder="Phone" autocomplete="off"></td>' +
        '</tr>';
    }

    if (!addingNew && filtered.length === 0) {
      html = '<tr><td colspan="3" class="pdash-empty">' +
        (allSuppliers.length === 0 ? 'No suppliers yet. Click "+ Add Supplier" to create the first one.' : 'No suppliers match your search.') +
        '</td></tr>';
    }

    tbody.innerHTML = html;
    attachListeners();
    updateSortHeaders();
  }

  // ── Listeners ─────────────────────────────────────────────────────

  function attachListeners() {
    tbody.querySelectorAll('[data-field]').forEach(function (input) {
      input.addEventListener('input', onCellInput);
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

  function onCellInput() {
    var row = this.closest('tr');
    var id = parseInt(row.dataset.id);
    var field = this.dataset.field;

    if (!pendingUpdates[id]) {
      var s = allSuppliers.find(function (s) { return s.id === id; });
      pendingUpdates[id] = { name: s.name, contact: s.contact, phone: s.phone };
    }

    pendingUpdates[id][field] = this.value;
    row.classList.add('is-modified');
    updateSaveButton();
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

      window.MVB_AUDIT_LOG.log({
        module: 'Suppliers',
        action: 'Create',
        recordType: 'Supplier',
        recordId: result.data[0].id,
        description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' created Supplier "' + name + '".',
        newData: result.data[0],
      });
    } catch (err) {
      console.error('Failed to add supplier:', err);
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Add'; }
      if (cancelBtn) cancelBtn.disabled = false;
      window.alert('Could not save supplier. Please try again.');
    }
  }

  // ── Save edits ────────────────────────────────────────────────────

  async function save() {
    var ids = Object.keys(pendingUpdates);
    if (!ids.length) return;

    btnSave.disabled = true;
    btnSave.textContent = 'Saving…';

    var results = await Promise.all(
      ids.map(function (id) {
        return db.from('suppliers').update(pendingUpdates[parseInt(id)]).eq('id', parseInt(id));
      })
    );

    var hasError = results.some(function (r) { return r && r.error; });

    if (!hasError) {
      ids.forEach(function (id) {
        var numId = parseInt(id);
        var idx = allSuppliers.findIndex(function (s) { return s.id === numId; });
        var oldData = idx !== -1 ? Object.assign({}, allSuppliers[idx]) : null;
        var newFields = pendingUpdates[numId];
        if (idx !== -1) Object.assign(allSuppliers[idx], newFields);

        var changed = Object.keys(newFields).filter(function (field) {
          return !oldData || oldData[field] !== newFields[field];
        });
        var supplierName = (idx !== -1 ? allSuppliers[idx].name : null) || (oldData && oldData.name) || numId;

        var trimmedOld = {}, trimmedNew = {};
        changed.forEach(function (field) {
          trimmedOld[field] = oldData ? oldData[field] : null;
          trimmedNew[field] = newFields[field];
        });

        window.MVB_AUDIT_LOG.log({
          module: 'Suppliers',
          action: 'Update',
          recordType: 'Supplier',
          recordId: numId,
          description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' updated ' + (changed.join(', ') || 'fields') + ' of Supplier "' + supplierName + '".',
          oldData: changed.length ? trimmedOld : null,
          newData: changed.length ? trimmedNew : null,
        });
      });
      pendingUpdates = {};
    }

    btnSave.disabled = false;
    btnSave.textContent = hasError ? 'Error — try again' : 'Saved!';
    setTimeout(function () {
      if (!hasError) render();
      updateSaveButton();
    }, 1200);
  }

  // ── Load ──────────────────────────────────────────────────────────

  async function loadSuppliers() {
    tbody.innerHTML = '<tr><td colspan="3" class="pdash-empty">Loading…</td></tr>';
    try {
      var result = await db.from('suppliers').select('*').order('name');
      if (result.error) throw result.error;
      allSuppliers = result.data || [];
      render();
    } catch (err) {
      console.error('Failed to load suppliers:', err);
      tbody.innerHTML = '<tr><td colspan="3" class="pdash-empty">Could not load suppliers. Please refresh.</td></tr>';
    }
  }

  // ── Events ────────────────────────────────────────────────────────

  btnAdd.addEventListener('click', function () {
    if (addingNew) return;
    addingNew = true;
    btnAdd.disabled = true;
    render();
  });

  btnSave.addEventListener('click', save);

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

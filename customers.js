(function () {
  var db = window.MVB_DB;
  var allCustomers = [];
  var pendingUpdates = {}; // id -> { client, contact, phone }
  var addingNew = false;
  var searchQuery = '';
  var sortField = 'contact';
  var sortDir = 'asc';

  var tbody = document.getElementById('customers-tbody');
  var searchInput = document.getElementById('customers-search');
  var btnAdd = document.getElementById('btn-add-customer');
  var btnSave = document.getElementById('btn-save-customers');

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

  function sortedCustomers(list) {
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
    var filtered = sortedCustomers(allCustomers.filter(function (c) {
      return (
        !q ||
        (c.contact && c.contact.toLowerCase().indexOf(q) !== -1) ||
        (c.client && c.client.toLowerCase().indexOf(q) !== -1) ||
        (c.phone && c.phone.toLowerCase().indexOf(q) !== -1)
      );
    }));

    var html = '';

    if (addingNew) {
      html +=
        '<tr class="pdash-new-row" id="new-customer-row">' +
        '<td><input class="pdash-cell-input" id="new-client" type="text" placeholder="Client / business name *" autocomplete="off"></td>' +
        '<td><input class="pdash-cell-input" id="new-contact" type="text" placeholder="Contact person (optional)" autocomplete="off"></td>' +
        '<td><input class="pdash-cell-input" id="new-phone" type="tel" placeholder="Phone (optional)" autocomplete="off"></td>' +
        '<td><div class="pdash-row-actions">' +
          '<button class="pdash-add-confirm-btn" id="confirm-add-customer">Add</button>' +
          '<button class="pdash-cancel-add-btn" id="cancel-add-customer">&#x2715;</button>' +
        '</div></td>' +
        '</tr>';
    }

    for (var i = 0; i < filtered.length; i++) {
      var c = filtered[i];
      var dirty = !!pendingUpdates[c.id];
      var client = get(c.id, 'client', c.client);
      var contact = get(c.id, 'contact', c.contact);
      var phone = get(c.id, 'phone', c.phone);
      html +=
        '<tr class="' + (dirty ? 'is-modified' : '') + '" data-id="' + c.id + '">' +
        '<td><input class="pdash-cell-input" type="text" value="' + esc(client) + '" data-field="client" placeholder="Client / business name" autocomplete="off"></td>' +
        '<td><input class="pdash-cell-input" type="text" value="' + esc(contact) + '" data-field="contact" placeholder="Contact person" autocomplete="off"></td>' +
        '<td><input class="pdash-cell-input" type="tel" value="' + esc(phone) + '" data-field="phone" placeholder="Phone" autocomplete="off"></td>' +
        '</tr>';
    }

    if (!addingNew && filtered.length === 0) {
      html = '<tr><td colspan="3" class="pdash-empty">' +
        (allCustomers.length === 0 ? 'No customers yet. Click "+ Add Customer" to create the first one.' : 'No customers match your search.') +
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

    var confirmBtn = document.getElementById('confirm-add-customer');
    var cancelBtn = document.getElementById('cancel-add-customer');
    if (confirmBtn) confirmBtn.addEventListener('click', confirmAdd);
    if (cancelBtn) cancelBtn.addEventListener('click', cancelAdd);

    var newRow = document.getElementById('new-customer-row');
    if (newRow) {
      newRow.querySelectorAll('input').forEach(function (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') confirmAdd();
          if (e.key === 'Escape') cancelAdd();
        });
      });
      var clientInput = document.getElementById('new-client');
      if (clientInput) setTimeout(function () { clientInput.focus(); }, 0);
    }
  }

  function onCellInput() {
    var row = this.closest('tr');
    var id = parseInt(row.dataset.id);
    var field = this.dataset.field;

    if (!pendingUpdates[id]) {
      var c = allCustomers.find(function (c) { return c.id === id; });
      pendingUpdates[id] = { client: c.client, contact: c.contact, phone: c.phone };
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
    var clientEl = document.getElementById('new-client');
    var contactEl = document.getElementById('new-contact');
    var phoneEl = document.getElementById('new-phone');

    var client = clientEl ? clientEl.value.trim() : '';
    var contact = contactEl ? contactEl.value.trim() : '';
    var phone = phoneEl ? phoneEl.value.trim() : '';

    if (!client) {
      if (clientEl) { clientEl.focus(); clientEl.style.outline = '2px solid #c82828'; }
      return;
    }

    var confirmBtn = document.getElementById('confirm-add-customer');
    var cancelBtn = document.getElementById('cancel-add-customer');
    if (confirmBtn) confirmBtn.disabled = true;
    if (confirmBtn) confirmBtn.textContent = '…';
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      var result = await db.from('customers').insert([{
        client: client,
        contact: contact || null,
        phone: phone || null,
      }]).select('*');

      if (result.error) throw result.error;

      allCustomers.push(result.data[0]);
      addingNew = false;
      btnAdd.disabled = false;
      render();

      window.MVB_AUDIT_LOG.log({
        module: 'Customers',
        action: 'Create',
        recordType: 'Customer',
        recordId: result.data[0].id,
        description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' created Customer "' + client + '".',
        newData: result.data[0],
      });
    } catch (err) {
      console.error('Failed to add customer:', err);
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Add'; }
      if (cancelBtn) cancelBtn.disabled = false;
      window.alert('Could not save customer. Please try again.');
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
        return db.from('customers').update(pendingUpdates[parseInt(id)]).eq('id', parseInt(id));
      })
    );

    var hasError = results.some(function (r) { return r && r.error; });

    if (!hasError) {
      ids.forEach(function (id) {
        var numId = parseInt(id);
        var idx = allCustomers.findIndex(function (c) { return c.id === numId; });
        var oldData = idx !== -1 ? Object.assign({}, allCustomers[idx]) : null;
        var newFields = pendingUpdates[numId];
        if (idx !== -1) Object.assign(allCustomers[idx], newFields);

        var changed = Object.keys(newFields).filter(function (field) {
          return !oldData || oldData[field] !== newFields[field];
        });
        var customerName = (idx !== -1 ? allCustomers[idx].client : null) || (oldData && oldData.client) || numId;

        var trimmedOld = {}, trimmedNew = {};
        changed.forEach(function (field) {
          trimmedOld[field] = oldData ? oldData[field] : null;
          trimmedNew[field] = newFields[field];
        });

        window.MVB_AUDIT_LOG.log({
          module: 'Customers',
          action: 'Update',
          recordType: 'Customer',
          recordId: numId,
          description: (window.MVB_USER ? window.MVB_USER.name : 'Someone') + ' updated ' + (changed.join(', ') || 'fields') + ' of Customer "' + customerName + '".',
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

  async function loadCustomers() {
    tbody.innerHTML = '<tr><td colspan="3" class="pdash-empty">Loading…</td></tr>';
    try {
      var result = await db.from('customers').select('*').order('contact');
      if (result.error) throw result.error;
      allCustomers = result.data || [];
      render();
    } catch (err) {
      console.error('Failed to load customers:', err);
      tbody.innerHTML = '<tr><td colspan="3" class="pdash-empty">Could not load customers. Please refresh.</td></tr>';
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

  loadCustomers();
})();

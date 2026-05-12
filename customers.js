(function () {
  var db = window.MVB_DB;
  var allCustomers = [];
  var addingNew = false;
  var searchQuery = '';
  var sortField = 'contact';
  var sortDir = 'asc';

  var tbody = document.getElementById('customers-tbody');
  var searchInput = document.getElementById('customers-search');
  var btnAdd = document.getElementById('btn-add-customer');

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
        '<td><input class="pdash-cell-input" id="new-contact" type="text" placeholder="Contact name *" autocomplete="off"></td>' +
        '<td><input class="pdash-cell-input" id="new-client" type="text" placeholder="Business / pharmacy (optional)" autocomplete="off"></td>' +
        '<td><input class="pdash-cell-input" id="new-phone" type="tel" placeholder="Phone *" autocomplete="off"></td>' +
        '<td><div class="pdash-row-actions">' +
          '<button class="pdash-add-confirm-btn" id="confirm-add-customer">Add</button>' +
          '<button class="pdash-cancel-add-btn" id="cancel-add-customer">&#x2715;</button>' +
        '</div></td>' +
        '</tr>';
    }

    for (var i = 0; i < filtered.length; i++) {
      var c = filtered[i];
      html +=
        '<tr data-id="' + c.id + '">' +
        '<td>' + esc(c.contact) + '</td>' +
        '<td>' + esc(c.client || '—') + '</td>' +
        '<td>' + esc(c.phone) + '</td>' +
        '<td><button class="pdash-delete-btn" data-id="' + c.id + '" title="Delete">&#x2715;</button></td>' +
        '</tr>';
    }

    if (!addingNew && filtered.length === 0) {
      html = '<tr><td colspan="4" class="pdash-empty">' +
        (allCustomers.length === 0 ? 'No customers yet. Click "+ Add Customer" to create the first one.' : 'No customers match your search.') +
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
        deleteCustomer(parseInt(this.dataset.id));
      });
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
      var contactInput = document.getElementById('new-contact');
      if (contactInput) setTimeout(function () { contactInput.focus(); }, 0);
    }
  }

  // ── Add ───────────────────────────────────────────────────────────

  function cancelAdd() {
    addingNew = false;
    render();
    btnAdd.disabled = false;
  }

  async function confirmAdd() {
    var contactEl = document.getElementById('new-contact');
    var clientEl = document.getElementById('new-client');
    var phoneEl = document.getElementById('new-phone');

    var contact = contactEl ? contactEl.value.trim() : '';
    var client = clientEl ? clientEl.value.trim() : '';
    var phone = phoneEl ? phoneEl.value.trim() : '';

    if (!contact) {
      if (contactEl) contactEl.focus();
      contactEl.style.outline = '2px solid #c82828';
      return;
    }
    if (!phone) {
      if (phoneEl) phoneEl.focus();
      phoneEl.style.outline = '2px solid #c82828';
      return;
    }

    var confirmBtn = document.getElementById('confirm-add-customer');
    var cancelBtn = document.getElementById('cancel-add-customer');
    if (confirmBtn) confirmBtn.disabled = true;
    if (confirmBtn) confirmBtn.textContent = '…';
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      var result = await db.from('customers').insert([{
        contact: contact,
        client: client || null,
        phone: phone,
      }]).select('*');

      if (result.error) throw result.error;

      allCustomers.push(result.data[0]);
      addingNew = false;
      btnAdd.disabled = false;
      render();
    } catch (err) {
      console.error('Failed to add customer:', err);
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Add'; }
      if (cancelBtn) cancelBtn.disabled = false;
      window.alert('Could not save customer. Please try again.');
    }
  }

  // ── Delete ────────────────────────────────────────────────────────

  async function deleteCustomer(id) {
    if (!window.confirm('Remove this customer from the directory?')) return;
    try {
      var result = await db.from('customers').delete().eq('id', id);
      if (result.error) throw result.error;
      allCustomers = allCustomers.filter(function (c) { return c.id !== id; });
      render();
    } catch (err) {
      console.error('Failed to delete customer:', err);
      window.alert('Could not remove customer. Please try again.');
    }
  }

  // ── Load ──────────────────────────────────────────────────────────

  async function loadCustomers() {
    tbody.innerHTML = '<tr><td colspan="4" class="pdash-empty">Loading…</td></tr>';
    try {
      var result = await db.from('customers').select('*').order('contact');
      if (result.error) throw result.error;
      allCustomers = result.data || [];
      render();
    } catch (err) {
      console.error('Failed to load customers:', err);
      tbody.innerHTML = '<tr><td colspan="4" class="pdash-empty">Could not load customers. Please refresh.</td></tr>';
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

  loadCustomers();
})();

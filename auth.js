(async function () {
  var RESTRICTED_PAGES = ['product-dashboard.html', 'suppliers.html', 'customers.html'];
  var ADMIN_LANDING    = 'invoice-generator.html';

  // ── Session check ─────────────────────────────────────────────────
  var session;
  try {
    var res = await window.MVB_DB.auth.getSession();
    session = res.data.session;
  } catch (e) {
    session = null;
  }

  if (!session) {
    window.location.replace('login.html');
    return;
  }

  // ── Load role ─────────────────────────────────────────────────────
  var roleData = null;
  try {
    var roleRes = await window.MVB_DB
      .from('user_roles')
      .select('role, name')
      .eq('id', session.user.id)
      .single();
    roleData = roleRes.data;
  } catch (e) { /* unassigned user — treated as no access */ }

  var role  = roleData ? roleData.role : null;
  var name  = roleData ? roleData.name : session.user.email;
  var initials = name.split(' ').filter(Boolean).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  var roleLabel = role
    ? role.replace('_', ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); })
    : 'No role';

  window.MVB_USER = { id: session.user.id, email: session.user.email, name: name, role: role };

  // ── Update sidebar user info ──────────────────────────────────────
  var avatarEl = document.querySelector('.sidebar__avatar');
  var nameEl   = document.querySelector('.sidebar__user-name');
  var roleEl   = document.querySelector('.sidebar__user-role');
  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl)   nameEl.textContent   = name;
  if (roleEl)   roleEl.textContent   = roleLabel;

  // ── Repurpose settings button as logout ───────────────────────────
  var settingsBtn = document.querySelector('.sidebar__settings-btn');
  if (settingsBtn) {
    settingsBtn.setAttribute('aria-label', 'Log out');
    settingsBtn.title = 'Log out';
    settingsBtn.innerHTML =
      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
      '<polyline points="16 17 21 12 16 7"/>' +
      '<line x1="21" y1="12" x2="9" y2="12"/>' +
      '</svg>';
    settingsBtn.addEventListener('click', async function () {
      await window.MVB_DB.auth.signOut();
      window.location.replace('login.html');
    });
  }

  // ── Admin restrictions ────────────────────────────────────────────
  if (role === 'admin') {
    document.querySelectorAll('[data-power-only]').forEach(function (el) {
      el.style.display = 'none';
    });

    var current = window.location.pathname.split('/').pop() || 'index.html';
    if (RESTRICTED_PAGES.indexOf(current) !== -1) {
      window.location.replace(ADMIN_LANDING);
      return;
    }
  }

  // Unassigned user — sign them out and back to login
  if (!role) {
    await window.MVB_DB.auth.signOut();
    window.location.replace('login.html');
    return;
  }

  // ── Show page ─────────────────────────────────────────────────────
  document.body.style.visibility = 'visible';
})();

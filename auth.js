(async function () {
  var RESTRICTED_PAGES = ['logs.html'];
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
      if (window.MVB_AUDIT_LOG) {
        window.MVB_AUDIT_LOG.log({
          module: 'Auth',
          action: 'Logout',
          description: name + ' logged out.',
        });
      }
      await window.MVB_DB.auth.signOut();
      window.location.replace('login.html');
    });
  }

  // ── Admin restrictions ────────────────────────────────────────────
  if (role === 'admin') {
    document.body.classList.add('is-admin');

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
    if (window.MVB_AUDIT_LOG) {
      window.MVB_AUDIT_LOG.log({
        module: 'Auth',
        action: 'Logout',
        description: name + ' was automatically signed out (no role assigned).',
      });
    }
    await window.MVB_DB.auth.signOut();
    window.location.replace('login.html');
    return;
  }

  // ── Master Control Access (power users only) ──────────────────────
  if (role !== 'admin') {
    var MCA_KEY = 'mvb_mca_unlocked';

    function showMcaToast(userName) {
      var existing = document.querySelector('.mca-toast');
      if (existing) existing.parentNode.removeChild(existing);

      var toast = document.createElement('div');
      toast.className = 'mca-toast';
      toast.innerHTML =
        '<p class="mca-toast__title">Master Control Access Unlocked</p>' +
        '<p class="mca-toast__sub">Welcome ' + String(userName || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</p>';
      document.body.appendChild(toast);

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          toast.classList.add('mca-toast--visible');
        });
      });

      setTimeout(function () {
        toast.classList.remove('mca-toast--visible');
        toast.addEventListener('transitionend', function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, { once: true });
      }, 3500);
    }

    function setLockState(unlocked) {
      if (unlocked) {
        document.body.classList.remove('is-locked');
        sessionStorage.setItem(MCA_KEY, 'true');
      } else {
        document.body.classList.add('is-locked');
        sessionStorage.removeItem(MCA_KEY);
      }
      if (lockBtn) {
        lockBtn.title = unlocked ? 'Lock Master Control' : 'Master Control Access';
        lockBtn.setAttribute('aria-label', unlocked ? 'Lock Master Control' : 'Master Control Access');
        lockBtn.classList.toggle('sidebar__lock-btn--active', unlocked);
        lockBtn.innerHTML = unlocked
          ? '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>'
          : '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
      }
    }

    var sessionUnlocked = sessionStorage.getItem(MCA_KEY) === 'true';

    // Start locked unless already unlocked this session
    if (!sessionUnlocked) {
      document.body.classList.add('is-locked');
    }

    // Inject lock button before the logout button
    var lockBtn = document.createElement('button');
    lockBtn.className = 'sidebar__lock-btn';
    var footer = settingsBtn && settingsBtn.parentNode;
    if (footer) {
      footer.insertBefore(lockBtn, settingsBtn);
    }

    setLockState(sessionUnlocked);

    lockBtn.addEventListener('click', function () {
      var currentlyLocked = document.body.classList.contains('is-locked');
      if (currentlyLocked) {
        setLockState(true);
        showMcaToast(name);
      } else {
        setLockState(false);
      }
    });
  }

  // ── Pending approval badges (Inbound / Outbound) ───────────────────
  // Visible to every role — just a heads-up count, not a permission check.
  (function loadPendingBadges() {
    var badgeInbound  = document.getElementById('sidebar-badge-inbound');
    var badgeOutbound = document.getElementById('sidebar-badge-outbound');
    if (!badgeInbound && !badgeOutbound) return;

    function showBadge(el, count) {
      if (!el) return;
      if (count > 0) {
        el.textContent = count > 99 ? '99+' : String(count);
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    }

    if (badgeInbound) {
      window.MVB_DB.from('grns')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(function (res) {
          if (!res.error) showBadge(badgeInbound, res.count || 0);
        });
    }

    if (badgeOutbound) {
      window.MVB_DB.from('customer_orders')
        .select('id', { count: 'exact', head: true })
        .or('outbound_confirmed.is.null,outbound_confirmed.eq.false')
        .then(function (res) {
          if (!res.error) showBadge(badgeOutbound, res.count || 0);
        });
    }
  })();

  // ── Show page ─────────────────────────────────────────────────────
  document.body.style.visibility = 'visible';
})();

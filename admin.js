/**
 * admin.js — Haven & Crest Admin Dashboard
 *
 * Passcode-gated dashboard for viewing waitlist signups and
 * community suggestions. Fetches live data from Supabase.
 *
 * ── CONFIGURATION ────────────────────────────────────────────
 * Change ADMIN_PASSCODE below to set your own passcode.
 * ─────────────────────────────────────────────────────────────
 */

/* ================================================================
   CONFIGURATION  (edit these to customise)
   ================================================================ */
var ADMIN_PASSCODE = 'HavenCrest2027';       // ← change this
var SESSION_KEY    = 'hc_admin_unlocked';
var SESSION_EMAIL_KEY = 'hc_admin_email';

var SUPABASE_URL      = 'https://mszxguwxcpxvbpagtwdv.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zenhndXd4Y3B4dmJwYWd0d2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNTgyOTUsImV4cCI6MjEwMDkzNDI5NX0.0axpIOA369GUOKPqxBO5nfTqaXjI2EvVVB8wTViLB_o';


/* ================================================================
   SUPABASE CLIENT  (uses global loaded from CDN script tag)
   ================================================================ */
var _sb = null;

function getClient() {
  if (_sb) return _sb;
  if (!window.supabase) {
    throw new Error('Supabase CDN script did not load. Check your internet connection.');
  }
  _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}


/* ================================================================
   STATE
   ================================================================ */
var _waitlistData    = [];
var _suggestionsData = [];
var _suggestionFilter = 'all';


/* ================================================================
   SECURITY AUDIT LOGGING
   Fire-and-forget — never throws, never blocks UI.
   ================================================================ */
function logAdminEvent(action_type, risk_level, metadata) {
  try {
    var sb = getClient();
    var payload = {
      action_type: action_type,
      ip_address:  null,        // fetched async below
      user_agent:  navigator.userAgent,
      metadata: Object.assign({
        page:      location.pathname,
        referrer:  document.referrer || null,
        timestamp: new Date().toISOString(),
      }, metadata || {}),
      risk_level: risk_level || 'LOW',
    };

    // Best-effort IP fetch (3 s timeout), then insert
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 3000) : null;

    var ipPromise = fetch('https://api.ipify.org?format=json', controller ? { signal: controller.signal } : {})
      .then(function (r) { return r.json(); })
      .then(function (d) { return d.ip || null; })
      .catch(function () { return null; });

    ipPromise.then(function (ip) {
      if (timer) clearTimeout(timer);
      payload.ip_address = ip;
      sb.from('security_audit_logs').insert([payload]).catch(function (err) {
        console.warn('[Admin Security] Could not write audit log:', err && err.message);
      });
    });
  } catch (err) {
    console.warn('[Admin Security] logAdminEvent failed:', err && err.message);
  }
}


/* ================================================================
   DOM READY
   ================================================================ */
document.addEventListener('DOMContentLoaded', function () {

  // Emergency sign-out via URL param: admin.html?signout
  if (location.search.includes('signout')) {
    sessionStorage.removeItem(SESSION_KEY);
    history.replaceState(null, '', location.pathname);
  }

  var lockScreen = document.getElementById('lock-screen');
  var adminShell = document.getElementById('admin-shell');
  var lockForm   = document.getElementById('lock-form');
  var lockInput  = document.getElementById('admin-passcode');
  var lockError  = document.getElementById('lock-error');
  var lockReveal = document.getElementById('lock-reveal-btn');

  /* ----------------------------------------------------------
     SHOW / HIDE PASSCODE
  ---------------------------------------------------------- */
  if (lockReveal && lockInput) {
    lockReveal.addEventListener('click', function () {
      var isText = lockInput.type === 'text';
      lockInput.type = isText ? 'password' : 'text';
      lockReveal.setAttribute('aria-label', isText ? 'Show passcode' : 'Hide passcode');
      lockReveal.classList.toggle('is-revealed', !isText);
    });
  }

  /* ----------------------------------------------------------
     SIGN OUT
     ⚠ IMPORTANT: must be wired BEFORE the early-return below
     so the button works even when the session is already active.
  ---------------------------------------------------------- */
  var signoutBtn = document.getElementById('admin-signout');
  if (signoutBtn) {
    signoutBtn.addEventListener('click', function () {
      logAdminEvent('ADMIN_SIGNOUT', 'LOW', {});
      sessionStorage.removeItem(SESSION_KEY);
      window.location.reload();
    });
  }

  /* ----------------------------------------------------------
     REFRESH
  ---------------------------------------------------------- */
  var refreshBtn = document.getElementById('admin-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadDashboard);
  }

  /* ----------------------------------------------------------
     RETRY
  ---------------------------------------------------------- */
  var retryBtn = document.getElementById('admin-error-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', loadDashboard);
  }

  /* ----------------------------------------------------------
     SKIP LOCK IF ALREADY AUTHENTICATED THIS SESSION
  ---------------------------------------------------------- */
  if (sessionStorage.getItem(SESSION_KEY) === 'true') {
    revealDashboard(lockScreen, adminShell);
    loadDashboard();
    return; // all listeners already attached above ✓
  }

  /* ----------------------------------------------------------
     PASSCODE FORM
  ---------------------------------------------------------- */
  if (lockForm) {
    lockForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var entered = lockInput ? lockInput.value.trim() : '';

      var enteredEmail = (document.getElementById('admin-email') || {}).value || '';

      if (entered === ADMIN_PASSCODE) {
        lockError.textContent = '';
        if (lockInput) lockInput.value = '';
        sessionStorage.setItem(SESSION_KEY, 'true');
        sessionStorage.setItem(SESSION_EMAIL_KEY, enteredEmail.trim().toLowerCase());
        logAdminEvent('ADMIN_LOGIN', 'LOW', { admin_email: enteredEmail.trim().toLowerCase() });
        revealDashboard(lockScreen, adminShell);
        loadDashboard();
      } else {
        lockError.textContent = 'Incorrect passcode. Please try again.';
        logAdminEvent('ADMIN_LOGIN_FAILED', 'HIGH', {});
        if (lockInput) lockInput.value = '';
        if (lockInput) lockInput.focus();
        lockForm.classList.add('lock-form--shake');
        lockForm.addEventListener('animationend', function () {
          lockForm.classList.remove('lock-form--shake');
        }, { once: true });
      }
    });
  }

});


/* ================================================================
   REVEAL DASHBOARD (fade transition)
   ================================================================ */
function revealDashboard(lockScreen, adminShell) {
  lockScreen.style.opacity    = '0';
  lockScreen.style.transition = 'opacity 0.3s ease';
  setTimeout(function () {
    lockScreen.hidden      = true;
    adminShell.hidden      = false;
    adminShell.style.opacity    = '0';
    adminShell.style.transition = 'opacity 0.35s ease';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        adminShell.style.opacity = '1';
      });
    });
  }, 310);
}


/* ================================================================
   LOAD DASHBOARD DATA
   ================================================================ */
function loadDashboard() {
  var loading = document.getElementById('admin-loading');
  var errorEl = document.getElementById('admin-error');
  var content = document.getElementById('admin-content');

  if (loading) loading.hidden = false;
  if (errorEl) errorEl.hidden = true;
  if (content) content.hidden = true;

  var sb;
  try {
    sb = getClient();
  } catch (initErr) {
    showError(initErr.message);
    return;
  }

  Promise.all([
    sb.from('waitlist').select('*').order('created_at', { ascending: false }),
    sb.from('suggestions').select('*').order('created_at', { ascending: false }),
  ]).then(function (results) {
    var waitlistRes    = results[0];
    var suggestionsRes = results[1];

    if (waitlistRes.error)    { showError(buildErrorMsg(waitlistRes.error));    return; }
    if (suggestionsRes.error) { showError(buildErrorMsg(suggestionsRes.error)); return; }

    _waitlistData    = waitlistRes.data    || [];
    _suggestionsData = suggestionsRes.data || [];

    renderMetrics();
    renderWaitlistTable(_waitlistData);
    renderSuggestionsGrid(_suggestionsData);
    wireWaitlistSearch();
    wireTabBar();
    wireSuggestionFilters();
    wireExportCSV();

    var lastUpdated = document.getElementById('admin-last-updated');
    if (lastUpdated) lastUpdated.textContent = 'Updated ' + formatTime(new Date());

    if (loading) loading.hidden = true;
    if (content) content.hidden = false;

  }).catch(function (err) {
    console.error('[Admin] Unexpected error:', err);
    showError(err && err.message ? err.message : String(err));
  });
}

function buildErrorMsg(err) {
  var parts = [];
  if (err.code)    parts.push('Code: ' + err.code);
  if (err.message) parts.push(err.message);
  if (err.hint)    parts.push('Hint: ' + err.hint);
  return parts.length ? parts.join(' — ') : 'Unknown Supabase error. Check the browser console.';
}

function showError(msg) {
  var loading = document.getElementById('admin-loading');
  var errorEl = document.getElementById('admin-error');
  var msgEl   = document.getElementById('admin-error-msg');
  if (loading) loading.hidden = true;
  if (msgEl)   msgEl.textContent = msg || 'Could not connect to Supabase.';
  if (errorEl) errorEl.hidden = false;
  console.error('[Admin]', msg);
}


/* ================================================================
   METRICS
   ================================================================ */
function renderMetrics() {
  var total     = _waitlistData.length;
  var students  = _waitlistData.filter(function (r) { return r.user_role === 'student'; }).length;
  var landlords = _waitlistData.filter(function (r) { return r.user_role === 'landlord' || r.user_role === 'agent'; }).length;
  var suggs     = _suggestionsData.length;

  animateCount('metric-total-signups', total);
  animateCount('metric-students',      students);
  animateCount('metric-landlords',     landlords);
  animateCount('metric-suggestions',   suggs);

  setTabCount('tab-waitlist-count',    total);
  setTabCount('tab-suggestions-count', suggs);
}

function setTabCount(id, n) {
  var el = document.getElementById(id);
  if (el) el.textContent = n > 0 ? String(n) : '';
}

function animateCount(id, target) {
  var el = document.getElementById(id);
  if (!el) return;
  var duration = 900;
  var start    = performance.now();
  var from     = parseInt(el.textContent, 10) || 0;

  function step(now) {
    var t   = Math.min((now - start) / duration, 1);
    var val = Math.round(from + (target - from) * easeOutExpo(t));
    el.textContent = val.toLocaleString();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}


/* ================================================================
   WAITLIST TABLE
   ================================================================ */
function renderWaitlistTable(rows) {
  var tbody    = document.getElementById('waitlist-tbody');
  var empty    = document.getElementById('waitlist-empty');
  var rowCount = document.getElementById('waitlist-row-count');
  var wrap     = tbody ? tbody.closest('.admin-table-wrap') : null;

  if (!tbody) return;
  tbody.innerHTML = '';

  if (!rows.length) {
    if (empty) empty.hidden = false;
    if (wrap)  wrap.style.display = 'none';
    if (rowCount) rowCount.textContent = '';
    return;
  }

  if (empty) empty.hidden = true;
  if (wrap)  wrap.style.display = '';

  rows.forEach(function (row, i) {
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="admin-table__num">' + (i + 1) + '</td>' +
      '<td class="admin-table__name">'  + escHtml(row.full_name  || '—') + '</td>' +
      '<td class="admin-table__email"><a href="mailto:' + escHtml(row.email || '') + '" class="admin-table__email-link">' + escHtml(row.email || '—') + '</a></td>' +
      '<td><span class="role-badge role-badge--' + escHtml(row.user_role || '') + '">' + capitalise(row.user_role || '—') + '</span></td>' +
      '<td class="admin-table__campus">' + escHtml(row.campus_name || '—') + '</td>' +
      '<td class="admin-table__date">'   + formatDate(row.created_at) + '</td>' +
      '<td class="admin-table__actions">' +
        '<button class="admin-delete-btn" aria-label="Delete ' + escHtml(row.full_name || row.email || 'entry') + '" title="Delete entry">' +
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<polyline points="2,4 14,4"/>' +
            '<path d="M5 4V2h6v2"/>' +
            '<path d="M6 7v5M10 7v5"/>' +
            '<rect x="3" y="4" width="10" height="10" rx="1"/>' +
          '</svg>' +
        '</button>' +
      '</td>';
    tr.querySelector('.admin-delete-btn').addEventListener('click', function () {
      deleteWaitlistEntry(row.id, row);
    });
    tbody.appendChild(tr);
  });

  var total = _waitlistData.length;
  if (rowCount) {
    rowCount.textContent = rows.length < total
      ? 'Showing ' + rows.length + ' of ' + total + ' entries'
      : total + (total === 1 ? ' entry total' : ' entries total');
  }
}


/* ================================================================
   WAITLIST SEARCH
   ================================================================ */
function wireWaitlistSearch() {
  var input = document.getElementById('waitlist-search');
  if (!input) return;

  // Clone to drop any previous listener
  var fresh = input.cloneNode(true);
  input.parentNode.replaceChild(fresh, input);

  fresh.addEventListener('input', function () {
    var q = fresh.value.trim().toLowerCase();
    if (!q) { renderWaitlistTable(_waitlistData); return; }

    var filtered = _waitlistData.filter(function (r) {
      return (r.full_name   || '').toLowerCase().includes(q) ||
             (r.email       || '').toLowerCase().includes(q) ||
             (r.campus_name || '').toLowerCase().includes(q) ||
             (r.user_role   || '').toLowerCase().includes(q);
    });
    renderWaitlistTable(filtered);
  });
}


/* ================================================================
   EXPORT CSV
   ================================================================ */
function wireExportCSV() {
  var btn = document.getElementById('waitlist-export');
  if (!btn) return;

  var fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);

  fresh.addEventListener('click', function () {
    if (_waitlistData.length) exportWaitlistCSV(_waitlistData);
  });
}

function exportWaitlistCSV(data) {
  var headers = ['#', 'Full Name', 'Email', 'Role', 'Campus', 'Signed Up'];
  var rows = data.map(function (r, i) {
    return [i + 1, r.full_name || '', r.email || '', r.user_role || '', r.campus_name || '', formatDate(r.created_at)];
  });

  var csv = [headers].concat(rows).map(function (row) {
    return row.map(function (cell) {
      return '"' + String(cell).replace(/"/g, '""') + '"';
    }).join(',');
  }).join('\n');

  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = 'haven-crest-waitlist-' + datestamp() + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


/* ================================================================
   SUGGESTIONS GRID
   ================================================================ */
function renderSuggestionsGrid(rows) {
  var grid  = document.getElementById('suggestions-grid');
  var empty = document.getElementById('suggestions-empty');
  if (!grid) return;
  grid.innerHTML = '';

  var filtered = _suggestionFilter === 'all'
    ? rows
    : rows.filter(function (r) { return (r.status || 'pending') === _suggestionFilter; });

  if (!filtered.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  filtered.forEach(function (row) {
    var status     = row.status || 'pending';
    var isReviewed = status === 'reviewed';
    var card = document.createElement('div');
    card.className  = 'suggestion-item';
    card.dataset.id = row.id;

    card.innerHTML =
      '<div class="suggestion-item__header">' +
        '<div class="suggestion-item__meta">' +
          '<span class="suggestion-item__author">' + escHtml(row.author_name || 'Anonymous') + '</span>' +
          '<time class="suggestion-item__date">' + formatDate(row.created_at) + '</time>' +
        '</div>' +
        '<span class="category-badge category-badge--' + slugify(row.category || 'other') + '">' +
          escHtml(row.category || 'Other') +
        '</span>' +
      '</div>' +
      '<p class="suggestion-item__text">' + escHtml(row.suggestion_text || '') + '</p>' +
      '<div class="suggestion-item__footer">' +
        '<span class="status-badge status-badge--' + status + '" id="status-label-' + row.id + '">' +
          (isReviewed ? 'Reviewed' : 'Pending') +
        '</span>' +
        '<div class="suggestion-item__actions">' +
          '<button class="admin-toggle-btn admin-toggle-btn--' + (isReviewed ? 'pending' : 'reviewed') + '" ' +
            'data-id="' + row.id + '" data-status="' + status + '" ' +
            'aria-label="' + (isReviewed ? 'Mark as pending' : 'Mark as reviewed') + '">' +
            (isReviewed
              ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v6M4 6l4 4 4-4"/></svg> Mark Pending'
              : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8l4 4 6-6"/></svg> Mark Reviewed') +
          '</button>' +
          '<button class="admin-delete-btn admin-delete-btn--card" aria-label="Delete suggestion" title="Delete suggestion">' +
            '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<polyline points="2,4 14,4"/>' +
              '<path d="M5 4V2h6v2"/>' +
              '<path d="M6 7v5M10 7v5"/>' +
              '<rect x="3" y="4" width="10" height="10" rx="1"/>' +
            '</svg>' +
          '</button>' +
        '</div>' +
      '</div>';

    card.querySelector('.admin-toggle-btn').addEventListener('click', function (e) {
      handleStatusToggle(e.currentTarget, row);
    });
    card.querySelector('.admin-delete-btn').addEventListener('click', function () {
      deleteSuggestion(row.id, row);
    });

    grid.appendChild(card);
  });
}


/* ================================================================
   SUGGESTION STATUS TOGGLE
   ================================================================ */
function handleStatusToggle(btn, row) {
  if (btn.disabled) return;
  btn.disabled = true;

  var currentStatus = btn.dataset.status;
  var newStatus     = currentStatus === 'reviewed' ? 'pending' : 'reviewed';

  // Optimistic update
  updateSuggestionCard(row.id, newStatus);
  var idx = _suggestionsData.findIndex(function (r) { return r.id === row.id; });
  if (idx !== -1) _suggestionsData[idx].status = newStatus;

  var sb;
  try { sb = getClient(); } catch (e) { btn.disabled = false; return; }

  sb.from('suggestions')
    .update({ status: newStatus })
    .eq('id', row.id)
    .then(function (res) {
      if (res.error) {
        // Revert
        updateSuggestionCard(row.id, currentStatus);
        if (idx !== -1) _suggestionsData[idx].status = currentStatus;
        console.error('[Admin] Status update failed:', res.error.message);
      } else {
        renderMetrics();
      }
    })
    .catch(function () {
      updateSuggestionCard(row.id, currentStatus);
      if (idx !== -1) _suggestionsData[idx].status = currentStatus;
    });
}

function updateSuggestionCard(id, newStatus) {
  var card       = document.querySelector('.suggestion-item[data-id="' + id + '"]');
  if (!card) return;
  var label      = document.getElementById('status-label-' + id);
  var btn        = card.querySelector('.admin-toggle-btn');
  var isReviewed = newStatus === 'reviewed';

  if (label) {
    label.textContent = isReviewed ? 'Reviewed' : 'Pending';
    label.className   = 'status-badge status-badge--' + newStatus;
  }
  if (btn) {
    btn.dataset.status = newStatus;
    btn.className      = 'admin-toggle-btn admin-toggle-btn--' + (isReviewed ? 'pending' : 'reviewed');
    btn.setAttribute('aria-label', isReviewed ? 'Mark as pending' : 'Mark as reviewed');
    btn.disabled  = false;
    btn.innerHTML = isReviewed
      ? '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v6M4 6l4 4 4-4"/></svg> Mark Pending'
      : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8l4 4 6-6"/></svg> Mark Reviewed';
  }
}


/* ================================================================
   SUGGESTION FILTERS
   ================================================================ */
function wireSuggestionFilters() {
  var btns = document.querySelectorAll('.admin-filter-btn');
  btns.forEach(function (btn) {
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', function () {
      _suggestionFilter = fresh.dataset.filter || 'all';
      document.querySelectorAll('.admin-filter-btn').forEach(function (b) {
        b.classList.toggle('admin-filter-btn--active', b.dataset.filter === _suggestionFilter);
      });
      renderSuggestionsGrid(_suggestionsData);
    });
  });
}


/* ================================================================
   TAB BAR
   ================================================================ */
function wireTabBar() {
  var tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(function (tab) {
    var fresh = tab.cloneNode(true);
    tab.parentNode.replaceChild(fresh, tab);
    fresh.addEventListener('click', function () { switchTab(fresh.id); });
  });
}

function switchTab(tabId) {
  document.querySelectorAll('.admin-tab').forEach(function (t) {
    var active = t.id === tabId;
    t.classList.toggle('admin-tab--active', active);
    t.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.admin-panel').forEach(function (p) {
    var active = p.id === tabId.replace('tab-', 'panel-');
    p.hidden = !active;
    p.classList.toggle('admin-panel--hidden', !active);
  });
}


/* ================================================================
   DELETE — WAITLIST ENTRY
   ================================================================ */
function deleteWaitlistEntry(id, row) {
  var name = (row.full_name || row.email || 'this entry');
  if (!confirm('Delete "' + name + '" from the waitlist? This cannot be undone.')) return;

  var sb;
  try { sb = getClient(); } catch (e) { alert('Cannot connect to database.'); return; }

  var adminEmail = sessionStorage.getItem(SESSION_EMAIL_KEY) || 'unknown';

  sb.from('waitlist')
    .delete()
    .eq('id', id)
    .then(function (res) {
      if (res.error) {
        alert('Delete failed: ' + res.error.message);
        return;
      }
      // Remove from local state and re-render
      _waitlistData = _waitlistData.filter(function (r) { return r.id !== id; });
      renderWaitlistTable(_waitlistData);
      renderMetrics();
      logAdminEvent('ADMIN_DELETE_WAITLIST', 'MEDIUM', {
        admin_email:   adminEmail,
        deleted_id:    id,
        deleted_name:  row.full_name  || null,
        deleted_email: row.email      || null,
        deleted_role:  row.user_role  || null,
        campus:        row.campus_name || null,
      });
    })
    .catch(function (err) {
      alert('Delete failed: ' + (err && err.message ? err.message : 'Unknown error'));
    });
}


/* ================================================================
   DELETE — SUGGESTION
   ================================================================ */
function deleteSuggestion(id, row) {
  var preview = (row.suggestion_text || '').slice(0, 60) || 'this suggestion';
  if (!confirm('Delete "' + preview + '…"? This cannot be undone.')) return;

  var sb;
  try { sb = getClient(); } catch (e) { alert('Cannot connect to database.'); return; }

  var adminEmail = sessionStorage.getItem(SESSION_EMAIL_KEY) || 'unknown';

  sb.from('suggestions')
    .delete()
    .eq('id', id)
    .then(function (res) {
      if (res.error) {
        alert('Delete failed: ' + res.error.message);
        return;
      }
      // Remove from local state and re-render
      _suggestionsData = _suggestionsData.filter(function (r) { return r.id !== id; });
      renderSuggestionsGrid(_suggestionsData);
      renderMetrics();
      logAdminEvent('ADMIN_DELETE_SUGGESTION', 'MEDIUM', {
        admin_email:    adminEmail,
        deleted_id:     id,
        deleted_author: row.author_name    || null,
        deleted_cat:    row.category       || null,
        deleted_text:   (row.suggestion_text || '').slice(0, 120),
      });
    })
    .catch(function (err) {
      alert('Delete failed: ' + (err && err.message ? err.message : 'Unknown error'));
    });
}


/* ================================================================
   HELPERS
   ================================================================ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalise(str) {
  if (!str) return '—';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch (e) { return iso; }
}

function formatTime(date) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(date);
  } catch (e) { return ''; }
}

function datestamp() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

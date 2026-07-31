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
const ADMIN_PASSCODE    = 'HavenCrest2027';      // ← change this
const SESSION_KEY       = 'hc_admin_unlocked';

const SUPABASE_URL      = 'https://mszxguwxcpxvbpagtwdv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zenhndXd4Y3B4dmJwYWd0d2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNTgyOTUsImV4cCI6MjEwMDkzNDI5NX0.0axpIOA369GUOKPqxBO5nfTqaXjI2EvVVB8wTViLB_o';


/* ================================================================
   SUPABASE CLIENT
   ================================================================ */
let _sb = null;

async function getClient() {
  if (_sb) return _sb;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  _sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _sb;
}


/* ================================================================
   STATE
   ================================================================ */
let _waitlistData     = [];   // full dataset from Supabase
let _suggestionsData  = [];   // full dataset from Supabase
let _suggestionFilter = 'all'; // 'all' | 'pending' | 'reviewed'


/* ================================================================
   DOM READY
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {

  /* ----------------------------------------------------------
     LOCK SCREEN
  ---------------------------------------------------------- */
  const lockScreen = document.getElementById('lock-screen');
  const adminShell = document.getElementById('admin-shell');
  const lockForm   = document.getElementById('lock-form');
  const lockInput  = document.getElementById('admin-passcode');
  const lockError  = document.getElementById('lock-error');
  const lockSubmit = document.getElementById('lock-submit');
  const lockReveal = document.getElementById('lock-reveal-btn');

  // Show/hide passcode toggle
  if (lockReveal && lockInput) {
    lockReveal.addEventListener('click', () => {
      const isText = lockInput.type === 'text';
      lockInput.type = isText ? 'password' : 'text';
      lockReveal.setAttribute('aria-label', isText ? 'Show passcode' : 'Hide passcode');
      lockReveal.classList.toggle('is-revealed', !isText);
    });
  }

  // Check sessionStorage — skip lock if already unlocked this session
  if (sessionStorage.getItem(SESSION_KEY) === 'true') {
    showDashboard();
    loadDashboard();
    return;
  }

  // Passcode form submit
  lockForm?.addEventListener('submit', e => {
    e.preventDefault();
    const entered = lockInput.value.trim();

    if (entered === ADMIN_PASSCODE) {
      lockError.textContent = '';
      lockInput.value = '';
      sessionStorage.setItem(SESSION_KEY, 'true');
      showDashboard();
      loadDashboard();
    } else {
      lockError.textContent = 'Incorrect passcode. Please try again.';
      lockInput.value = '';
      lockInput.focus();
      // Shake animation
      lockForm.classList.add('lock-form--shake');
      lockForm.addEventListener('animationend', () => {
        lockForm.classList.remove('lock-form--shake');
      }, { once: true });
    }
  });

  function showDashboard() {
    lockScreen.style.opacity = '0';
    lockScreen.style.transition = 'opacity 0.35s ease';
    setTimeout(() => {
      lockScreen.hidden = true;
      adminShell.hidden = false;
      // Fade in
      requestAnimationFrame(() => {
        adminShell.style.opacity = '0';
        adminShell.style.transition = 'opacity 0.4s ease';
        requestAnimationFrame(() => { adminShell.style.opacity = '1'; });
      });
    }, 350);
  }

  /* ----------------------------------------------------------
     SIGN OUT
  ---------------------------------------------------------- */
  document.getElementById('admin-signout')?.addEventListener('click', () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  });

  /* ----------------------------------------------------------
     REFRESH
  ---------------------------------------------------------- */
  document.getElementById('admin-refresh')?.addEventListener('click', () => {
    loadDashboard();
  });

  /* ----------------------------------------------------------
     RETRY
  ---------------------------------------------------------- */
  document.getElementById('admin-error-retry')?.addEventListener('click', () => {
    loadDashboard();
  });

});


/* ================================================================
   LOAD DASHBOARD DATA
   ================================================================ */
async function loadDashboard() {
  const loading = document.getElementById('admin-loading');
  const error   = document.getElementById('admin-error');
  const content = document.getElementById('admin-content');

  loading.hidden = false;
  error.hidden   = true;
  content.hidden = true;

  try {
    const sb = await getClient();

    const [waitlistRes, suggestionsRes] = await Promise.all([
      sb.from('waitlist').select('*').order('created_at', { ascending: false }),
      sb.from('suggestions').select('*').order('created_at', { ascending: false }),
    ]);

    if (waitlistRes.error)    throw waitlistRes.error;
    if (suggestionsRes.error) throw suggestionsRes.error;

    _waitlistData    = waitlistRes.data    ?? [];
    _suggestionsData = suggestionsRes.data ?? [];

    renderMetrics();
    renderWaitlistTable(_waitlistData);
    renderSuggestionsGrid(_suggestionsData);
    wireWaitlistSearch();
    wireTabBar();
    wireSuggestionFilters();
    wireExportCSV();

    document.getElementById('admin-last-updated').textContent =
      'Updated ' + formatTime(new Date());

    loading.hidden = true;
    content.hidden = false;

  } catch (err) {
    console.error('[Admin] Failed to load data:', err);
    loading.hidden = true;
    document.getElementById('admin-error-msg').textContent =
      err.message ?? 'Failed to reach Supabase. Check your RLS policies.';
    error.hidden = false;
  }
}


/* ================================================================
   METRICS
   ================================================================ */
function renderMetrics() {
  const total     = _waitlistData.length;
  const students  = _waitlistData.filter(r => r.user_role === 'student').length;
  const landlords = _waitlistData.filter(r => r.user_role === 'landlord' || r.user_role === 'agent').length;
  const suggs     = _suggestionsData.length;

  animateCount('metric-total-signups', total);
  animateCount('metric-students',      students);
  animateCount('metric-landlords',     landlords);
  animateCount('metric-suggestions',   suggs);

  // Tab badge counts
  setTabCount('tab-waitlist-count',     total);
  setTabCount('tab-suggestions-count',  suggs);
}

function setTabCount(id, n) {
  const el = document.getElementById(id);
  if (el) el.textContent = n > 0 ? String(n) : '';
}

function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const duration = 900;
  const start    = performance.now();
  const from     = parseInt(el.textContent, 10) || 0;

  function step(now) {
    const t   = Math.min((now - start) / duration, 1);
    const val = Math.round(from + (target - from) * easeOutExpo(t));
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
  const tbody   = document.getElementById('waitlist-tbody');
  const empty   = document.getElementById('waitlist-empty');
  const rowCount = document.getElementById('waitlist-row-count');

  tbody.innerHTML = '';

  if (!rows.length) {
    empty.hidden   = false;
    tbody.closest('.admin-table-wrap').style.display = 'none';
    rowCount.textContent = '';
    return;
  }

  empty.hidden = true;
  tbody.closest('.admin-table-wrap').style.display = '';

  rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="admin-table__num">${i + 1}</td>
      <td class="admin-table__name">${escHtml(row.full_name ?? '—')}</td>
      <td class="admin-table__email">
        <a href="mailto:${escHtml(row.email ?? '')}" class="admin-table__email-link">
          ${escHtml(row.email ?? '—')}
        </a>
      </td>
      <td><span class="role-badge role-badge--${escHtml(row.user_role ?? '')}">${capitalise(row.user_role ?? '—')}</span></td>
      <td class="admin-table__campus">${escHtml(row.campus_name ?? '—')}</td>
      <td class="admin-table__date">${formatDate(row.created_at)}</td>
    `;
    tbody.appendChild(tr);
  });

  const total = _waitlistData.length;
  rowCount.textContent = rows.length < total
    ? `Showing ${rows.length} of ${total} entries`
    : `${total} ${total === 1 ? 'entry' : 'entries'} total`;
}


/* ================================================================
   WAITLIST SEARCH
   ================================================================ */
function wireWaitlistSearch() {
  const input = document.getElementById('waitlist-search');
  if (!input) return;

  // Remove old listener if re-wiring after refresh
  const fresh = input.cloneNode(true);
  input.parentNode.replaceChild(fresh, input);

  fresh.addEventListener('input', () => {
    const q = fresh.value.trim().toLowerCase();
    if (!q) {
      renderWaitlistTable(_waitlistData);
      return;
    }
    const filtered = _waitlistData.filter(r =>
      (r.full_name    ?? '').toLowerCase().includes(q) ||
      (r.email        ?? '').toLowerCase().includes(q) ||
      (r.campus_name  ?? '').toLowerCase().includes(q) ||
      (r.user_role    ?? '').toLowerCase().includes(q)
    );
    renderWaitlistTable(filtered);
  });
}


/* ================================================================
   EXPORT CSV
   ================================================================ */
function wireExportCSV() {
  const btn = document.getElementById('waitlist-export');
  if (!btn) return;

  const fresh = btn.cloneNode(true);
  btn.parentNode.replaceChild(fresh, btn);

  fresh.addEventListener('click', () => {
    if (!_waitlistData.length) return;
    exportWaitlistCSV(_waitlistData);
  });
}

function exportWaitlistCSV(data) {
  const headers = ['#', 'Full Name', 'Email', 'Role', 'Campus', 'Signed Up'];
  const rows = data.map((r, i) => [
    i + 1,
    r.full_name    ?? '',
    r.email        ?? '',
    r.user_role    ?? '',
    r.campus_name  ?? '',
    formatDate(r.created_at),
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `haven-crest-waitlist-${datestamp()}.csv`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


/* ================================================================
   SUGGESTIONS GRID
   ================================================================ */
function renderSuggestionsGrid(rows) {
  const grid  = document.getElementById('suggestions-grid');
  const empty = document.getElementById('suggestions-empty');
  grid.innerHTML = '';

  const filtered = _suggestionFilter === 'all'
    ? rows
    : rows.filter(r => (r.status ?? 'pending') === _suggestionFilter);

  if (!filtered.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  filtered.forEach(row => {
    const status   = row.status ?? 'pending';
    const isReviewed = status === 'reviewed';
    const card = document.createElement('div');
    card.className = 'suggestion-item';
    card.dataset.id = row.id;

    card.innerHTML = `
      <div class="suggestion-item__header">
        <div class="suggestion-item__meta">
          <span class="suggestion-item__author">${escHtml(row.author_name ?? 'Anonymous')}</span>
          <time class="suggestion-item__date">${formatDate(row.created_at)}</time>
        </div>
        <span class="category-badge category-badge--${slugify(row.category ?? 'other')}">
          ${escHtml(row.category ?? 'Other')}
        </span>
      </div>
      <p class="suggestion-item__text">${escHtml(row.suggestion_text ?? '')}</p>
      <div class="suggestion-item__footer">
        <span class="status-badge status-badge--${status}" id="status-label-${row.id}">
          ${isReviewed ? 'Reviewed' : 'Pending'}
        </span>
        <button
          class="admin-toggle-btn admin-toggle-btn--${isReviewed ? 'pending' : 'reviewed'}"
          data-id="${row.id}"
          data-status="${status}"
          aria-label="${isReviewed ? 'Mark as pending' : 'Mark as reviewed'}"
        >
          ${isReviewed
            ? `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M8 2v6M4 6l4 4 4-4"/>
               </svg> Mark Pending`
            : `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 8l4 4 6-6"/>
               </svg> Mark Reviewed`
          }
        </button>
      </div>
    `;

    card.querySelector('.admin-toggle-btn').addEventListener('click', e => {
      handleStatusToggle(e.currentTarget, row);
    });

    grid.appendChild(card);
  });
}


/* ================================================================
   SUGGESTION STATUS TOGGLE
   ================================================================ */
async function handleStatusToggle(btn, row) {
  if (btn.disabled) return;
  btn.disabled = true;

  const currentStatus = btn.dataset.status;
  const newStatus     = currentStatus === 'reviewed' ? 'pending' : 'reviewed';

  // Optimistic UI update
  updateSuggestionCard(row.id, newStatus);
  // Update local state
  const idx = _suggestionsData.findIndex(r => r.id === row.id);
  if (idx !== -1) _suggestionsData[idx].status = newStatus;

  try {
    const sb = await getClient();
    const { error } = await sb
      .from('suggestions')
      .update({ status: newStatus })
      .eq('id', row.id);

    if (error) {
      // Revert on failure
      updateSuggestionCard(row.id, currentStatus);
      if (idx !== -1) _suggestionsData[idx].status = currentStatus;
      console.error('[Admin] Status update failed:', error.message);
    } else {
      // Re-render metrics
      renderMetrics();
    }
  } catch (err) {
    updateSuggestionCard(row.id, currentStatus);
    if (idx !== -1) _suggestionsData[idx].status = currentStatus;
    console.error('[Admin] Status update error:', err);
  }
}

function updateSuggestionCard(id, newStatus) {
  const card = document.querySelector(`.suggestion-item[data-id="${id}"]`);
  if (!card) return;

  const label = card.querySelector(`#status-label-${id}`);
  const btn   = card.querySelector('.admin-toggle-btn');
  const isReviewed = newStatus === 'reviewed';

  if (label) {
    label.textContent = isReviewed ? 'Reviewed' : 'Pending';
    label.className   = `status-badge status-badge--${newStatus}`;
  }

  if (btn) {
    btn.dataset.status = newStatus;
    btn.className = `admin-toggle-btn admin-toggle-btn--${isReviewed ? 'pending' : 'reviewed'}`;
    btn.setAttribute('aria-label', isReviewed ? 'Mark as pending' : 'Mark as reviewed');
    btn.disabled = false;
    btn.innerHTML = isReviewed
      ? `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 2v6M4 6l4 4 4-4"/>
         </svg> Mark Pending`
      : `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 8l4 4 6-6"/>
         </svg> Mark Reviewed`;
  }
}


/* ================================================================
   SUGGESTION FILTERS
   ================================================================ */
function wireSuggestionFilters() {
  const btns = document.querySelectorAll('.admin-filter-btn');
  btns.forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', () => {
      _suggestionFilter = fresh.dataset.filter ?? 'all';
      document.querySelectorAll('.admin-filter-btn').forEach(b =>
        b.classList.toggle('admin-filter-btn--active', b.dataset.filter === _suggestionFilter)
      );
      renderSuggestionsGrid(_suggestionsData);
    });
  });
}


/* ================================================================
   TAB BAR
   ================================================================ */
function wireTabBar() {
  const tabs = document.querySelectorAll('.admin-tab');
  tabs.forEach(tab => {
    const fresh = tab.cloneNode(true);
    tab.parentNode.replaceChild(fresh, tab);
    fresh.addEventListener('click', () => switchTab(fresh.id));
  });
}

function switchTab(tabId) {
  const tabs   = document.querySelectorAll('.admin-tab');
  const panels = document.querySelectorAll('.admin-panel');

  tabs.forEach(t => {
    const isActive = t.id === tabId;
    t.classList.toggle('admin-tab--active', isActive);
    t.setAttribute('aria-selected', String(isActive));
  });

  panels.forEach(p => {
    const panelId = tabId.replace('tab-', 'panel-');
    const isActive = p.id === panelId;
    p.hidden = !isActive;
    p.classList.toggle('admin-panel--hidden', !isActive);
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
      day:   '2-digit',
      month: 'short',
      year:  'numeric',
      hour:  '2-digit',
      minute:'2-digit',
    }).format(new Date(iso));
  } catch { return iso; }
}

function formatTime(date) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  } catch { return ''; }
}

function datestamp() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

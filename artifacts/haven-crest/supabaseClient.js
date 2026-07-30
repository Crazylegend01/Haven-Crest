/**
 * supabaseClient.js — Haven & Crest
 *
 * Supabase backend client, helper utilities, and Toast notification system.
 *
 * ─────────────────────────────────────────────────────────────────
 *  SETUP (two steps)
 *  1. Paste your credentials below (Supabase → Project Settings → API)
 *  2. Run supabase-setup.sql in your Supabase SQL Editor
 * ─────────────────────────────────────────────────────────────────
 */

/* ================================================================
   CREDENTIALS  ← replace these two strings
   ================================================================ */
const SUPABASE_URL      = '';   // e.g. "https://abcdefgh.supabase.co"
const SUPABASE_ANON_KEY = '';   // your anon / public key


/* ================================================================
   INTERNAL CLIENT  (lazy CDN import — no build step required)
   ================================================================ */
let _client = null;

/**
 * Returns an initialised Supabase client, or null if credentials
 * are not yet set. Safe to call from multiple places.
 * @returns {Promise<import('https://esm.sh/@supabase/supabase-js@2').SupabaseClient | null>}
 */
async function getClient() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.info('[Haven & Crest] Supabase client ready.');
  } catch (err) {
    console.warn('[Haven & Crest] Supabase could not be loaded:', err.message);
  }
  return _client;
}


/* ================================================================
   HELPER UTILITIES
   ================================================================ */

/**
 * Submit a waitlist entry.
 *
 * @param {{
 *   full_name:   string,
 *   email:       string,
 *   user_role:   'student' | 'landlord' | 'agent',
 *   campus_name?: string
 * }} data
 * @returns {Promise<{ success: boolean, error?: string }>}
 *
 * @example
 *   import { submitWaitlist } from './supabaseClient.js';
 *   const res = await submitWaitlist({
 *     full_name:   'Alex Reid',
 *     email:       'alex@example.com',
 *     user_role:   'student',
 *     campus_name: 'UCL',
 *   });
 */
export async function submitWaitlist(data) {
  const sb = await getClient();

  if (!sb) {
    // No-backend fallback: log and simulate success
    console.log('[Haven & Crest] submitWaitlist (offline):', data);
    await _delay(600);
    return { success: true };
  }

  const { error } = await sb.from('waitlist').insert([data]);
  if (error) return { success: false, error: error.message };
  return { success: true };
}


/**
 * Submit a suggestion.
 *
 * @param {{
 *   author_name?:    string,
 *   category:        string,
 *   suggestion_text: string
 * }} data
 * @returns {Promise<{ success: boolean, error?: string }>}
 *
 * @example
 *   import { submitSuggestion } from './supabaseClient.js';
 *   const res = await submitSuggestion({
 *     author_name:     'Sam',
 *     category:        'property',
 *     suggestion_text: 'More listings in Shoreditch please!',
 *   });
 */
export async function submitSuggestion(data) {
  const sb = await getClient();

  if (!sb) {
    console.log('[Haven & Crest] submitSuggestion (offline):', data);
    await _delay(600);
    return { success: true };
  }

  const { error } = await sb.from('suggestions').insert([data]);
  if (error) return { success: false, error: error.message };
  return { success: true };
}


/**
 * Submit a general enquiry (contact form).
 *
 * @param {{ name: string, email: string, message: string }} data
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function submitEnquiry(data) {
  const sb = await getClient();

  if (!sb) {
    console.log('[Haven & Crest] submitEnquiry (offline):', data);
    await _delay(800);
    return { success: true };
  }

  const { error } = await sb.from('enquiries').insert([data]);
  if (error) return { success: false, error: error.message };
  return { success: true };
}


/* ================================================================
   TOAST NOTIFICATION SYSTEM
   ================================================================ */

let _toastRoot = null;

/** @returns {HTMLElement} */
function _getToastRoot() {
  if (_toastRoot) return _toastRoot;
  _toastRoot = document.createElement('div');
  _toastRoot.id = 'hc-toast-root';
  document.body.appendChild(_toastRoot);
  return _toastRoot;
}

const _toastIcons = {
  success: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="10" cy="10" r="8"/>
              <path d="m6.5 10 2.5 2.5 4.5-4.5"/>
            </svg>`,
  error:   `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="10" cy="10" r="8"/>
              <path d="M10 6v4.5M10 14h.01"/>
            </svg>`,
  info:    `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="10" cy="10" r="8"/>
              <path d="M10 10v4M10 6h.01"/>
            </svg>`,
};

/**
 * Display a toast notification that slides in from the top-right.
 * Stacks gracefully when multiple toasts are shown.
 * Auto-dismisses after `duration` ms; user can also close manually.
 *
 * @param {string}                         message  Text to display
 * @param {'success' | 'error' | 'info'}  [type='info']
 * @param {number}                         [duration=4500]  ms before auto-dismiss
 *
 * @example
 *   import { showToast } from './supabaseClient.js';
 *   showToast('Saved successfully!', 'success');
 *   showToast('Something went wrong.', 'error');
 */
export function showToast(message, type = 'info', duration = 4500) {
  const root  = _getToastRoot();
  const icon  = _toastIcons[type] || _toastIcons.info;
  const toast = document.createElement('div');

  toast.className = `hc-toast hc-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <span class="hc-toast__icon">${icon}</span>
    <span class="hc-toast__msg">${message}</span>
    <button class="hc-toast__close" aria-label="Dismiss">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>
      </svg>
    </button>
  `;

  root.appendChild(toast);

  // Trigger enter animation on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('hc-toast--visible'));
  });

  const dismiss = () => {
    toast.classList.remove('hc-toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  };

  const timer = setTimeout(dismiss, duration);

  toast.querySelector('.hc-toast__close').addEventListener('click', () => {
    clearTimeout(timer);
    dismiss();
  });
}


/* ================================================================
   INTERNAL HELPERS
   ================================================================ */
const _delay = ms => new Promise(r => setTimeout(r, ms));


/* ================================================================
   INIT LOG
   ================================================================ */
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.info(
    '[Haven & Crest] Running without a Supabase backend.\n' +
    'To connect: open supabaseClient.js and paste your SUPABASE_URL + SUPABASE_ANON_KEY,\n' +
    'then run supabase-setup.sql in your Supabase SQL Editor.'
  );
}

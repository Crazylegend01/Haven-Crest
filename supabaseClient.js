/**
 * supabaseClient.js — Haven & Crest
 *
 * Supabase backend client, helper utilities, Toast notification system,
 * and Security / Fraud-detection layer.
 */

/* ================================================================
   CREDENTIALS
   ================================================================ */
const SUPABASE_URL      = 'https://mszxguwxcpxvbpagtwdv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zenhndXd4Y3B4dmJwYWd0d2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNTgyOTUsImV4cCI6MjEwMDkzNDI5NX0.0axpIOA369GUOKPqxBO5nfTqaXjI2EvVVB8wTViLB_o';


/* ================================================================
   INTERNAL CLIENT  (lazy CDN import — no build step required)
   ================================================================ */
let _client = null;

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
   FORM SUBMISSIONS
   ================================================================ */

export async function submitWaitlist(data) {
  const sb = await getClient();
  if (!sb) { await _delay(600); return { success: true }; }
  const { error } = await sb.from('waitlist').insert([data]);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function submitSuggestion(data) {
  const sb = await getClient();
  if (!sb) { await _delay(600); return { success: true }; }
  const { error } = await sb.from('suggestions').insert([data]);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function submitEnquiry(data) {
  const sb = await getClient();
  if (!sb) { await _delay(800); return { success: true }; }
  const { error } = await sb.from('enquiries').insert([data]);
  if (error) return { success: false, error: error.message };
  return { success: true };
}


/* ================================================================
   ── SECURITY LAYER ──────────────────────────────────────────────
   ================================================================ */


/* ----------------------------------------------------------------
   1. INPUT SANITIZATION
   ---------------------------------------------------------------- */

/**
 * Strip HTML / script content and enforce a maximum length.
 * Use on every free-text field before sending to Supabase.
 */
export function sanitizeText(str, maxLen = 2000) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')            // strip HTML tags
    .replace(/javascript\s*:/gi, '')    // strip JS URI scheme
    .replace(/on\w+\s*=\s*["'`]/gi, '') // strip inline event attrs
    .replace(/&lt;/gi, '<')             // normalise encoded entities
    .replace(/&gt;/gi, '>')             //   so the checks below still catch them
    .replace(/<[^>]*>/g, '')            // second pass after entity decode
    .trim()
    .slice(0, maxLen);
}

/**
 * Normalise and validate an email address.
 * Returns the cleaned email or an empty string if invalid.
 */
export function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const cleaned = email.trim().toLowerCase().slice(0, 255);
  // RFC-5322–ish check
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned) ? cleaned : '';
}

/**
 * Sanitize a full name — letters, spaces, hyphens, apostrophes only.
 */
export function sanitizeName(name, maxLen = 100) {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{M}\s'\-\.]/gu, '') // allow unicode letters + common name chars
    .trim()
    .slice(0, maxLen);
}


/* ----------------------------------------------------------------
   2. SUSPICIOUS CONTENT DETECTION
   ---------------------------------------------------------------- */

const SCAM_KEYWORDS = [
  'wire transfer', 'western union', 'moneygram', 'advance fee',
  'send money', 'bank details', 'nigerian prince', 'lottery winner',
  'inheritance funds', 'bitcoin payment', 'crypto payment',
  'whatsapp only', 'telegram only', 'no viewing',
];

/**
 * Analyse text for spam / scam signals.
 * @param {string} text
 * @returns {{ suspicious: boolean, flags: string[], riskLevel: string }}
 */
export function detectSuspiciousContent(text) {
  if (!text) return { suspicious: false, flags: [], riskLevel: 'LOW' };

  const flags  = [];
  const lower  = text.toLowerCase();
  const letters = text.replace(/[^a-zA-Z]/g, '');

  // Embedded URLs
  if (/https?:\/\/|www\./i.test(text))          flags.push('contains_url');

  // Repeated characters (e.g. "aaaaaaaaaa")
  if (/(.)\1{9,}/.test(text))                   flags.push('repeated_chars');

  // ALL CAPS blocks (shouting spam)
  if (letters.length > 20 && letters === letters.toUpperCase())
                                                  flags.push('all_caps');

  // Scam keyword hits
  for (const kw of SCAM_KEYWORDS) {
    if (lower.includes(kw)) flags.push('scam_keyword:' + kw);
  }

  // Phone numbers embedded in text
  if (/\+?\d[\d\s\-().]{7,}\d/.test(text))      flags.push('phone_number');

  const hasScam = flags.some(f => f.startsWith('scam_keyword'));
  const riskLevel = hasScam             ? 'HIGH'
                  : flags.length >= 2   ? 'MEDIUM'
                  : flags.length === 1  ? 'LOW'
                  : 'LOW';

  return { suspicious: flags.length > 0, flags, riskLevel };
}


/* ----------------------------------------------------------------
   3. HONEYPOT DETECTION
   ---------------------------------------------------------------- */

/**
 * Returns true if a bot-only hidden field has been filled.
 * Bots auto-complete all visible inputs; humans never touch these.
 * @param {HTMLFormElement} form
 * @param {string[]}        fieldNames  Names of honeypot inputs
 */
export function isBotDetected(form, fieldNames = ['hc_website', 'hc_url']) {
  for (const name of fieldNames) {
    const el = form.querySelector(`[name="${name}"]`);
    if (el && el.value.trim() !== '') return true;
  }
  return false;
}


/* ----------------------------------------------------------------
   4. CLIENT-SIDE RATE LIMITING
   ---------------------------------------------------------------- */

/**
 * Sliding-window rate limiter backed by localStorage.
 *
 * @param {string} action        Unique key, e.g. 'waitlist_submit'
 * @param {number} maxAttempts   Max allowed calls within the window
 * @param {number} windowMs      Window size in milliseconds
 * @returns {{ allowed: boolean, remaining: number, retryAfterMs: number }}
 */
export function checkRateLimit(action, maxAttempts = 3, windowMs = 24 * 60 * 60 * 1000) {
  const key = 'hc_rl_' + action;
  const now = Date.now();
  let timestamps = [];

  try {
    timestamps = JSON.parse(localStorage.getItem(key) || '[]');
  } catch { timestamps = []; }

  // Prune entries outside the window
  timestamps = timestamps.filter(t => now - t < windowMs);

  if (timestamps.length >= maxAttempts) {
    const oldest      = Math.min(...timestamps);
    const retryAfterMs = (oldest + windowMs) - now;
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  timestamps.push(now);
  try { localStorage.setItem(key, JSON.stringify(timestamps)); } catch {}

  return { allowed: true, remaining: maxAttempts - timestamps.length, retryAfterMs: 0 };
}

/**
 * Human-readable countdown, e.g. "23 hrs 12 min".
 */
export function formatRetryAfter(ms) {
  const hrs  = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hrs > 0)  return `${hrs} hr${hrs > 1 ? 's' : ''} ${mins} min`;
  if (mins > 0) return `${mins} min`;
  return 'a moment';
}


/* ----------------------------------------------------------------
   5. IP ADDRESS FETCHING  (best-effort, never blocks submission)
   ---------------------------------------------------------------- */
let _cachedIP = null;

async function _fetchClientIP() {
  if (_cachedIP !== null) return _cachedIP;
  try {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), 3000);
    const res  = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timer);
    const data = await res.json();
    _cachedIP  = data.ip || null;
  } catch {
    _cachedIP = null;
  }
  return _cachedIP;
}


/* ----------------------------------------------------------------
   6. SECURITY AUDIT LOGGING
   ---------------------------------------------------------------- */

/**
 * Insert a security event into public.security_audit_logs.
 * Fire-and-forget — never throws, never blocks the calling code.
 *
 * @param {{
 *   action_type: string,
 *   metadata?:   object,
 *   risk_level?: 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'
 * }} opts
 */
export async function logSecurityEvent({ action_type, metadata = {}, risk_level = 'LOW' }) {
  try {
    const sb = await getClient();
    if (!sb) return;

    const ip_address = await _fetchClientIP();
    const payload = {
      action_type,
      ip_address,
      user_agent:  navigator.userAgent,
      metadata:    {
        ...metadata,
        page:      location.pathname,
        referrer:  document.referrer || null,
        timestamp: new Date().toISOString(),
      },
      risk_level,
    };

    await sb.from('security_audit_logs').insert([payload]);
  } catch (err) {
    // Logging must never disrupt UX
    console.warn('[Security] Could not log event:', err.message);
  }
}


/* ================================================================
   TOAST NOTIFICATION SYSTEM
   ================================================================ */
let _toastRoot = null;

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

console.info('[Haven & Crest] Supabase credentials loaded. Client will initialise on first request.');

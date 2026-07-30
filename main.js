/**
 * main.js — Haven & Crest
 *
 * Pure vanilla JS — no build step, no dependencies.
 *
 * - Mobile navigation toggle
 * - Smooth-scroll anchor links (with sticky-nav offset)
 * - Contact form validation & submission
 * - Supabase client stub (activated by setting SUPABASE_URL + SUPABASE_ANON_KEY below)
 * - Footer copyright year
 */


/* ================================================================
   SUPABASE CONFIGURATION
   To enable backend persistence:
     1. Create a project at https://supabase.com
     2. Paste your Project URL and anon key into the constants below.
     3. Create a table called `enquiries` with columns:
           name    text  not null
           email   text  not null
           message text
   ================================================================ */
const SUPABASE_URL  = '';   // e.g. 'https://xyzcompany.supabase.co'
const SUPABASE_ANON = '';   // e.g. 'eyJhbGci...'

/** Lazy-loaded Supabase client (null when credentials are not set). */
let supabase = null;

if (SUPABASE_URL && SUPABASE_ANON) {
  // Load from CDN — no build step required
  import('https://esm.sh/@supabase/supabase-js@2')
    .then(({ createClient }) => {
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
      console.info('[Haven & Crest] Supabase client ready.');
    })
    .catch(err => {
      console.warn('[Haven & Crest] Could not load Supabase:', err.message);
    });
} else {
  console.info(
    '[Haven & Crest] Running without Supabase — ' +
    'set SUPABASE_URL and SUPABASE_ANON in main.js to enable backend storage.'
  );
}


/* ================================================================
   DOM-READY
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {

  /* ---- MOBILE NAV TOGGLE ---- */
  const burger     = document.getElementById('nav-burger');
  const mobileMenu = document.getElementById('mobile-menu');

  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      const isOpen = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!isOpen));
      mobileMenu.setAttribute('aria-hidden', String(isOpen));
      mobileMenu.classList.toggle('is-open', !isOpen);
    });

    // Close on mobile link click
    mobileMenu.querySelectorAll('.nav__mobile-link').forEach(link => {
      link.addEventListener('click', () => {
        burger.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
        mobileMenu.classList.remove('is-open');
      });
    });
  }


  /* ---- SMOOTH SCROLL WITH NAV OFFSET ---- */
  const nav = document.getElementById('main-nav');

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const id     = anchor.getAttribute('href').slice(1);
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      e.preventDefault();
      const offset = (nav ? nav.offsetHeight : 0) + 16;
      const top    = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });


  /* ---- CONTACT FORM ---- */
  const form   = document.getElementById('contact-form');
  const notice = document.getElementById('form-notice');

  if (form && notice) {
    form.addEventListener('submit', async e => {
      e.preventDefault();

      const name    = form.querySelector('#contact-name')?.value.trim()  ?? '';
      const email   = form.querySelector('#contact-email')?.value.trim() ?? '';
      const message = form.querySelector('#contact-msg')?.value.trim()   ?? '';
      const submit  = form.querySelector('.contact-form__submit');

      // Validate
      if (!name || !email || !message) {
        showNotice('Please fill in all required fields.', 'error');
        return;
      }
      if (!isValidEmail(email)) {
        showNotice('Please enter a valid email address.', 'error');
        return;
      }

      setSubmitting(submit, true);

      try {
        if (supabase) {
          const { error } = await supabase
            .from('enquiries')
            .insert([{ name, email, message }]);
          if (error) throw new Error(error.message);
        } else {
          // No backend — log locally and simulate success
          console.log('[Haven & Crest] Enquiry (no backend):', { name, email, message });
          await delay(700);
        }

        showNotice('Thank you — your enquiry has been received. We will be in touch shortly.', 'success');
        form.reset();
      } catch (err) {
        console.error('[Haven & Crest] Form error:', err);
        showNotice('Something went wrong. Please try again.', 'error');
      } finally {
        setSubmitting(submit, false);
      }
    });
  }


  /* ---- FOOTER YEAR ---- */
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

});


/* ================================================================
   HELPERS
   ================================================================ */

function showNotice(msg, type) {
  const el = document.getElementById('form-notice');
  if (!el) return;
  el.textContent = msg;
  el.className   = `contact-form__notice contact-form__notice--${type}`;
}

function setSubmitting(btn, isSubmitting) {
  if (!btn) return;
  btn.disabled    = isSubmitting;
  btn.textContent = isSubmitting ? 'Sending…' : 'Send Enquiry';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

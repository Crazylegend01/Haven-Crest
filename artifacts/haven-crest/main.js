/**
 * main.js — Haven & Crest
 *
 * Application entry point for vanilla-JS logic:
 *  - Mobile navigation toggle
 *  - Smooth-scroll anchor links
 *  - Contact form validation & submission handler
 *  - Footer copyright year
 *  - Supabase client initialisation (ready for integration)
 */


/* ================================================================
   SUPABASE CLIENT SETUP
   Reads credentials from Vite's import.meta.env (set via .env or
   Replit environment secrets):
     VITE_SUPABASE_URL
     VITE_SUPABASE_ANON_KEY
   ================================================================ */

// Supabase is imported as a CDN ESM module so the vanilla-JS bundle
// stays simple. Swap this for `@supabase/supabase-js` once you run
// `npm install @supabase/supabase-js` and configure the build.
let supabase = null;

const SUPABASE_URL  = import.meta.env?.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env?.VITE_SUPABASE_ANON_KEY;

if (SUPABASE_URL && SUPABASE_ANON) {
  // Dynamic import so the app works without Supabase in the base build
  import('https://esm.sh/@supabase/supabase-js@2')
    .then(({ createClient }) => {
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
      console.info('[Haven & Crest] Supabase client initialised.');
    })
    .catch(err => {
      console.warn('[Haven & Crest] Supabase could not be loaded:', err.message);
    });
} else {
  console.info(
    '[Haven & Crest] Supabase credentials not found — running without backend. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable.'
  );
}

/** Expose supabase client to other modules if needed. */
export { supabase };


/* ================================================================
   DOM-READY INITIALISATION
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {

  /* ------------------------------------------------------------
     1. MOBILE NAV TOGGLE
  ------------------------------------------------------------ */
  const burger     = document.getElementById('nav-burger');
  const mobileMenu = document.getElementById('mobile-menu');

  if (burger && mobileMenu) {
    burger.addEventListener('click', () => {
      const isOpen = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!isOpen));
      mobileMenu.setAttribute('aria-hidden', String(isOpen));
      mobileMenu.classList.toggle('is-open', !isOpen);
    });

    // Close on any mobile link click
    mobileMenu.querySelectorAll('.nav__mobile-link').forEach(link => {
      link.addEventListener('click', () => {
        burger.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-hidden', 'true');
        mobileMenu.classList.remove('is-open');
      });
    });
  }


  /* ------------------------------------------------------------
     2. SMOOTH-SCROLL FOR ANCHOR LINKS
     (CSS scroll-behavior covers most browsers but this ensures
     correct offset when a sticky nav is present.)
  ------------------------------------------------------------ */
  const nav = document.getElementById('main-nav');

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', event => {
      const targetId = anchor.getAttribute('href').slice(1);
      const target   = document.getElementById(targetId);
      if (!target) return;

      event.preventDefault();

      const navHeight = nav ? nav.offsetHeight : 0;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 16;

      window.scrollTo({ top, behavior: 'smooth' });
    });
  });


  /* ------------------------------------------------------------
     3. CONTACT FORM
  ------------------------------------------------------------ */
  const form   = document.getElementById('contact-form');
  const notice = document.getElementById('form-notice');

  if (form && notice) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const name    = form.querySelector('#contact-name')?.value.trim()  ?? '';
      const email   = form.querySelector('#contact-email')?.value.trim() ?? '';
      const message = form.querySelector('#contact-msg')?.value.trim()   ?? '';
      const submit  = form.querySelector('.contact-form__submit');

      // --- Basic client-side validation ---
      if (!name || !email || !message) {
        setNotice('Please fill in all required fields.', 'error');
        return;
      }
      if (!isValidEmail(email)) {
        setNotice('Please enter a valid email address.', 'error');
        return;
      }

      // --- Disable while submitting ---
      if (submit) {
        submit.disabled    = true;
        submit.textContent = 'Sending…';
      }

      try {
        if (supabase) {
          // ----- Supabase submission -----
          const { error } = await supabase
            .from('enquiries')
            .insert([{ name, email, message }]);

          if (error) throw new Error(error.message);
          setNotice('Thank you — your enquiry has been received. We will be in touch shortly.', 'success');
          form.reset();
        } else {
          // ----- Fallback: log to console in dev, show success UI -----
          console.log('[Haven & Crest] Form submission (no Supabase):', { name, email, message });
          await fakeDelay(800); // simulate network latency for demo
          setNotice('Thank you — your enquiry has been received. We will be in touch shortly.', 'success');
          form.reset();
        }
      } catch (err) {
        console.error('[Haven & Crest] Form error:', err);
        setNotice('Something went wrong. Please try again or email us directly.', 'error');
      } finally {
        if (submit) {
          submit.disabled    = false;
          submit.textContent = 'Send Enquiry';
        }
      }
    });
  }


  /* ------------------------------------------------------------
     4. FOOTER YEAR
  ------------------------------------------------------------ */
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

});


/* ================================================================
   HELPERS
   ================================================================ */

/**
 * Update the form notice paragraph with a message and style class.
 * @param {string} msg
 * @param {'success'|'error'} type
 */
function setNotice(msg, type) {
  const notice = document.getElementById('form-notice');
  if (!notice) return;
  notice.textContent = msg;
  notice.className   = `contact-form__notice contact-form__notice--${type}`;
}

/**
 * Simple email format check.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Returns a promise that resolves after `ms` milliseconds.
 * Used for simulating async operations in the no-Supabase fallback.
 * @param {number} ms
 */
function fakeDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

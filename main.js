/**
 * main.js — Haven & Crest
 *
 * Application entry point:
 *  - Mobile navigation toggle
 *  - Smooth-scroll anchor links (respects sticky nav height)
 *  - Contact form validation & Supabase submission
 *  - Footer copyright year
 *
 * Supabase client, helper utilities, and Toast notifications live in
 * supabaseClient.js — import from there to wire up any new form.
 */

import { submitEnquiry, showToast } from './supabaseClient.js';


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

    // Close mobile menu when any link inside it is clicked
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
     CSS scroll-behavior handles most cases; this adds the correct
     offset for the sticky navigation bar.
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
     Validates inputs, submits via submitEnquiry(), shows a toast
     for both success and error states.
  ------------------------------------------------------------ */
  const form = document.getElementById('contact-form');

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();

      const name    = form.querySelector('#contact-name')?.value.trim()  ?? '';
      const email   = form.querySelector('#contact-email')?.value.trim() ?? '';
      const message = form.querySelector('#contact-msg')?.value.trim()   ?? '';
      const submit  = form.querySelector('.contact-form__submit');

      // ── Client-side validation ──────────────────────────────
      if (!name || !email || !message) {
        showToast('Please fill in all required fields.', 'error');
        return;
      }
      if (!isValidEmail(email)) {
        showToast('Please enter a valid email address.', 'error');
        return;
      }

      // ── Disable button while request is in flight ───────────
      if (submit) {
        submit.disabled    = true;
        submit.textContent = 'Sending\u2026';
      }

      try {
        const result = await submitEnquiry({ name, email, message });
        if (!result.success) throw new Error(result.error ?? 'Unknown error');

        showToast(
          'Thank you \u2014 your enquiry has been received. We\u2019ll be in touch shortly.',
          'success',
          6000
        );
        form.reset();
      } catch (err) {
        console.error('[Haven & Crest] Form error:', err);
        showToast(
          'Something went wrong. Please try again or email us directly.',
          'error'
        );
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

/** Basic email format guard. */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

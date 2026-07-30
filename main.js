/**
 * main.js — Haven & Crest
 *
 * Application entry point:
 *  - Mobile navigation toggle
 *  - Smooth-scroll anchor links (respects sticky nav height)
 *  - Waitlist form — wired to submitWaitlist() in Supabase
 *  - Community suggestions form — wired to submitSuggestion() in Supabase
 *  - Footer copyright year
 */

import { submitWaitlist, submitSuggestion, showToast } from './supabaseClient.js';


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
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;

      event.preventDefault();

      const navHeight = nav ? nav.offsetHeight : 0;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 16;

      window.scrollTo({ top, behavior: 'smooth' });
    });
  });


  /* ------------------------------------------------------------
     3. WAITLIST FORM
     Validates inputs, submits via submitWaitlist(), shows a toast
     for both success and error states with loading state on button.
  ------------------------------------------------------------ */
  const waitlistForm   = document.getElementById('waitlist-form');
  const waitlistSubmit = document.getElementById('waitlist-submit');

  if (waitlistForm) {
    waitlistForm.addEventListener('submit', async event => {
      event.preventDefault();

      const fullName   = waitlistForm.querySelector('#wl-name')?.value.trim()    ?? '';
      const email      = waitlistForm.querySelector('#wl-email')?.value.trim()   ?? '';
      const campusName = waitlistForm.querySelector('#wl-campus')?.value.trim()  ?? '';
      const roleInput  = waitlistForm.querySelector('input[name="user_role"]:checked');
      const userRole   = roleInput ? roleInput.value : 'student';

      // ── Client-side validation ──────────────────────────────
      if (!fullName) {
        showToast('Please enter your full name.', 'error');
        waitlistForm.querySelector('#wl-name')?.focus();
        return;
      }
      if (!email || !isValidEmail(email)) {
        showToast('Please enter a valid email address.', 'error');
        waitlistForm.querySelector('#wl-email')?.focus();
        return;
      }

      // ── Loading state ───────────────────────────────────────
      setButtonLoading(waitlistSubmit, true, 'Securing your spot\u2026');

      try {
        const payload = {
          full_name:   fullName,
          email:       email,
          user_role:   userRole,
          campus_name: campusName || null,
        };

        const result = await submitWaitlist(payload);

        if (!result.success) {
          // Handle duplicate email gracefully
          if (result.error && result.error.toLowerCase().includes('duplicate')) {
            showToast(
              'You\u2019re already on the list \u2014 we\u2019ll be in touch!',
              'info',
              6000
            );
          } else {
            throw new Error(result.error ?? 'Unknown error');
          }
        } else {
          showToast(
            'You\u2019re on the list! \uD83C\uDF89 We\u2019ll reach out when we launch.',
            'success',
            7000
          );
          waitlistForm.reset();
          // Re-check the default radio after reset
          const studentRadio = waitlistForm.querySelector('#role-student');
          if (studentRadio) studentRadio.checked = true;
        }
      } catch (err) {
        console.error('[Haven & Crest] Waitlist error:', err);
        showToast(
          'Something went wrong. Please try again in a moment.',
          'error'
        );
      } finally {
        setButtonLoading(waitlistSubmit, false, 'Secure My Spot');
      }
    });
  }


  /* ------------------------------------------------------------
     4. COMMUNITY SUGGESTIONS FORM
     Validates inputs, submits via submitSuggestion(), shows a
     success notification and resets the form.
  ------------------------------------------------------------ */
  const suggestionForm   = document.getElementById('suggestion-form');
  const suggestionSubmit = document.getElementById('suggestion-submit');

  if (suggestionForm) {
    suggestionForm.addEventListener('submit', async event => {
      event.preventDefault();

      const authorName     = suggestionForm.querySelector('#sg-name')?.value.trim()     ?? '';
      const category       = suggestionForm.querySelector('#sg-category')?.value        ?? '';
      const suggestionText = suggestionForm.querySelector('#sg-text')?.value.trim()     ?? '';

      // ── Client-side validation ──────────────────────────────
      if (!category) {
        showToast('Please select a category.', 'error');
        suggestionForm.querySelector('#sg-category')?.focus();
        return;
      }
      if (!suggestionText) {
        showToast('Please enter your suggestion before submitting.', 'error');
        suggestionForm.querySelector('#sg-text')?.focus();
        return;
      }

      // ── Loading state ───────────────────────────────────────
      setButtonLoading(suggestionSubmit, true, 'Sending\u2026');

      try {
        const payload = {
          author_name:     authorName || 'Anonymous',
          category:        category,
          suggestion_text: suggestionText,
        };

        const result = await submitSuggestion(payload);

        if (!result.success) throw new Error(result.error ?? 'Unknown error');

        showToast(
          'Thank you! Your suggestion has been received and will help shape the platform.',
          'success',
          6000
        );
        suggestionForm.reset();
      } catch (err) {
        console.error('[Haven & Crest] Suggestion error:', err);
        showToast(
          'Something went wrong. Please try again.',
          'error'
        );
      } finally {
        setButtonLoading(suggestionSubmit, false, 'Submit Suggestion');
      }
    });
  }


  /* ------------------------------------------------------------
     5. FOOTER YEAR
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

/**
 * Toggle a submit button between loading and idle states.
 * @param {HTMLButtonElement} btn
 * @param {boolean}           loading
 * @param {string}            label   Text to show when idle
 */
function setButtonLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled     = loading;
  btn.textContent  = loading ? label : label;
  btn.style.opacity = loading ? '0.72' : '';
  btn.style.cursor  = loading ? 'not-allowed' : '';
}

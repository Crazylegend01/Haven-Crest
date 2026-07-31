/**
 * main.js — Haven & Crest
 *
 * Application entry point:
 *  - Mobile navigation toggle
 *  - Smooth-scroll anchor links
 *  - Waitlist form  — sanitized, rate-limited, honeypot-checked, audit-logged
 *  - Suggestions form — sanitized, rate-limited, honeypot-checked, audit-logged
 *  - Footer copyright year
 */

import {
  submitWaitlist,
  submitSuggestion,
  showToast,
  sanitizeText,
  sanitizeEmail,
  sanitizeName,
  checkRateLimit,
  formatRetryAfter,
  detectSuspiciousContent,
  isBotDetected,
  logSecurityEvent,
} from './supabaseClient.js?v=4';


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
        Rate limit: 2 per 24 hours per browser
  ------------------------------------------------------------ */
  const waitlistForm   = document.getElementById('waitlist-form');
  const waitlistSubmit = document.getElementById('waitlist-submit');

  if (waitlistForm) {
    waitlistForm.addEventListener('submit', async event => {
      event.preventDefault();

      // ── 3a. Honeypot check ──────────────────────────────────
      if (isBotDetected(waitlistForm, ['hc_website'])) {
        // Silent reject — let the bot think it succeeded
        logSecurityEvent({
          action_type: 'BOT_DETECTED',
          metadata:    { form: 'waitlist' },
          risk_level:  'HIGH',
        });
        showToast('You\u2019re on the list! 🎉 We\u2019ll reach out when we launch.', 'success', 7000);
        waitlistForm.reset();
        return;
      }

      // ── 3b. Rate limit ──────────────────────────────────────
      const rl = checkRateLimit('waitlist_submit', 2, 24 * 60 * 60 * 1000);
      if (!rl.allowed) {
        logSecurityEvent({
          action_type: 'RATE_LIMIT_HIT',
          metadata:    { form: 'waitlist', retry_after_ms: rl.retryAfterMs },
          risk_level:  'MEDIUM',
        });
        showToast(
          `You\u2019ve already signed up. Try again in ${formatRetryAfter(rl.retryAfterMs)}.`,
          'info', 7000
        );
        return;
      }

      // ── 3c. Read & sanitize fields ──────────────────────────
      const fullName   = sanitizeName(waitlistForm.querySelector('#wl-name')?.value   ?? '', 100);
      const email      = sanitizeEmail(waitlistForm.querySelector('#wl-email')?.value  ?? '');
      const campusName = sanitizeText(waitlistForm.querySelector('#wl-campus')?.value ?? '', 200);
      const roleInput  = waitlistForm.querySelector('input[name="user_role"]:checked');
      const userRole   = roleInput ? roleInput.value : 'student';

      // ── 3d. Validation ──────────────────────────────────────
      if (!fullName) {
        showToast('Please enter your full name.', 'error');
        waitlistForm.querySelector('#wl-name')?.focus();
        return;
      }
      if (!email) {
        showToast('Please enter a valid email address.', 'error');
        waitlistForm.querySelector('#wl-email')?.focus();
        return;
      }

      // ── 3e. Suspicious content scan ─────────────────────────
      const scan = detectSuspiciousContent(fullName + ' ' + campusName);
      if (scan.suspicious) {
        logSecurityEvent({
          action_type: 'SUSPICIOUS_CONTENT',
          metadata:    { form: 'waitlist', flags: scan.flags },
          risk_level:  scan.riskLevel,
        });
        // Don't block — just flag it. High-risk content is blocked.
        if (scan.riskLevel === 'HIGH' || scan.riskLevel === 'CRITICAL') {
          showToast('Your submission could not be processed. Please try again with valid information.', 'error');
          return;
        }
      }

      // ── 3f. Submit ──────────────────────────────────────────
      setButtonLoading(waitlistSubmit, true, 'Securing your spot\u2026');

      try {
        const payload = {
          full_name:   fullName,
          email,
          user_role:   userRole,
          campus_name: campusName || null,
        };

        const result = await submitWaitlist(payload);

        if (!result.success) {
          if (result.error?.toLowerCase().includes('duplicate')) {
            logSecurityEvent({
              action_type: 'DUPLICATE_EMAIL',
              metadata:    { form: 'waitlist', email_domain: email.split('@')[1] },
              risk_level:  'MEDIUM',
            });
            showToast('You\u2019re already on the list \u2014 we\u2019ll be in touch!', 'info', 6000);
          } else {
            throw new Error(result.error ?? 'Unknown error');
          }
        } else {
          logSecurityEvent({
            action_type: 'WAITLIST_SUBMIT',
            metadata:    { role: userRole, campus: campusName || null },
            risk_level:  'LOW',
          });
          showToast('You\u2019re on the list! \uD83C\uDF89 We\u2019ll reach out when we launch.', 'success', 7000);
          waitlistForm.reset();
          const studentRadio = waitlistForm.querySelector('#role-student');
          if (studentRadio) studentRadio.checked = true;
        }
      } catch (err) {
        console.error('[Haven & Crest] Waitlist error:', err);
        showToast('Something went wrong. Please try again in a moment.', 'error');
      } finally {
        setButtonLoading(waitlistSubmit, false, 'Secure My Spot');
      }
    });
  }


  /* ------------------------------------------------------------
     4. COMMUNITY SUGGESTIONS FORM
        Rate limit: 5 per hour per browser
  ------------------------------------------------------------ */
  const suggestionForm   = document.getElementById('suggestion-form');
  const suggestionSubmit = document.getElementById('suggestion-submit');

  if (suggestionForm) {
    suggestionForm.addEventListener('submit', async event => {
      event.preventDefault();

      // ── 4a. Honeypot check ──────────────────────────────────
      if (isBotDetected(suggestionForm, ['hc_url'])) {
        logSecurityEvent({
          action_type: 'BOT_DETECTED',
          metadata:    { form: 'suggestions' },
          risk_level:  'HIGH',
        });
        showToast('Thank you! Your suggestion has been received.', 'success', 6000);
        suggestionForm.reset();
        return;
      }

      // ── 4b. Rate limit ──────────────────────────────────────
      const rl = checkRateLimit('suggestion_submit', 5, 60 * 60 * 1000);
      if (!rl.allowed) {
        logSecurityEvent({
          action_type: 'RATE_LIMIT_HIT',
          metadata:    { form: 'suggestions', retry_after_ms: rl.retryAfterMs },
          risk_level:  'MEDIUM',
        });
        showToast(
          `You\u2019ve submitted several suggestions recently. Try again in ${formatRetryAfter(rl.retryAfterMs)}.`,
          'info', 7000
        );
        return;
      }

      // ── 4c. Read & sanitize ─────────────────────────────────
      const authorName     = sanitizeName(suggestionForm.querySelector('#sg-name')?.value  ?? '', 100);
      const category       = suggestionForm.querySelector('#sg-category')?.value            ?? '';
      const suggestionText = sanitizeText(suggestionForm.querySelector('#sg-text')?.value  ?? '', 2000);

      // ── 4d. Validation ──────────────────────────────────────
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

      // ── 4e. Suspicious content scan ─────────────────────────
      const scan = detectSuspiciousContent(suggestionText + ' ' + authorName);
      if (scan.suspicious) {
        logSecurityEvent({
          action_type: 'SUSPICIOUS_CONTENT',
          metadata:    { form: 'suggestions', flags: scan.flags, category },
          risk_level:  scan.riskLevel,
        });
        if (scan.riskLevel === 'HIGH' || scan.riskLevel === 'CRITICAL') {
          showToast('Your submission was flagged. Please remove any links or inappropriate content.', 'error');
          return;
        }
      }

      // ── 4f. Submit ──────────────────────────────────────────
      setButtonLoading(suggestionSubmit, true, 'Sending\u2026');

      try {
        const payload = {
          author_name:     authorName || 'Anonymous',
          category,
          suggestion_text: suggestionText,
        };

        const result = await submitSuggestion(payload);
        if (!result.success) throw new Error(result.error ?? 'Unknown error');

        logSecurityEvent({
          action_type: 'SUGGESTION_SUBMIT',
          metadata:    { category, content_length: suggestionText.length },
          risk_level:  'LOW',
        });
        showToast('Thank you! Your suggestion has been received and will help shape the platform.', 'success', 6000);
        suggestionForm.reset();
      } catch (err) {
        console.error('[Haven & Crest] Suggestion error:', err);
        showToast('Something went wrong. Please try again.', 'error');
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

function setButtonLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled      = loading;
  btn.textContent   = label;
  btn.style.opacity = loading ? '0.72' : '';
  btn.style.cursor  = loading ? 'not-allowed' : '';
}

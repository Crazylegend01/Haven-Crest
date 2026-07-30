/**
 * animations.js — Haven & Crest
 *
 * Responsibilities:
 *  1. Fade out the full-screen preloader once the DOM is ready.
 *  2. Reveal the #app shell after the preloader exits.
 *  3. Drive scroll-triggered entrance animations via IntersectionObserver.
 */


/* ================================================================
   1. PRELOADER FADE-OUT
   Triggered on DOMContentLoaded so the loader disappears as soon
   as the document is parsed — before any heavy images load.
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const preloader = document.getElementById('preloader');
  const app       = document.getElementById('app');

  if (!preloader || !app) return;

  /**
   * Hide the loader and reveal the app.
   * A short delay (300 ms) keeps the loader visible long enough for
   * the ring animation to be appreciated even on fast connections.
   */
  const hidePreloader = () => {
    // Step 1 — start CSS opacity → 0 (transition is on #preloader)
    preloader.classList.add('is-hiding');

    // Step 2 — once the CSS transition ends, fully remove from DOM flow
    preloader.addEventListener(
      'transitionend',
      () => {
        preloader.setAttribute('aria-hidden', 'true');
        // Reveal the app shell
        app.classList.add('is-visible');
        app.removeAttribute('aria-hidden');
      },
      { once: true }
    );
  };

  // A brief minimum display ensures the animation plays at least once
  const MINIMUM_DISPLAY_MS = 600;
  setTimeout(hidePreloader, MINIMUM_DISPLAY_MS);
});


/* ================================================================
   2. SCROLL-TRIGGERED ENTRANCE ANIMATIONS
   Any element with [data-animate] is observed; when it enters the
   viewport the `is-visible` class is added which triggers the CSS
   transition defined in styles.css.
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  /** @type {NodeListOf<HTMLElement>} */
  const animatables = document.querySelectorAll('[data-animate]');

  if (!animatables.length) return;

  // Respect the user's motion preferences
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    // Instantly reveal everything — no animation
    animatables.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observerOptions = {
    root:       null,      // viewport
    rootMargin: '0px 0px -60px 0px', // trigger slightly before element enters
    threshold:  0.12,
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;

        // Read the per-element stagger delay from the inline CSS var
        const delay = el.style.getPropertyValue('--delay') || '0s';
        el.style.transitionDelay = delay;

        el.classList.add('is-visible');

        // Stop observing once revealed — animation runs only once
        observer.unobserve(el);
      }
    });
  }, observerOptions);

  animatables.forEach(el => observer.observe(el));
});


/* ================================================================
   3. STICKY NAV — add is-scrolled class after page is scrolled
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const SCROLL_THRESHOLD = 40;

  const updateNav = () => {
    if (window.scrollY > SCROLL_THRESHOLD) {
      nav.classList.add('is-scrolled');
    } else {
      nav.classList.remove('is-scrolled');
    }
  };

  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav(); // run once on load
});

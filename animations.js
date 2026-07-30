/**
 * animations.js — Haven & Crest
 *
 * Pure vanilla JS — no build step, no dependencies.
 *
 * 1. Fades out the preloader once the DOM is ready.
 * 2. Reveals #app shell after the preloader exits.
 * 3. Drives scroll-triggered entrance animations via IntersectionObserver.
 * 4. Adds is-scrolled class to the nav on scroll.
 */


/* ================================================================
   1. PRELOADER FADE-OUT
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const preloader = document.getElementById('preloader');
  const app       = document.getElementById('app');

  if (!preloader || !app) return;

  /**
   * Hides the loader and reveals the app shell.
   * A short minimum display ensures the animation plays at least once.
   */
  const hidePreloader = () => {
    // Trigger CSS opacity → 0 transition
    preloader.classList.add('is-hiding');

    preloader.addEventListener(
      'transitionend',
      () => {
        preloader.setAttribute('aria-hidden', 'true');
        // Reveal the main app
        app.classList.add('is-visible');
        app.removeAttribute('aria-hidden');
      },
      { once: true }
    );
  };

  // Minimum 600 ms so the spinning ring animation is seen
  setTimeout(hidePreloader, 600);
});


/* ================================================================
   2. SCROLL-TRIGGERED ENTRANCE ANIMATIONS
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const animatables = document.querySelectorAll('[data-animate]');
  if (!animatables.length) return;

  // Respect prefers-reduced-motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    animatables.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        const el    = entry.target;
        const delay = el.style.getPropertyValue('--delay') || '0s';
        el.style.transitionDelay = delay;
        el.classList.add('is-visible');
        observer.unobserve(el); // animate once only
      });
    },
    {
      root:       null,
      rootMargin: '0px 0px -60px 0px',
      threshold:  0.12,
    }
  );

  animatables.forEach(el => observer.observe(el));
});


/* ================================================================
   3. STICKY NAV SHADOW
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const update = () => {
    nav.classList.toggle('is-scrolled', window.scrollY > 40);
  };

  window.addEventListener('scroll', update, { passive: true });
  update();
});

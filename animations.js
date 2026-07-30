/**
 * animations.js — Haven & Crest
 *
 * Pure vanilla JS — no build step, no dependencies.
 * All animations respect prefers-reduced-motion.
 *
 * 1. Preloader fade-out + hero stagger entrance
 * 2. Scroll-triggered entrance animations (IntersectionObserver)
 * 3. Hero stat counter animation
 * 4. Staggered children in grids and role-toggle
 * 5. Sticky nav shadow on scroll
 * 6. Active-link highlight tracking
 */


/* ================================================================
   SHARED UTILITIES
   ================================================================ */

/** True when the user has requested reduced motion. */
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * rAF-based easing. Maps t ∈ [0,1] → easeOutExpo value.
 * Keeps counter animations smooth without a dependency.
 */
const easeOutExpo = t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Animate a numeric value from `from` to `to` over `duration` ms,
 * calling `onUpdate(value)` on each frame.
 */
function animateNumber(from, to, duration, onUpdate, onDone) {
  const start = performance.now();
  const step  = (now) => {
    const elapsed = Math.min(now - start, duration);
    const progress = easeOutExpo(elapsed / duration);
    const current  = from + (to - from) * progress;
    onUpdate(current);
    if (elapsed < duration) {
      requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  };
  requestAnimationFrame(step);
}


/* ================================================================
   1. PRELOADER FADE-OUT + HERO STAGGER ENTRANCE
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const preloader = document.getElementById('preloader');
  const app       = document.getElementById('app');
  if (!preloader || !app) return;

  const heroChildren = document.querySelectorAll(
    '.hero__badge, .hero__heading, .hero__sub, .hero__actions, .hero__stats'
  );

  const revealHero = () => {
    if (reducedMotion) {
      heroChildren.forEach(el => {
        el.style.opacity   = '1';
        el.style.transform = 'none';
      });
      return;
    }

    heroChildren.forEach((el, i) => {
      // Reset to initial hidden state
      el.style.opacity         = '0';
      el.style.transform       = 'translateY(22px)';
      el.style.transition      = 'none';

      // Stagger each child 80 ms apart
      const delay = 80 + i * 90;
      setTimeout(() => {
        el.style.transition  = 'opacity 0.6s cubic-bezier(0.16,1,0.3,1), transform 0.6s cubic-bezier(0.16,1,0.3,1)';
        el.style.opacity     = '1';
        el.style.transform   = 'translateY(0)';
      }, delay);
    });
  };

  const hidePreloader = () => {
    preloader.classList.add('is-hiding');
    preloader.addEventListener(
      'transitionend',
      () => {
        preloader.setAttribute('aria-hidden', 'true');
        app.classList.add('is-visible');
        app.removeAttribute('aria-hidden');
        revealHero();
      },
      { once: true }
    );
  };

  // Minimum 650 ms so the spin ring plays at least once
  setTimeout(hidePreloader, 650);
});


/* ================================================================
   2. SCROLL-TRIGGERED ENTRANCE ANIMATIONS
   Observes [data-animate] elements and adds .is-visible when
   they cross the viewport threshold.
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const animatables = document.querySelectorAll('[data-animate]');
  if (!animatables.length) return;

  if (reducedMotion) {
    animatables.forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        const el    = entry.target;
        const delay = el.style.getPropertyValue('--delay') || '0s';
        // Apply the stagger delay from inline style, then reveal
        el.style.transitionDelay = delay;
        el.classList.add('is-visible');
        observer.unobserve(el);
      });
    },
    {
      root:       null,
      rootMargin: '0px 0px -56px 0px',
      threshold:  0.1,
    }
  );

  animatables.forEach(el => observer.observe(el));
});


/* ================================================================
   3. HERO STAT COUNTER ANIMATION
   Counts up numeric values in .hero__stat-num when the stats
   row scrolls into view. Supports integers and percentages.
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (reducedMotion) return;

  const statsRow = document.querySelector('.hero__stats');
  if (!statsRow) return;

  const statNums = statsRow.querySelectorAll('.hero__stat-num');
  let hasRun = false;

  const runCounters = () => {
    if (hasRun) return;
    hasRun = true;

    statNums.forEach(el => {
      const raw      = el.textContent.trim();
      const numeric  = parseFloat(raw.replace(/[^0-9.]/g, ''));
      const suffix   = raw.replace(/[0-9.]/g, '');    // e.g. "%", "+"

      if (isNaN(numeric) || numeric === 0) return;     // skip "0"

      const isFloat  = raw.includes('.');
      animateNumber(0, numeric, 1400, (val) => {
        el.textContent = (isFloat ? val.toFixed(1) : Math.round(val)) + suffix;
      });
    });
  };

  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          runCounters();
          counterObserver.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    counterObserver.observe(statsRow);
  } else {
    // Fallback: run immediately
    runCounters();
  }
});


/* ================================================================
   4. STAGGERED GRID CHILDREN
   Adds auto-stagger delays to direct children of .grid elements
   so they cascade in nicely without needing inline --delay styles.
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (reducedMotion) return;

  document.querySelectorAll('.grid').forEach(grid => {
    const animatableChildren = [...grid.querySelectorAll('[data-animate]')];
    animatableChildren.forEach((child, i) => {
      // Only set if no explicit --delay is already declared
      const existing = child.style.getPropertyValue('--delay');
      if (!existing) {
        child.style.setProperty('--delay', `${i * 0.10}s`);
      }
    });
  });
});


/* ================================================================
   5. ROLE TOGGLE — RIPPLE ON SELECT
   A quick scale-pulse on the label when its radio is selected,
   giving tactile feedback without CSS :checked alone.
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (reducedMotion) return;

  const roleInputs = document.querySelectorAll('.role-toggle__input');
  roleInputs.forEach(input => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (!label) return;

      // Brief scale-up pulse
      label.style.transition = 'transform 0.18s cubic-bezier(0.34,1.56,0.64,1)';
      label.style.transform  = 'scale(1.08)';
      setTimeout(() => {
        label.style.transform = 'scale(1)';
      }, 180);
    });
  });
});


/* ================================================================
   6. STICKY NAV SHADOW + ACTIVE LINK HIGHLIGHT
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  // Shadow on scroll
  const updateNavShadow = () => {
    nav.classList.toggle('is-scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', updateNavShadow, { passive: true });
  updateNavShadow();

  if (reducedMotion) return;

  // Active section link highlight
  const sections  = document.querySelectorAll('section[id]');
  const navLinks  = document.querySelectorAll('.nav__link:not(.nav__link--cta)');

  const linkMap = {};
  navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href?.startsWith('#')) linkMap[href.slice(1)] = link;
  });

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        const link = linkMap[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach(l => l.classList.remove('nav__link--active'));
          link.classList.add('nav__link--active');
        }
      });
    },
    {
      root:       null,
      rootMargin: '-30% 0px -60% 0px',
      threshold:  0,
    }
  );

  sections.forEach(s => sectionObserver.observe(s));
});


/* ================================================================
   7. CARD TILT — subtle 3-D perspective shift on hover
   Applied to .service-card, .waitlist-card, .suggestion-card.
   Uses pointer position within the card to compute tilt angle.
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (reducedMotion) return;

  const tiltables = document.querySelectorAll('.service-card, .waitlist-card, .suggestion-card');
  const MAX_TILT  = 4; // degrees

  tiltables.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect   = card.getBoundingClientRect();
      const cx     = rect.left + rect.width  / 2;
      const cy     = rect.top  + rect.height / 2;
      const dx     = (e.clientX - cx) / (rect.width  / 2);
      const dy     = (e.clientY - cy) / (rect.height / 2);
      const rotateX = (-dy * MAX_TILT).toFixed(2);
      const rotateY = ( dx * MAX_TILT).toFixed(2);

      card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.45s cubic-bezier(0.16,1,0.3,1), box-shadow 0.45s cubic-bezier(0.16,1,0.3,1)';
      card.style.transform  = '';
      // Clear the inline transition after it settles
      setTimeout(() => { card.style.transition = ''; }, 450);
    });

    card.addEventListener('mouseenter', () => {
      card.style.transition = 'none';
    });
  });
});


/* ================================================================
   8. BUTTON SCALE MICRO-INTERACTION
   Adds a satisfying spring-pop to all .btn elements on click.
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (reducedMotion) return;

  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('pointerdown', () => {
      btn.style.transition = 'transform 0.1s ease';
      btn.style.transform  = 'scale(0.96)';
    });
    btn.addEventListener('pointerup', () => {
      btn.style.transition = 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)';
      btn.style.transform  = 'scale(1)';
    });
    btn.addEventListener('pointerleave', () => {
      btn.style.transition = 'transform 0.25s cubic-bezier(0.16,1,0.3,1)';
      btn.style.transform  = '';
    });
  });
});


/* ================================================================
   9. FORM FIELD RIPPLE FOCUS
   Draws a brief expanding-ring glow on input focus to reinforce
   the Desert Gold colour system.
   ================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (reducedMotion) return;

  document.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('focus', () => {
      input.classList.add('form-input--focused');
    });
    input.addEventListener('blur', () => {
      input.classList.remove('form-input--focused');
    });
  });
});

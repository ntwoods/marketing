/*
 * Prevent accidental duplicate activity submissions.
 *
 * This wraps the existing saveActivity() function without changing its
 * business logic. The Save button is disabled immediately, shows a clear
 * Processing… state, and remains locked until the full activity workflow
 * (including file conversion / API call / verification / refresh) completes.
 */
(function installActivitySubmitGuard() {
  'use strict';

  if (window.__NTW_ACTIVITY_SUBMIT_GUARD__) return;
  window.__NTW_ACTIVITY_SUBMIT_GUARD__ = true;

  const originalSaveActivity = window.saveActivity;
  if (typeof originalSaveActivity !== 'function') {
    console.warn('Activity submit guard: saveActivity() was not found.');
    return;
  }

  let isSubmitting = false;

  window.saveActivity = async function guardedSaveActivity(...args) {
    if (isSubmitting) {
      console.warn('Duplicate activity submission blocked.');
      return;
    }

    const btn = document.getElementById('btn-save-activity');
    const originalText = btn ? btn.textContent : 'Save';

    isSubmitting = true;

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Processing…';
      btn.setAttribute('aria-busy', 'true');
    }

    try {
      return await originalSaveActivity.apply(this, args);
    } finally {
      isSubmitting = false;

      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText || 'Save';
        btn.removeAttribute('aria-busy');
      }
    }
  };
})();

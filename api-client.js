/*
 * Apps Script transport bridge for the GitHub Pages frontend.
 *
 * Google Apps Script ContentService redirects responses to a one-time
 * script.googleusercontent.com URL. Cross-origin POSTs from GitHub Pages can
 * therefore complete on the server (Sheet row is written) while the browser
 * still rejects access to the redirected response with `Failed to fetch`.
 *
 * We send POSTs as `no-cors` (so the write can complete without the browser
 * trying to read the redirected response), then verify the write through the
 * existing readable GET endpoints before returning a synthetic JSON Response
 * to the rest of app.js. This keeps the current UI/business logic unchanged.
 */
(function installAppsScriptTransportBridge() {
  'use strict';

  if (window.__NTW_APPS_SCRIPT_FETCH_BRIDGE__) return;
  window.__NTW_APPS_SCRIPT_FETCH_BRIDGE__ = true;

  const nativeFetch = window.fetch.bind(window);
  const VERIFY_ATTEMPTS = 10;
  const VERIFY_DELAY_MS = 450;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  function jsonResponse(body) {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  function normalizeUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return String(input || '');
  }

  async function getJson(action, email) {
    const url = `${API_BASE}?action=${encodeURIComponent(action)}` +
      `&email=${encodeURIComponent(email || '')}` +
      `&_=${Date.now()}`;

    const res = await nativeFetch(url, {
      method: 'GET',
      cache: 'no-store'
    });

    const data = await res.json();
    if (!data || data.ok !== true) {
      throw new Error((data && data.error) || `${action} failed`);
    }
    return data;
  }

  function activityMatches(activity, payload) {
    return activity &&
      String(activity.clientName || '').trim() === String(payload.clientName || '').trim() &&
      String(activity.mobile || '').trim() === String(payload.mobile || '').trim() &&
      String(activity.activityType || '').toUpperCase() === String(payload.activityType || '').toUpperCase() &&
      String(activity.outcome || '').toUpperCase() === String(payload.outcome || '').toUpperCase();
  }

  async function captureActivityIds(email) {
    const data = await getJson('listActivities', email);
    return new Set((data.activities || []).map(a => String(a.id)));
  }

  async function verifyActivityWrite(payload, beforeIds) {
    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await sleep(VERIFY_DELAY_MS);

      try {
        const data = await getJson('listActivities', payload.email);
        const activities = data.activities || [];
        const created = activities.find(a =>
          !beforeIds.has(String(a.id)) && activityMatches(a, payload)
        );

        if (created) {
          return {
            ok: true,
            activityId: created.id || '',
            followupId: created.followupIdCreated || '',
            attachmentUrl: created.attachmentUrl || '',
            attachmentFileId: created.attachmentFileId || '',
            message: 'Activity logged and verified'
          };
        }
      } catch (err) {
        console.warn('Activity verification attempt failed:', err);
      }
    }

    return {
      ok: false,
      error: 'Activity request was sent, but the saved row could not be confirmed. Please refresh once before retrying.'
    };
  }

  function routePlanMatches(routePlan, days) {
    if (!routePlan || !Array.isArray(routePlan.weekPlan)) return false;

    return days.every(day => {
      const found = routePlan.weekPlan.find(p => p.dateStr === day.dateStr);
      return found && String(found.station || '').trim() === String(day.station || '').trim();
    });
  }

  async function verifyRoutePlanWrite(payload) {
    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await sleep(VERIFY_DELAY_MS);

      try {
        const data = await getJson('getRoutePlan', payload.email);
        if (routePlanMatches(data.routePlan, payload.days || [])) {
          return {
            ok: true,
            message: 'Route plan saved and verified',
            routePlan: data.routePlan
          };
        }
      } catch (err) {
        console.warn('Route-plan verification attempt failed:', err);
      }
    }

    // The current backend only returns the running week. On Sunday the UI
    // intentionally submits NEXT week's plan, so that write cannot be read
    // back until Monday. Treat only that known case as accepted-but-deferred.
    const today = new Date();
    if (today.getDay() === 0 && Array.isArray(payload.days) && payload.days.length === 7) {
      return {
        ok: true,
        message: 'Next-week route plan submitted; read-back will become available on Monday.'
      };
    }

    return {
      ok: false,
      error: 'Route plan request was sent, but the saved plan could not be confirmed. Please refresh once before retrying.'
    };
  }

  window.fetch = async function ntwFetch(input, init) {
    const options = init || {};
    const method = String(options.method || 'GET').toUpperCase();
    const url = normalizeUrl(input);

    // Only intercept the two write calls sent directly to the Apps Script URL.
    if (url !== API_BASE || method !== 'POST') {
      return nativeFetch(input, options);
    }

    let payload;
    try {
      payload = JSON.parse(String(options.body || '{}'));
    } catch (err) {
      return jsonResponse({ ok: false, error: 'Invalid request payload.' });
    }

    let beforeActivityIds = null;
    if (payload.action === 'logActivity') {
      try {
        beforeActivityIds = await captureActivityIds(payload.email);
      } catch (err) {
        console.warn('Could not capture activity IDs before write:', err);
        beforeActivityIds = new Set();
      }
    }

    try {
      await nativeFetch(input, {
        ...options,
        mode: 'no-cors',
        cache: 'no-store'
      });
    } catch (networkErr) {
      console.error('Apps Script POST network error:', networkErr);
      return jsonResponse({
        ok: false,
        error: 'Network error while sending data. Please check your connection and try again.'
      });
    }

    if (payload.action === 'saveRoutePlan') {
      return jsonResponse(await verifyRoutePlanWrite(payload));
    }

    if (payload.action === 'logActivity') {
      return jsonResponse(await verifyActivityWrite(payload, beforeActivityIds || new Set()));
    }

    return jsonResponse({
      ok: false,
      error: `Unsupported POST action: ${payload.action || '(missing)'}`
    });
  };
})();

/*
 * Activity submit UX guard.
 *
 * All Call / Visit / Follow-up settlement submissions flow through
 * saveActivity(). Lock the button for the complete async operation so a user
 * cannot create accidental duplicate activities while the request is being
 * processed or verified.
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

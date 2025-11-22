/******** CONFIG ********/

// 👇 Yahan tumhein apna Apps Script Web App URL daalna hai
const API_BASE = 'https://script.google.com/macros/s/AKfycbwzh0ihCHEaCW8sGqJULSADqlU_moR1uCsM4UNBo6JmqMf9PWy5oy6O6Ey_xquecOk3/exec';

let currentUser = null;
let bootstrapData = {
  stats: null,
  followups: [],
  activities: []
};
let countdownInterval = null;
let currentTab = 'FOLLOWUPS';
let completingFollowup = null; // if activity is from followup card

/******** GOOGLE SIGN-IN ********/

function decodeJwtResponse(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const decoded = atob(payload);
  return JSON.parse(decoded);
}

window.handleGoogleCredential = (response) => {
  try {
    const payload = decodeJwtResponse(response.credential);
    const email = payload.email;
    const name = payload.name || '';
    if (!email) {
      showLoginError('Email not found in Google response.');
      return;
    }
    currentUser = { email, name };
    localStorage.setItem('marketingUser', JSON.stringify(currentUser));
    initAppAfterLogin();
  } catch (err) {
    showLoginError('Login failed: ' + err.message);
  }
};

function showLoginError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
}

/******** INIT ********/

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('marketingUser');
  if (saved) {
    try {
      currentUser = JSON.parse(saved);
      initAppAfterLogin();
    } catch (e) {
      console.warn(e);
    }
  }

  // Tabs
  document.getElementById('tab-followups').addEventListener('click', () => switchTab('FOLLOWUPS'));
  document.getElementById('tab-activities').addEventListener('click', () => switchTab('ACTIVITIES'));

  // Filters
  document.getElementById('search-input').addEventListener('input', renderCurrentTab);
  document.getElementById('followup-filter').addEventListener('change', renderFollowups);
  document.getElementById('activity-filter').addEventListener('change', renderActivities);

  // FAB
  document.getElementById('btn-add').addEventListener('click', () => openActivityModal());

  // Modal buttons
  document.getElementById('btn-cancel-modal').addEventListener('click', closeActivityModal);
  document.getElementById('btn-save-activity').addEventListener('click', saveActivity);

  document.getElementById('btn-close-history').addEventListener('click', closeHistoryModal);

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('marketingUser');
    currentUser = null;
    showScreen('login');
  });

  // Activity type toggle
  document.querySelectorAll('#activity-type-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#activity-type-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Visit -> address required, Call -> optional
      const type = btn.dataset.type;
      const addressGroup = document.getElementById('address-group');
      addressGroup.style.display = type === 'VISIT' ? 'block' : 'block'; // we still show field, but you can enforce required in save
    });
  });

  // Outcome toggle
  document.querySelectorAll('.outcome-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.outcome-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      syncOutcomeUI();
    });
  });
});

function showScreen(which) {
  const login = document.getElementById('login-screen');
  const main = document.getElementById('main-screen');
  if (which === 'login') {
    login.classList.add('active');
    main.classList.remove('active');
  } else {
    login.classList.remove('active');
    main.classList.add('active');
  }
}

async function initAppAfterLogin() {
  if (!currentUser) return;
  showScreen('main');

  document.getElementById('user-name').textContent = currentUser.name || '';
  document.getElementById('user-email').textContent = currentUser.email || '';

  await fetchBootstrap();
}

/******** API HELPERS ********/

async function fetchBootstrap() {
  try {
    const url = `${API_BASE}?action=getBootstrap&email=${encodeURIComponent(currentUser.email)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error || 'API error');
    }
    bootstrapData.stats = data.stats;
    bootstrapData.followups = data.followups || [];
    bootstrapData.activities = data.activities || [];

    updateStatsUI();
    renderCurrentTab();
    startCountdownTimer();
  } catch (err) {
    alert('Error loading data: ' + err.message);
  }
}

async function refreshFollowups() {
  const url = `${API_BASE}?action=listFollowups&email=${encodeURIComponent(currentUser.email)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.ok) {
    bootstrapData.followups = data.followups || [];
    updateStatsUI();
    if (currentTab === 'FOLLOWUPS') renderFollowups();
  }
}

async function refreshActivities() {
  const url = `${API_BASE}?action=listActivities&email=${encodeURIComponent(currentUser.email)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.ok) {
    bootstrapData.activities = data.activities || [];
    updateStatsUI();
    if (currentTab === 'ACTIVITIES') renderActivities();
  }
}

/******** UI: Stats ********/

function updateStatsUI() {
  if (!bootstrapData.stats) return;
  const { followups, activities } = bootstrapData.stats;

  document.getElementById('stat-overdue').textContent = followups.overdue;
  document.getElementById('stat-today').textContent = followups.today;
  document.getElementById('stat-matured').textContent = activities.matured;
  document.getElementById('stat-cancelled').textContent = activities.cancelled;
}

/******** UI: Tabs ********/

function switchTab(tab) {
  currentTab = tab;

  document.getElementById('tab-followups').classList.toggle('active', tab === 'FOLLOWUPS');
  document.getElementById('tab-activities').classList.toggle('active', tab === 'ACTIVITIES');

  document.getElementById('followups-list').classList.toggle('active', tab === 'FOLLOWUPS');
  document.getElementById('activities-list').classList.toggle('active', tab === 'ACTIVITIES');

  // Swap filter select visibility
  document.getElementById('filter-followup-container').classList.toggle('hidden', tab !== 'FOLLOWUPS');
  document.getElementById('filter-activity-container').classList.toggle('hidden', tab !== 'ACTIVITIES');

  renderCurrentTab();
}

function renderCurrentTab() {
  if (currentTab === 'FOLLOWUPS') {
    renderFollowups();
  } else {
    renderActivities();
  }
}

/******** UI: Followups ********/

function renderFollowups() {
  const container = document.getElementById('followups-list');
  container.innerHTML = '';

  const search = document.getElementById('search-input').value.toLowerCase();
  const filter = document.getElementById('followup-filter').value;

  let list = bootstrapData.followups || [];
  const nowMs = Date.now();

  list = list.filter(f => {
    const text = (f.clientName + ' ' + (f.station || '') + ' ' + (f.mobile || '')).toLowerCase();
    if (search && !text.includes(search)) return false;

    if (filter === 'OVERDUE' && !f.isOverdue) return false;
    if (filter === 'TODAY') {
      if (!f.dueMs) return false;
      const d = new Date(f.dueMs);
      const today = new Date();
      const dStr = d.toISOString().slice(0,10);
      const tStr = today.toISOString().slice(0,10);
      if (dStr !== tStr) return false;
    }
    if (filter === 'UPCOMING') {
      if (!f.dueMs) return false;
      if (f.dueMs <= nowMs) return false;
    }

    return true;
  });

  if (!list.length) {
    container.innerHTML = '<p style="color:#9ca3af;font-size:0.9rem;">No follow ups.</p>';
    return;
  }

  list.forEach(f => {
    const card = document.createElement('div');
    card.className = 'card followup-card';
    card.dataset.dueMs = f.dueMs || '';
    card.dataset.id = f.id;

    const dueLabel = formatDueLabel(f.dueMs);
    const overdue = f.isOverdue;

    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(f.clientName)} (${escapeHtml(f.mobile)})</div>
          <div class="card-subtitle">
            ${escapeHtml(f.station || '')}
          </div>
        </div>
        <div>
          <div class="badge ${overdue ? 'badge-overdue' : ''}">${overdue ? 'Overdue' : f.nextActionType}</div>
        </div>
      </div>
      <div class="card-body">
        <div><strong>Next:</strong> <span class="countdown-text">${dueLabel}</span></div>
        ${f.remark ? `<div><strong>Remark:</strong> ${escapeHtml(f.remark)}</div>` : ''}
      </div>
      <div class="card-footer">
        <div class="counts-pill">
          Call: ${f.callsBefore} &middot; Visits: ${f.visitsBefore}
        </div>
        <div>
          <span class="history-link" data-clientkey="${f.clientKey}">History</span>
        </div>
      </div>
    `;

    // Click on card => complete followup
    card.addEventListener('click', (ev) => {
      // avoid click from history link
      if (ev.target.classList.contains('history-link')) return;
      openActivityModalFromFollowup(f);
    });

    // History link
    card.querySelector('.history-link').addEventListener('click', (ev) => {
      ev.stopPropagation();
      openHistoryModal(f.clientKey, f.clientName, f.mobile);
    });

    container.appendChild(card);
  });
}

/******** UI: Activities (All Activities) ********/

function renderActivities() {
  const container = document.getElementById('activities-list');
  container.innerHTML = '';

  const search = document.getElementById('search-input').value.toLowerCase();
  const filter = document.getElementById('activity-filter').value;

  let list = bootstrapData.activities || [];

  // Filter by outcome
  list = list.filter(a => {
    if (filter !== 'ALL' && a.outcome !== filter) return false;
    const text = (a.clientName + ' ' + a.station + ' ' + a.mobile).toLowerCase();
    if (search && !text.includes(search)) return false;
    return true;
  });

  if (!list.length) {
    container.innerHTML = '<p style="color:#9ca3af;font-size:0.9rem;">No activities.</p>';
    return;
  }

  // Group by clientKey and keep latest
  const grouped = {};
  list.forEach(a => {
    if (!grouped[a.clientKey] || (grouped[a.clientKey].tsMs || 0) < (a.tsMs || 0)) {
      grouped[a.clientKey] = a;
    }
  });

  // Convert to array, sort by latest ts desc
  const latestList = Object.values(grouped).sort((a, b) => (b.tsMs || 0) - (a.tsMs || 0));

  latestList.forEach(a => {
    const card = document.createElement('div');
    card.className = 'card';

    const dateStr = a.tsMs ? new Date(a.tsMs).toLocaleString() : '';

    let outcomeLabel = a.outcome;
    if (a.outcome === 'FOLLOW_UP') outcomeLabel = 'Follow Up';
    if (a.outcome === 'DEAL_MATURED') outcomeLabel = 'Deal Matured';
    if (a.outcome === 'DEAL_CANCELLED') outcomeLabel = 'Deal Cancelled';

    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-title">${escapeHtml(a.clientName)} (${escapeHtml(a.mobile)})</div>
          <div class="card-subtitle">${escapeHtml(a.station || '')}</div>
        </div>
        <div class="badge">${escapeHtml(outcomeLabel)}</div>
      </div>
      <div class="card-body">
        <div><strong>Last Activity:</strong> ${a.activityType} on ${dateStr}</div>
        ${a.remark ? `<div><strong>Remark:</strong> ${escapeHtml(a.remark)}</div>` : ''}
        ${a.attachmentUrl ? `<div><a href="${a.attachmentUrl}" target="_blank">Association Form</a></div>` : ''}
      </div>
      <div class="card-footer">
        <span class="history-link" data-clientkey="${a.clientKey}">History</span>
        <span style="font-size:0.8rem;">Tap + to add new activity</span>
      </div>
    `;

    card.querySelector('.history-link').addEventListener('click', () => {
      openHistoryModal(a.clientKey, a.clientName, a.mobile);
    });

    container.appendChild(card);
  });
}

/******** UI: History Modal ********/

function openHistoryModal(clientKey, clientName, mobile) {
  const modal = document.getElementById('history-modal');
  document.getElementById('history-title').textContent =
    `History: ${clientName} (${mobile})`;

  const container = document.getElementById('history-list');
  container.innerHTML = '';

  const list = (bootstrapData.activities || [])
    .filter(a => a.clientKey === clientKey)
    .sort((a, b) => (b.tsMs || 0) - (a.tsMs || 0));

  list.forEach(a => {
    const item = document.createElement('div');
    item.className = 'history-item';
    const dateStr = a.tsMs ? new Date(a.tsMs).toLocaleString() : '';

    let tag = a.outcome;
    if (a.outcome === 'FOLLOW_UP') tag = 'Follow Up';
    if (a.outcome === 'DEAL_MATURED') tag = 'Deal Matured';
    if (a.outcome === 'DEAL_CANCELLED') tag = 'Deal Cancelled';

    item.innerHTML = `
      <div class="history-item-header">
        <div>${a.activityType} &middot; ${dateStr}</div>
        <div class="history-tag">${escapeHtml(tag)}</div>
      </div>
      ${a.remark ? `<div>Remark: ${escapeHtml(a.remark)}</div>` : ''}
    `;
    container.appendChild(item);
  });

  modal.classList.remove('hidden');
}

function closeHistoryModal() {
  document.getElementById('history-modal').classList.add('hidden');
}

/******** UI: Activity Modal ********/

function openActivityModalFromFollowup(f) {
  completingFollowup = f;
  openActivityModal({
    clientName: f.clientName,
    mobile: f.mobile,
    station: f.station,
    address: f.address,
    forceType: f.nextActionType // CALL / VISIT
  });
}

function openActivityModal(prefill = {}) {
  const modal = document.getElementById('activity-modal');
  modal.classList.remove('hidden');

  document.getElementById('modal-title').textContent =
    completingFollowup ? 'Complete Follow Up' : 'Add Activity';

  // Prefill fields
  document.getElementById('client-name').value = prefill.clientName || '';
  document.getElementById('client-mobile').value = prefill.mobile || '';
  document.getElementById('client-station').value = prefill.station || '';
  document.getElementById('client-address').value = prefill.address || '';

  // Activity type
  const typeToSelect = prefill.forceType || 'CALL';
  document.querySelectorAll('#activity-type-toggle .toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === typeToSelect);
    btn.disabled = !!prefill.forceType; // lock type if coming from followup
  });

  // Default outcome: Follow up required
  document.querySelectorAll('.outcome-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.outcome === 'FOLLOW_UP');
  });

  // Clear extra fields
  document.getElementById('followup-remark').value = '';
  document.getElementById('followup-datetime').value = '';
  document.getElementById('followup-next-action').value = 'CALL';
  document.getElementById('deal-file').value = '';
  document.getElementById('deal-remark').value = '';
  document.getElementById('cancel-remark').value = '';

  syncOutcomeUI();
}

function closeActivityModal() {
  document.getElementById('activity-modal').classList.add('hidden');
  completingFollowup = null;
  // unlock type toggles
  document.querySelectorAll('#activity-type-toggle .toggle-btn').forEach(btn => {
    btn.disabled = false;
  });
}

function getSelectedActivityType() {
  const btn = document.querySelector('#activity-type-toggle .toggle-btn.active');
  return btn ? btn.dataset.type : 'CALL';
}

function getSelectedOutcome() {
  const btn = document.querySelector('.outcome-btn.active');
  return btn ? btn.dataset.outcome : 'FOLLOW_UP';
}

function syncOutcomeUI() {
  const outcome = getSelectedOutcome();
  document.getElementById('followup-extra').classList.toggle('hidden', outcome !== 'FOLLOW_UP');
  document.getElementById('deal-mature-extra').classList.toggle('hidden', outcome !== 'DEAL_MATURED');
  document.getElementById('deal-cancel-extra').classList.toggle('hidden', outcome !== 'DEAL_CANCELLED');
}



/******** SAVE ACTIVITY ********/

// 👇 ye helper add karo (saveActivity se just upar)
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || '';
      // "data:...;base64,AAAA" se sirf base64 part nikalo
      const parts = String(result).split(',');
      resolve(parts.length > 1 ? parts[1] : '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}




async function saveActivity() {
  if (!currentUser) return;

  const activityType = getSelectedActivityType(); // CALL / VISIT
  const outcome = getSelectedOutcome();           // FOLLOW_UP / DEAL_MATURED / DEAL_CANCELLED

  const clientName = document.getElementById('client-name').value.trim();
  const mobile = document.getElementById('client-mobile').value.trim();
  const station = document.getElementById('client-station').value.trim();
  const address = document.getElementById('client-address').value.trim();

  if (!clientName || !mobile) {
    alert('Client name and mobile are required.');
    return;
  }

  const formData = new FormData();
  formData.append('action', 'logActivity');
  formData.append('email', currentUser.email);
  formData.append('userName', currentUser.name || '');
  formData.append('activityType', activityType);
  formData.append('clientName', clientName);
  formData.append('mobile', mobile);
  formData.append('station', station);
  formData.append('address', address);
  formData.append('outcome', outcome);

  if (completingFollowup) {
    formData.append('followupId', completingFollowup.id);
  }

  if (outcome === 'FOLLOW_UP') {
    const remark = document.getElementById('followup-remark').value.trim();
    const dtStr = document.getElementById('followup-datetime').value;
    const nextAction = document.getElementById('followup-next-action').value;

    if (!dtStr) {
      alert('Next follow up date & time required.');
      return;
    }
    const dt = new Date(dtStr);
    const ms = dt.getTime();
    if (!ms || isNaN(ms)) {
      alert('Invalid follow up date/time.');
      return;
    }

    formData.append('remark', remark);
    formData.append('nextActionType', nextAction);
    formData.append('nextFollowupTs', String(ms));
  } else if (outcome === 'DEAL_MATURED') {
    const remark = document.getElementById('deal-remark').value.trim();
    const fileInput = document.getElementById('deal-file');
    if (fileInput.files.length > 0) {
      formData.append('file1', fileInput.files[0]); // name doesn't matter, server takes first file
    }
    formData.append('remark', remark);
  } else if (outcome === 'DEAL_CANCELLED') {
    const remark = document.getElementById('cancel-remark').value.trim();
    if (!remark) {
      alert('Please add cancellation remark.');
      return;
    }
    formData.append('remark', remark);
  }

  try {
    document.getElementById('btn-save-activity').disabled = true;
    const res = await fetch(API_BASE, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'API error');

    closeActivityModal();
    // Refresh data
    await Promise.all([refreshFollowups(), refreshActivities(), fetchBootstrap()]);
    completingFollowup = null;
  } catch (err) {
    alert('Error saving activity: ' + err.message);
  } finally {
    document.getElementById('btn-save-activity').disabled = false;
  }
}

/******** COUNTDOWN TIMER ********/

function startCountdownTimer() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const cards = document.querySelectorAll('.followup-card');
    const now = Date.now();
    cards.forEach(card => {
      const dueMs = Number(card.dataset.dueMs || '0');
      const el = card.querySelector('.countdown-text');
      if (!dueMs || !el) return;
      const diff = dueMs - now;
      if (diff <= 0) {
        el.textContent = 'Overdue';
        card.classList.add('overdue');
      } else {
        el.textContent = formatDiff(diff);
      }
    });
  }, 1000);
}

function formatDueLabel(dueMs) {
  if (!dueMs) return 'No date';
  const diff = dueMs - Date.now();
  if (diff <= 0) return 'Overdue';
  return formatDiff(diff);
}

function formatDiff(diffMs) {
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}

/******** UTILS ********/

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  // Hamesha string bana lo, chahe number ho ya kuch bhi
  str = String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// app.js

const CLIENT_ID = '360849757137-agopfs0m8rgmcj541ucpg22btep5olt3.apps.googleusercontent.com';

let API_URL = '';
let state = {
  idToken: null,
  user: null,
  activities: [],
  filters: {
    followupType: 'ALL',
    followupStatus: 'FOLLOWUP',
    globalStatus: 'ALL',
    quickDate: 'ALL',
    searchClient: ''
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const appRoot = document.getElementById('app');
  API_URL = appRoot.dataset.apiUrl;

  initElements();
  initTabs();
  initBottomNav();
  initFab();
  initModal();
  initFilters();
  initFollowupActionClicks();   // 🔴 NEW
  initSignOut();

  initGoogleIdentity();
});

/************** ELEMENTS **************/
let authSection, mainSection, btnSignOut, chipToday;
let followupsList, allActivitiesList;
let followupTypeFilter, followupStatusFilter;
let quickDateFilter, globalStatusFilter, searchClientInput;
let tabButtons, bottomNavButtons;
let btnNewActivity, activityModal, btnCloseModal;
let typeButtons, callFields, visitFields, followupFields, membershipSection;
let fieldClientName, fieldMobile, fieldStation, fieldShortAddress, fieldRemark, fieldFollowupAt;
let fieldMembership1, fieldMembership2, fieldMembership3;
let btnDealCancel, btnFollowup, btnDealMature, modalError, toastEl;
let userAvatar, userNameEl, userEmailEl;
let authMessage;

// 🔴 current followup context (parentId etc.)
let currentFollowupParentId = null;

function initElements() {
  authSection = document.getElementById('authSection');
  mainSection = document.getElementById('mainSection');
  btnSignOut = document.getElementById('btnSignOut');
  chipToday = document.getElementById('chipToday');

  followupsList = document.getElementById('followupsList');
  allActivitiesList = document.getElementById('allActivitiesList');

  followupTypeFilter = document.getElementById('followupTypeFilter');
  followupStatusFilter = document.getElementById('followupStatusFilter');
  quickDateFilter = document.getElementById('quickDateFilter');
  globalStatusFilter = document.getElementById('globalStatusFilter');
  searchClientInput = document.getElementById('searchClient');

  tabButtons = document.querySelectorAll('.tab-btn');
  bottomNavButtons = document.querySelectorAll('.bottom-nav-btn');

  btnNewActivity = document.getElementById('btnNewActivity');
  activityModal = document.getElementById('activityModal');
  btnCloseModal = document.getElementById('btnCloseModal');
  typeButtons = document.querySelectorAll('.type-btn');
  callFields = document.getElementById('callFields');
  visitFields = document.getElementById('visitFields');
  followupFields = document.getElementById('followupFields');
  membershipSection = document.getElementById('membershipSection');

  fieldClientName = document.getElementById('fieldClientName');
  fieldMobile = document.getElementById('fieldMobile');
  fieldStation = document.getElementById('fieldStation');
  fieldShortAddress = document.getElementById('fieldShortAddress');
  fieldRemark = document.getElementById('fieldRemark');
  fieldFollowupAt = document.getElementById('fieldFollowupAt');

  fieldMembership1 = document.getElementById('fieldMembership1');
  fieldMembership2 = document.getElementById('fieldMembership2');
  fieldMembership3 = document.getElementById('fieldMembership3');

  btnDealCancel = document.getElementById('btnDealCancel');
  btnFollowup = document.getElementById('btnFollowup');
  btnDealMature = document.getElementById('btnDealMature');
  modalError = document.getElementById('modalError');
  toastEl = document.getElementById('toast');

  userAvatar = document.getElementById('userAvatar');
  userNameEl = document.getElementById('userName');
  userEmailEl = document.getElementById('userEmail');

  authMessage = document.getElementById('authMessage');

  const today = new Date();
  chipToday.textContent = today.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  });
}

/************** GOOGLE IDENTITY **************/
function initGoogleIdentity() {
  window.onload = () => {
    /* global google */
    if (!window.google || !google.accounts || !google.accounts.id) {
      authMessage.textContent = 'Unable to load Google Sign-In.';
      return;
    }

    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: handleCredentialResponse
    });

    google.accounts.id.renderButton(
      document.getElementById('g_id_signin'),
      { theme: 'outline', size: 'large', width: '240' }
    );
  };
}

async function handleCredentialResponse(response) {
  try {
    const idToken = response.credential;
    state.idToken = idToken;

    authMessage.textContent = 'Verifying...';
    const data = await apiPost('init', { idToken });

    if (!data.ok || data.code === 'NOT_ALLOWED') {
      authMessage.textContent = 'You are not allowed to use this app.';
      showToast('Access denied. Please contact admin.');
      state.idToken = null;
      return;
    }

    state.user = data.user;
    state.activities = data.activities || [];

    authSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    btnSignOut.classList.remove('hidden');
    btnNewActivity.classList.remove('hidden');
    document.getElementById('bottomNav').classList.remove('hidden');

    // Set user UI
    if (state.user.picture) userAvatar.src = state.user.picture;
    userNameEl.textContent = state.user.name || 'Sales User';
    userEmailEl.textContent = state.user.email || '';

    renderAll();
    showToast('Signed in successfully');
  } catch (err) {
    console.error(err);
    authMessage.textContent = 'Error during login.';
    showToast('Login failed. Try again.');
  }
}

function initSignOut() {
  btnSignOut.addEventListener('click', () => {
    state.idToken = null;
    state.user = null;
    state.activities = [];
    mainSection.classList.add('hidden');
    document.getElementById('bottomNav').classList.add('hidden');
    btnNewActivity.classList.add('hidden');
    btnSignOut.classList.add('hidden');
    authSection.classList.remove('hidden');
    showToast('Signed out');
  });
}

/************** API **************/
async function apiPost(action, payload) {
  const body = {
    action,
    ...payload
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    // application/json ki jagah text/plain
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body)
  });

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error('Response JSON parse error:', err, 'raw:', text);
    throw err;
  }

  return data;
}


/************** TABS + NAV **************/
function initTabs() {
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveTab(btn.dataset.tab);
      syncBottomNav(btn.dataset.tab);
    });
  });
}

function initBottomNav() {
  bottomNavButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setActiveTab(btn.dataset.tab);
      syncTopTabs(btn.dataset.tab);
    });
  });
}

function setActiveTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(sec => {
    sec.classList.toggle('active', sec.id === tabId);
  });

  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  bottomNavButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
}

function syncBottomNav(tabId) {
  bottomNavButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
}

function syncTopTabs(tabId) {
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
}

/************** FAB + MODAL **************/
function initFab() {
  btnNewActivity.addEventListener('click', () => {
    // New activity (no parent followup)
    openActivityModal();
  });
}

function initModal() {
  btnCloseModal.addEventListener('click', closeActivityModal);
  activityModal.addEventListener('click', (e) => {
    if (e.target === activityModal || e.target.classList.contains('modal-backdrop')) {
      closeActivityModal();
    }
  });

  typeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      typeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const type = btn.dataset.type;
      updateTypeVisibility(type);
    });
  });

  btnDealCancel.addEventListener('click', () => saveActivityWithStatus('CANCEL'));
  btnFollowup.addEventListener('click', () => saveActivityWithStatus('FOLLOWUP'));
  btnDealMature.addEventListener('click', () => saveActivityWithStatus('MATURE'));
}

// 🔴 Open modal: optionally with prefilled data from a followup
function openActivityModal(prefill) {
  clearModal();

  let typeToSet = 'CALL';
  if (prefill && prefill.type) {
    typeToSet = prefill.type;
  }

  // Set active type button
  typeButtons.forEach(btn => {
    const isActive = btn.dataset.type === typeToSet;
    btn.classList.toggle('active', isActive);
  });
  updateTypeVisibility(typeToSet);

  if (prefill) {
    if (prefill.clientName) fieldClientName.value = prefill.clientName;
    if (prefill.mobile) fieldMobile.value = prefill.mobile;
    if (prefill.station) fieldStation.value = prefill.station;
    if (prefill.shortAddress) fieldShortAddress.value = prefill.shortAddress;
    currentFollowupParentId = prefill.parentId || null;
  } else {
    currentFollowupParentId = null;
  }

  activityModal.classList.remove('hidden');
}

function closeActivityModal() {
  activityModal.classList.add('hidden');
  clearModal();
}

function currentType() {
  const active = Array.from(typeButtons).find(btn => btn.classList.contains('active'));
  return active ? active.dataset.type : 'CALL';
}

function updateTypeVisibility(type) {
  if (type === 'CALL') {
    callFields.classList.remove('hidden');
    visitFields.classList.add('hidden');
  } else {
    callFields.classList.add('hidden');
    visitFields.classList.remove('hidden');
  }
}

function clearModal() {
  fieldClientName.value = '';
  fieldMobile.value = '';
  fieldStation.value = '';
  fieldShortAddress.value = '';
  fieldRemark.value = '';
  fieldFollowupAt.value = '';
  fieldMembership1.value = '';
  fieldMembership2.value = '';
  fieldMembership3.value = '';
  membershipSection.classList.add('hidden');
  followupFields.classList.add('hidden');
  modalError.textContent = '';
  currentFollowupParentId = null; // 🔴 reset parent
}

/************** SAVE ACTIVITY **************/
async function saveActivityWithStatus(status) {
  if (!state.idToken) {
    showToast('Please login first');
    return;
  }

  modalError.textContent = '';
  const type = currentType();

  const clientName = fieldClientName.value.trim();
  const mobile = fieldMobile.value.trim();
  const station = fieldStation.value.trim();
  const shortAddress = fieldShortAddress.value.trim();
  const remark = fieldRemark.value.trim();
  const followupAt = fieldFollowupAt.value ? fieldFollowupAt.value : '';
  const membershipField1 = fieldMembership1.value.trim();
  const membershipField2 = fieldMembership2.value.trim();
  const membershipField3 = fieldMembership3.value.trim();

  if (!clientName) {
    modalError.textContent = 'Client name is required.';
    return;
  }

  if (type === 'CALL') {
    if (!mobile || mobile.length !== 10 || !/^\d{10}$/.test(mobile)) {
      modalError.textContent = 'Valid 10 digit mobile is required for Call.';
      return;
    }
  }

  // Status-wise validations & UI:
  let finalStatus = status;
  let finalFollowupAt = followupAt;

  if (status === 'FOLLOWUP') {
    followupFields.classList.remove('hidden');
    if (!followupAt) {
      modalError.textContent = 'Please select follow up date & time.';
      return;
    }
  }

  if (status === 'MATURE') {
    membershipSection.classList.remove('hidden');
    if (!membershipField1) {
      modalError.textContent = 'Please fill membership details (Firm Name at least).';
      return;
    }
  }

  try {
    const payload = {
      idToken: state.idToken,
      activity: {
        type,
        clientName,
        mobile,
        station,
        shortAddress,
        remark,
        status: finalStatus,
        followupAt: finalFollowupAt,
        parentId: currentFollowupParentId || '',   // 🔴 IMPORTANT
        membershipField1,
        membershipField2,
        membershipField3
      }
    };

    const res = await apiPost('saveActivity', payload);
    if (!res.ok) {
      modalError.textContent = res.error || 'Error saving activity';
      return;
    }

    state.activities.push(res.activity);
    renderAll();
    showToast('Activity saved');

    closeActivityModal();
  } catch (err) {
    console.error(err);
    modalError.textContent = 'Unexpected error';
  }
}

/************** FILTERS **************/
function initFilters() {
  followupTypeFilter.addEventListener('change', () => {
    state.filters.followupType = followupTypeFilter.value;
    renderFollowups();
  });

  followupStatusFilter.addEventListener('change', () => {
    state.filters.followupStatus = followupStatusFilter.value;
    renderFollowups();
  });

  quickDateFilter.addEventListener('change', () => {
    state.filters.quickDate = quickDateFilter.value;
    renderFollowups();
    renderAllActivities();
  });

  globalStatusFilter.addEventListener('change', () => {
    state.filters.globalStatus = globalStatusFilter.value;
    renderAllActivities();
  });

  searchClientInput.addEventListener('input', () => {
    state.filters.searchClient = searchClientInput.value.toLowerCase();
    renderFollowups();
    renderAllActivities();
  });
}

/************** FOLLOWUP ACTION CLICK (NEW) **************/
function initFollowupActionClicks() {
  if (!followupsList) return;

  followupsList.addEventListener('click', (e) => {
    const btn = e.target.closest('.badge-type-action');
    if (!btn) return;

    const prefill = {
      type: btn.dataset.type || 'CALL',
      clientName: btn.dataset.clientName || '',
      mobile: btn.dataset.mobile || '',
      station: btn.dataset.station || '',
      shortAddress: btn.dataset.shortAddress || '',
      parentId: btn.dataset.parentId || ''
    };

    openActivityModal(prefill);
  });
}

/************** RENDER **************/
function renderAll() {
  renderFollowups();
  renderAllActivities();
}

function renderFollowups() {
  const { followupType, followupStatus, quickDate, searchClient } = state.filters;
  const now = new Date();

  const items = state.activities.filter(a => {
    const isFollowup = a.status === 'FOLLOWUP';
    if (!isFollowup && followupStatus === 'FOLLOWUP') return false;

    if (followupStatus !== 'ALL' && followupStatus !== 'FOLLOWUP') {
      if (a.status !== followupStatus) return false;
    }

    if (followupType !== 'ALL' && a.type !== followupType) return false;

    if (searchClient && !String(a.clientName || '').toLowerCase().includes(searchClient)) return false;

    if (quickDate !== 'ALL') {
      if (!a.followupAt) return false;
      const dt = new Date(a.followupAt);
      const diffDays = (dt - startOfDay_(now)) / (1000 * 60 * 60 * 24);
      if (quickDate === 'TODAY') {
        if (!sameDay_(dt, now)) return false;
      } else if (quickDate === 'NEXT7') {
        if (diffDays < 0 || diffDays > 7) return false;
      } else if (quickDate === 'PAST') {
        if (dt >= startOfDay_(now)) return false;
      }
    }

    return true;
  });

  items.sort((a, b) => (a.followupAt || '').localeCompare(b.followupAt || ''));

  followupsList.innerHTML = '';
  if (!items.length) {
    followupsList.innerHTML = `<div class="list-item"><div class="list-item-sub">No follow ups found.</div></div>`;
    return;
  }

  items.forEach(a => {
    const card = document.createElement('div');
    card.className = 'list-item';

    const header = document.createElement('div');
    header.className = 'list-item-header';

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.textContent = a.clientName || '(No name)';
    const sub = document.createElement('div');
    sub.className = 'list-item-sub';

    let line = a.type === 'CALL'
      ? (a.mobile ? `📞 ${a.mobile}` : 'Call')
      : (a.station ? `📍 ${a.station}` : 'Visit');

    if (a.followupAt) {
      const dt = new Date(a.followupAt);
      line += ` • ${dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    }

    sub.textContent = line;

    left.appendChild(title);
    left.appendChild(sub);

    const right = document.createElement('div');

    // 🔴 CLICKABLE Call / Visit chip with data- attributes
    const badgeType = document.createElement('button');
    badgeType.type = 'button';
    badgeType.className = 'badge badge-type-action ' + (a.type === 'CALL' ? 'badge-call' : 'badge-visit');
    badgeType.textContent = a.type === 'CALL' ? 'Call' : 'Visit';

    badgeType.dataset.type = a.type || 'CALL';
    badgeType.dataset.clientName = a.clientName || '';
    badgeType.dataset.mobile = a.mobile || '';
    badgeType.dataset.station = a.station || '';
    badgeType.dataset.shortAddress = a.shortAddress || '';
    badgeType.dataset.parentId = a.id || '';

    const badgeStatus = document.createElement('span');
    badgeStatus.className = 'badge ' + getStatusBadgeClass_(a.status);
    badgeStatus.textContent = statusLabel_(a.status);

    right.appendChild(badgeType);
    right.appendChild(badgeStatus);

    header.appendChild(left);
    header.appendChild(right);

    const remark = document.createElement('div');
    remark.className = 'list-item-sub';
    remark.textContent = a.remark || 'No remark';

    card.appendChild(header);
    card.appendChild(remark);
    followupsList.appendChild(card);
  });
}

function renderAllActivities() {
  const { globalStatus, quickDate, searchClient } = state.filters;
  const now = new Date();

  const items = state.activities.filter(a => {
    if (globalStatus !== 'ALL' && a.status !== globalStatus) {
      return false;
    }

    if (searchClient && !String(a.clientName || '').toLowerCase().includes(searchClient)) {
      return false;
    }

    if (quickDate !== 'ALL') {
      if (!a.followupAt) return false;
      const dt = new Date(a.followupAt);
      const diffDays = (dt - startOfDay_(now)) / (1000 * 60 * 60 * 24);
      if (quickDate === 'TODAY') {
        if (!sameDay_(dt, now)) return false;
      } else if (quickDate === 'NEXT7') {
        if (diffDays < 0 || diffDays > 7) return false;
      } else if (quickDate === 'PAST') {
        if (dt >= startOfDay_(now)) return false;
      }
    }

    return true;
  });

  items.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

  allActivitiesList.innerHTML = '';
  if (!items.length) {
    allActivitiesList.innerHTML = `<div class="list-item"><div class="list-item-sub">No activities yet.</div></div>`;
    return;
  }

  items.forEach(a => {
    const card = document.createElement('div');
    card.className = 'list-item';

    const header = document.createElement('div');
    header.className = 'list-item-header';

    const left = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'list-item-title';
    title.textContent = a.clientName || '(No name)';
    const sub = document.createElement('div');
    sub.className = 'list-item-sub';

    const ts = a.timestamp
      ? new Date(a.timestamp).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit'
        })
      : '';

    let line = ts;
    if (a.type === 'CALL' && a.mobile) {
      line += ` • 📞 ${a.mobile}`;
    } else if (a.type === 'VISIT' && a.station) {
      line += ` • 📍 ${a.station}`;
    }
    sub.textContent = line;

    left.appendChild(title);
    left.appendChild(sub);

    const right = document.createElement('div');
    const badgeType = document.createElement('span');
    badgeType.className = 'badge ' + (a.type === 'CALL' ? 'badge-call' : 'badge-visit');
    badgeType.textContent = a.type === 'CALL' ? 'Call' : 'Visit';

    const badgeStatus = document.createElement('span');
    badgeStatus.className = 'badge ' + getStatusBadgeClass_(a.status);
    badgeStatus.textContent = statusLabel_(a.status);

    right.appendChild(badgeType);
    right.appendChild(badgeStatus);

    header.appendChild(left);
    header.appendChild(right);

    const remark = document.createElement('div');
    remark.className = 'list-item-sub';
    remark.textContent = a.remark || 'No remark';

    card.appendChild(header);
    card.appendChild(remark);

    allActivitiesList.appendChild(card);
  });
}

/************** HELPERS **************/
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2200);
}

function getStatusBadgeClass_(status) {
  switch (status) {
    case 'MATURE':
      return 'badge-status-mature';
    case 'CANCEL':
      return 'badge-status-cancel';
    case 'FOLLOWUP':
      return 'badge-status-follow';
    case 'NEW':
    default:
      return 'badge-status-new';
  }
}

function statusLabel_(status) {
  switch (status) {
    case 'MATURE':
      return 'Matured';
    case 'CANCEL':
      return 'Cancelled';
    case 'FOLLOWUP':
      return 'Follow-up';
    case 'NEW':
    default:
      return 'New';
  }
}

function startOfDay_(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function sameDay_(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

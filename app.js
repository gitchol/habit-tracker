// ============================================================
// Habit Tracker PWA — app.js
// Firebase v10 ES Module imports via CDN
// ============================================================

// ===== FIREBASE CONFIG - REPLACE WITH YOUR OWN =====
// 1. Go to https://console.firebase.google.com
// 2. Create a project → Add Web App → copy the config object
// 3. Paste your values below (replace every "YOUR_..." string)
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCPEU8Msa8LwBeNRVJyv_SUE5jb9EoRuY8",
  authDomain:        "habit-tracker-98644.firebaseapp.com",
  projectId:         "habit-tracker-98644",
  storageBucket:     "habit-tracker-98644.firebasestorage.app",
  messagingSenderId: "253518126373",
  appId:             "1:253518126373:web:6bb59363677c28a01c0ecc",
  measurementId:     "G-7BWJZF6J6B"
};
// ===================================================

// Detect unconfigured state
const IS_CONFIGURED = !Object.values(FIREBASE_CONFIG).some(v => v.startsWith('YOUR_'));

// ─── Firebase imports ────────────────────────────────────────────────────
import { initializeApp }              from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── Constants ───────────────────────────────────────────────────────────
const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899'];

const EMOJIS = [
  '🏃','🧘','💪','🚴','🏊','🤸','⚽','🎾',
  '📚','✍️','🎨','🎵','🧠','💡','🔬','📝',
  '🍎','🥗','💊','💧','🥦','🍵','🧃','🥑',
  '😴','🛌','🧹','🛁','🌿','🌱','☀️','🌙',
  '❤️','🙏','📿','🔥','⭐','✨','🎯','🏆',
  '💰','📊','💻','📱','🔑','🗓️','📌','🎁',
  '👨‍👩‍👧','🐕','🌻','🏠','🚗','✈️','🎭','🎬'
];

const TIME_LABELS = {
  morning:   'Morning',
  afternoon: 'Afternoon',
  evening:   'Evening',
  anytime:   'Anytime'
};

const TIME_ORDER = ['morning', 'afternoon', 'evening', 'anytime'];

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// ─── App State ───────────────────────────────────────────────────────────
let auth, db;
let currentUser = null;
let habits = [];          // Array of habit objects
let completions = {};     // { 'YYYY-MM-DD': { date, done: { habitId: timestamp } } }
let currentView = 'today';
let calendarDate = new Date();
let selectedCalDay = null;
let editingHabitId = null;
let habitUnsubscribe = null;
let completionUnsubscribe = null;
let selectedEmoji = '⭐';
let selectedColor = COLORS[5]; // indigo default

// ─── DOM refs ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const appEl            = $('app');
const authScreen       = $('auth-screen');
const setupScreen      = $('setup-screen');
const loadingScreen    = $('loading-screen');
const googleSignInBtn  = $('google-sign-in-btn');
const authError        = $('auth-error');

// ─── Show / Hide helpers (bypass [hidden] CSS specificity issues) ─────────
function hide(el) { if (el) { el.hidden = true;  el.style.display = 'none';  } }
function show(el) { if (el) { el.hidden = false; el.style.display = '';      } }

// ─── Init ────────────────────────────────────────────────────────────────
async function init() {
  // Apply saved dark mode preference
  applyDarkModePreference();

  // If Firebase config not filled in, show setup screen
  if (!IS_CONFIGURED) {
    hide(loadingScreen);
    hide(authScreen);
    show(setupScreen);
    return;
  }

  // Initialize Firebase
  const app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  db = getFirestore(app);

  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch(e) {
      console.warn('SW registration failed:', e);
    }
  }

  // Listen for auth state
  onAuthStateChanged(auth, user => {
    if (user) {
      currentUser = user;
      hide(authScreen);
      show(loadingScreen);
      hide(appEl);
      onUserSignedIn();
    } else {
      currentUser = null;
      cleanupListeners();
      hide(loadingScreen);
      show(authScreen);
      hide(appEl);
    }
  });

  // Wire up UI events
  wireEvents();
}

// ─── Auth ────────────────────────────────────────────────────────────────
googleSignInBtn.addEventListener('click', async () => {
  authError.hidden = true;
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch(err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      authError.textContent = err.message;
      authError.hidden = false;
    }
  }
});

$('sign-out-btn').addEventListener('click', async () => {
  try {
    cleanupListeners();
    await signOut(auth);
    showToast('Signed out');
  } catch(err) {
    showToast('Sign out failed', 'error');
  }
});

function onUserSignedIn() {
  updateProfileUI();
  subscribeHabits();
  subscribeCompletions();
  renderView(currentView);
  hide(loadingScreen);
  show(appEl);
}

function cleanupListeners() {
  if (habitUnsubscribe) { habitUnsubscribe(); habitUnsubscribe = null; }
  if (completionUnsubscribe) { completionUnsubscribe(); completionUnsubscribe = null; }
  habits = [];
  completions = {};
}

// ─── Firestore Subscriptions ─────────────────────────────────────────────

function subscribeHabits() {
  if (!currentUser) return;
  const habitsRef = collection(db, 'users', currentUser.uid, 'habits');
  const q = query(habitsRef, orderBy('order', 'asc'));

  habitUnsubscribe = onSnapshot(q, snapshot => {
    habits = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderView(currentView);
    scheduleNotifications();
  }, err => {
    console.error('Habits snapshot error:', err);
    showToast('Sync error. Check connection.', 'error');
  });
}

function subscribeCompletions() {
  if (!currentUser) return;
  // Listen to last 60 days of completions
  const sixty = new Date();
  sixty.setDate(sixty.getDate() - 60);
  const startDate = dateKey(sixty);

  const compRef = collection(db, 'users', currentUser.uid, 'completions');
  const q = query(compRef, where('date', '>=', startDate));

  completionUnsubscribe = onSnapshot(q, snapshot => {
    completions = {};
    snapshot.docs.forEach(d => {
      completions[d.id] = d.data();
    });
    renderView(currentView);
  }, err => {
    console.error('Completions snapshot error:', err);
  });
}

// ─── Date utilities ──────────────────────────────────────────────────────

function dateKey(d) {
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return dateKey(new Date());
}

function parseDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplayDate(d) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── Habits for a given date ─────────────────────────────────────────────

function habitsForDate(dateStr) {
  const d = parseDate(dateStr);
  const dow = d.getDay(); // 0=Sun
  return habits.filter(h => {
    if (!h.active) return false;
    if (!h.days || h.days.length === 0) return true;
    return h.days.includes(dow);
  });
}

function isHabitDoneOnDate(habitId, dateStr) {
  return !!(completions[dateStr]?.done?.[habitId]);
}

// ─── Streak calculation ──────────────────────────────────────────────────

function calcStreak(habit) {
  let streak = 0;
  const today = new Date();
  const d = new Date(today);
  // Start from yesterday if not yet done today
  const todayStr = dateKey(today);
  if (!isHabitDoneOnDate(habit.id, todayStr)) {
    d.setDate(d.getDate() - 1);
  }
  for (let i = 0; i < 365; i++) {
    const key = dateKey(d);
    const dow = d.getDay();
    // Skip days habit is not scheduled
    if (habit.days && habit.days.length > 0 && !habit.days.includes(dow)) {
      d.setDate(d.getDate() - 1);
      continue;
    }
    if (isHabitDoneOnDate(habit.id, key)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  // Include today if done
  if (isHabitDoneOnDate(habit.id, todayStr) && streak === 0) {
    streak = 1;
  }
  return streak;
}

// ─── Toggle completion ───────────────────────────────────────────────────

async function toggleCompletion(habitId, dateStr) {
  if (!currentUser) return;
  const done = isHabitDoneOnDate(habitId, dateStr);
  const ref = doc(db, 'users', currentUser.uid, 'completions', dateStr);

  // Optimistic update
  if (!completions[dateStr]) {
    completions[dateStr] = { date: dateStr, done: {} };
  }
  if (done) {
    delete completions[dateStr].done[habitId];
  } else {
    completions[dateStr].done[habitId] = new Date().toISOString();
    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);
  }
  renderTodayView();

  try {
    await setDoc(ref, {
      date: dateStr,
      done: completions[dateStr].done
    }, { merge: false });
  } catch(err) {
    // Rollback optimistic update on failure
    if (done) {
      completions[dateStr].done[habitId] = 'rollback';
    } else {
      delete completions[dateStr].done[habitId];
    }
    renderTodayView();
    showToast('Failed to save. Check connection.', 'error');
  }
}

// ─── Navigation ──────────────────────────────────────────────────────────

function wireEvents() {
  // Bottom nav / sidebar nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      navigateTo(view);
    });
  });

  // Dark mode toggle
  const darkToggle = $('dark-mode-toggle');
  darkToggle.addEventListener('change', () => {
    const isDark = darkToggle.checked;
    localStorage.setItem('darkMode', isDark ? 'dark' : 'light');
    applyDarkMode(isDark);
  });

  // Notification toggle
  $('notif-toggle').addEventListener('change', async (e) => {
    if (e.target.checked) {
      const result = await requestNotificationPermission();
      if (!result) {
        e.target.checked = false;
        $('notif-toggle').setAttribute('aria-checked', 'false');
      } else {
        localStorage.setItem('notificationsEnabled', 'true');
        scheduleNotifications();
      }
    } else {
      localStorage.setItem('notificationsEnabled', 'false');
      cancelNotifications();
    }
  });

  // Add habit buttons
  $('add-habit-btn').addEventListener('click', () => openHabitModal(null));
  $('add-habit-fab').addEventListener('click', () => openHabitModal(null));

  // Modal
  $('modal-close-btn').addEventListener('click', closeHabitModal);
  $('modal-save-btn').addEventListener('click', saveHabit);
  $('modal-delete-btn').addEventListener('click', deleteHabit);
  $('habit-modal-overlay').addEventListener('click', e => {
    if (e.target === $('habit-modal-overlay')) closeHabitModal();
  });

  // Calendar navigation
  $('cal-prev').addEventListener('click', prevMonth);
  $('cal-next').addEventListener('click', nextMonth);

  // Emoji picker
  $('emoji-btn').addEventListener('click', openEmojiPicker);
  $('emoji-picker-close').addEventListener('click', closeEmojiPicker);
  $('emoji-picker-overlay').addEventListener('click', e => {
    if (e.target === $('emoji-picker-overlay')) closeEmojiPicker();
  });
  buildEmojiGrid();

  // Time-of-day segment
  document.querySelectorAll('#tod-segment .segment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#tod-segment .segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Day buttons
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');
    });
  });

  // Color swatches
  buildColorSwatches();

  // Keyboard: close modal on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('habit-modal-overlay').hidden) closeHabitModal();
      if (!$('emoji-picker-overlay').hidden) closeEmojiPicker();
    }
  });

  // Restore notification toggle state
  const notifEnabled = localStorage.getItem('notificationsEnabled') === 'true';
  $('notif-toggle').checked = notifEnabled && Notification.permission === 'granted';
  $('notif-toggle').setAttribute('aria-checked', $('notif-toggle').checked ? 'true' : 'false');

  updateNotifStatusLabel();
}

function navigateTo(view) {
  currentView = view;
  // Update nav buttons
  document.querySelectorAll('.nav-item').forEach(btn => {
    const isActive = btn.dataset.view === view;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
  // Show/hide views
  document.querySelectorAll('.view').forEach(v => {
    v.hidden = true;
    v.classList.remove('active');
  });
  const target = $(`view-${view}`);
  if (target) {
    target.hidden = false;
    target.classList.add('active');
  }
  renderView(view);
}

function renderView(view) {
  switch(view) {
    case 'today':    renderTodayView(); break;
    case 'history':  renderHistoryView(); break;
    case 'habits':   renderHabitsManageView(); break;
    case 'settings': renderSettingsView(); break;
  }
}

// ─── Today View ──────────────────────────────────────────────────────────

function renderTodayView() {
  const today = new Date();
  const todayStr = dateKey(today);
  const todayHabits = habitsForDate(todayStr);

  // Header date
  $('today-date-label').textContent = today.toLocaleDateString('en-US', { weekday: 'long' });
  $('today-sub').textContent = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Progress
  const doneCount = todayHabits.filter(h => isHabitDoneOnDate(h.id, todayStr)).length;
  const total = todayHabits.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  // Ring
  const circumference = 2 * Math.PI * 22; // r=22
  const offset = circumference - (pct / 100) * circumference;
  $('progress-ring-circle').style.strokeDashoffset = offset;
  $('progress-ring-text').textContent = `${pct}%`;

  // Bar
  $('progress-bar-fill').style.width = `${pct}%`;
  $('progress-bar-label').textContent = `${doneCount} / ${total} done`;
  $('progress-bar-wrap').setAttribute('aria-valuenow', pct);

  // Groups
  const groups = $('today-habit-groups');
  groups.innerHTML = '';

  if (todayHabits.length === 0) {
    $('today-empty').hidden = false;
    return;
  }
  $('today-empty').hidden = true;

  // Group by timeOfDay
  TIME_ORDER.forEach(tod => {
    const group = todayHabits.filter(h => (h.timeOfDay || 'anytime') === tod);
    if (group.length === 0) return;

    const groupEl = document.createElement('div');
    groupEl.className = 'habit-group';

    const title = document.createElement('h2');
    title.className = 'habit-group-title';
    title.textContent = TIME_LABELS[tod];
    groupEl.appendChild(title);

    group.forEach(habit => {
      groupEl.appendChild(buildTodayHabitItem(habit, todayStr));
    });

    groups.appendChild(groupEl);
  });
}

function buildTodayHabitItem(habit, dateStr) {
  const done = isHabitDoneOnDate(habit.id, dateStr);
  const streak = calcStreak(habit);

  const item = document.createElement('div');
  item.className = `habit-item ${done ? 'done' : ''}`;
  item.setAttribute('role', 'checkbox');
  item.setAttribute('aria-checked', done ? 'true' : 'false');
  item.setAttribute('aria-label', `${habit.name} - ${done ? 'completed' : 'not completed'}`);
  item.setAttribute('tabindex', '0');

  // Color bar
  const bar = document.createElement('div');
  bar.className = 'habit-color-bar';
  bar.style.background = habit.color || COLORS[5];

  // Icon
  const icon = document.createElement('div');
  icon.className = 'habit-icon';
  icon.textContent = habit.icon || '⭐';
  icon.setAttribute('aria-hidden', 'true');

  // Info
  const info = document.createElement('div');
  info.className = 'habit-info';

  const name = document.createElement('div');
  name.className = 'habit-name';
  name.textContent = habit.name;

  const streakEl = document.createElement('div');
  streakEl.className = `habit-streak ${streak > 0 ? 'active-streak' : ''}`;
  streakEl.textContent = streak > 0 ? `🔥 ${streak} day${streak !== 1 ? 's' : ''}` : 'Start streak!';

  info.appendChild(name);
  info.appendChild(streakEl);

  // Checkbox
  const checkbox = document.createElement('div');
  checkbox.className = 'habit-checkbox';
  checkbox.setAttribute('aria-hidden', 'true');

  const check = document.createElement('span');
  check.className = 'habit-checkbox-check';
  check.textContent = '✓';
  checkbox.appendChild(check);

  item.appendChild(bar);
  item.appendChild(icon);
  item.appendChild(info);
  item.appendChild(checkbox);

  // Click handler
  const handleToggle = () => {
    item.classList.add('completing');
    item.addEventListener('animationend', () => item.classList.remove('completing'), { once: true });
    toggleCompletion(habit.id, dateStr);
  };

  item.addEventListener('click', handleToggle);
  item.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  });

  return item;
}

// ─── History View ─────────────────────────────────────────────────────────

function renderHistoryView() {
  $('cal-month-label').textContent = `${MONTH_NAMES[calendarDate.getMonth()]} ${calendarDate.getFullYear()}`;
  renderCalendarGrid();

  // Legend
  let legend = $('cal-legend');
  if (!legend) {
    legend = document.createElement('div');
    legend.id = 'cal-legend';
    legend.className = 'cal-legend';
    legend.innerHTML = `
      <div class="cal-legend-item"><div class="cal-legend-dot done"></div>All done</div>
      <div class="cal-legend-item"><div class="cal-legend-dot partial"></div>Partial</div>
      <div class="cal-legend-item"><div class="cal-legend-dot missed"></div>Missed</div>
      <div class="cal-legend-item"><div class="cal-legend-dot empty"></div>No habits</div>`;
    $('calendar-grid').after(legend);
  }

  if (selectedCalDay) {
    renderDayDetail(selectedCalDay);
  } else {
    $('day-detail').hidden = true;
  }
}

function renderCalendarGrid() {
  const grid = $('calendar-grid');
  // Remove all day cells (keep the 7 header cells)
  const headers = grid.querySelectorAll('.cal-day-header');
  grid.innerHTML = '';
  headers.forEach(h => grid.appendChild(h));

  const year  = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = dateKey(today);

  // Blank cells before month starts
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day empty';
    blank.setAttribute('aria-hidden', 'true');
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const key = dateKey(date);
    const isToday = key === todayStr;
    const isFuture = date > today;
    const isSelected = key === selectedCalDay;

    // Calculate completion for this day
    const dayHabits = habitsForDate(key);
    const doneCount = dayHabits.filter(h => isHabitDoneOnDate(h.id, key)).length;
    const allDone = dayHabits.length > 0 && doneCount === dayHabits.length;
    const someDone = !allDone && doneCount > 0;

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('tabindex', isFuture ? '-1' : '0');
    cell.textContent = d;

    const isMissed = !isFuture && dayHabits.length > 0 && doneCount === 0 && key !== todayStr;

    if (isToday)            cell.classList.add('is-today');
    if (isFuture)           cell.classList.add('is-future');
    if (!isFuture && allDone)  cell.classList.add('is-all-done');
    if (!isFuture && someDone) cell.classList.add('is-partial');
    if (isMissed)           cell.classList.add('is-missed');
    if (isSelected)         cell.classList.add('is-selected');

    cell.setAttribute('aria-label', `${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${
      isFuture ? 'future' : allDone ? 'all done' : someDone ? `${doneCount} of ${dayHabits.length} done` : 'not started'
    }`);

    if (!isFuture) {
      cell.addEventListener('click', () => {
        selectedCalDay = key;
        renderHistoryView();
      });
      cell.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectedCalDay = key;
          renderHistoryView();
        }
      });
    }

    grid.appendChild(cell);
  }
}

function renderDayDetail(dateStr) {
  const detailEl = $('day-detail');
  const date = parseDate(dateStr);
  $('day-detail-title').textContent = formatDisplayDate(date);

  const dayHabits = habitsForDate(dateStr);
  const list = $('day-detail-list');
  list.innerHTML = '';

  if (dayHabits.length === 0) {
    list.innerHTML = '<p style="color:var(--text2);font-size:14px;">No habits scheduled this day.</p>';
  } else {
    dayHabits.forEach(habit => {
      const done = isHabitDoneOnDate(habit.id, dateStr);
      const item = document.createElement('div');
      item.className = 'day-detail-item';

      const dot = document.createElement('div');
      dot.className = 'day-detail-dot';
      dot.style.background = habit.color || COLORS[5];

      const icon = document.createElement('span');
      icon.textContent = habit.icon || '⭐';
      icon.style.fontSize = '16px';

      const name = document.createElement('span');
      name.className = 'day-detail-name';
      name.textContent = habit.name;

      const status = document.createElement('span');
      status.className = `day-detail-status ${done ? 'done' : 'missed'}`;
      status.textContent = done ? 'Done' : 'Missed';

      item.appendChild(dot);
      item.appendChild(icon);
      item.appendChild(name);
      item.appendChild(status);
      list.appendChild(item);
    });
  }

  detailEl.hidden = false;
}

function prevMonth() {
  calendarDate.setMonth(calendarDate.getMonth() - 1);
  selectedCalDay = null;
  renderHistoryView();
}

function nextMonth() {
  calendarDate.setMonth(calendarDate.getMonth() + 1);
  selectedCalDay = null;
  renderHistoryView();
}

// ─── Habits Manage View ──────────────────────────────────────────────────

function renderHabitsManageView() {
  const list = $('habits-list');
  list.innerHTML = '';

  if (habits.length === 0) {
    $('habits-empty').hidden = false;
    list.hidden = true;
    return;
  }

  $('habits-empty').hidden = true;
  list.hidden = false;

  habits.forEach(habit => {
    const item = document.createElement('div');
    item.className = 'manage-habit-item';
    item.setAttribute('tabindex', '0');
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `Edit habit: ${habit.name}`);

    const dot = document.createElement('div');
    dot.className = 'manage-habit-dot';
    dot.style.background = habit.color || COLORS[5];

    const icon = document.createElement('span');
    icon.style.fontSize = '22px';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = habit.icon || '⭐';

    const info = document.createElement('div');
    info.className = 'manage-habit-info';

    const name = document.createElement('div');
    name.className = 'manage-habit-name';
    name.textContent = habit.name;

    const meta = document.createElement('div');
    meta.className = 'manage-habit-meta';
    const days = habit.days && habit.days.length < 7
      ? habit.days.map(d => DAY_NAMES[d]).join(', ')
      : 'Every day';
    const tod = TIME_LABELS[habit.timeOfDay || 'anytime'];
    meta.textContent = `${tod} · ${days}`;

    info.appendChild(name);
    info.appendChild(meta);

    const arrow = document.createElement('span');
    arrow.className = 'manage-habit-arrow';
    arrow.textContent = '›';
    arrow.setAttribute('aria-hidden', 'true');

    item.appendChild(dot);
    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(arrow);

    const openEdit = () => openHabitModal(habit.id);
    item.addEventListener('click', openEdit);
    item.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(); }
    });

    list.appendChild(item);
  });
}

// ─── Settings View ───────────────────────────────────────────────────────

function renderSettingsView() {
  updateProfileUI();
  // Sync dark toggle state with current mode
  const isDark = !document.body.classList.contains('light');
  const darkToggle = $('dark-mode-toggle');
  darkToggle.checked = isDark;
  darkToggle.setAttribute('aria-checked', isDark ? 'true' : 'false');

  // Notification toggle
  const notifEnabled = localStorage.getItem('notificationsEnabled') === 'true';
  $('notif-toggle').checked = notifEnabled && Notification.permission === 'granted';
  $('notif-toggle').setAttribute('aria-checked', $('notif-toggle').checked ? 'true' : 'false');
  updateNotifStatusLabel();
}

function updateProfileUI() {
  if (!currentUser) return;
  const name = currentUser.displayName || 'User';
  const email = currentUser.email || '';
  $('profile-name').textContent = name;
  $('profile-email').textContent = email;

  const avatarEl = $('profile-avatar');
  if (currentUser.photoURL) {
    avatarEl.innerHTML = `<img src="${currentUser.photoURL}" alt="${name}" width="56" height="56" />`;
  } else {
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }
}

// ─── Habit Modal ─────────────────────────────────────────────────────────

function openHabitModal(habitId) {
  editingHabitId = habitId;
  const overlay = $('habit-modal-overlay');
  const deleteBtn = $('modal-delete-btn');
  const title = $('modal-title');

  if (habitId) {
    // Editing existing
    title.textContent = 'Edit Habit';
    deleteBtn.hidden = false;
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    selectedEmoji = habit.icon || '⭐';
    $('emoji-btn').textContent = selectedEmoji;
    $('habit-name').value = habit.name || '';
    $('reminder-time').value = habit.reminderTime || '';

    // Time of day
    document.querySelectorAll('#tod-segment .segment-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === (habit.timeOfDay || 'anytime'));
    });

    // Days
    const activeDays = habit.days || [0,1,2,3,4,5,6];
    document.querySelectorAll('.day-btn').forEach(btn => {
      const active = activeDays.includes(parseInt(btn.dataset.day));
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    // Color
    selectedColor = habit.color || COLORS[5];
    updateColorSwatches();
  } else {
    // Adding new
    title.textContent = 'Add Habit';
    deleteBtn.hidden = true;
    selectedEmoji = '⭐';
    $('emoji-btn').textContent = selectedEmoji;
    $('habit-name').value = '';
    $('reminder-time').value = '';

    // Reset time of day to anytime
    document.querySelectorAll('#tod-segment .segment-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === 'anytime');
    });

    // Reset days to all
    document.querySelectorAll('.day-btn').forEach(btn => {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    });

    // Reset color
    selectedColor = COLORS[5];
    updateColorSwatches();
  }

  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  // Focus the name input after animation
  setTimeout(() => $('habit-name').focus(), 100);
}

function closeHabitModal() {
  $('habit-modal-overlay').hidden = true;
  document.body.style.overflow = '';
  editingHabitId = null;
}

async function saveHabit() {
  const name = $('habit-name').value.trim();
  if (!name) {
    $('habit-name').focus();
    $('habit-name').style.borderColor = 'var(--danger)';
    setTimeout(() => $('habit-name').style.borderColor = '', 1500);
    return;
  }
  if (!currentUser) return;

  const timeOfDay = document.querySelector('#tod-segment .segment-btn.active')?.dataset.value || 'anytime';
  const days = Array.from(document.querySelectorAll('.day-btn.active')).map(b => parseInt(b.dataset.day));
  const reminderTime = $('reminder-time').value || null;

  $('modal-save-btn').disabled = true;
  $('modal-save-btn').textContent = 'Saving...';

  try {
    if (editingHabitId) {
      // Update existing
      const ref = doc(db, 'users', currentUser.uid, 'habits', editingHabitId);
      await setDoc(ref, {
        name, icon: selectedEmoji, color: selectedColor,
        timeOfDay, days, reminderTime, active: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
      showToast('Habit updated');
    } else {
      // Create new
      const newId = crypto.randomUUID();
      const ref = doc(db, 'users', currentUser.uid, 'habits', newId);
      await setDoc(ref, {
        name, icon: selectedEmoji, color: selectedColor,
        timeOfDay, days, reminderTime, active: true,
        order: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      showToast('Habit added!');
    }
    closeHabitModal();
  } catch(err) {
    console.error('Save habit error:', err);
    showToast('Failed to save habit', 'error');
  } finally {
    $('modal-save-btn').disabled = false;
    $('modal-save-btn').textContent = 'Save';
  }
}

async function deleteHabit() {
  if (!editingHabitId || !currentUser) return;
  const habit = habits.find(h => h.id === editingHabitId);
  if (!confirm(`Delete "${habit?.name}"? This cannot be undone.`)) return;

  try {
    const ref = doc(db, 'users', currentUser.uid, 'habits', editingHabitId);
    await deleteDoc(ref);
    showToast('Habit deleted');
    closeHabitModal();
  } catch(err) {
    showToast('Failed to delete habit', 'error');
  }
}

// ─── Color swatches ──────────────────────────────────────────────────────

function buildColorSwatches() {
  const container = $('color-swatches');
  COLORS.forEach(color => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'color-swatch';
    btn.style.background = color;
    btn.setAttribute('aria-label', `Color ${color}`);
    btn.setAttribute('role', 'radio');
    btn.dataset.color = color;

    const check = document.createElement('span');
    check.className = 'color-swatch-check';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');
    btn.appendChild(check);

    btn.addEventListener('click', () => {
      selectedColor = color;
      updateColorSwatches();
    });

    container.appendChild(btn);
  });
  updateColorSwatches();
}

function updateColorSwatches() {
  document.querySelectorAll('.color-swatch').forEach(btn => {
    const isSelected = btn.dataset.color === selectedColor;
    btn.classList.toggle('selected', isSelected);
    btn.setAttribute('aria-checked', isSelected ? 'true' : 'false');
  });
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────

function buildEmojiGrid() {
  const grid = $('emoji-grid');
  EMOJIS.forEach(emoji => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-option';
    btn.textContent = emoji;
    btn.setAttribute('aria-label', emoji);
    btn.addEventListener('click', () => {
      selectedEmoji = emoji;
      $('emoji-btn').textContent = emoji;
      closeEmojiPicker();
    });
    grid.appendChild(btn);
  });
}

function openEmojiPicker() {
  $('emoji-picker-overlay').hidden = false;
}

function closeEmojiPicker() {
  $('emoji-picker-overlay').hidden = true;
}

// ─── Dark Mode ────────────────────────────────────────────────────────────

function applyDarkModePreference() {
  const saved = localStorage.getItem('darkMode');
  // Default to dark (Nothing aesthetic) unless user explicitly chose light
  applyDarkMode(saved !== 'light');
}

function applyDarkMode(isDark) {
  document.body.classList.toggle('light', !isDark);
  document.body.classList.remove('dark');
  // Update meta theme-color
  document.querySelector('meta[name="theme-color"]').content = isDark ? '#1e293b' : '#6366f1';
}

// ─── Notifications ────────────────────────────────────────────────────────

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Notifications not supported in this browser', 'error');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    showToast('Notifications blocked. Enable in browser settings.', 'error');
    return false;
  }
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    showToast('Notifications enabled!', 'success');
    return true;
  }
  showToast('Notification permission denied', 'error');
  return false;
}

function updateNotifStatusLabel() {
  const el = $('notif-status-sub');
  if (!('Notification' in window)) {
    el.textContent = 'Not supported in this browser';
    return;
  }
  if (Notification.permission === 'denied') {
    el.textContent = 'Blocked — enable in browser settings';
    return;
  }
  el.textContent = 'Habit reminders (requires tab to be open)';
}

async function scheduleNotifications() {
  if (Notification.permission !== 'granted') return;
  if (localStorage.getItem('notificationsEnabled') !== 'true') return;
  if (!navigator.serviceWorker?.controller) return;

  const habitsWithReminders = habits.filter(h => h.reminderTime && h.active);
  navigator.serviceWorker.controller.postMessage({
    type: 'SCHEDULE_NOTIFICATIONS',
    payload: { habits: habitsWithReminders.map(h => ({ ...h })) }
  });
}

function cancelNotifications() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_NOTIFICATIONS' });
}

// ─── Toast ────────────────────────────────────────────────────────────────

function showToast(message, type = '') {
  const container = $('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type ? `toast-${type}` : ''}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px) scale(0.9)';
    toast.style.transition = 'all 250ms ease';
    setTimeout(() => toast.remove(), 260);
  }, 2500);
}

// ─── Start ────────────────────────────────────────────────────────────────

init().catch(err => {
  console.error('Init error:', err);
  hide(loadingScreen);
  const authErr = $('auth-error');
  authErr.textContent = 'Failed to load: ' + err.message;
  show(authErr);
  show(authScreen);
});

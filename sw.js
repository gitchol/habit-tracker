// Service Worker for Habit Tracker PWA
// Handles offline caching and notification scheduling

const CACHE_NAME = 'habit-tracker-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icon.svg'
];

// URLs that should always go to the network (Firebase, Google auth)
const NETWORK_ONLY_PATTERNS = [
  'firebaseapp.com',
  'firebase.google.com',
  'googleapis.com',
  'gstatic.com',
  'accounts.google.com',
  'securetoken.google.com',
  'identitytoolkit.googleapis.com',
  'firestore.googleapis.com'
];

// ─── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(APP_SHELL);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// ─── Activate ──────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// ─── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Always use network for Firebase/Google URLs
  if (NETWORK_ONLY_PATTERNS.some(pattern => url.includes(pattern))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first strategy for app shell
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cache successful GET responses
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: return index.html for navigation requests
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
      });
    })
  );
});

// ─── Message Handler ────────────────────────────────────────────────────────
// Handles notification scheduling from the main app

const scheduledTimeouts = new Map();

self.addEventListener('message', event => {
  const { type, payload } = event.data || {};

  if (type === 'SCHEDULE_NOTIFICATIONS') {
    // Clear all existing scheduled notifications
    scheduledTimeouts.forEach(id => clearTimeout(id));
    scheduledTimeouts.clear();

    const habits = payload.habits || [];
    habits.forEach(habit => {
      if (!habit.reminderTime || !habit.active) return;

      const [hours, minutes] = habit.reminderTime.split(':').map(Number);
      const now = new Date();
      const scheduled = new Date();
      scheduled.setHours(hours, minutes, 0, 0);

      // If time has passed today, schedule for tomorrow
      if (scheduled <= now) {
        scheduled.setDate(scheduled.getDate() + 1);
      }

      const delay = scheduled.getTime() - now.getTime();
      const timeoutId = setTimeout(() => {
        const dayOfWeek = scheduled.getDay();
        if (!habit.days || habit.days.includes(dayOfWeek)) {
          self.registration.showNotification('Habit Reminder', {
            body: `Time to: ${habit.icon || ''} ${habit.name}`,
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: `habit-${habit.id}`,
            renotify: true,
            requireInteraction: false,
            data: { habitId: habit.id }
          });
        }
        // Reschedule for next day
        scheduledTimeouts.delete(habit.id);
      }, delay);

      scheduledTimeouts.set(habit.id, timeoutId);
    });

    event.ports?.[0]?.postMessage({ status: 'scheduled', count: habits.filter(h => h.reminderTime && h.active).length });
  }

  if (type === 'CLEAR_NOTIFICATIONS') {
    scheduledTimeouts.forEach(id => clearTimeout(id));
    scheduledTimeouts.clear();
  }
});

// ─── Notification Click ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing tab if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

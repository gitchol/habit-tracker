# Habit Tracker PWA

A mobile-first Progressive Web App for tracking daily habits with cross-device sync via Firebase Firestore. Install it to your phone home screen for a native app experience.

---

## Features

- **Cross-device sync** via Firebase Firestore
- **Google Sign-In** — same data on all your devices
- **Streak tracking** — consecutive day counts with 🔥 indicators
- **Four views**: Today, History (monthly calendar), Manage Habits, Settings
- **Dark mode** — auto-detects system preference, manual toggle
- **Habit reminders** — optional notification times per habit
- **PWA installable** — works offline, installs to home screen
- **Mobile-first** — large tap targets (72px min height), haptic feedback

---

## Setup Instructions

### Step 1 — Create a Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"**
3. Enter a project name (e.g. "my-habit-tracker")
4. Disable Google Analytics (optional) → **"Create project"**

### Step 2 — Enable Firestore Database

1. In the Firebase console left sidebar, click **"Firestore Database"**
2. Click **"Create database"**
3. Choose **"Start in production mode"** → Next
4. Select a region closest to you → **"Enable"**

### Step 3 — Enable Google Sign-In

1. In the left sidebar, click **"Authentication"**
2. Click **"Get started"**
3. Under **"Sign-in method"**, click **"Google"**
4. Toggle the **Enable** switch → **"Save"**
5. Make sure your app's domain is in the **Authorized domains** list (Firebase adds `localhost` automatically; add your hosted domain when you deploy)

### Step 4 — Get Your Web App Config

1. Go to **Project Settings** (gear icon in top-left) → **"General"** tab
2. Scroll down to **"Your apps"** → click **"</> Web"** (or select your existing web app)
3. Register the app with a nickname → continue
4. Copy the `firebaseConfig` object — it looks like:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "my-project.firebaseapp.com",
  projectId: "my-project",
  storageBucket: "my-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### Step 5 — Paste Config into app.js

Open `app.js` and replace the placeholder block at the top:

```js
// ===== FIREBASE CONFIG - REPLACE WITH YOUR OWN =====
const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",         // ← replace this
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
```

Replace each `"YOUR_..."` value with the actual value from your Firebase config.

### Step 6 — Set Firestore Security Rules

1. In the Firebase console, go to **Firestore Database** → **"Rules"** tab
2. Replace the existing rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Click **"Publish"**

These rules ensure each user can only read and write their own data.

---

## Hosting

### Option A — GitHub Pages (Free, Easy)

1. Create a new repository on [github.com](https://github.com) (e.g. `habit-tracker`)
2. Upload all files in this folder to the repository root
3. Go to **Settings** → **Pages** → set source to **"Deploy from a branch"** → **main branch** → **/ (root)**
4. Your app will be live at `https://yourusername.github.io/habit-tracker/`
5. In Firebase console → Authentication → **Authorized domains** → **"Add domain"** → add `yourusername.github.io`

### Option B — Netlify (Free, Drag & Drop)

1. Go to [netlify.com](https://netlify.com) and sign in
2. Drag the entire `habit-tracker` folder onto the Netlify dashboard
3. Your app gets a URL like `https://random-name.netlify.app`
4. Add that domain to Firebase Auth **Authorized domains**

### Option C — Vercel (Free)

1. Install Vercel CLI: `npm install -g vercel`
2. Run `vercel` in this folder and follow prompts
3. Add the deployment domain to Firebase Auth **Authorized domains**

### Option D — Local / Self-hosted

You need a web server (not just opening the file in a browser) because:
- ES modules require HTTP/HTTPS
- Service workers require HTTP/HTTPS or localhost

Use any of these locally:
```bash
# Python
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code
# Install "Live Server" extension, right-click index.html → "Open with Live Server"
```

Then open `http://localhost:8080` in your browser.

---

## Firestore Data Structure

```
users/
  {uid}/
    habits/
      {habitId}:
        name:         string
        icon:         string (emoji)
        color:        string (hex)
        timeOfDay:    "morning" | "afternoon" | "evening" | "anytime"
        days:         number[]  (0=Sun, 1=Mon, ..., 6=Sat)
        reminderTime: string | null  ("HH:MM" format)
        active:       boolean
        order:        number  (timestamp for sorting)
        createdAt:    timestamp
        updatedAt:    timestamp

    completions/
      {YYYY-MM-DD}:
        date:  string  ("YYYY-MM-DD")
        done:  { [habitId]: ISO timestamp string }
```

---

## PWA Installation

### On iPhone/iPad (Safari)
1. Open the app URL in Safari
2. Tap the **Share** button (box with arrow)
3. Scroll down → tap **"Add to Home Screen"**
4. Tap **"Add"**

### On Android (Chrome)
1. Open the app URL in Chrome
2. Tap the **three-dot menu** → **"Add to Home screen"**
   (or tap the install prompt banner if it appears)
3. Tap **"Add"**

### On Desktop (Chrome/Edge)
1. Open the app URL
2. Look for the install icon in the address bar (⊕ or computer icon)
3. Click **"Install"**

---

## Notification Limitations

Browser notifications in PWAs have limitations:
- **Reminders only fire while the browser tab is open** (or the app is installed)
- iOS Safari has limited notification support in PWAs
- Android Chrome has the best PWA notification support when installed

For best notification reliability, **install the app** to your device's home screen.

---

## Customization

- **Colors**: Edit the `COLORS` array in `app.js` to change the 8 habit color options
- **Emojis**: Edit the `EMOJIS` array in `app.js` to change the emoji picker options
- **Theme**: Edit CSS variables in `styles.css` to change the color scheme
- **Streak logic**: The `calcStreak()` function in `app.js` — currently counts consecutive completed days, skipping unscheduled days

---

## File Structure

```
habit-tracker/
├── index.html       — App shell HTML
├── styles.css       — All styles (mobile-first, dark mode)
├── app.js           — App logic + Firebase integration
├── sw.js            — Service worker (caching + notifications)
├── manifest.json    — PWA manifest
├── icon.svg         — App icon
└── README.md        — This file
```

---

## Free Firebase Limits (Spark Plan)

The free Spark plan is more than enough for personal use:
- **Firestore**: 1 GB storage, 50K reads/day, 20K writes/day
- **Authentication**: Unlimited sign-ins
- **Hosting** (if used): 10 GB storage, 360 MB/day transfer

---

## Troubleshooting

**"Setup Required" screen shows** → Open `app.js` and replace all `YOUR_...` values in `FIREBASE_CONFIG`

**"Permission denied" error in console** → Check your Firestore security rules (Step 6 above)

**Google sign-in popup blocked** → Allow popups for your site in browser settings, or check that your domain is in Firebase Auth Authorized domains

**App won't install as PWA** → Must be served over HTTPS (or localhost). GitHub Pages and Netlify both provide HTTPS automatically

**Changes not reflecting** → The service worker caches files. Hard-refresh with Ctrl+Shift+R (Cmd+Shift+R on Mac) or open DevTools → Application → Service Workers → "Update"

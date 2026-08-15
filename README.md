# YouTube FocusGuard

**Stay focused. Watch intentionally.**

A lightweight Chrome extension (Manifest V3) that helps you reduce distractions on YouTube while studying, working, or focusing — no accounts, no backend, no tracking.

---

## Description

YouTube FocusGuard adds a "Focus Mode" to YouTube. When it's on, you can selectively block Shorts, hide recommendations, disable autoplay, and hide comments, all controlled from a clean popup. It also includes a background-persistent Focus Timer with desktop notifications.

Everything runs locally in your browser using `chrome.storage`. No data ever leaves your machine.

---

## Features

- **Focus Mode** — master switch that activates all enabled blocking features and shows a small on-page badge confirming FocusGuard is active.
- **Block Shorts** — hides Shorts shelves/links on the homepage and sidebar, and shows a friendly block screen if you open a `youtube.com/shorts/...` URL directly.
- **Hide Recommendations** — hides the homepage feed and the "related/up next" sidebar on watch pages, without touching the video player or search results.
- **Block Autoplay** — automatically turns off YouTube's native "Autoplay" toggle so the next video won't play itself.
- **Hide Comments** — hides the comments section under videos.
- **Focus Timer** — 15/25/45/60-minute presets plus a custom duration, with Start/Pause/Resume/Reset controls. Runs in the background service worker so it keeps counting down even if you close the popup, and shows a Chrome notification when the session ends.
- **Settings** — every toggle persists via `chrome.storage.local` across page refreshes, popup closes, and Chrome restarts. Includes a one-click "Reset Settings" button.

---

## Technologies

- HTML5
- CSS3
- Vanilla JavaScript
- Chrome Extension Manifest V3
- Chrome Storage API (`chrome.storage.local`)
- Chrome Alarms & Notifications API
- MutationObserver

No frameworks, no build tools, no backend, no database.

---

## Installation (Windows + VS Code + Chrome)

1. Download or extract the `youtube-focusguard` project folder somewhere on your computer (e.g. `Documents\youtube-focusguard`).
2. Open the folder in VS Code (`File → Open Folder…`) if you want to inspect or edit the code.
3. Open Google Chrome.
4. Go to `chrome://extensions` in the address bar.
5. Turn on **Developer mode** using the toggle in the top-right corner.
6. Click **Load unpacked**.
7. Select the `youtube-focusguard` folder (the one containing `manifest.json`).
8. The extension should now appear in your extensions list. Click the puzzle-piece icon in Chrome's toolbar and **pin** YouTube FocusGuard for easy access.
9. Open `youtube.com`, then click the FocusGuard icon to open the popup.

---

## Usage

1. Click the FocusGuard icon in your toolbar.
2. Toggle **Focus Mode** on — this is the master switch.
3. Toggle individual features (Block Shorts, Hide Recommendations, Block Autoplay, Hide Comments) on or off as you like. They only take effect while Focus Mode is on.
4. Optionally start a **Focus Timer**: pick a preset or enter a custom number of minutes, then click **Start**. You'll get a notification when it finishes, even if the popup is closed.
5. Click **Reset Settings** at any time to restore the defaults.

---

## Testing Checklist

- **Focus Mode**: Turn it on/off and confirm the small red "FocusGuard Active" badge appears/disappears in the top-right of YouTube pages.
- **Shorts**: With Focus Mode + Block Shorts on, confirm Shorts shelves are hidden on the homepage, and that navigating to a `youtube.com/shorts/...` link shows the FocusGuard block screen instead of playing the Short.
- **Recommendations**: With Hide Recommendations on, confirm the homepage feed and the "related videos" sidebar on a watch page are hidden, while the video player and search results still work normally.
- **Autoplay**: With Block Autoplay on, open a video, confirm YouTube's own Autoplay toggle (near the end-screen/up-next panel) switches off automatically.
- **Comments**: With Hide Comments on, confirm the comments section under a video is hidden; turn it off and confirm comments reappear on refresh.
- **Timer**: Start a short custom timer (e.g. 1 minute), close the popup, wait, and confirm you get a "Focus session complete!" notification. Reopen the popup mid-countdown and confirm the time shown is accurate.
- **Settings persistence**: Change several settings, close the popup, refresh YouTube, and even restart Chrome — confirm your settings are still applied.

---

## How Each Feature Works

- **Focus Mode**: Stored in `chrome.storage.local` as `focusGuardSettings.focusMode`. The content script listens for storage changes and toggles a `fg-focus-mode` class on `<html>`, which other rules key off of.
- **Shorts blocking**: A mix of CSS (hiding known Shorts shelf/link elements) and a small JS check that detects `/shorts/...` URLs and displays a full-page overlay instead of letting the Short play.
- **Recommendation hiding**: CSS rules scoped specifically to the homepage feed container and the watch-page "related videos" sidebar, so search results and the player are never touched.
- **Autoplay control**: The content script looks for YouTube's own autoplay toggle button and clicks it off if it's on — FocusGuard doesn't reimplement autoplay logic, it just uses YouTube's existing control.
- **Comments hiding**: A single CSS rule hides the `ytd-comments#comments` element when the setting is on.
- **Focus Timer**: The countdown state (`status`, `endTime`, `remainingSeconds`) lives in `chrome.storage.local` and is driven by the background service worker using `chrome.alarms`, so it survives the popup closing. The popup just displays/reads that state.
- **Settings**: A single object in `chrome.storage.local` under the key `focusGuardSettings`, read by both the popup and the content script.

### Known limitation

YouTube frequently changes its internal DOM structure and CSS class names. Selectors are centralized at the top of `content.js` and `content.css` with comments and fallback selectors so they're easy to update if a specific rule stops matching. If something doesn't get hidden after a YouTube update, that's the first place to look.

---

## Common Errors & Troubleshooting

**"Extension failed to load" / manifest errors**
Make sure you selected the folder that directly contains `manifest.json` (not a parent or child folder), and that you haven't renamed any of the referenced files (`popup.html`, `content.js`, etc.).

**Popup doesn't open**
Confirm the extension is enabled on `chrome://extensions`, and that there's no red "Errors" button showing on the extension's card — click it to see details.

**Features aren't affecting YouTube**
1. Make sure **Focus Mode** is switched on — sub-features do nothing while it's off.
2. Refresh the YouTube tab after installing or updating the extension (content scripts only load into new page loads).
3. Open DevTools (`F12`) → Console on the YouTube tab and check for errors mentioning `content.js`.

**Changes to the code aren't appearing**
After editing any file, go to `chrome://extensions`, click the refresh/reload icon on the FocusGuard card, then refresh the YouTube tab.

**Timer notification didn't appear**
Check that Chrome notifications are allowed for your OS/browser (Windows notification settings, or `chrome://settings/content/notifications`). The timer state itself is still tracked correctly even if the OS notification is suppressed.

---

## Pushing to GitHub

1. Open a terminal in the `youtube-focusguard` folder (in VS Code: `Terminal → New Terminal`).
2. Initialize git (skip if already a repo):
   ```
   git init
   ```
3. Create a `.gitignore` if you like (optional — this project has no build artifacts to ignore).
4. Stage and commit your files:
   ```
   git add .
   git commit -m "Initial commit: YouTube FocusGuard extension"
   ```
5. Create a new empty repository on GitHub (via github.com → New repository). Don't initialize it with a README since you already have one.
6. Link your local repo to GitHub and push:
   ```
   git remote add origin https://github.com/YOUR_USERNAME/youtube-focusguard.git
   git branch -M main
   git push -u origin main
   ```
7. Refresh your GitHub repository page to confirm all files uploaded correctly.

---

## Privacy & Safety

FocusGuard only modifies the visual layout of YouTube pages you visit. It does not download videos, access your account or passwords, collect browsing history, send data to any server, or interfere with any other websites.

/* ==========================================================================
   YouTube FocusGuard - content.js

   Runs on youtube.com. Reads the user's settings from chrome.storage.local
   and applies distraction-blocking rules to the page.

   Design notes:
   - Most hiding is done with CSS classes toggled on <html>, matched against
     rules in content.css. CSS is cheap and doesn't require re-scanning the
     DOM on every mutation.
   - A small amount of JavaScript handles things CSS can't: redirecting/
     blocking the Shorts player page, turning off YouTube's native autoplay
     toggle, and showing a "Focus Mode is active" badge.
   - A single, debounced MutationObserver re-applies the JS-only rules after
     YouTube's SPA navigation and dynamic content loading. We deliberately
     avoid setInterval polling loops.
   ========================================================================== */

(function () {
  "use strict";

  const SETTINGS_KEY = "focusGuardSettings";

  const DEFAULT_SETTINGS = {
    focusMode: false,
    blockShorts: true,
    hideRecommendations: true,
    blockAutoplay: true,
    hideComments: false,
  };

  let currentSettings = Object.assign({}, DEFAULT_SETTINGS);

  // Centralized selectors so they're easy to update if YouTube changes
  // its markup. Each entry lists fallback selectors — the first ones that
  // exist on the page are used.
  const SELECTORS = {
    // The native autoplay toggle switch on the watch page.
    autoplayToggle: [
      "ytd-autoplay-switch-button-renderer #toggle",
      "ytd-autoplay-switch-button-renderer button",
      "#movie_player .ytp-autonav-toggle-button",
    ],
    // Containers that only ever hold Shorts content — safe to hide entirely.
    shortsContainers: [
      "ytd-rich-shelf-renderer[is-shorts]",
      "ytd-reel-shelf-renderer",
      "ytd-guide-entry-renderer:has(a[title='Shorts'])",
      "ytd-mini-guide-entry-renderer:has(a[title='Shorts'])",
      "a[title='Shorts']",
    ],
  };

  /* ------------------------------------------------------------------
     Settings loading + reacting to changes
     ------------------------------------------------------------------ */

  function loadSettingsAndApply() {
    chrome.storage.local.get([SETTINGS_KEY], (result) => {
      currentSettings = Object.assign({}, DEFAULT_SETTINGS, result[SETTINGS_KEY] || {});
      applyAllRules();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return;
    currentSettings = Object.assign({}, DEFAULT_SETTINGS, changes[SETTINGS_KEY].newValue || {});
    applyAllRules();
  });

  /* ------------------------------------------------------------------
     Effective flags: sub-features only take effect while Focus Mode is on
     ------------------------------------------------------------------ */

  function getEffectiveFlags() {
    const focusMode = !!currentSettings.focusMode;
    return {
      focusMode,
      blockShorts: focusMode && !!currentSettings.blockShorts,
      hideRecommendations: focusMode && !!currentSettings.hideRecommendations,
      blockAutoplay: focusMode && !!currentSettings.blockAutoplay,
      hideComments: focusMode && !!currentSettings.hideComments,
    };
  }

  /* ------------------------------------------------------------------
     Apply / remove CSS classes on <html> — the cheap, declarative part
     ------------------------------------------------------------------ */

  function applyHtmlClasses(flags) {
    const root = document.documentElement;
    root.classList.toggle("fg-focus-mode", flags.focusMode);
    root.classList.toggle("fg-block-shorts", flags.blockShorts);
    root.classList.toggle("fg-hide-recommendations", flags.hideRecommendations);
    root.classList.toggle("fg-hide-comments", flags.hideComments);
  }

  /* ------------------------------------------------------------------
     Focus Mode badge — clear visual indicator that FocusGuard is active
     ------------------------------------------------------------------ */

  function updateFocusBadge(flags) {
    let badge = document.getElementById("focusguard-badge");

    if (!flags.focusMode) {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement("div");
      badge.id = "focusguard-badge";
      badge.textContent = "🛡 FocusGuard Active";
      document.body.appendChild(badge);
    }
  }

  /* ------------------------------------------------------------------
     Shorts: block the /shorts/ watch page with a friendly overlay
     ------------------------------------------------------------------ */

  function handleShortsPage(flags) {
    const isShortsUrl = /^\/shorts\//.test(window.location.pathname);
    let overlay = document.getElementById("focusguard-shorts-block");

    if (isShortsUrl && flags.blockShorts) {
      if (!overlay) {
        overlay = buildShortsOverlay();
        document.body.appendChild(overlay);
      }
      document.documentElement.classList.add("fg-shorts-blocked");
    } else {
      if (overlay) overlay.remove();
      document.documentElement.classList.remove("fg-shorts-blocked");
    }
  }

  function buildShortsOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "focusguard-shorts-block";

    const box = document.createElement("div");
    box.className = "focusguard-shorts-box";

    const title = document.createElement("h2");
    title.textContent = "🛡 Shorts are blocked";

    const message = document.createElement("p");
    message.textContent =
      "FocusGuard is helping you stay focused. Shorts are turned off while Focus Mode is on.";

    const homeBtn = document.createElement("button");
    homeBtn.textContent = "Go to YouTube Home";
    homeBtn.addEventListener("click", () => {
      window.location.href = "https://www.youtube.com/";
    });

    box.appendChild(title);
    box.appendChild(message);
    box.appendChild(homeBtn);
    overlay.appendChild(box);
    return overlay;
  }

  /* ------------------------------------------------------------------
     Shorts shelves / links that need JS because :has() support or
     dynamic insertion makes pure CSS unreliable in some layouts
     ------------------------------------------------------------------ */

  function hideShortsElements(flags) {
    if (!flags.blockShorts) return;

    for (const selector of SELECTORS.shortsContainers) {
      let matches;
      try {
        matches = document.querySelectorAll(selector);
      } catch (err) {
        // Selector not supported in this Chrome version — skip safely.
        continue;
      }
      matches.forEach((el) => {
        // Hide the closest reasonable ancestor "card" instead of just the
        // link/element, so we don't leave an empty shelf behind.
        const target =
          el.closest("ytd-rich-item-renderer, ytd-video-renderer, ytd-guide-entry-renderer") || el;
        target.classList.add("fg-hidden");
      });
    }
  }

  /* ------------------------------------------------------------------
     Autoplay: click YouTube's own toggle off when Block Autoplay is on
     ------------------------------------------------------------------ */

  function enforceAutoplaySetting(flags) {
    if (!flags.blockAutoplay) return;

    for (const selector of SELECTORS.autoplayToggle) {
      const toggle = document.querySelector(selector);
      if (!toggle) continue;

      const isOn =
        toggle.getAttribute("aria-checked") === "true" ||
        toggle.getAttribute("aria-pressed") === "true" ||
        toggle.classList.contains("ytp-autonav-toggle-button-active");

      if (isOn) {
        toggle.click();
      }
      break;
    }
  }

  /* ------------------------------------------------------------------
     Apply everything (called on load, on storage change, and after
     debounced DOM mutations / SPA navigation)
     ------------------------------------------------------------------ */

  function applyAllRules() {
    const flags = getEffectiveFlags();
    applyHtmlClasses(flags);
    updateFocusBadge(flags);
    handleShortsPage(flags);
    hideShortsElements(flags);
    enforceAutoplaySetting(flags);
  }

  /* ------------------------------------------------------------------
     SPA navigation handling
     YouTube fires a "yt-navigate-finish" custom event on its SPA
     navigations. We also listen to popstate as a fallback.
     ------------------------------------------------------------------ */

  window.addEventListener("yt-navigate-finish", () => {
    applyAllRules();
  });

  window.addEventListener("popstate", () => {
    applyAllRules();
  });

  /* ------------------------------------------------------------------
     Debounced MutationObserver
     Re-applies the JS-only rules when YouTube injects new content
     (infinite scroll, lazy-loaded shelves, SPA re-renders) without
     re-scanning on every single tiny DOM change.
     ------------------------------------------------------------------ */

  let debounceTimer = null;
  function scheduleReapply() {
    if (debounceTimer) return;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const flags = getEffectiveFlags();
      handleShortsPage(flags);
      hideShortsElements(flags);
      enforceAutoplaySetting(flags);
    }, 400);
  }

  function startObserver() {
    const target = document.body || document.documentElement;
    const observer = new MutationObserver((mutations) => {
      // Ignore mutations caused by our own badge/overlay insertions.
      const relevant = mutations.some((m) => {
        return ![...m.addedNodes].every(
          (node) =>
            node.id === "focusguard-badge" || node.id === "focusguard-shorts-block"
        );
      });
      if (relevant) scheduleReapply();
    });

    observer.observe(target, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------------
     Init
     ------------------------------------------------------------------ */

  function init() {
    loadSettingsAndApply();

    if (document.body) {
      startObserver();
    } else {
      document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    }
  }

  init();
})();

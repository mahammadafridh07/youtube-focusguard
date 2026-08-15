/* ==========================================================================
   YouTube FocusGuard - popup.js
   Handles the popup UI: settings toggles and the focus timer controls.
   All state is persisted through chrome.storage.local so it survives
   popup close, YouTube refreshes, and Chrome restarts.
   ========================================================================== */

const SETTINGS_KEY = "focusGuardSettings";

const DEFAULT_SETTINGS = {
  focusMode: false,
  blockShorts: true,
  hideRecommendations: true,
  blockAutoplay: true,
  hideComments: false,
};

// ---- DOM references ----------------------------------------------------
const focusModeToggle = document.getElementById("focusModeToggle");
const focusModeCard = document.getElementById("focusModeCard");
const focusModeStatusText = document.getElementById("focusModeStatusText");

const blockShortsToggle = document.getElementById("blockShortsToggle");
const hideRecommendationsToggle = document.getElementById("hideRecommendationsToggle");
const blockAutoplayToggle = document.getElementById("blockAutoplayToggle");
const hideCommentsToggle = document.getElementById("hideCommentsToggle");

const resetSettingsBtn = document.getElementById("resetSettingsBtn");

const timerDisplay = document.getElementById("timerDisplay");
const timerStateText = document.getElementById("timerStateText");
const presetButtons = document.querySelectorAll(".preset-btn");
const customMinutesInput = document.getElementById("customMinutes");
const setCustomBtn = document.getElementById("setCustomBtn");
const startBtn = document.getElementById("startBtn");
const pauseResumeBtn = document.getElementById("pauseResumeBtn");
const resetBtn = document.getElementById("resetBtn");

let tickIntervalId = null;
let selectedDurationSeconds = 25 * 60; // default preset (25 minutes)

/* ==========================================================================
   SETTINGS
   ========================================================================== */

function loadSettings() {
  chrome.storage.local.get([SETTINGS_KEY], (result) => {
    const settings = Object.assign({}, DEFAULT_SETTINGS, result[SETTINGS_KEY] || {});
    applySettingsToUI(settings);
  });
}

function applySettingsToUI(settings) {
  focusModeToggle.checked = settings.focusMode;
  blockShortsToggle.checked = settings.blockShorts;
  hideRecommendationsToggle.checked = settings.hideRecommendations;
  blockAutoplayToggle.checked = settings.blockAutoplay;
  hideCommentsToggle.checked = settings.hideComments;
  updateFocusModeCardStyle(settings.focusMode);
}

function updateFocusModeCardStyle(isOn) {
  if (isOn) {
    focusModeCard.classList.add("active");
    focusModeStatusText.textContent = "Active — distractions blocked";
  } else {
    focusModeCard.classList.remove("active");
    focusModeStatusText.textContent = "Off";
  }
}

function saveSettingsPatch(patch) {
  chrome.storage.local.get([SETTINGS_KEY], (result) => {
    const current = Object.assign({}, DEFAULT_SETTINGS, result[SETTINGS_KEY] || {});
    const updated = Object.assign({}, current, patch);
    chrome.storage.local.set({ [SETTINGS_KEY]: updated }, () => {
      applySettingsToUI(updated);
    });
  });
}

focusModeToggle.addEventListener("change", () => {
  saveSettingsPatch({ focusMode: focusModeToggle.checked });
});

blockShortsToggle.addEventListener("change", () => {
  saveSettingsPatch({ blockShorts: blockShortsToggle.checked });
});

hideRecommendationsToggle.addEventListener("change", () => {
  saveSettingsPatch({ hideRecommendations: hideRecommendationsToggle.checked });
});

blockAutoplayToggle.addEventListener("change", () => {
  saveSettingsPatch({ blockAutoplay: blockAutoplayToggle.checked });
});

hideCommentsToggle.addEventListener("change", () => {
  saveSettingsPatch({ hideComments: hideCommentsToggle.checked });
});

resetSettingsBtn.addEventListener("click", () => {
  chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS }, () => {
    applySettingsToUI(DEFAULT_SETTINGS);
  });
});

/* ==========================================================================
   FOCUS TIMER
   The actual countdown lives in the background service worker so it keeps
   running even when this popup is closed. This script only displays the
   current state and sends control messages.
   ========================================================================== */

function formatSeconds(totalSeconds) {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setPresetActive(minutes) {
  presetButtons.forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.minutes) === minutes);
  });
}

presetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const minutes = Number(btn.dataset.minutes);
    selectedDurationSeconds = minutes * 60;
    setPresetActive(minutes);
    timerDisplay.textContent = formatSeconds(selectedDurationSeconds);
    customMinutesInput.value = "";
  });
});

setCustomBtn.addEventListener("click", () => {
  const minutes = Number(customMinutesInput.value);
  if (!minutes || minutes <= 0) {
    return;
  }
  selectedDurationSeconds = Math.round(minutes * 60);
  setPresetActive(-1); // deselect presets
  timerDisplay.textContent = formatSeconds(selectedDurationSeconds);
});

startBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage(
    { type: "TIMER_START", durationSeconds: selectedDurationSeconds },
    () => refreshTimerUI()
  );
});

pauseResumeBtn.addEventListener("click", () => {
  const action = pauseResumeBtn.textContent.trim() === "Pause" ? "TIMER_PAUSE" : "TIMER_RESUME";
  chrome.runtime.sendMessage({ type: action }, () => refreshTimerUI());
});

resetBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "TIMER_RESET" }, () => {
    selectedDurationSeconds = 25 * 60;
    setPresetActive(25);
    refreshTimerUI();
  });
});

function refreshTimerUI() {
  chrome.runtime.sendMessage({ type: "TIMER_GET_STATE" }, (state) => {
    if (!state) return;
    renderTimerState(state);
  });
}

function renderTimerState(state) {
  clearInterval(tickIntervalId);

  if (state.status === "running") {
    const remaining = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
    timerDisplay.textContent = formatSeconds(remaining);
    timerStateText.textContent = "Running";
    startBtn.disabled = true;
    pauseResumeBtn.disabled = false;
    pauseResumeBtn.textContent = "Pause";

    tickIntervalId = setInterval(() => {
      const secsLeft = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
      timerDisplay.textContent = formatSeconds(secsLeft);
      if (secsLeft <= 0) {
        clearInterval(tickIntervalId);
        refreshTimerUI();
      }
    }, 1000);
  } else if (state.status === "paused") {
    timerDisplay.textContent = formatSeconds(state.remainingSeconds);
    timerStateText.textContent = "Paused";
    startBtn.disabled = true;
    pauseResumeBtn.disabled = false;
    pauseResumeBtn.textContent = "Resume";
  } else {
    // idle or completed
    selectedDurationSeconds = state.durationSeconds || selectedDurationSeconds;
    timerDisplay.textContent = formatSeconds(selectedDurationSeconds);
    timerStateText.textContent = state.status === "completed" ? "Session complete!" : "Ready";
    startBtn.disabled = false;
    pauseResumeBtn.disabled = true;
    pauseResumeBtn.textContent = "Pause";
  }
}

/* ==========================================================================
   INIT
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  setPresetActive(25);
  refreshTimerUI();
});

/* ==========================================================================
   YouTube FocusGuard - background.js (Manifest V3 service worker)

   Responsible for:
   - Running the Focus Timer independently of the popup, so it keeps
     counting down even after the popup is closed.
   - Persisting timer state in chrome.storage.local.
   - Firing a chrome.alarms alarm + notification when the timer completes.
   ========================================================================== */

const TIMER_KEY = "focusGuardTimer";
const ALARM_NAME = "focusGuardTimerComplete";
const DEFAULT_DURATION_SECONDS = 25 * 60;

const DEFAULT_TIMER_STATE = {
  status: "idle", // "idle" | "running" | "paused" | "completed"
  durationSeconds: DEFAULT_DURATION_SECONDS,
  endTime: null, // epoch ms, only meaningful while running
  remainingSeconds: DEFAULT_DURATION_SECONDS, // meaningful while paused/idle
};

function getTimerState() {
  return new Promise((resolve) => {
    chrome.storage.local.get([TIMER_KEY], (result) => {
      resolve(Object.assign({}, DEFAULT_TIMER_STATE, result[TIMER_KEY] || {}));
    });
  });
}

function setTimerState(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [TIMER_KEY]: state }, resolve);
  });
}

/* ---- Message handling from popup.js ------------------------------------ */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // keep the message channel open for the async response
});

async function handleMessage(message) {
  switch (message.type) {
    case "TIMER_START":
      return startTimer(message.durationSeconds || DEFAULT_DURATION_SECONDS);
    case "TIMER_PAUSE":
      return pauseTimer();
    case "TIMER_RESUME":
      return resumeTimer();
    case "TIMER_RESET":
      return resetTimer();
    case "TIMER_GET_STATE":
      return getTimerState();
    default:
      return null;
  }
}

async function startTimer(durationSeconds) {
  const endTime = Date.now() + durationSeconds * 1000;
  const state = {
    status: "running",
    durationSeconds,
    endTime,
    remainingSeconds: durationSeconds,
  };
  await setTimerState(state);
  scheduleAlarm(durationSeconds);
  return state;
}

async function pauseTimer() {
  const state = await getTimerState();
  if (state.status !== "running") return state;

  const remainingSeconds = Math.max(0, Math.round((state.endTime - Date.now()) / 1000));
  const newState = Object.assign({}, state, {
    status: "paused",
    remainingSeconds,
    endTime: null,
  });
  await setTimerState(newState);
  chrome.alarms.clear(ALARM_NAME);
  return newState;
}

async function resumeTimer() {
  const state = await getTimerState();
  if (state.status !== "paused") return state;

  const endTime = Date.now() + state.remainingSeconds * 1000;
  const newState = Object.assign({}, state, {
    status: "running",
    endTime,
  });
  await setTimerState(newState);
  scheduleAlarm(state.remainingSeconds);
  return newState;
}

async function resetTimer() {
  const state = await getTimerState();
  const newState = Object.assign({}, DEFAULT_TIMER_STATE, {
    durationSeconds: state.durationSeconds,
    remainingSeconds: state.durationSeconds,
  });
  await setTimerState(newState);
  chrome.alarms.clear(ALARM_NAME);
  return newState;
}

function scheduleAlarm(durationSeconds) {
  chrome.alarms.clear(ALARM_NAME, () => {
    // Chrome alarms use minutes; convert and enforce a sane minimum so
    // very short custom timers still fire (Chrome may round up to ~1 min
    // for packed/production extensions).
    const delayInMinutes = Math.max(durationSeconds / 60, 0.017); // ~1 second floor
    chrome.alarms.create(ALARM_NAME, { delayInMinutes });
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  const state = await getTimerState();
  const completedState = Object.assign({}, state, {
    status: "completed",
    endTime: null,
    remainingSeconds: 0,
  });
  await setTimerState(completedState);

  chrome.notifications.create("focusGuardComplete", {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "Focus session complete!",
    message: "Great job staying focused.",
    priority: 2,
  });
});

/* ---- Initialize default settings on install ----------------------------- */

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["focusGuardSettings"], (result) => {
    if (!result.focusGuardSettings) {
      chrome.storage.local.set({
        focusGuardSettings: {
          focusMode: false,
          blockShorts: true,
          hideRecommendations: true,
          blockAutoplay: true,
          hideComments: false,
        },
      });
    }
  });

  chrome.storage.local.get([TIMER_KEY], (result) => {
    if (!result[TIMER_KEY]) {
      chrome.storage.local.set({ [TIMER_KEY]: DEFAULT_TIMER_STATE });
    }
  });
});

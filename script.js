/* ==========================================================
   Music Player - script.js
   Plays lovely.mp3 from this folder. If that file is missing,
   a timer runs instead so every control still works.
   ========================================================== */

/* ---------- Settings ---------- */
const FALLBACK_DURATION = 200.62; // 3:20, length of lovely.mp3; used if the file is missing
const SKIP_SECONDS = 10;        // buttons: back and forward 10 s
const KEY_SEEK_SECONDS = 5;     // arrow keys: 5 s
const KEY_VOLUME_STEP = 5;      // arrow keys: 5 %
const STORAGE_KEY = "lovely-player";
const TRACK_TITLE = "Lovely";
const TRACK_ARTIST = "Billie Eilish & Khalid";

/* Arc geometry (must match the SVG in index.html) */
const ARC_CENTER = 130;         // center of the 260 px dial
const ARC_RADIUS = 122;         // radius of the arc line
const ARC_LIMIT = 70;           // the arc spans -70 to +70 degrees
const DIAL_DISC_RADIUS = 105;   // clicks inside this radius do not move the volume

/* Icons (filled with the button's text color) */
const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" stroke="none"/></svg>';

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const dom = {
  audio: $("song"),
  title: $("title"),
  disc: $("disc"),
  dial: $("dial"),
  knob: $("knob"),
  volume: $("volume"),
  current: $("current"),
  duration: $("duration"),
  seek: $("seek"),
  seekDot: $("seekDot"),
  playBtn: $("playBtn"),
  prevBtn: $("prevBtn"),
  nextBtn: $("nextBtn"),
  backBtn: $("backBtn"),
  menuBtn: $("menuBtn"),
  info: $("info"),
};

/* ---------- State ---------- */
const state = {
  position: 0,           // seconds
  duration: FALLBACK_DURATION,
  volume: 70,            // 0 to 100
  playing: false,
  usingAudio: false,     // true only when lovely.mp3 loaded correctly
};

let frameId = null;
let lastFrame = 0;

/* ---------- Helpers ---------- */

/** Seconds to m:ss, for example 72 becomes "01:12". */
function formatTime(seconds) {
  const total = Math.floor(seconds);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const secs = String(total % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Saves volume and position. Storage can be blocked, so errors are ignored. */
function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ position: Math.floor(state.position), volume: state.volume })
    );
  } catch (err) {
    /* Storage unavailable: the player still works. */
  }
}

/** Restores saved values. Bad or missing data keeps the defaults. */
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;
    if (typeof saved.volume === "number") state.volume = clamp(saved.volume, 0, 100);
    if (typeof saved.position === "number") state.position = clamp(saved.position, 0, state.duration);
  } catch (err) {
    /* Corrupt data: keep the defaults. */
  }
}

/* ---------- Audio file events ---------- */
dom.audio.addEventListener("loadedmetadata", () => {
  if (Number.isFinite(dom.audio.duration) && dom.audio.duration > 0) {
    state.duration = dom.audio.duration;
    state.usingAudio = true;
    dom.audio.currentTime = state.position;
    render();
  }
});

// File missing or unreadable: keep using the timer.
dom.audio.addEventListener("error", () => {
  state.usingAudio = false;
});

dom.audio.addEventListener("ended", () => {
  pause();
  state.position = 0;
  render();
});

/* ---------- Playback ---------- */

/** Runs once per frame while playing. */
function tick(now) {
  if (!state.playing) return;

  if (state.usingAudio) {
    state.position = dom.audio.currentTime;
  } else {
    state.position += Math.max(0, (now - lastFrame) / 1000);
    lastFrame = now;
  }

  // Reached the end of the song: stop at the start.
  if (state.position >= state.duration) {
    pause();
    state.position = 0;
    render();
    return;
  }

  render();
  frameId = requestAnimationFrame(tick);
}

function startLoop() {
  cancelAnimationFrame(frameId);
  lastFrame = performance.now();
  frameId = requestAnimationFrame(tick);
}

function play() {
  if (state.playing) return;
  state.playing = true;

  if (state.usingAudio) {
    dom.audio.currentTime = state.position;
    dom.audio.play().catch(() => {
      // Browser refused audio: switch to the timer.
      state.usingAudio = false;
    });
  }

  startLoop();
  render();
  saveState();
}

function pause() {
  state.playing = false;
  cancelAnimationFrame(frameId);
  if (state.usingAudio) dom.audio.pause();
  render();
  saveState();
}

function togglePlay() {
  if (state.playing) {
    pause();
  } else {
    play();
  }
}

/** Moves the playhead to a time in seconds. */
function seekTo(seconds) {
  state.position = clamp(seconds, 0, state.duration);
  if (state.usingAudio) dom.audio.currentTime = state.position;
  lastFrame = performance.now();
  render();
  saveState();
}

/** Sets volume (0 to 100) and updates the dial and audio. */
function setVolume(value) {
  state.volume = clamp(Math.round(value), 0, 100);
  dom.audio.volume = state.volume / 100;
  render();
  saveState();
}

/* ---------- Info panel and Back ---------- */
function toggleInfo() {
  const willOpen = dom.info.hidden;
  dom.info.hidden = !willOpen;
  dom.menuBtn.setAttribute("aria-expanded", String(willOpen));
  dom.menuBtn.setAttribute("aria-label", willOpen ? "Hide track info" : "Show track info");
}

/** Back closes the info panel if it is open, otherwise restarts the song. */
function goBack() {
  if (!dom.info.hidden) {
    toggleInfo();
    return;
  }
  seekTo(0);
}

/* ---------- Arc volume dial ---------- */

/** Moves the knob on the arc to match the volume. */
function placeKnob(volume) {
  // 100 % sits at the top (-70 degrees), 0 % at the bottom (+70 degrees).
  const angle = (ARC_LIMIT - volume * (2 * ARC_LIMIT / 100)) * (Math.PI / 180);
  dom.knob.setAttribute("cx", (ARC_CENTER + ARC_RADIUS * Math.cos(angle)).toFixed(2));
  dom.knob.setAttribute("cy", (ARC_CENTER + ARC_RADIUS * Math.sin(angle)).toFixed(2));
}

/** Converts a pointer position into a volume. Only the right side of the dial responds. */
function volumeFromPointer(event) {
  const rect = dom.dial.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);

  if (dx <= 0 || Math.hypot(dx, dy) < DIAL_DISC_RADIUS) return null;

  const angle = clamp(Math.atan2(dy, dx) * (180 / Math.PI), -ARC_LIMIT, ARC_LIMIT);
  return ((ARC_LIMIT - angle) / (2 * ARC_LIMIT)) * 100;
}

let dragging = false;

dom.dial.addEventListener("pointerdown", (event) => {
  const value = volumeFromPointer(event);
  if (value === null) return;
  dragging = true;
  dom.dial.setPointerCapture(event.pointerId);
  setVolume(value);
});

dom.dial.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  const value = volumeFromPointer(event);
  if (value !== null) setVolume(value);
});

dom.dial.addEventListener("pointerup", () => { dragging = false; });
dom.dial.addEventListener("pointercancel", () => { dragging = false; });

/* ---------- Render ---------- */

/** Copies the current state into the page. Safe to call often. */
function render() {
  dom.title.textContent = TRACK_TITLE;
  document.title = `${TRACK_TITLE} · ${TRACK_ARTIST} · Music Player`;

  dom.current.textContent = formatTime(state.position);
  dom.duration.textContent = formatTime(state.duration);

  dom.seek.max = state.duration;
  dom.seek.value = state.position;
  const percent = (state.position / state.duration) * 100;
  dom.seekDot.style.left = `${percent}%`;

  dom.volume.value = state.volume;
  placeKnob(state.volume);

  dom.disc.classList.toggle("is-playing", state.playing);

  dom.playBtn.innerHTML = state.playing ? ICON_PAUSE : ICON_PLAY;
  dom.playBtn.setAttribute("aria-label", state.playing ? "Pause" : "Play");
}

/* ---------- Events ---------- */
dom.playBtn.addEventListener("click", togglePlay);
dom.prevBtn.addEventListener("click", () => seekTo(state.position - SKIP_SECONDS));
dom.nextBtn.addEventListener("click", () => seekTo(state.position + SKIP_SECONDS));
dom.backBtn.addEventListener("click", goBack);
dom.menuBtn.addEventListener("click", toggleInfo);

dom.seek.addEventListener("input", () => seekTo(Number(dom.seek.value)));
dom.volume.addEventListener("input", () => setVolume(Number(dom.volume.value)));

/* Keyboard shortcuts. Buttons and sliders keep their own native keys. */
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;

  const onButton = event.target.closest("button");
  const onSlider = event.target.matches('input[type="range"]');

  switch (event.key) {
    case " ":
      if (onButton) return;
      event.preventDefault();
      togglePlay();
      break;

    case "ArrowLeft":
      if (onSlider) return;
      event.preventDefault();
      seekTo(state.position - KEY_SEEK_SECONDS);
      break;

    case "ArrowRight":
      if (onSlider) return;
      event.preventDefault();
      seekTo(state.position + KEY_SEEK_SECONDS);
      break;

    case "ArrowUp":
      if (onSlider) return;
      event.preventDefault();
      setVolume(state.volume + KEY_VOLUME_STEP);
      break;

    case "ArrowDown":
      if (onSlider) return;
      event.preventDefault();
      setVolume(state.volume - KEY_VOLUME_STEP);
      break;

    case "m":
    case "M":
      toggleInfo();
      break;

    case "Escape":
      if (!dom.info.hidden) toggleInfo();
      break;
  }
});

// Save the state when the page is closed or hidden.
window.addEventListener("pagehide", saveState);

/* ---------- Start ---------- */
function init() {
  loadState();
  dom.audio.volume = state.volume / 100;
  render();
}

init();

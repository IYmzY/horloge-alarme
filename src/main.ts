import "./style.scss";

/* =========================
   Utils & date
========================= */
const pad = (n: number) => n.toString().padStart(2, "0");
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

// Auto-stop & auto-snooze
const AUTO_STOP_MS = 60_000; // 1 minute de sonnerie max
const AUTO_SNOOZE_MIN = 5; // auto snooze de 5 min

/* =========================
   DOM
========================= */
const appEl = document.getElementById("app") as HTMLElement;

const timeEl = document.getElementById("time") as HTMLElement;
const dateEl = document.getElementById("date") as HTMLElement;

const alarmStateTextEl = document.getElementById(
  "alarmStateText"
) as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

const alarmForm = document.getElementById("alarmForm") as HTMLFormElement;
const alarmTimeInput = document.getElementById("alarmTime") as HTMLInputElement;
const alarmLabelInput = document.getElementById(
  "alarmLabel"
) as HTMLInputElement;

const setBtn = document.getElementById("setBtn") as HTMLButtonElement;

const alarmActivePanel = document.getElementById(
  "alarmActivePanel"
) as HTMLDivElement;
const cancelBtn = document.getElementById("cancelBtn") as HTMLButtonElement;
const snoozeBtn = document.getElementById(
  "snoozeBtn"
) as HTMLButtonElement | null;
const activeTimeEl = document.getElementById("activeTime") as HTMLElement;
const activeLabelEl = document.getElementById("activeLabel") as HTMLElement;
const activeSoundEl = document.getElementById("activeSound") as HTMLElement;

const soundsSection = document.getElementById("sounds") as HTMLElement;
const viewerEl = soundsSection.querySelector(".sound-viewer") as HTMLElement;
const windowEl = viewerEl.querySelector(".slide-window") as HTMLElement;
const cards = Array.from(windowEl.querySelectorAll<HTMLElement>(".sound-card"));
const prevBtn = viewerEl.querySelector(".nav.prev") as HTMLButtonElement;
const nextBtn = viewerEl.querySelector(".nav.next") as HTMLButtonElement;
const currentTitleEl = document.getElementById(
  "currentSoundTitle"
) as HTMLElement;

const volumeEl = document.getElementById("volume") as HTMLInputElement | null;
const ringToast = document.getElementById("ringToast") as HTMLDivElement;
const ringToastText = document.getElementById("ringToastText") as HTMLElement;
const toastSnoozeBtn = document.getElementById(
  "toastSnoozeBtn"
) as HTMLButtonElement;
const toastStopBtn = document.getElementById(
  "toastStopBtn"
) as HTMLButtonElement;

/* =========================
   State
========================= */
type AppState = "inactive" | "active";

type SoundKey =
  | "rooster"
  | "trumpet"
  | "firealarm"
  | "electronic"
  | "iphone"
  | "morningflower"
  | "funmix";

const DEFAULT_SOUND: SoundKey = "rooster";

const SOUND_FILES: Record<SoundKey, string> = {
  rooster: "/sounds/alarm-rooster.mp3",
  trumpet: "/sounds/military-trumpet.mp3",
  firealarm: "/sounds/fire-alarm.mp3",
  electronic: "/sounds/electronic.mp3",
  iphone: "/sounds/iphone-alarm.mp3",
  morningflower: "/sounds/morning-flower.mp3",
  funmix: "/sounds/perfect-alarm.mp3",
};

function soundTitle(key: SoundKey): string {
  switch (key) {
    case "rooster":
      return "Coq";
    case "trumpet":
      return "Trompette militaire";
    case "firealarm":
      return "Fire Alarm";
    case "electronic":
      return "Alarme électronique";
    case "iphone":
      return "Réveil iPhone (classique)";
    case "morningflower":
      return "Morning Flower (Samsung)";
    case "funmix":
      return "Alarme Parfaite";
  }
}

type AlarmState = {
  time: string; // "HH:MM"
  label?: string;
  soundKey: SoundKey;
  active: boolean;
  nextTrigger: Date;
  snoozed?: boolean;
};

let uiState: AppState = "inactive";
let alarm: AlarmState | null = null;

/* =========================
   Persistence
========================= */
const LS_KEY = "alarm-clock-state-v1";
const LS_VOL = "alarm-volume-v1";
const LS_SOUND_INDEX = "alarm-sound-index-v1";

type Persisted = {
  alarm: {
    time: string;
    label?: string;
    soundKey: SoundKey;
    active: boolean;
    snoozed?: boolean;
  } | null;
  soundIndex: number;
};

function saveState() {
  const data: Persisted = {
    alarm: alarm
      ? {
          time: alarm.time,
          label: alarm.label,
          soundKey: alarm.soundKey,
          active: alarm.active,
          snoozed: alarm.snoozed,
        }
      : null,
    soundIndex: currentIndex,
  };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {}
}

function loadState(): Persisted | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Persisted;
  } catch {
    return null;
  }
}

/* =========================
   Clock (tick aligné)
========================= */
let lastDay = -1;

function renderClock(now = new Date()) {
  const h = pad(now.getHours());
  const m = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  timeEl.textContent = `${h}:${m}:${s}`;

  const day = now.getDate();
  if (day !== lastDay) {
    dateEl.textContent = cap(dateFmt.format(now));
    lastDay = day;
  }
}

function tickAligned() {
  const now = new Date();
  renderClock(now);
  checkAlarm(now);
  if (alarm?.active && now.getSeconds() % 5 === 0) updateStatus(now);
  const delay = 1000 - now.getMilliseconds();
  setTimeout(tickAligned, delay);
}

/* =========================
   Alarm scheduling
========================= */
function computeNextTrigger(hhmm: string, from = new Date()): Date {
  const [hh, mm] = hhmm.split(":").map(Number);
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setHours(hh, mm, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1); // si passé → demain
  return d;
}

function formatRemaining(target: Date, now = new Date()): string {
  const ms = Math.max(0, target.getTime() - now.getTime());
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins} min ${pad(secs)} s`;
}

function updateStatus(now = new Date()) {
  if (!alarm || !alarm.active) {
    alarmStateTextEl.textContent = "Aucune alarme programmée.";
    statusEl.textContent = "—";
    return;
  }
  const snoozeTag = alarm.snoozed ? " (snooze)" : "";
  alarmStateTextEl.textContent = `Active pour ${
    alarm.time
  }${snoozeTag} — ${soundTitle(alarm.soundKey)}`;
  statusEl.textContent = `Prochaine dans ~ ${formatRemaining(
    alarm.nextTrigger,
    now
  )}.`;
}

function setAppState(next: AppState) {
  uiState = next;
  if (next === "active") {
    appEl.classList.remove("alarm-inactive");
    appEl.classList.add("alarm-active");
    alarmForm.hidden = true;
    alarmActivePanel.hidden = false;
    document
      .getElementById("alarm")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  } else {
    appEl.classList.add("alarm-inactive");
    appEl.classList.remove("alarm-active");
    alarmForm.hidden = false;
    alarmActivePanel.hidden = true;
  }
}

/* =========================
   WebAudio + volume
========================= */
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null; // volume global (slider)
let ringGain: GainNode | null = null; // fade in/out sonnerie

// slider linéaire → courbe douce
const sliderToGain = (v: number) => Math.pow(v / 100, 1.6);

async function ensureAudioContext(): Promise<AudioContext> {
  if (!audioCtx) {
    const AC =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AC();
  }
  const ctx = audioCtx!;
  if (ctx.state === "suspended") await ctx.resume();

  if (!masterGain) {
    masterGain = ctx.createGain();
    const stored = Number(localStorage.getItem(LS_VOL) ?? "90");
    masterGain.gain.value = sliderToGain(isNaN(stored) ? 90 : stored);
    masterGain.connect(ctx.destination);
  }
  if (!ringGain) {
    ringGain = ctx.createGain();
    ringGain.gain.value = 1;
    ringGain.connect(masterGain);
  }
  return ctx;
}

const soundBuffers = new Map<SoundKey, AudioBuffer>();

async function loadSoundBuffer(key: SoundKey): Promise<AudioBuffer | null> {
  await ensureAudioContext();
  if (soundBuffers.has(key)) return soundBuffers.get(key)!;
  const url = SOUND_FILES[key];
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const arr = await res.arrayBuffer();
    // Compat TS: utilise la forme callback
    const buf = await new Promise<AudioBuffer>((resolve, reject) => {
      audioCtx!.decodeAudioData(arr, resolve, reject);
    });
    soundBuffers.set(key, buf);
    return buf;
  } catch (e) {
    console.warn("Impossible de charger le son:", key, url, e);
    return null;
  }
}

/* =========================
   Notifications & attention grabbers
========================= */
function canNotify(): boolean {
  return "Notification" in window && Notification.permission !== "denied";
}

async function ensureNotifyPermission(): Promise<void> {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {}
  }
}

let titleBlinkId: number | null = null;
const originalTitle = document.title;

function startTitleBlink(text = "⏰ Alarme !") {
  stopTitleBlink();
  let on = false;
  titleBlinkId = window.setInterval(() => {
    document.title = on ? text : originalTitle;
    on = !on;
  }, 900);
}
function stopTitleBlink() {
  if (titleBlinkId) {
    clearInterval(titleBlinkId);
    titleBlinkId = null;
  }
  document.title = originalTitle;
}

function showRingToast(label?: string) {
  if (!ringToast || !ringToastText) return;
  ringToastText.textContent = `Alarme${label ? " — " + label : ""}`;
  ringToast.hidden = false;
  document.body.classList.add("modal-open");
}
function hideRingToast() {
  if (ringToast) ringToast.hidden = true;
  document.body.classList.remove("modal-open");
}

function showSystemNotification(label?: string) {
  if (!canNotify() || document.visibilityState === "visible") return;
  try {
    const n = new Notification("⏰ Alarme", {
      body: label ? `— ${label}` : "Il est l'heure !",
      icon: "/favicon.ico",
      silent: false,
      tag: "alarm-ring", // ok pour regrouper
      requireInteraction: true, // reste affichée jusqu'au clic (supporté par la plupart des Chromium)
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {}
}

/* =========================
   Preview toggle & Ring
========================= */
let currentPreviewNode: AudioBufferSourceNode | null = null;
let currentPreviewKey: SoundKey | null = null;
let currentPreviewBtn: HTMLButtonElement | null = null;

function markBtnPlaying(btn: HTMLButtonElement) {
  btn.classList.add("is-playing");
  btn.setAttribute("aria-pressed", "true");
  btn.textContent = "■ Stop";
}
function unmarkBtnPlaying(btn: HTMLButtonElement) {
  btn.classList.remove("is-playing");
  btn.removeAttribute("aria-pressed");
  btn.textContent = "▶︎ Préécouter";
}

function stopPreview() {
  try {
    currentPreviewNode?.stop();
  } catch {}
  currentPreviewNode = null;
  currentPreviewKey = null;
  if (currentPreviewBtn) {
    unmarkBtnPlaying(currentPreviewBtn);
    currentPreviewBtn = null;
  }
}

async function previewToggle(key: SoundKey, btn: HTMLButtonElement) {
  await ensureAudioContext();

  if (currentPreviewNode && currentPreviewKey === key) {
    stopPreview();
    return;
  }

  stopPreview();
  if (ringing) stopRinging();

  const buf = await loadSoundBuffer(key);
  if (!buf) return;

  const src = audioCtx!.createBufferSource();
  src.buffer = buf;
  src.connect(masterGain!); // preview direct
  src.start(0);

  currentPreviewNode = src;
  currentPreviewKey = key;
  currentPreviewBtn = btn;
  markBtnPlaying(btn);

  src.onended = () => {
    if (currentPreviewNode === src) stopPreview();
  };
}

let ringing = false;
let ringNode: AudioBufferSourceNode | null = null;
let autoStopId: number | null = null;

async function ringNowWithSample(key: SoundKey, label?: string) {
  if (ringing) return;
  ringing = true;
  await ensureAudioContext();

  stopPreview(); // coupe la préécoute

  statusEl.textContent = `⏰ Alarme !${label ? " — " + label : ""}`;
  showRingToast(label);
  startTitleBlink();
  showSystemNotification(label);
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch {}
  }

  const buf = await loadSoundBuffer(key);
  if (!buf) {
    autoStopId = window.setTimeout(stopRinging, 4000);
    return;
  }

  const src = audioCtx!.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(ringGain!);

  // fade-in 0.8s
  const t0 = audioCtx!.currentTime;
  ringGain!.gain.cancelScheduledValues(t0);
  ringGain!.gain.setValueAtTime(0, t0);
  ringGain!.gain.linearRampToValueAtTime(1, t0 + 0.8);

  src.start(0);
  ringNode = src;
  if (AUTO_STOP_MS > 0) {
    autoStopId = window.setTimeout(() => {
      // si ça sonne encore au bout d'1 min → auto-snooze
      if (ringing) {
        snooze(AUTO_SNOOZE_MIN);
      }
    }, AUTO_STOP_MS);
  }
}

function stopRinging() {
  if (!ringing) return;
  ringing = false;

  if (audioCtx && ringGain) {
    const t0 = audioCtx.currentTime;
    ringGain.gain.cancelScheduledValues(t0);
    ringGain.gain.setTargetAtTime(0, t0, 0.15); // ~0.6s
  }
  try {
    ringNode?.stop(audioCtx ? audioCtx.currentTime + 0.65 : 0);
  } catch {}
  ringNode = null;

  if (autoStopId) {
    clearTimeout(autoStopId);
    autoStopId = null;
  }
  hideRingToast();
  stopTitleBlink();
  stopPreview();
}

/* =========================
   Carousel (1 slide visible)
========================= */
let currentIndex = Math.max(
  0,
  cards.findIndex((c) => c.classList.contains("is-active"))
);
if (currentIndex < 0) currentIndex = 0;

function keyAt(i: number): SoundKey {
  return cards[i].dataset.key as SoundKey;
}

function setAria(card: HTMLElement, active: boolean) {
  card.setAttribute("aria-hidden", active ? "false" : "true");
}

function applySlideClasses(prev: number, next: number, dir: "next" | "prev") {
  const prevEl = cards[prev];
  const nextEl = cards[next];

  cards.forEach((c) =>
    c.classList.remove("from-left", "from-right", "is-active")
  );
  nextEl.classList.add(dir === "next" ? "from-right" : "from-left");
  setAria(prevEl, false);
  setAria(nextEl, true);

  nextEl.classList.add("is-active");
  void nextEl.offsetWidth; // reflow
  nextEl.classList.remove("from-right", "from-left");

  prevEl.classList.add(dir === "next" ? "from-left" : "from-right");
}

function goTo(index: number, dir: "next" | "prev") {
  if (index === currentIndex) return;
  stopPreview(); // coupe la préécoute de la slide précédente
  const prev = currentIndex;
  const next = (index + cards.length) % cards.length;
  currentIndex = next;
  applySlideClasses(prev, next, dir);
  currentTitleEl.textContent = soundTitle(keyAt(currentIndex));
  try {
    localStorage.setItem(LS_SOUND_INDEX, String(currentIndex));
  } catch {}
}

function goNext() {
  goTo((currentIndex + 1) % cards.length, "next");
}
function goPrev() {
  goTo((currentIndex - 1 + cards.length) % cards.length, "prev");
}

/* =========================
   Alarm flow (inactive <-> active)
========================= */
function setAlarm() {
  const time = alarmTimeInput.value;
  if (!time) {
    statusEl.textContent = "Heure requise. Choisissez une heure (HH:MM).";
    return;
  }
  const label = alarmLabelInput.value.trim() || undefined;
  const soundKey = keyAt(currentIndex);

  alarm = {
    time,
    label,
    soundKey,
    active: true,
    nextTrigger: computeNextTrigger(time, new Date()),
    snoozed: false,
  };

  activeTimeEl.textContent = alarm.time;
  activeLabelEl.textContent = alarm.label ? `— ${alarm.label}` : "";
  activeSoundEl.textContent = soundTitle(alarm.soundKey);

  setAppState("active");
  updateStatus(new Date());
  saveState();

  ensureAudioContext().catch(() => {});
  ensureNotifyPermission().catch(() => {});
}

function cancelAlarm() {
  stopRinging();
  alarm = null;
  setAppState("inactive");
  alarmStateTextEl.textContent = "Aucune alarme programmée.";
  statusEl.textContent = "—";
  saveState();
}

function snooze(minutes = 5) {
  if (!alarm) return;
  const now = new Date();
  alarm.nextTrigger = new Date(now.getTime() + minutes * 60_000);
  alarm.snoozed = true;
  stopRinging();
  updateStatus(now);
  saveState();
}

/* =========================
   Check alarm (throttling-proof)
========================= */
function checkAlarm(now = new Date()) {
  if (!alarm || !alarm.active) return;
  if (now >= alarm.nextTrigger) {
    ringNowWithSample(alarm.soundKey, alarm.label).catch(() => {});
    // si pas snooze ensuite, on reprogramme au lendemain
    alarm.nextTrigger = computeNextTrigger(
      alarm.time,
      new Date(now.getTime() + 1000)
    );
    alarm.snoozed = false;
    updateStatus(now);
    saveState();
  }
}

/* =========================
   Volume
========================= */
function applyVolumeFromSlider() {
  if (!volumeEl) return;
  const v = Math.min(100, Math.max(0, Number(volumeEl.value)));
  try {
    localStorage.setItem(LS_VOL, String(v));
  } catch {}
  if (masterGain) masterGain.gain.value = sliderToGain(v);
}

/* =========================
   Events
========================= */
setBtn.addEventListener("click", () => {
  if (uiState === "active") return;
  setAlarm();
});
cancelBtn.addEventListener("click", () => {
  if (uiState === "inactive") return;
  cancelAlarm();
});
snoozeBtn?.addEventListener("click", () => snooze(5));

prevBtn.addEventListener("click", () => goPrev());
nextBtn.addEventListener("click", () => goNext());

windowEl.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target.matches(".btn-preview")) return;
  const btn = target as HTMLButtonElement;
  const key = keyAt(currentIndex);
  previewToggle(key, btn).catch(() => {});
});

toastSnoozeBtn?.addEventListener("click", () => {
  snooze(5);
});
toastStopBtn?.addEventListener("click", () => {
  cancelAlarm();
});

// Volume
volumeEl?.addEventListener("input", applyVolumeFromSlider);

// ESC coupe tout
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    stopPreview();
    stopRinging();
  }
});

// Recalage au retour onglet
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    const now = new Date();
    renderClock(now);
    checkAlarm(now);
    updateStatus(now);
  }
});

/* =========================
   Boot (restore state)
========================= */
function activateIndexWithoutAnim(i: number) {
  currentIndex = i;
  cards.forEach((c, idx) => {
    c.classList.remove("from-left", "from-right", "is-active");
    setAria(c, idx === i);
  });
  cards[i].classList.add("is-active");
  currentTitleEl.textContent = soundTitle(keyAt(i));
}

function restoreState() {
  // volume
  if (volumeEl) {
    const v = Number(localStorage.getItem(LS_VOL) ?? "90");
    volumeEl.value = isNaN(v) ? "90" : String(v);
  }

  // index son
  const storedIndex = Number(localStorage.getItem(LS_SOUND_INDEX));
  if (!isNaN(storedIndex) && storedIndex >= 0 && storedIndex < cards.length) {
    activateIndexWithoutAnim(storedIndex);
  } else {
    activateIndexWithoutAnim(currentIndex);
  }

  // alarme
  const p = loadState();
  if (!p || !p.alarm) return;

  const a = p.alarm;
  const idx = cards.findIndex((c) => c.dataset.key === a.soundKey);
  if (idx >= 0) activateIndexWithoutAnim(idx);

  if (a.active) {
    alarm = {
      time: a.time,
      label: a.label,
      soundKey: a.soundKey,
      active: true,
      nextTrigger: computeNextTrigger(a.time, new Date()),
      snoozed: false,
    };
    activeTimeEl.textContent = alarm.time;
    activeLabelEl.textContent = alarm.label ? `— ${alarm.label}` : "";
    activeSoundEl.textContent = soundTitle(alarm.soundKey);
    setAppState("active");
    updateStatus(new Date());
  }
}

(function boot() {
  // état initial UI
  activateIndexWithoutAnim(
    Math.max(
      0,
      cards.findIndex((c) => c.classList.contains("is-active"))
    )
  );
  setAppState("inactive");
  alarmStateTextEl.textContent = "Aucune alarme programmée.";
  statusEl.textContent = "—";

  // restauration
  restoreState();

  renderClock();
  updateStatus();
  tickAligned();
})();

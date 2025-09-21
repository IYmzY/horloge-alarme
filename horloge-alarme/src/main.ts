import "./style.scss";

/* =========================================
   Utils & date
========================================= */
const pad = (n: number) => n.toString().padStart(2, "0");
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/* =========================================
   DOM
========================================= */
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
const selectedSoundInput = document.getElementById(
  "selectedSound"
) as HTMLInputElement;

const setBtn = document.getElementById("setBtn") as HTMLButtonElement;

const alarmActivePanel = document.getElementById(
  "alarmActivePanel"
) as HTMLDivElement;
const cancelBtn = document.getElementById("cancelBtn") as HTMLButtonElement;
const activeTimeEl = document.getElementById("activeTime") as HTMLElement;
const activeLabelEl = document.getElementById("activeLabel") as HTMLElement;
const activeSoundEl = document.getElementById("activeSound") as HTMLElement;

const soundsSection = document.getElementById("sounds") as HTMLElement;
const carouselWrap = soundsSection.querySelector(
  ".carousel-wrap"
) as HTMLElement;
const carouselEl = soundsSection.querySelector(".carousel") as HTMLElement;
const prevBtn = carouselWrap.querySelector(
  ".carousel-nav.prev"
) as HTMLButtonElement;
const nextBtn = carouselWrap.querySelector(
  ".carousel-nav.next"
) as HTMLButtonElement;

/* =========================================
   State
========================================= */
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
      return "Fun Mix";
  }
}

type AlarmState = {
  time: string; // "HH:MM"
  label?: string;
  soundKey: SoundKey;
  active: boolean;
  nextTrigger: Date;
};

let uiState: AppState = "inactive";
let alarm: AlarmState | null = null;
let selectedSound: SoundKey = DEFAULT_SOUND;

/* =========================================
   Clock (tick aligné)
========================================= */
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

/* =========================================
   Alarm scheduling (robuste)
========================================= */
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
  alarmStateTextEl.textContent = `Active pour ${alarm.time} — ${soundTitle(
    alarm.soundKey
  )}`;
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
  } else {
    appEl.classList.add("alarm-inactive");
    appEl.classList.remove("alarm-active");
    alarmForm.hidden = false;
    alarmActivePanel.hidden = true;
  }
}

/* =========================================
   WebAudio (lazy) + loader de samples
========================================= */
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

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
    masterGain.gain.value = 1.0; // volume global (ajoute un slider si besoin)
    masterGain.connect(ctx.destination);
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
    const buf = await audioCtx!.decodeAudioData(arr);
    soundBuffers.set(key, buf);
    return buf;
  } catch (e) {
    console.warn("Impossible de charger le son:", key, url, e);
    return null;
  }
}

/* =========================================
   Preview & Ring (avec samples)
========================================= */
let currentPreviewNode: AudioBufferSourceNode | null = null;
let ringing = false;
let ringNode: AudioBufferSourceNode | null = null;
let autoStopId: number | null = null;

function stopPreview() {
  try {
    currentPreviewNode?.stop();
  } catch {}
  currentPreviewNode = null;
}

async function previewSound(key: SoundKey) {
  await ensureAudioContext();
  stopPreview();
  const buf = await loadSoundBuffer(key);
  if (!buf) return;
  const src = audioCtx!.createBufferSource();
  src.buffer = buf;
  src.connect(masterGain!);
  src.start(0);
  currentPreviewNode = src;
  src.onended = () => {
    if (currentPreviewNode === src) currentPreviewNode = null;
  };
}

async function ringNowWithSample(key: SoundKey, label?: string) {
  if (ringing) return;
  ringing = true;
  await ensureAudioContext();

  statusEl.textContent = `⏰ Alarme !${label ? " — " + label : ""}`;

  const buf = await loadSoundBuffer(key);
  if (!buf) {
    // fallback tout simple si le sample est indispo
    statusEl.textContent += " (sample indisponible)";
    autoStopId = window.setTimeout(stopRinging, 5000);
    return;
  }

  const src = audioCtx!.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(masterGain!);
  src.start(0);

  ringNode = src;
  autoStopId = window.setTimeout(stopRinging, 30_000);
}

function stopRinging() {
  if (!ringing) return;
  ringing = false;
  try {
    ringNode?.stop();
  } catch {}
  ringNode = null;
  if (autoStopId) {
    clearTimeout(autoStopId);
    autoStopId = null;
  }
  // coupe aussi un éventuel preview en cours
  stopPreview();
}

/* =========================================
   Alarm flow (inactive <-> active)
========================================= */
function setAlarm() {
  const time = alarmTimeInput.value;
  if (!time) {
    statusEl.textContent = "Heure requise. Choisissez une heure (HH:MM).";
    return;
  }
  const label = alarmLabelInput.value.trim() || undefined;

  alarm = {
    time,
    label,
    soundKey: selectedSound,
    active: true,
    nextTrigger: computeNextTrigger(time, new Date()),
  };

  // maj panneau actif
  activeTimeEl.textContent = alarm.time;
  activeLabelEl.textContent = alarm.label ? `— ${alarm.label}` : "";
  activeSoundEl.textContent = soundTitle(alarm.soundKey);

  // UI → active
  setAppState("active");
  updateStatus(new Date());

  // gesture utilisateur : tentative de déblocage audio
  ensureAudioContext().catch(() => {});
}

function cancelAlarm() {
  stopRinging();
  alarm = null;
  setAppState("inactive");
  alarmStateTextEl.textContent = "Aucune alarme programmée.";
  statusEl.textContent = "—";
}

/* =========================================
   Check alarm (throttling-proof)
========================================= */
function checkAlarm(now = new Date()) {
  if (!alarm || !alarm.active) return;
  if (now >= alarm.nextTrigger) {
    ringNowWithSample(alarm.soundKey, alarm.label).catch(() => {});
    // récurrence quotidienne
    alarm.nextTrigger = computeNextTrigger(
      alarm.time,
      new Date(now.getTime() + 1000)
    );
    updateStatus(now);
  }
}

/* =========================================
   Carousel (preview / choose / nav)
========================================= */
function setSelectedSoundCard(key: SoundKey) {
  const cards = carouselEl.querySelectorAll<HTMLElement>(".sound-card");
  cards.forEach((card) => {
    const match = card.dataset.key === key;
    card.classList.toggle("is-selected", match);
    card.setAttribute("aria-selected", match ? "true" : "false");
  });
}

function handleCarouselClick(e: Event) {
  const target = e.target as HTMLElement;
  const card = (target.closest(".sound-card") as HTMLElement) || null;
  if (!card) return;
  const key = card.dataset.key as SoundKey;

  if (target.matches('[data-action="preview"]')) {
    previewSound(key).catch(() => {});
    return;
  }
  if (target.matches('[data-action="choose"]')) {
    selectedSound = key;
    setSelectedSoundCard(key);
    selectedSoundInput.value = soundTitle(key);
    // petit feedback visuel possible ici si tu veux
    return;
  }
}

function scrollCarousel(direction: "prev" | "next") {
  const card = carouselEl.querySelector<HTMLElement>(".sound-card");
  const step = card ? card.getBoundingClientRect().width + 12 : 240;
  const delta = direction === "next" ? step : -step;
  carouselEl.scrollBy({ left: delta, behavior: "smooth" });
}

function updateCarouselNavDisabled() {
  // (optionnel) désactive les flèches quand on est au bord
  const maxScroll = carouselEl.scrollWidth - carouselEl.clientWidth;
  const left = Math.round(carouselEl.scrollLeft);
  prevBtn.disabled = left <= 0;
  nextBtn.disabled = left >= maxScroll;
}

/* =========================================
   Events
========================================= */
setBtn.addEventListener("click", () => {
  if (uiState === "active") return; // pas d’overwrite
  setAlarm();
});

cancelBtn.addEventListener("click", () => {
  if (uiState === "inactive") return;
  cancelAlarm();
});

carouselEl.addEventListener("click", handleCarouselClick);

prevBtn.addEventListener("click", () => {
  scrollCarousel("prev");
  setTimeout(updateCarouselNavDisabled, 250);
});
nextBtn.addEventListener("click", () => {
  scrollCarousel("next");
  setTimeout(updateCarouselNavDisabled, 250);
});
carouselEl.addEventListener("scroll", () => {
  // throttle léger
  window.requestAnimationFrame(updateCarouselNavDisabled);
});

// ESC pour couper la sonnerie
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") stopRinging();
});

// Recalage instantané au retour onglet
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    const now = new Date();
    renderClock(now);
    checkAlarm(now);
    updateStatus(now);
    updateCarouselNavDisabled();
  }
});

/* =========================================
   Boot
========================================= */
function initSelectedFromDOM() {
  const card = carouselEl.querySelector<HTMLElement>(".sound-card.is-selected");
  selectedSound = (card?.dataset.key as SoundKey) ?? DEFAULT_SOUND;
  setSelectedSoundCard(selectedSound);
  selectedSoundInput.value = soundTitle(selectedSound);
}

function initUI() {
  setAppState("inactive");
  alarmStateTextEl.textContent = "Aucune alarme programmée.";
  statusEl.textContent = "—";
}

initSelectedFromDOM();
initUI();
renderClock();
updateStatus();
updateCarouselNavDisabled();
tickAligned();

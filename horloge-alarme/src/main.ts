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
const activeTimeEl = document.getElementById("activeTime") as HTMLElement;
const activeLabelEl = document.getElementById("activeLabel") as HTMLElement;
const activeSoundEl = document.getElementById("activeSound") as HTMLElement;

const soundsSection = document.getElementById("sounds") as HTMLElement;
const viewerEl = soundsSection.querySelector(".sound-viewer") as HTMLElement;
const windowEl = viewerEl.querySelector(".slide-window") as HTMLElement;
const cards = Array.from(windowEl.querySelectorAll<HTMLElement>(".sound-card"));
const prevBtn = viewerEl.querySelector(".nav.prev") as HTMLButtonElement;
const nextBtn = viewerEl.querySelector(".nav.next") as HTMLButtonButton;
const currentTitleEl = document.getElementById(
  "currentSoundTitle"
) as HTMLElement;

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
   Alarm scheduling (robuste)
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

/* =========================
   WebAudio (lazy) + loader
========================= */
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
    masterGain.gain.value = 1.0;
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

  // si on re-clique sur le même bouton pendant lecture => stop
  if (currentPreviewNode && currentPreviewKey === key) {
    stopPreview();
    return;
  }

  // sinon: coupe toute autre préécoute + coupe une éventuelle alarme
  stopPreview();
  if (ringing) stopRinging();

  const buf = await loadSoundBuffer(key);
  if (!buf) return;

  const src = audioCtx!.createBufferSource();
  src.buffer = buf;
  src.connect(masterGain!);
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

  // coupe toute préécoute
  stopPreview();

  statusEl.textContent = `⏰ Alarme !${label ? " — " + label : ""}`;

  const buf = await loadSoundBuffer(key);
  if (!buf) {
    // échec de sample → stop rapide
    autoStopId = window.setTimeout(stopRinging, 4000);
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
  // sécurité : coupe aussi un preview en cours
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

  // reset classes
  cards.forEach((c) =>
    c.classList.remove("from-left", "from-right", "is-active")
  );

  // préparation directionnelle
  nextEl.classList.add(dir === "next" ? "from-right" : "from-left");
  setAria(prevEl, false);
  setAria(nextEl, true);

  // entrée
  nextEl.classList.add("is-active");
  // forcer un reflow pour que la transition prenne bien
  void nextEl.offsetWidth;
  nextEl.classList.remove("from-right", "from-left");

  // sortie
  prevEl.classList.add(dir === "next" ? "from-left" : "from-right");
}

function goTo(index: number, dir: "next" | "prev") {
  if (index === currentIndex) return;

  // couper un éventuel preview (et libeller le bouton de l'ancienne slide)
  stopPreview();

  const prev = currentIndex;
  const next = (index + cards.length) % cards.length;
  currentIndex = next;

  applySlideClasses(prev, next, dir);

  // MAJ du titre courant
  currentTitleEl.textContent = soundTitle(keyAt(currentIndex));
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
  };

  // panneau actif
  activeTimeEl.textContent = alarm.time;
  activeLabelEl.textContent = alarm.label ? `— ${alarm.label}` : "";
  activeSoundEl.textContent = soundTitle(alarm.soundKey);

  setAppState("active");
  updateStatus(new Date());

  // geste utilisateur → tente de débloquer l'audio
  ensureAudioContext().catch(() => {});
}

function cancelAlarm() {
  stopRinging();
  alarm = null;
  setAppState("inactive");
  alarmStateTextEl.textContent = "Aucune alarme programmée.";
  statusEl.textContent = "—";
}

/* =========================
   Check alarm (throttling-proof)
========================= */
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

/* =========================
   Events
========================= */
// Programmer / Annuler
setBtn.addEventListener("click", () => {
  if (uiState === "active") return;
  setAlarm();
});
cancelBtn.addEventListener("click", () => {
  if (uiState === "inactive") return;
  cancelAlarm();
});

// Carousel nav
prevBtn.addEventListener("click", () => goPrev());
nextBtn.addEventListener("click", () => goNext());

// Preview toggle (délégué sur la fenêtre de slide)
windowEl.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target.matches(".btn-preview")) return;
  const btn = target as HTMLButtonElement;
  const active = cards[currentIndex];
  const key = active.dataset.key as SoundKey;
  previewToggle(key, btn).catch(() => {});
});

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
   Boot
========================= */
function initFromDOM() {
  // s'assure que l'état initial correspond à la carte marquée .is-active
  const initial = Math.max(
    0,
    cards.findIndex((c) => c.classList.contains("is-active"))
  );
  currentIndex = initial >= 0 ? initial : 0;
  cards.forEach((c, i) => setAria(c, i === currentIndex));
  currentTitleEl.textContent = soundTitle(keyAt(currentIndex));
}

function initUI() {
  setAppState("inactive");
  alarmStateTextEl.textContent = "Aucune alarme programmée.";
  statusEl.textContent = "—";
}

initFromDOM();
initUI();
renderClock();
updateStatus();
tickAligned();

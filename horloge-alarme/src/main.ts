import "./style.scss";

/* =========================================
   Utils
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
const carouselEl = soundsSection.querySelector(".carousel") as HTMLElement;

/* =========================================
   State
========================================= */
type AppState = "inactive" | "active";

type AlarmState = {
  time: string; // "HH:MM"
  label?: string;
  soundKey: SoundKey;
  active: boolean;
  nextTrigger: Date;
};

let uiState: AppState = "inactive";
let alarm: AlarmState | null = null;

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
  if (alarm?.active && now.getSeconds() % 5 === 0) {
    updateStatus(now);
  }
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
   Sonneries: patterns & preview
========================================= */
type SoundKey = "rooster" | "bell" | "electro" | "trumpet" | "metal" | "fun";
const DEFAULT_SOUND: SoundKey = "rooster";

function soundTitle(key: SoundKey): string {
  switch (key) {
    case "rooster":
      return "Coq";
    case "bell":
      return "Cloche";
    case "electro":
      return "Électronique";
    case "trumpet":
      return "Trompette";
    case "metal":
      return "Heavy Metal";
    case "fun":
      return "Fun";
  }
}

let selectedSound: SoundKey = DEFAULT_SOUND; // son sélectionné via carrousel

// Sélection visuelle dans le carrousel
function setSelectedSoundCard(key: SoundKey) {
  const cards = carouselEl.querySelectorAll<HTMLElement>(".sound-card");
  cards.forEach((card) => {
    const match = card.dataset.key === key;
    card.classList.toggle("is-selected", match);
    card.setAttribute("aria-selected", match ? "true" : "false");
  });
}

/* =========================================
   WebAudio (lazy) + patterns
========================================= */
let audioCtx: AudioContext | null = null;
let ringing = false;
let ringLoopId: number | null = null;
let autoStopId: number | null = null;

async function ensureAudioContext(): Promise<AudioContext> {
  if (!audioCtx) {
    const AC =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AC();
  }
  const ctx = audioCtx!;
  if (ctx.state === "suspended") await ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  dur = 0.15,
  when = 0,
  vol = 0.6,
  attack = 0.004,
  type: OscillatorType = "sine"
) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(audioCtx.destination);

  const t = audioCtx.currentTime + when;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Patterns simples mais distinctifs pour chaque son */
function playPattern(key: SoundKey) {
  if (!audioCtx) return;

  switch (key) {
    case "rooster": {
      // cocorico synthétique (saw/square mixé en étapes)
      // approximation courte et non agressive
      tone(660, 0.18, 0.0, 0.55, 0.004, "square");
      tone(880, 0.2, 0.16, 0.55, 0.004, "sawtooth");
      tone(740, 0.22, 0.34, 0.55, 0.004, "square");
      break;
    }
    case "bell": {
      // cloche: fondamentale + partiels qui décroissent
      const base = 660;
      [1, 2.01, 2.4, 3.8].forEach((m, i) =>
        tone(base * m, 0.8 - i * 0.15, i * 0.02, 0.42 - i * 0.06, 0.003, "sine")
      );
      break;
    }
    case "electro": {
      // arpège électronique
      const base = 440;
      [0, 0.15, 0.3, 0.45].forEach((off, i) =>
        tone(base * Math.pow(1.122, i * 2), 0.18, off, 0.5, 0.002, "sawtooth")
      );
      break;
    }
    case "trumpet": {
      // appel clairon simple
      const seq = [523.25, 659.25, 784.0, 659.25, 523.25]; // C5 E5 G5 E5 C5
      seq.forEach((f, i) => tone(f, 0.22, i * 0.22, 0.6, 0.002, "square"));
      break;
    }
    case "metal": {
      // petit riff agressif
      const base = 196; // G3
      [0, 0.12, 0.24, 0.36, 0.6].forEach((off, i) =>
        tone(base * [1, 1.5, 2, 1.5, 1][i], 0.12, off, 0.65, 0.001, "sawtooth")
      );
      break;
    }
    case "fun": {
      // cartoon / retro
      [880, 660, 990].forEach((f, i) =>
        tone(f, 0.12, i * 0.14, 0.55, 0.003, "triangle")
      );
      break;
    }
  }
}

async function ringNow(key: SoundKey, label?: string) {
  if (ringing) return;
  ringing = true;
  await ensureAudioContext();

  // feedback UI (texte) — visuel “ringing” possible via classe si tu veux
  statusEl.textContent = `⏰ Alarme !${label ? " — " + label : ""}`;

  // boucle pattern toutes les 2s (soft)
  playPattern(key);
  ringLoopId = window.setInterval(() => playPattern(key), 2000);

  // auto-stop 30s
  autoStopId = window.setTimeout(stopRinging, 30_000);
}

function stopRinging() {
  if (!ringing) return;
  ringing = false;
  if (ringLoopId) {
    clearInterval(ringLoopId);
    ringLoopId = null;
  }
  if (autoStopId) {
    clearTimeout(autoStopId);
    autoStopId = null;
  }
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

  // gesture utilisateur : tente de débloquer l'audio
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
    ringNow(alarm.soundKey, alarm.label).catch(() => {});
    // récurrence quotidienne par défaut
    alarm.nextTrigger = computeNextTrigger(
      alarm.time,
      new Date(now.getTime() + 1000)
    );
    updateStatus(now);
  }
}

/* =========================================
   Carousel interactions (preview / choose)
========================================= */
function handleCarouselClick(e: Event) {
  const target = e.target as HTMLElement;
  const card = (target.closest(".sound-card") as HTMLElement) || null;
  if (!card) return;
  const key = card.dataset.key as SoundKey;

  if (target.matches('[data-action="preview"]')) {
    ensureAudioContext()
      .then(() => playPattern(key))
      .catch(() => {});
    return;
  }

  if (target.matches('[data-action="choose"]')) {
    selectedSound = key;
    setSelectedSoundCard(key);
    selectedSoundInput.value = soundTitle(key);
    return;
  }
}

/* =========================================
   Events
========================================= */
setBtn.addEventListener("click", () => {
  if (uiState === "active") return; // pas d'overwrite
  setAlarm();
});

cancelBtn.addEventListener("click", () => {
  if (uiState === "inactive") return;
  cancelAlarm();
});

carouselEl.addEventListener("click", handleCarouselClick);

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
  }
});

/* =========================================
   Boot
========================================= */
function initSelectedFromDOM() {
  // lis la carte marquée .is-selected au démarrage
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
tickAligned();

const LOGS_KEY = "workout-logs";
const WORKOUTS_KEY = "workout-templates";
const BODYWEIGHT_KEY = "bodyweight-logs";
const THEME_KEY = "theme-preference";
const EXERCISE_NOTES_KEY = "exercise-notes";
const LAST_VIEW_KEY = "last-view";
const ACCENT_HUE_KEY = "accent-hue";

/* ---------- Helpers ---------- */

const $ = (id) => document.getElementById(id);

// Escape user-provided text before it goes into innerHTML / attributes.
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// localStorage-backed JSON store: storage(key).load(fallback) / .save(value)
function storage(key) {
  return {
    load(fallback) {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    },
    save(value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
  };
}

const ENCOURAGEMENTS = [
  "Chaque séance compte 💪",
  "Un peu plus fort qu'hier",
  "T'es ici, c'est déjà gagné",
  "La constance bat l'intensité",
  "Prêt à repousser tes limites ?",
  "Les progrès se voient pas toujours, mais ils s'accumulent",
  "Aujourd'hui, juste un peu mieux",
  "Ton futur toi te remercie déjà",
  "On lâche rien",
  "Petit progrès > pas de progrès",
];

const logsStore = storage(LOGS_KEY);
const workoutsStore = storage(WORKOUTS_KEY);
const bodyweightsStore = storage(BODYWEIGHT_KEY);
const exerciseNotesStore = storage(EXERCISE_NOTES_KEY);

const saveLogs = () => logsStore.save(logs);
const saveWorkouts = () => workoutsStore.save(workouts);
const saveBodyweights = () => bodyweightsStore.save(bodyweights);
const saveExerciseNotes = () => exerciseNotesStore.save(exerciseNotes);

let logs = logsStore.load([]);
let workouts = workoutsStore.load([]);
let bodyweights = bodyweightsStore.load([]);
let exerciseNotes = exerciseNotesStore.load({});
let editingExerciseName = null;
let draftExercises = [];
let draftCover = null;
let editingDraftIndex = null;
let editingLogId = null;
let editingWorkoutId = null;

function formatDate(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });
}

function formatDateShort(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

/* ---------- Navigation ---------- */

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function switchView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === viewId));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));
  sessionStorage.setItem(LAST_VIEW_KEY, viewId);
  if (viewId === "view-progress") {
    renderProgress();
    if (!document.getElementById("progress-photo-mode").classList.contains("hidden")) renderPhotoGallery();
    if (!document.getElementById("progress-bodyweight-mode").classList.contains("hidden")) renderBodyweight();
  }
  if (viewId === "view-workouts") renderWorkouts();
}

switchView(sessionStorage.getItem(LAST_VIEW_KEY) || "view-workouts");

/* ---------- Accent color ---------- */

const ACCENT_COLORS = [
  { name: "Rouge", hue: 355 },
  { name: "Corail", hue: 12 },
  { name: "Orange", hue: 28 },
  { name: "Ambre", hue: 42 },
  { name: "Jaune", hue: 55 },
  { name: "Citron vert", hue: 78 },
  { name: "Vert lime", hue: 95 },
  { name: "Vert", hue: 130 },
  { name: "Menthe", hue: 152 },
  { name: "Émeraude", hue: 165 },
  { name: "Turquoise", hue: 178 },
  { name: "Cyan", hue: 190 },
  { name: "Bleu ciel", hue: 200 },
  { name: "Azur", hue: 215 },
  { name: "Bleu", hue: 225 },
  { name: "Indigo", hue: 240 },
  { name: "Mauve", hue: 250 },
  { name: "Violet", hue: 268 },
  { name: "Améthyste", hue: 285 },
  { name: "Rose", hue: 330 },
];

// (S%, L%) per token — tuned to match the app's original purple exactly;
// applying any hue through this recipe keeps the same contrast/feel.
const ACCENT_RECIPE = {
  light: { primary: [74, 63], primaryDark: [65, 55], primaryLight: [62, 73], tint: [35, 93], hover: [80, 96] },
  dark: { primary: [87, 72], primaryDark: [74, 63], primaryLight: [45, 48], tint: [24, 20], hover: [23, 23] },
};

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function applyAccentHue(hue) {
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  const recipe = dark ? ACCENT_RECIPE.dark : ACCENT_RECIPE.light;
  const root = document.documentElement.style;
  const primary = hslToHex(hue, ...recipe.primary);
  root.setProperty("--primary", primary);
  root.setProperty("--primary-dark", hslToHex(hue, ...recipe.primaryDark));
  root.setProperty("--primary-light", hslToHex(hue, ...recipe.primaryLight));
  root.setProperty("--tint", hslToHex(hue, ...recipe.tint));
  root.setProperty("--hover", hslToHex(hue, ...recipe.hover));
  // Keep the iOS status bar / PWA chrome in sync with the current theme + accent.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#15141c" : primary);
}

/* ---------- Theme ---------- */

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  $("dark-mode-toggle").checked = theme === "dark";
  applyAccentHue(Number(localStorage.getItem(ACCENT_HUE_KEY)) || 250);
}

const storedTheme = localStorage.getItem(THEME_KEY);
const systemPrefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
applyTheme(storedTheme || (systemPrefersDark ? "dark" : "light"));

document.getElementById("dark-mode-toggle").addEventListener("change", (e) => {
  const theme = e.target.checked ? "dark" : "light";
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

function renderAccentColorGrid() {
  const current = Number(localStorage.getItem(ACCENT_HUE_KEY)) || 250;
  document.getElementById("accent-color-grid").innerHTML = ACCENT_COLORS.map((c) => `
    <button type="button" class="accent-color-swatch ${c.hue === current ? "active" : ""}" style="background: ${hslToHex(c.hue, 74, 55)}" data-hue="${c.hue}" title="${c.name}" aria-label="${c.name}"></button>
  `).join("");
}

document.getElementById("accent-color-btn").addEventListener("click", () => {
  renderAccentColorGrid();
  document.getElementById("accent-color-overlay").classList.remove("hidden");
});

document.getElementById("accent-color-close").addEventListener("click", () => {
  document.getElementById("accent-color-overlay").classList.add("hidden");
});

document.getElementById("accent-color-grid").addEventListener("click", (e) => {
  const btn = e.target.closest(".accent-color-swatch");
  if (!btn) return;
  const hue = Number(btn.dataset.hue);
  localStorage.setItem(ACCENT_HUE_KEY, hue);
  applyAccentHue(hue);
  document.getElementById("accent-color-overlay").classList.add("hidden");
});

/* ---------- Exercise registry (rename + notes) ---------- */

function renameExerciseEverywhere(oldName, newName) {
  if (!newName || oldName === newName) return;

  logs.forEach((l) => { if (l.exercise === oldName) l.exercise = newName; });
  workouts.forEach((w) => w.exercises.forEach((ex) => { if (ex.name === oldName) ex.name = newName; }));

  if (exerciseNotes[oldName] !== undefined) {
    exerciseNotes[newName] = exerciseNotes[oldName];
    delete exerciseNotes[oldName];
  }

  saveLogs();
  saveWorkouts();
  saveExerciseNotes();
}

function renderExerciseManager() {
  const container = document.getElementById("exercise-manager-list");
  const names = allExerciseNames();

  if (names.length === 0) {
    container.innerHTML = `<p class="empty-state">Aucun exercice encore.</p>`;
    return;
  }

  container.innerHTML = names.map((name) => {
    if (name === editingExerciseName) {
      return `
        <div class="exercise-manager-row editing">
          <input type="text" id="exercise-manager-name-input" value="${esc(name)}">
          <textarea id="exercise-manager-note-input" placeholder="Note (ex: grip large, attention à l'épaule)" rows="2">${esc(exerciseNotes[name] || "")}</textarea>
          <div class="form-actions">
            <button type="button" id="exercise-manager-save">Enregistrer</button>
            <button type="button" id="exercise-manager-cancel" class="secondary-btn">Annuler</button>
          </div>
        </div>
      `;
    }
    const note = exerciseNotes[name];
    return `
      <div class="exercise-manager-row">
        <div class="exercise-manager-info">
          <strong>${esc(name)}</strong>
          ${note ? `<span class="exercise-manager-note">📝 ${esc(note)}</span>` : ""}
        </div>
        <button type="button" class="edit-btn" data-name="${esc(name)}">✎</button>
      </div>
    `;
  }).join("");
}

document.getElementById("manage-exercises-btn").addEventListener("click", () => {
  editingExerciseName = null;
  renderExerciseManager();
  document.getElementById("exercise-manager-overlay").classList.remove("hidden");
});

document.getElementById("exercise-manager-close").addEventListener("click", () => {
  document.getElementById("exercise-manager-overlay").classList.add("hidden");
});

document.getElementById("exercise-manager-list").addEventListener("click", (e) => {
  if (e.target.matches(".edit-btn")) {
    editingExerciseName = e.target.dataset.name;
    renderExerciseManager();
    return;
  }

  if (e.target.id === "exercise-manager-cancel") {
    editingExerciseName = null;
    renderExerciseManager();
    return;
  }

  if (e.target.id === "exercise-manager-save") {
    const oldName = editingExerciseName;
    const newName = document.getElementById("exercise-manager-name-input").value.trim();
    const note = document.getElementById("exercise-manager-note-input").value.trim();
    if (!newName) return;

    if (newName !== oldName) renameExerciseEverywhere(oldName, newName);
    if (note) exerciseNotes[newName] = note;
    else delete exerciseNotes[newName];
    saveExerciseNotes();

    editingExerciseName = null;
    renderExerciseManager();
    renderLog();
    renderWorkouts();
    renderProgress();
  }
});

/* ---------- Bodyweight tracking ---------- */

document.getElementById("bodyweight-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const weight = Number(document.getElementById("bodyweight-input").value);
  const now = new Date();
  bodyweights.push({
    id: crypto.randomUUID(),
    weight,
    date: now.toISOString().slice(0, 10),
    createdAt: now.getTime(),
  });
  saveBodyweights();
  e.target.reset();
  renderBodyweight();
});

document.getElementById("bodyweight-list").addEventListener("click", (e) => {
  if (!e.target.matches(".bw-delete")) return;
  if (!confirm("Supprimer cette pesée ?")) return;
  bodyweights = bodyweights.filter((b) => b.id !== e.target.dataset.id);
  saveBodyweights();
  renderBodyweight();
});

function renderBodyweight() {
  const sorted = [...bodyweights].sort((a, b) => a.createdAt - b.createdAt);
  const statsBox = document.getElementById("bodyweight-stats");
  const chartBox = document.getElementById("bodyweight-chart-container");
  const listBox = document.getElementById("bodyweight-list");

  if (sorted.length === 0) {
    statsBox.innerHTML = "";
    chartBox.innerHTML = `<p class="empty-state">Ajoute ta première pesée pour voir ta courbe ici.</p>`;
    listBox.innerHTML = "";
    return;
  }

  const points = sorted.map((b) => ({ date: b.date, value: b.weight }));
  const latest = points[points.length - 1].value;
  const first = points[0].value;
  const diff = latest - first;

  statsBox.innerHTML = `
    <div class="stat-box">
      <div class="value">${latest} lb</div>
      <div class="label">Actuel</div>
    </div>
    <div class="stat-box">
      <div class="value">${diff >= 0 ? "+" : ""}${diff.toFixed(1)} lb</div>
      <div class="label">Depuis le début</div>
    </div>
  `;

  chartBox.innerHTML = buildLineChartSVG(points, "lb");

  const recent = [...sorted].reverse().slice(0, 15);
  listBox.innerHTML = recent.map((b) => `
    <div class="bodyweight-row">
      <span>${formatDateShort(b.date)}</span>
      <strong>${b.weight} lb</strong>
      <button type="button" class="bw-delete" data-id="${b.id}">✕</button>
    </div>
  `).join("");
}

/* ---------- Image helpers ---------- */

function compressImage(file, maxWidth = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Preset cover art (generated locally, works offline) ---------- */

function coverIconSVG(icon) {
  const c = "rgba(255,255,255,0.92)";
  switch (icon) {
    case "barbell":
      return `<g fill="${c}">
        <rect x="150" y="88" width="100" height="24" rx="4"/>
        <rect x="110" y="66" width="24" height="68" rx="4"/>
        <rect x="266" y="66" width="24" height="68" rx="4"/>
        <rect x="86" y="76" width="18" height="48" rx="4"/>
        <rect x="296" y="76" width="18" height="48" rx="4"/>
      </g>`;
    case "mountain":
      return `<polygon points="0,200 90,90 150,150 220,60 320,160 400,120 400,200" fill="${c}"/>`;
    case "sun":
      return `<g fill="${c}">
        <circle cx="200" cy="100" r="32"/>
        ${[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          const x1 = 200 + Math.cos(rad) * 46, y1 = 100 + Math.sin(rad) * 46;
          const x2 = 200 + Math.cos(rad) * 62, y2 = 100 + Math.sin(rad) * 62;
          return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="5" stroke-linecap="round"/>`;
        }).join("")}
      </g>`;
    case "wave":
      return `<path d="M0,140 C60,110 100,170 160,140 C220,110 260,170 320,140 C360,120 380,130 400,140 L400,200 L0,200 Z" fill="${c}"/>`;
    case "burst":
      return `<g fill="${c}">
        ${Array.from({ length: 10 }).map((_, i) => {
          const rad = (i * 36 * Math.PI) / 180;
          const x = 200 + Math.cos(rad) * 68, y = 100 + Math.sin(rad) * 68;
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6"/>`;
        }).join("")}
        <circle cx="200" cy="100" r="24"/>
      </g>`;
    case "runner":
      return `<g fill="${c}">
        <circle cx="200" cy="58" r="14"/>
        <rect x="190" y="76" width="20" height="46" rx="8"/>
        <rect x="163" y="80" width="34" height="10" rx="5" transform="rotate(-20 180 85)"/>
        <rect x="203" y="80" width="34" height="10" rx="5" transform="rotate(20 220 85)"/>
        <rect x="176" y="118" width="12" height="46" rx="6" transform="rotate(-24 182 141)"/>
        <rect x="208" y="118" width="12" height="46" rx="6" transform="rotate(18 214 141)"/>
      </g>`;
    default:
      return "";
  }
}

function buildPresetSVG({ colors: [c1, c2], icon }) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c1}"/>
        <stop offset="1" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="200" fill="url(#g)"/>
    ${coverIconSVG(icon)}
  </svg>`;
  return "data:image/svg+xml;base64," + btoa(svg);
}

const COVER_PRESETS = [
  { colors: ["#f97316", "#ec4899"], icon: "barbell" },
  { colors: ["#0ea5e9", "#14b8a6"], icon: "wave" },
  { colors: ["#7c3aed", "#f97316"], icon: "mountain" },
  { colors: ["#16a34a", "#4ade80"], icon: "mountain" },
  { colors: ["#0f172a", "#334155"], icon: "sun" },
  { colors: ["#d946ef", "#6366f1"], icon: "burst" },
  { colors: ["#facc15", "#f97316"], icon: "runner" },
  { colors: ["#64748b", "#1e293b"], icon: "barbell" },
  { colors: ["#ec4899", "#a855f7"], icon: "wave" },
  { colors: ["#84cc16", "#22c55e"], icon: "burst" },
  { colors: ["#6c5ce7", "#5341d6"], icon: "barbell" },
  { colors: ["#ef4444", "#f97316"], icon: "runner" },
  { colors: ["#06b6d4", "#0891b2"], icon: "mountain" },
  { colors: ["#111827", "#374151"], icon: "barbell" },
  { colors: ["#fda4af", "#fdba74"], icon: "sun" },
].map((p, i) => ({ id: `preset-${i}`, ...p, dataUrl: buildPresetSVG(p) }));

function renderCoverPresetGrid() {
  document.getElementById("cover-preset-grid").innerHTML = COVER_PRESETS.map((p) => `
    <button type="button" class="cover-preset-tile" data-id="${p.id}" style="background-image:url('${p.dataUrl}')"></button>
  `).join("");
}

/* ---------- Toast ---------- */

let toastTimeout = null;

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add("hidden"), 2500);
}

/* ---------- Progress photos (IndexedDB) ---------- */

const PHOTO_DB_NAME = "workout-tracker-db";
const PHOTO_STORE = "photos";
let photoDbPromise = null;

function openPhotoDB() {
  if (photoDbPromise) return photoDbPromise;
  photoDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PHOTO_STORE)) {
        req.result.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return photoDbPromise;
}

async function addPhoto(record) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllPhotos() {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(PHOTO_STORE, "readonly").objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deletePhoto(id) {
  const db = await openPhotoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function renderPhotoGallery() {
  const container = document.getElementById("photo-gallery");
  const photos = (await getAllPhotos()).sort((a, b) => b.date.localeCompare(a.date));

  if (photos.length === 0) {
    container.innerHTML = `<p class="empty-state">Aucune photo encore. Ajoute ta première photo de progression.</p>`;
    return;
  }

  container.innerHTML = photos.map((p) => `
    <div class="photo-card">
      <img src="${p.dataUrl}" alt="Photo du ${formatDateShort(p.date)}">
      <div class="photo-date">${formatDateShort(p.date)}</div>
      <button type="button" class="photo-delete" data-id="${p.id}">✕</button>
    </div>
  `).join("");
}

document.getElementById("progress-mode-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-mode]");
  if (!btn) return;
  document.querySelectorAll("#progress-mode-toggle button").forEach((b) => b.classList.toggle("active", b === btn));
  const mode = btn.dataset.mode;
  document.getElementById("progress-chart-mode").classList.toggle("hidden", mode !== "chart");
  document.getElementById("progress-bodyweight-mode").classList.toggle("hidden", mode !== "bodyweight");
  document.getElementById("progress-photo-mode").classList.toggle("hidden", mode !== "photos");
  if (mode === "photos") renderPhotoGallery();
  if (mode === "bodyweight") renderBodyweight();
});

document.getElementById("add-photo-btn").addEventListener("click", () => {
  document.getElementById("photo-upload-input").click();
});

document.getElementById("photo-upload-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const dataUrl = await compressImage(file, 900, 0.75);
  await addPhoto({ id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), dataUrl });
  e.target.value = "";
  renderPhotoGallery();
});

document.getElementById("photo-gallery").addEventListener("click", async (e) => {
  if (e.target.matches(".photo-delete")) {
    if (!confirm("Supprimer cette photo ?")) return;
    await deletePhoto(e.target.dataset.id);
    renderPhotoGallery();
    return;
  }
  if (e.target.tagName === "IMG") {
    document.getElementById("photo-lightbox-img").src = e.target.src;
    document.getElementById("photo-lightbox").classList.remove("hidden");
  }
});

document.getElementById("photo-lightbox-close").addEventListener("click", () => {
  document.getElementById("photo-lightbox").classList.add("hidden");
});

/* ---------- Action menu (⋯) ---------- */

let actionMenuContext = null;

function openActionMenu(btn, type, id) {
  actionMenuContext = { type, id };
  const menu = document.getElementById("action-menu");
  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  menu.style.left = "auto";
  menu.classList.remove("hidden");
}

function closeActionMenu() {
  document.getElementById("action-menu").classList.add("hidden");
  actionMenuContext = null;
}

document.getElementById("action-menu-note").addEventListener("click", () => {
  const ctx = actionMenuContext;
  closeActionMenu();
  if (!ctx) return;
  if (ctx.type === "log") {
    const name = logs.find((l) => l.id === ctx.id)?.exercise;
    if (name) openNoteEditor(name);
  } else {
    openNoteExercisePicker(ctx.id);
  }
});

document.getElementById("action-menu-edit").addEventListener("click", () => {
  const ctx = actionMenuContext;
  closeActionMenu();
  if (!ctx) return;
  if (ctx.type === "log") editLogEntry(ctx.id);
  else editWorkout(ctx.id);
});

document.getElementById("action-menu-delete").addEventListener("click", () => {
  const ctx = actionMenuContext;
  closeActionMenu();
  if (!ctx) return;
  if (ctx.type === "log") deleteLogEntry(ctx.id);
  else deleteWorkout(ctx.id);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".menu-btn") && !e.target.closest("#action-menu")) closeActionMenu();
});

/* ---------- Note editor (per exercise, opened from ⋯ menu) ---------- */

let noteEditorExercise = null;

function openNoteEditor(exerciseName) {
  noteEditorExercise = exerciseName;
  document.getElementById("note-editor-title").textContent = `Note — ${exerciseName}`;
  document.getElementById("note-editor-input").value = exerciseNotes[exerciseName] || "";
  document.getElementById("note-editor-overlay").classList.remove("hidden");
}

function closeNoteEditor() {
  document.getElementById("note-editor-overlay").classList.add("hidden");
  noteEditorExercise = null;
}

document.getElementById("note-editor-close").addEventListener("click", closeNoteEditor);
document.getElementById("note-editor-cancel").addEventListener("click", closeNoteEditor);

document.getElementById("note-editor-save").addEventListener("click", () => {
  const note = document.getElementById("note-editor-input").value.trim();
  if (note) exerciseNotes[noteEditorExercise] = note;
  else delete exerciseNotes[noteEditorExercise];
  saveExerciseNotes();
  closeNoteEditor();
  renderWorkouts();
  updateExerciseNoteHint();
});

/* ---------- Note exercise picker (choose which exercise to annotate) ---------- */

function openNoteExercisePicker(workoutId) {
  const w = workouts.find((w) => w.id === workoutId);
  if (!w) return;
  document.getElementById("note-exercise-picker-list").innerHTML = w.exercises
    .map((ex) => `
      <div class="exercise-manager-row note-pick-row" data-name="${esc(ex.name)}">
        <div class="exercise-manager-info">
          <strong>${esc(ex.name)}</strong>
          ${exerciseNotes[ex.name] ? `<span class="exercise-manager-note">📝 ${esc(exerciseNotes[ex.name])}</span>` : ""}
        </div>
        <span class="edit-btn">📝</span>
      </div>
    `)
    .join("");
  document.getElementById("note-exercise-picker-overlay").classList.remove("hidden");
}

function closeNoteExercisePicker() {
  document.getElementById("note-exercise-picker-overlay").classList.add("hidden");
}

document.getElementById("note-exercise-picker-close").addEventListener("click", closeNoteExercisePicker);

document.getElementById("note-exercise-picker-list").addEventListener("click", (e) => {
  const row = e.target.closest(".note-pick-row");
  if (!row) return;
  closeNoteExercisePicker();
  openNoteEditor(row.dataset.name);
});

/* ---------- Encouragement ---------- */

function showEncouragement() {
  const phrase = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
  document.getElementById("encouragement").textContent = phrase;
}

/* ---------- Log view ---------- */

function allExerciseNames() {
  const fromLogs = logs.map((l) => l.exercise);
  const fromWorkouts = workouts.flatMap((w) => w.exercises.map((ex) => ex.name));
  return [...new Set([...fromLogs, ...fromWorkouts])].sort((a, b) => a.localeCompare(b));
}

function populateProgramSelect() {
  const select = document.getElementById("program-select");
  const current = select.value;
  select.innerHTML = `<option value="">Libre (tous les exercices)</option>` +
    workouts.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join("");
  if (workouts.some((w) => w.id === current)) select.value = current;
}

function setupCombobox(input, dropdown, sourceFn, onSelect) {
  function open(filter = "") {
    const names = sourceFn();
    const q = filter.trim().toLowerCase();
    const matches = q ? names.filter((n) => n.toLowerCase().includes(q)) : names;

    dropdown.innerHTML = matches.length
      ? matches.map((n) => `<div class="combobox-option" data-name="${esc(n)}">${esc(n)}</div>`).join("")
      : `<div class="combobox-empty">Aucun exercice existant — tape pour en créer un nouveau</div>`;

    dropdown.classList.add("open");
  }

  function close() {
    dropdown.classList.remove("open");
  }

  input.addEventListener("focus", () => open(input.value));
  input.addEventListener("input", () => open(input.value));

  dropdown.addEventListener("mousedown", (e) => {
    const opt = e.target.closest(".combobox-option");
    if (!opt) return;
    input.value = opt.dataset.name;
    close();
    if (onSelect) onSelect(opt.dataset.name);
  });

  return { open, close };
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".combobox-wrap")) {
    exerciseCombobox.close();
    newExerciseCombobox.close();
  }
});

const exerciseInput = document.getElementById("exercise");

function exerciseSuggestionSource() {
  const programId = document.getElementById("program-select").value;
  return programId
    ? workouts.find((w) => w.id === programId)?.exercises.map((ex) => ex.name) ?? []
    : allExerciseNames();
}

function prefillFromProgram(name) {
  const programId = document.getElementById("program-select").value;
  if (!programId) return;
  const program = workouts.find((w) => w.id === programId);
  const ex = program?.exercises.find((e) => e.name === name);
  if (!ex) return;
  if (ex.sets) document.getElementById("sets").value = ex.sets;
  if (ex.reps) {
    const match = ex.reps.match(/\d+/);
    if (match) document.getElementById("reps").value = match[0];
  }
}

function updateExerciseNoteHint() {
  const hint = document.getElementById("exercise-note-hint");
  const note = exerciseNotes[exerciseInput.value.trim()];
  if (note) {
    hint.textContent = `📝 ${note}`;
    hint.classList.remove("hidden");
  } else {
    hint.classList.add("hidden");
  }
}

function updateWeightPlaceholder() {
  const exercise = exerciseInput.value.trim();
  const lastEntry = logs
    .filter((l) => l.exercise === exercise)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  document.getElementById("weight").placeholder = lastEntry ? String(lastEntry.weight) : "";
}

exerciseInput.addEventListener("input", () => {
  updateExerciseNoteHint();
  updateWeightPlaceholder();
});

const exerciseCombobox = setupCombobox(exerciseInput, document.getElementById("exercise-dropdown"), exerciseSuggestionSource, (name) => {
  prefillFromProgram(name);
  updateExerciseNoteHint();
  updateWeightPlaceholder();
});

function closeExerciseDropdown() {
  exerciseCombobox.close();
}

document.getElementById("program-select").addEventListener("change", closeExerciseDropdown);

const newExerciseInput = document.getElementById("new-exercise-name");
const newExerciseCombobox = setupCombobox(newExerciseInput, document.getElementById("new-exercise-dropdown"), allExerciseNames);

/* ---------- Per-set weights (optional, opt-in via checkbox) ---------- */

// A log entry may carry `perSet: [{ weight, reps }, ...]` — one object per set.
// When present, the flat weight/sets/reps fields are kept filled as a summary
// (heaviest set) so every existing reader keeps working unchanged.
function summarizePerSet(perSet) {
  const top = perSet.reduce((a, b) => (b.weight > a.weight ? b : a), perSet[0]);
  return { weight: top.weight, sets: perSet.length, reps: top.reps };
}

function formatPerSet(perSet) {
  return `${perSet.length} séries · ${perSet.map((s) => `${s.weight}×${s.reps}`).join(", ")}`;
}

// Reads the raw (string) values currently typed into a per-set list.
function psReadRows(listEl) {
  return [...listEl.querySelectorAll(".per-set-row")].map((row) => ({
    weight: row.querySelector(".ps-weight").value,
    reps: row.querySelector(".ps-reps").value,
  }));
}

// Paints N set rows + an "add" button. `rows` values may be strings or numbers.
function renderSetRows(listEl, rows) {
  const list = rows.length ? rows : [{ weight: "", reps: "" }];
  listEl.innerHTML =
    list.map((r, i) => `
      <div class="per-set-row">
        <span class="per-set-n">Série ${i + 1}</span>
        <div class="field">
          <label>Poids (lb)</label>
          <input type="number" class="ps-weight" step="0.5" min="0" value="${esc(r.weight ?? "")}">
        </div>
        <div class="field">
          <label>Reps</label>
          <input type="number" class="ps-reps" min="1" value="${esc(r.reps ?? "")}">
        </div>
        <button type="button" class="ps-remove" aria-label="Retirer la série" ${list.length === 1 ? "disabled" : ""}>✕</button>
      </div>
    `).join("") +
    `<button type="button" class="per-set-add secondary-btn">+ Ajouter une série</button>`;
}

// Parsed + validated rows, ready to store. Returns null if any kept row is incomplete.
function readSetRows(listEl) {
  const raw = psReadRows(listEl).filter((r) => r.weight !== "" || r.reps !== "");
  if (!raw.length) return null;
  const parsed = raw.map((r) => ({ weight: Number(r.weight), reps: Number(r.reps) }));
  if (parsed.some((r) => !Number.isFinite(r.weight) || !Number.isFinite(r.reps) || r.reps < 1)) return null;
  return parsed;
}

// Toggles a form between the single weight/sets/reps row and the per-set list.
// Also drops `required` from the hidden inputs (a hidden required control blocks submit).
function setPerSetMode(scope, on) {
  const single = document.getElementById(`${scope}-single-fields`);
  const list = document.getElementById(`${scope}-per-set-list`);
  single.classList.toggle("hidden", on);
  list.classList.toggle("hidden", !on);
  single.querySelectorAll("input").forEach((inp) => { inp.required = !on; });
}

// Seed rows from whatever is already typed in the single fields (repeated `count` times).
function seedPerSetRows(scope, count) {
  const single = document.getElementById(`${scope}-single-fields`);
  const weight = single.querySelector('[id$="weight"]').value;
  const reps = single.querySelector('[id$="reps"]').value;
  const n = Math.max(1, Number(count) || Number(single.querySelector('[id$="sets"]').value) || 3);
  return Array.from({ length: n }, () => ({ weight, reps }));
}

// Wire add/remove for both per-set lists once (innerHTML swaps keep the container).
["log-per-set-list", "guided-per-set-list"].forEach((listId) => {
  const listEl = document.getElementById(listId);
  listEl.addEventListener("click", (e) => {
    const rows = psReadRows(listEl);
    if (e.target.closest(".per-set-add")) {
      rows.push({ weight: "", reps: "" });
      renderSetRows(listEl, rows);
    } else if (e.target.closest(".ps-remove") && !e.target.closest(".ps-remove").disabled) {
      const i = [...listEl.querySelectorAll(".per-set-row")].indexOf(e.target.closest(".per-set-row"));
      if (rows.length > 1) {
        rows.splice(i, 1);
        renderSetRows(listEl, rows);
      }
    }
  });
});

document.getElementById("log-per-set-toggle").addEventListener("change", (e) => {
  const on = e.target.checked;
  setPerSetMode("log", on);
  if (on) renderSetRows(document.getElementById("log-per-set-list"), seedPerSetRows("log"));
});

document.getElementById("guided-per-set-toggle").addEventListener("change", (e) => {
  const on = e.target.checked;
  setPerSetMode("guided", on);
  if (on) {
    const step = guidedSteps[guidedIndex];
    renderSetRows(document.getElementById("guided-per-set-list"), seedPerSetRows("guided", step && step.sets));
  }
});

function renderLog() {
  const container = document.getElementById("log-list");

  if (logs.length === 0) {
    container.innerHTML = `<p class="empty-state">Aucun log encore. Ajoute ta première séance ci-dessus.</p>`;
    return;
  }

  const sorted = [...logs].sort((a, b) => b.createdAt - a.createdAt);

  const groups = {};
  for (const log of sorted) {
    if (!groups[log.date]) groups[log.date] = [];
    groups[log.date].push(log);
  }

  container.innerHTML = Object.entries(groups)
    .map(([date, entries]) => `
      <div class="day-group">
        <h2>${formatDate(date)}</h2>
        ${entries.map((entry) => `
          <div class="log-entry">
            <div class="info">
              <strong>${esc(entry.exercise)}</strong>
              <span>${entry.perSet ? esc(formatPerSet(entry.perSet)) : `${entry.weight} lb × ${entry.sets} séries × ${entry.reps} reps`}</span>
              ${entry.workoutName ? `<span class="tag">${esc(entry.workoutName)}</span>` : ""}
            </div>
            <button class="menu-btn" data-id="${entry.id}">⋯</button>
          </div>
        `).join("")}
      </div>
    `)
    .join("");
}

function resetLogForm() {
  editingLogId = null;
  document.getElementById("log-submit-btn").textContent = "Ajouter";
  document.getElementById("log-cancel-btn").classList.add("hidden");
  document.getElementById("log-per-set-toggle").checked = false;
  setPerSetMode("log", false);
  document.getElementById("log-per-set-list").innerHTML = "";
}

document.getElementById("log-form").addEventListener("submit", (e) => {
  e.preventDefault();

  const programId = document.getElementById("program-select").value;
  const program = workouts.find((w) => w.id === programId);
  const exercise = document.getElementById("exercise").value.trim();

  const perSetOn = document.getElementById("log-per-set-toggle").checked;
  let perSet = null;
  if (perSetOn) {
    perSet = readSetRows(document.getElementById("log-per-set-list"));
    if (!perSet) {
      showToast("Chaque série a besoin d'un poids et de reps");
      return;
    }
  }

  const { weight, sets, reps } = perSet
    ? summarizePerSet(perSet)
    : {
        weight: Number(document.getElementById("weight").value),
        sets: Number(document.getElementById("sets").value),
        reps: Number(document.getElementById("reps").value),
      };
  const previousBest = Math.max(0, ...logs.filter((l) => l.exercise === exercise).map((l) => l.weight));

  if (editingLogId) {
    const entry = logs.find((l) => l.id === editingLogId);
    if (exercise && exercise !== entry.exercise) renameExerciseEverywhere(entry.exercise, exercise);
    Object.assign(entry, {
      exercise, weight, sets, reps,
      workoutId: program ? program.id : null,
      workoutName: program ? program.name : null,
    });
    if (perSet) entry.perSet = perSet;
    else delete entry.perSet;
  } else {
    const now = new Date();
    logs.push({
      id: crypto.randomUUID(),
      exercise, weight, sets, reps,
      ...(perSet ? { perSet } : {}),
      date: now.toISOString().slice(0, 10),
      createdAt: now.getTime(),
      workoutId: program ? program.id : null,
      workoutName: program ? program.name : null,
    });
  }

  saveLogs();
  renderLog();
  showEncouragement();

  const wasEditing = Boolean(editingLogId);
  if (!wasEditing && previousBest > 0 && weight > previousBest) {
    showToast(`🏆 Nouveau record : ${weight} lb !`);
  }

  resetLogForm();
  e.target.reset();
  if (!wasEditing) document.getElementById("program-select").value = programId;
  exerciseInput.focus();
  closeExerciseDropdown();
  updateExerciseNoteHint();
  updateWeightPlaceholder();
});

document.getElementById("log-cancel-btn").addEventListener("click", () => {
  resetLogForm();
  document.getElementById("log-form").reset();
  closeExerciseDropdown();
  updateExerciseNoteHint();
  updateWeightPlaceholder();
});

function editLogEntry(id) {
  const entry = logs.find((l) => l.id === id);
  if (!entry) return;
  editingLogId = entry.id;
  document.getElementById("program-select").value = entry.workoutId || "";
  exerciseInput.value = entry.exercise;
  updateExerciseNoteHint();
  updateWeightPlaceholder();
  document.getElementById("weight").value = entry.weight;
  document.getElementById("sets").value = entry.sets;
  document.getElementById("reps").value = entry.reps;

  const perSetToggle = document.getElementById("log-per-set-toggle");
  perSetToggle.checked = Boolean(entry.perSet);
  setPerSetMode("log", perSetToggle.checked);
  if (entry.perSet) renderSetRows(document.getElementById("log-per-set-list"), entry.perSet);
  else document.getElementById("log-per-set-list").innerHTML = "";

  document.getElementById("log-submit-btn").textContent = "Mettre à jour";
  document.getElementById("log-cancel-btn").classList.remove("hidden");
  switchView("view-log");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteLogEntry(id) {
  if (!confirm("Supprimer ce log ?")) return;
  logs = logs.filter((log) => log.id !== id);
  saveLogs();
  renderLog();
}

document.getElementById("log-list").addEventListener("click", (e) => {
  const btn = e.target.closest(".menu-btn");
  if (btn) openActionMenu(btn, "log", btn.dataset.id);
});

/* ---------- Workouts (programmes) view ---------- */

// Rebuilds `group` ids purely from array order: an entry keeps its predecessor's
// group only if they already shared a group id. Reordering that pulls a superset
// member away from its partner therefore dissolves the pair instead of leaving
// two non-adjacent entries wearing the same id (which broke the A/B labelling).
function normalizeGroups(exercises) {
  const original = exercises.map((ex) => ex.group);
  let current = 0;
  exercises.forEach((ex, i) => {
    if (i > 0 && original[i] !== original[i - 1]) current++;
    ex.group = current;
  });
  return exercises;
}

// Assigns display labels (A, A1/A2 for supersets, B, C...) based on
// consecutive entries sharing the same `group` id. Works on normalized copies so
// callers' objects are untouched and stale data still labels correctly.
function labelExerciseGroups(exercises) {
  exercises = normalizeGroups(exercises.map((ex) => ({ ...ex })));
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let letterIndex = -1;
  let lastGroup = null;
  const groupSizes = {};
  exercises.forEach((ex) => { groupSizes[ex.group] = (groupSizes[ex.group] || 0) + 1; });

  const counters = {};
  return exercises.map((ex) => {
    if (ex.group !== lastGroup) {
      letterIndex++;
      lastGroup = ex.group;
      counters[ex.group] = 0;
    }
    counters[ex.group]++;
    const letter = letters[letterIndex % letters.length];
    const inSuperset = groupSizes[ex.group] > 1;
    return { ...ex, label: inSuperset ? `${letter}${counters[ex.group]}` : letter, inSuperset };
  });
}

function renderDraftChips() {
  const container = document.getElementById("draft-exercise-list");
  const toggleWrap = document.getElementById("superset-toggle-wrap");
  toggleWrap.classList.toggle("hidden", draftExercises.length === 0);

  const labeled = labelExerciseGroups(draftExercises);
  container.innerHTML = labeled
    .map((ex, i) => `
      <div class="draft-card ${ex.inSuperset ? "in-superset" : ""}">
        <span class="group-label">${ex.label}</span>
        <div class="draft-info">
          <strong>${esc(ex.name)}</strong>
          <span>${[ex.sets && `${ex.sets} séries`, ex.reps && `${esc(ex.reps)} reps`].filter(Boolean).join(" · ") || "—"}</span>
          ${exerciseNotes[ex.name] ? `<span class="ex-note" title="${esc(exerciseNotes[ex.name])}">📝 ${esc(exerciseNotes[ex.name])}</span>` : ""}
        </div>
        <div class="draft-actions">
          <button type="button" class="edit-draft" data-i="${i}">✎</button>
          <button type="button" class="move-up" data-i="${i}" ${i === 0 ? "disabled" : ""}>▲</button>
          <button type="button" class="move-down" data-i="${i}" ${i === draftExercises.length - 1 ? "disabled" : ""}>▼</button>
          <button type="button" class="remove-draft" data-i="${i}">✕</button>
        </div>
      </div>
    `)
    .join("");
}

function updateCoverPreview() {
  const img = document.getElementById("workout-cover-preview");
  const removeBtn = document.getElementById("workout-cover-remove");
  if (draftCover) {
    img.src = draftCover;
    img.classList.remove("hidden");
    removeBtn.classList.remove("hidden");
  } else {
    img.classList.add("hidden");
    removeBtn.classList.add("hidden");
  }
}

document.getElementById("workout-cover-btn").addEventListener("click", () => {
  renderCoverPresetGrid();
  document.getElementById("cover-picker-overlay").classList.remove("hidden");
});

document.getElementById("cover-picker-close").addEventListener("click", () => {
  document.getElementById("cover-picker-overlay").classList.add("hidden");
});

document.getElementById("cover-preset-grid").addEventListener("click", (e) => {
  const tile = e.target.closest(".cover-preset-tile");
  if (!tile) return;
  const preset = COVER_PRESETS.find((p) => p.id === tile.dataset.id);
  draftCover = preset.dataUrl;
  updateCoverPreview();
  document.getElementById("cover-picker-overlay").classList.add("hidden");
});

document.getElementById("cover-upload-btn").addEventListener("click", () => {
  document.getElementById("cover-picker-overlay").classList.add("hidden");
  document.getElementById("workout-cover-input").click();
});

document.getElementById("workout-cover-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  draftCover = await compressImage(file, 600, 0.7);
  updateCoverPreview();
  e.target.value = "";
});

document.getElementById("workout-cover-remove").addEventListener("click", () => {
  draftCover = null;
  updateCoverPreview();
});

document.getElementById("add-exercise-btn").addEventListener("click", addDraftExercise);
newExerciseInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addDraftExercise();
  }
});

function cancelDraftExerciseEdit() {
  editingDraftIndex = null;
  document.getElementById("add-exercise-btn").textContent = "Ajouter à la liste";
  document.getElementById("cancel-draft-edit-btn").classList.add("hidden");
  newExerciseInput.value = "";
  document.getElementById("new-exercise-sets").value = "";
  document.getElementById("new-exercise-reps").value = "";
}

document.getElementById("cancel-draft-edit-btn").addEventListener("click", cancelDraftExerciseEdit);

function addDraftExercise() {
  const name = newExerciseInput.value.trim();
  if (!name) return;

  const sets = document.getElementById("new-exercise-sets").value;
  const reps = document.getElementById("new-exercise-reps").value.trim();

  if (editingDraftIndex !== null) {
    const original = draftExercises[editingDraftIndex];
    if (name !== original.name) renameExerciseEverywhere(original.name, name);
    draftExercises[editingDraftIndex] = {
      ...original,
      name,
      sets: sets ? Number(sets) : null,
      reps: reps || null,
    };
    cancelDraftExerciseEdit();
  } else {
    const superset = document.getElementById("new-exercise-superset").checked;
    const lastGroup = draftExercises.length ? draftExercises[draftExercises.length - 1].group : -1;
    const group = superset && draftExercises.length ? lastGroup : lastGroup + 1;

    draftExercises.push({
      name,
      sets: sets ? Number(sets) : null,
      reps: reps || null,
      group,
    });
  }

  newExerciseInput.value = "";
  document.getElementById("new-exercise-sets").value = "";
  document.getElementById("new-exercise-reps").value = "";
  document.getElementById("new-exercise-superset").checked = false;
  newExerciseInput.focus();
  renderDraftChips();
  renderLog();
  renderWorkouts();
}

document.getElementById("draft-exercise-list").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const i = Number(btn.dataset.i);

  if (btn.matches(".edit-draft")) {
    editingDraftIndex = i;
    const ex = draftExercises[i];
    newExerciseInput.value = ex.name;
    document.getElementById("new-exercise-sets").value = ex.sets || "";
    document.getElementById("new-exercise-reps").value = ex.reps || "";
    document.getElementById("add-exercise-btn").textContent = "Mettre à jour";
    document.getElementById("cancel-draft-edit-btn").classList.remove("hidden");
    newExerciseInput.focus();
    return;
  }

  if (btn.matches(".remove-draft")) {
    if (editingDraftIndex === i) cancelDraftExerciseEdit();
    draftExercises.splice(i, 1);
  } else if (btn.matches(".move-up") && i > 0) {
    [draftExercises[i - 1], draftExercises[i]] = [draftExercises[i], draftExercises[i - 1]];
  } else if (btn.matches(".move-down") && i < draftExercises.length - 1) {
    [draftExercises[i + 1], draftExercises[i]] = [draftExercises[i], draftExercises[i + 1]];
  }
  renderDraftChips();
});

function resetWorkoutForm() {
  editingWorkoutId = null;
  draftExercises = [];
  draftCover = null;
  cancelDraftExerciseEdit();
  renderDraftChips();
  updateCoverPreview();
  document.getElementById("workout-form").reset();
  document.getElementById("workout-submit-btn").textContent = "Enregistrer le programme";
  document.getElementById("workout-cancel-btn").classList.add("hidden");
}

document.getElementById("workout-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("workout-name").value.trim();
  if (!name || draftExercises.length === 0) return;

  normalizeGroups(draftExercises);

  if (editingWorkoutId) {
    const w = workouts.find((w) => w.id === editingWorkoutId);
    w.name = name;
    w.cover = draftCover;
    w.exercises = draftExercises.map((ex) => ({ ...ex }));
  } else {
    workouts.push({
      id: crypto.randomUUID(),
      name,
      cover: draftCover,
      exercises: draftExercises.map((ex) => ({ ...ex })),
    });
  }

  saveWorkouts();
  resetWorkoutForm();
  renderWorkouts();
  populateProgramSelect();
});

document.getElementById("workout-cancel-btn").addEventListener("click", resetWorkoutForm);

function renderWorkouts() {
  const container = document.getElementById("workout-list");

  if (workouts.length === 0) {
    container.innerHTML = `<p class="empty-state">Aucun programme encore. Crée-en un ci-dessous.</p>`;
    return;
  }

  container.innerHTML = workouts
    .map((w) => `
      <div class="workout-card">
        ${w.cover ? `<img src="${w.cover}" class="workout-cover" alt="${esc(w.name)}">` : ""}
        <div class="workout-card-head">
          <h3>${esc(w.name)}</h3>
          <button class="menu-btn" data-id="${w.id}">⋯</button>
        </div>
        ${labelExerciseGroups(w.exercises).map((ex) => `
          <div class="workout-exercise-row ${ex.inSuperset ? "in-superset" : ""}">
            <span class="group-label">${ex.label}</span>
            <div class="workout-exercise-main">
              <div class="workout-exercise-line">
                <span class="ex-name">${esc(ex.name)}</span>
                <span class="ex-detail">${ex.sets ? `${ex.sets}x${esc(ex.reps || "?")}` : ""}</span>
              </div>
              ${exerciseNotes[ex.name] ? `<span class="ex-note" title="${esc(exerciseNotes[ex.name])}">📝 ${esc(exerciseNotes[ex.name])}</span>` : ""}
            </div>
          </div>
        `).join("")}
        <button type="button" class="start-btn" data-id="${w.id}">▶ Démarrer la séance</button>
      </div>
    `)
    .join("");
}

function editWorkout(id) {
  const w = workouts.find((w) => w.id === id);
  if (!w) return;
  editingWorkoutId = w.id;
  document.getElementById("workout-name").value = w.name;
  draftExercises = w.exercises.map((ex) => ({ ...ex }));
  draftCover = w.cover || null;
  cancelDraftExerciseEdit();
  renderDraftChips();
  updateCoverPreview();
  document.getElementById("workout-submit-btn").textContent = "Mettre à jour le programme";
  document.getElementById("workout-cancel-btn").classList.remove("hidden");
  document.getElementById("workout-form").scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteWorkout(id) {
  if (!confirm("Supprimer ce programme ?")) return;
  workouts = workouts.filter((w) => w.id !== id);
  if (editingWorkoutId === id) resetWorkoutForm();
  saveWorkouts();
  renderWorkouts();
  populateProgramSelect();
}

document.getElementById("workout-list").addEventListener("click", (e) => {
  if (e.target.matches(".start-btn")) {
    startGuidedSession(e.target.dataset.id);
    return;
  }

  const btn = e.target.closest(".menu-btn");
  if (btn) openActionMenu(btn, "workout", btn.dataset.id);
});

/* ---------- Progress view ---------- */

function mostRecentlyLoggedExercise() {
  return [...logs].sort((a, b) => b.createdAt - a.createdAt)[0]?.exercise ?? null;
}

function populateProgressSelect() {
  const select = document.getElementById("progress-exercise-select");
  const current = select.value;
  const names = allExerciseNames();
  select.innerHTML = names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
  if (names.includes(current)) {
    select.value = current;
  } else {
    // First open (or the selected exercise vanished): show the one with data,
    // not just the alphabetical first — which is often an exercise never logged.
    const fallback = mostRecentlyLoggedExercise();
    if (fallback && names.includes(fallback)) select.value = fallback;
  }
}

document.getElementById("progress-exercise-select").addEventListener("change", renderProgress);

let progressMetric = "weight";
let lastProgressExercise = null;

document.getElementById("metric-toggle").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-metric]");
  if (!btn) return;
  progressMetric = btn.dataset.metric;
  document.querySelectorAll("#metric-toggle button").forEach((b) => b.classList.toggle("active", b === btn));
  renderProgress();
});

function setMetricToggle(metric) {
  progressMetric = metric;
  document.querySelectorAll("#metric-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.metric === metric));
}

function buildLineChartSVG(points, unit) {
  const width = 300;
  const height = 160;
  const padL = 32;
  const padR = 12;
  const padT = 14;
  const padB = 22;

  const weights = points.map((p) => p.value);
  let min = Math.min(...weights);
  let max = Math.max(...weights);
  if (min === max) {
    min -= 5;
    max += 5;
  }
  const yPad = (max - min) * 0.15;
  min -= yPad;
  max += yPad;

  const xStep = points.length > 1 ? (width - padL - padR) / (points.length - 1) : 0;
  const yScale = (v) => height - padB - ((v - min) / (max - min)) * (height - padT - padB);
  const xOf = (i) => padL + i * xStep;

  const coords = points.map((p, i) => [xOf(i), yScale(p.value)]);
  const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const gridLines = [0, 0.5, 1].map((f) => {
    const v = min + (max - min) * f;
    const y = yScale(v);
    return `
      <line class="chart-grid" x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" />
      <text class="chart-label" x="2" y="${y + 3}">${Math.round(v)}</text>
    `;
  }).join("");

  const showEvery = points.length <= 6 ? 1 : Math.ceil(points.length / 5);
  const xLabels = points.map((p, i) => {
    if (i % showEvery !== 0 && i !== points.length - 1) return "";
    const [x] = coords[i];
    return `<text class="chart-label" x="${x}" y="${height - 4}" text-anchor="middle">${formatDateShort(p.date)}</text>`;
  }).join("");

  const circles = coords.map(([x, y], i) =>
    `<circle class="chart-point" cx="${x}" cy="${y}" r="3"><title>${points[i].value} ${unit} — ${formatDateShort(points[i].date)}</title></circle>`
  ).join("");

  return `
    <svg viewBox="0 0 ${width} ${height}">
      ${gridLines}
      <path class="chart-line" d="${linePath}" />
      ${circles}
      ${xLabels}
    </svg>
  `;
}

function renderProgress() {
  populateProgressSelect();

  const select = document.getElementById("progress-exercise-select");
  const statsBox = document.getElementById("progress-stats");
  const chartBox = document.getElementById("chart-container");
  const exercise = select.value;

  if (!exercise) {
    statsBox.innerHTML = "";
    chartBox.innerHTML = `<p class="empty-state">Log un exercice pour voir ta progression ici.</p>`;
    return;
  }

  const exerciseLogs = logs
    .filter((l) => l.exercise === exercise)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (exerciseLogs.length === 0) {
    statsBox.innerHTML = "";
    chartBox.innerHTML = `<p class="empty-state">Aucune donnée pour cet exercice.</p>`;
    return;
  }

  if (exercise !== lastProgressExercise) {
    const looksBodyweight = exerciseLogs.every((l) => l.weight === 0);
    setMetricToggle(looksBodyweight ? "reps" : "weight");
    lastProgressExercise = exercise;
  }

  const unit = progressMetric === "weight" ? "lb" : "reps";
  const points = exerciseLogs.map((l) => ({
    date: l.date,
    value: progressMetric === "weight" ? l.weight : l.reps,
  }));

  const best = Math.max(...points.map((p) => p.value));
  const latest = points[points.length - 1].value;
  const first = points[0].value;
  const diff = latest - first;

  statsBox.innerHTML = `
    <div class="stat-box">
      <div class="value">${best} ${unit}</div>
      <div class="label">Record 🏆</div>
    </div>
    <div class="stat-box">
      <div class="value">${diff >= 0 ? "+" : ""}${diff} ${unit}</div>
      <div class="label">Depuis le début</div>
    </div>
  `;

  chartBox.innerHTML = buildLineChartSVG(points, unit);
}

/* ---------- Guided session ---------- */

let guidedSteps = [];
let guidedIndex = 0;
let guidedProgramId = null;
let guidedProgramName = "";
let guidedDrafts = {};

function startGuidedSession(programId) {
  const program = workouts.find((w) => w.id === programId);
  if (!program) return;
  guidedSteps = labelExerciseGroups(program.exercises);
  guidedIndex = 0;
  guidedProgramId = program.id;
  guidedProgramName = program.name;
  guidedDrafts = {};

  const coverImg = document.getElementById("guided-cover");
  if (program.cover) {
    coverImg.src = program.cover;
    coverImg.classList.remove("hidden");
  } else {
    coverImg.classList.add("hidden");
  }

  document.getElementById("guided-overlay").classList.remove("hidden");
  renderGuidedStep();
}

function renderGuidedStep() {
  const stepEl = document.getElementById("guided-step");
  const doneEl = document.getElementById("guided-done");

  if (guidedIndex >= guidedSteps.length) {
    stepEl.classList.add("hidden");
    doneEl.classList.remove("hidden");
    document.getElementById("guided-done-summary").textContent =
      `${guidedProgramName} — ${guidedSteps.length} exercices complétés.`;
    return;
  }

  stepEl.classList.remove("hidden");
  doneEl.classList.add("hidden");

  const step = guidedSteps[guidedIndex];
  const badge = document.getElementById("guided-superset-badge");
  if (step.inSuperset) {
    badge.textContent = `Superset ${step.label}`;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }

  document.getElementById("guided-progress").textContent =
    `${guidedProgramName} — Exercice ${guidedIndex + 1} / ${guidedSteps.length}`;
  document.getElementById("guided-exercise-name").textContent = step.name;
  document.getElementById("guided-exercise-target").textContent =
    [step.sets && `${step.sets} séries`, step.reps && `${step.reps} reps`]
      .filter(Boolean).join(" · ") || "Pas de cible définie";

  document.getElementById("guided-back").disabled = guidedIndex === 0;

  const draft = guidedDrafts[guidedIndex];
  const repsMatch = step.reps ? step.reps.match(/\d+/) : null;
  document.getElementById("guided-weight").value = draft ? draft.weight : "";
  document.getElementById("guided-sets").value = draft ? draft.sets : (step.sets || "");
  document.getElementById("guided-reps").value = draft ? draft.reps : (repsMatch ? repsMatch[0] : "");

  const usePerSet = Boolean(draft && draft.usePerSet);
  document.getElementById("guided-per-set-toggle").checked = usePerSet;
  setPerSetMode("guided", usePerSet);
  const guidedList = document.getElementById("guided-per-set-list");
  if (usePerSet) {
    const rows = draft.perSet && draft.perSet.length
      ? draft.perSet
      : Array.from({ length: Math.max(1, step.sets || 3) }, () => ({ weight: "", reps: repsMatch ? repsMatch[0] : "" }));
    renderSetRows(guidedList, rows);
  } else {
    guidedList.innerHTML = "";
  }

  const lastEntry = logs
    .filter((l) => l.exercise === step.name)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  document.getElementById("guided-weight").placeholder = lastEntry ? String(lastEntry.weight) : "";
}

function saveCurrentGuidedDraft() {
  const usePerSet = document.getElementById("guided-per-set-toggle").checked;
  guidedDrafts[guidedIndex] = {
    weight: document.getElementById("guided-weight").value,
    sets: document.getElementById("guided-sets").value,
    reps: document.getElementById("guided-reps").value,
    usePerSet,
    perSet: usePerSet ? psReadRows(document.getElementById("guided-per-set-list")) : null,
  };
}

function advanceGuidedStep() {
  saveCurrentGuidedDraft();
  guidedIndex++;
  renderGuidedStep();
}

function goToPreviousGuidedStep() {
  if (guidedIndex <= 0) return;
  saveCurrentGuidedDraft();
  guidedIndex--;
  renderGuidedStep();
}

function closeGuidedSession() {
  document.getElementById("guided-overlay").classList.add("hidden");
  renderLog();
}

document.getElementById("guided-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const step = guidedSteps[guidedIndex];
  const program = workouts.find((w) => w.id === guidedProgramId);
  const now = new Date();

  const perSetOn = document.getElementById("guided-per-set-toggle").checked;
  let perSet = null;
  if (perSetOn) {
    perSet = readSetRows(document.getElementById("guided-per-set-list"));
    if (!perSet) {
      showToast("Chaque série a besoin d'un poids et de reps");
      return;
    }
  }

  const { weight, sets, reps } = perSet
    ? summarizePerSet(perSet)
    : {
        weight: Number(document.getElementById("guided-weight").value),
        sets: Number(document.getElementById("guided-sets").value),
        reps: Number(document.getElementById("guided-reps").value),
      };
  const previousBest = Math.max(0, ...logs.filter((l) => l.exercise === step.name).map((l) => l.weight));

  logs.push({
    id: crypto.randomUUID(),
    exercise: step.name,
    weight, sets, reps,
    ...(perSet ? { perSet } : {}),
    date: now.toISOString().slice(0, 10),
    createdAt: now.getTime(),
    workoutId: program ? program.id : null,
    workoutName: program ? program.name : null,
  });
  saveLogs();

  if (previousBest > 0 && weight > previousBest) showToast(`🏆 Nouveau record : ${weight} lb !`);

  advanceGuidedStep();
});

document.getElementById("guided-skip").addEventListener("click", advanceGuidedStep);
document.getElementById("guided-back").addEventListener("click", goToPreviousGuidedStep);

document.getElementById("guided-quit").addEventListener("click", () => {
  if (confirm("Terminer la séance maintenant ?")) closeGuidedSession();
});

document.getElementById("guided-close").addEventListener("click", closeGuidedSession);

/* ---------- Réglages (backup) ---------- */

document.getElementById("export-btn").addEventListener("click", () => {
  const payload = { logs, workouts, bodyweights, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `workout-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById("import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch {
      alert("Fichier invalide.");
      e.target.value = "";
      return;
    }

    if (!Array.isArray(data.logs) || !Array.isArray(data.workouts)) {
      alert("Ce fichier ne ressemble pas à une sauvegarde de Mes Workouts.");
      e.target.value = "";
      return;
    }

    if (!confirm(`Remplacer tes données actuelles par cette sauvegarde (${data.logs.length} logs, ${data.workouts.length} programmes) ?`)) {
      e.target.value = "";
      return;
    }

    logs = data.logs;
    workouts = data.workouts;
    bodyweights = Array.isArray(data.bodyweights) ? data.bodyweights : [];
    saveLogs();
    saveWorkouts();
    saveBodyweights();
    resetLogForm();
    resetWorkoutForm();
    populateProgramSelect();
    renderLog();
    renderWorkouts();
    renderProgress();
    renderBodyweight();
    e.target.value = "";
    alert("Sauvegarde importée !");
  };
  reader.readAsText(file);
});

/* ---------- Service worker (offline) ---------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

/* ---------- Init ---------- */

populateProgramSelect();
renderLog();
renderWorkouts();
showEncouragement();

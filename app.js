const LOGS_KEY = "workout-logs";
const WORKOUTS_KEY = "workout-templates";

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

function loadLogs() {
  const raw = localStorage.getItem(LOGS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveLogs() {
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

function loadWorkouts() {
  const raw = localStorage.getItem(WORKOUTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveWorkouts() {
  localStorage.setItem(WORKOUTS_KEY, JSON.stringify(workouts));
}

let logs = loadLogs();
let workouts = loadWorkouts();
let draftExercises = [];
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
  if (viewId === "view-progress") renderProgress();
  if (viewId === "view-workouts") renderWorkouts();
}

/* ---------- Encouragement ---------- */

function showEncouragement() {
  const phrase = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
  document.getElementById("encouragement").textContent = phrase;
}

/* ---------- Log view ---------- */

function allExerciseNames() {
  const fromLogs = logs.map((l) => l.exercise);
  const fromWorkouts = workouts.flatMap((w) => w.exercises);
  return [...new Set([...fromLogs, ...fromWorkouts])].sort((a, b) => a.localeCompare(b));
}

function populateProgramSelect() {
  const select = document.getElementById("program-select");
  const current = select.value;
  select.innerHTML = `<option value="">Libre (tous les exercices)</option>` +
    workouts.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");
  if (workouts.some((w) => w.id === current)) select.value = current;
}

const exerciseInput = document.getElementById("exercise");
const exerciseDropdown = document.getElementById("exercise-dropdown");

function exerciseSuggestionSource() {
  const programId = document.getElementById("program-select").value;
  return programId
    ? workouts.find((w) => w.id === programId)?.exercises ?? []
    : allExerciseNames();
}

function openExerciseDropdown(filter = "") {
  const names = exerciseSuggestionSource();
  const q = filter.trim().toLowerCase();
  const matches = q ? names.filter((n) => n.toLowerCase().includes(q)) : names;

  exerciseDropdown.innerHTML = matches.length
    ? matches.map((n) => `<div class="combobox-option" data-name="${n}">${n}</div>`).join("")
    : `<div class="combobox-empty">Aucun exercice existant — tape pour en créer un nouveau</div>`;

  exerciseDropdown.classList.add("open");
}

function closeExerciseDropdown() {
  exerciseDropdown.classList.remove("open");
}

exerciseInput.addEventListener("focus", () => openExerciseDropdown(exerciseInput.value));
exerciseInput.addEventListener("input", () => openExerciseDropdown(exerciseInput.value));

exerciseDropdown.addEventListener("mousedown", (e) => {
  const opt = e.target.closest(".combobox-option");
  if (!opt) return;
  exerciseInput.value = opt.dataset.name;
  closeExerciseDropdown();
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".combobox-wrap")) closeExerciseDropdown();
});

document.getElementById("program-select").addEventListener("change", closeExerciseDropdown);

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
              <strong>${entry.exercise}</strong>
              <span>${entry.weight} lb × ${entry.sets} séries × ${entry.reps} reps</span>
              ${entry.workoutName ? `<span class="tag">${entry.workoutName}</span>` : ""}
            </div>
            <div class="entry-actions">
              <button class="edit-btn" data-id="${entry.id}">✎</button>
              <button class="delete-btn" data-id="${entry.id}">✕</button>
            </div>
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
}

document.getElementById("log-form").addEventListener("submit", (e) => {
  e.preventDefault();

  const programId = document.getElementById("program-select").value;
  const program = workouts.find((w) => w.id === programId);
  const exercise = document.getElementById("exercise").value.trim();
  const weight = Number(document.getElementById("weight").value);
  const sets = Number(document.getElementById("sets").value);
  const reps = Number(document.getElementById("reps").value);

  if (editingLogId) {
    const entry = logs.find((l) => l.id === editingLogId);
    Object.assign(entry, {
      exercise, weight, sets, reps,
      workoutId: program ? program.id : null,
      workoutName: program ? program.name : null,
    });
  } else {
    const now = new Date();
    logs.push({
      id: crypto.randomUUID(),
      exercise, weight, sets, reps,
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
  resetLogForm();
  e.target.reset();
  if (!wasEditing) document.getElementById("program-select").value = programId;
  exerciseInput.focus();
  closeExerciseDropdown();
});

document.getElementById("log-cancel-btn").addEventListener("click", () => {
  resetLogForm();
  document.getElementById("log-form").reset();
  closeExerciseDropdown();
});

document.getElementById("log-list").addEventListener("click", (e) => {
  if (e.target.matches(".delete-btn")) {
    if (!confirm("Supprimer ce log ?")) return;
    logs = logs.filter((log) => log.id !== e.target.dataset.id);
    saveLogs();
    renderLog();
    return;
  }

  if (e.target.matches(".edit-btn")) {
    const entry = logs.find((l) => l.id === e.target.dataset.id);
    if (!entry) return;
    editingLogId = entry.id;
    document.getElementById("program-select").value = entry.workoutId || "";
    exerciseInput.value = entry.exercise;
    document.getElementById("weight").value = entry.weight;
    document.getElementById("sets").value = entry.sets;
    document.getElementById("reps").value = entry.reps;
    document.getElementById("log-submit-btn").textContent = "Mettre à jour";
    document.getElementById("log-cancel-btn").classList.remove("hidden");
    switchView("view-log");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

/* ---------- Workouts (programmes) view ---------- */

function renderDraftChips() {
  const container = document.getElementById("draft-exercise-chips");
  container.innerHTML = draftExercises
    .map((name, i) => `<span class="chip">${name}<button type="button" data-i="${i}">✕</button></span>`)
    .join("");
}

document.getElementById("add-exercise-btn").addEventListener("click", addDraftExercise);
document.getElementById("new-exercise-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addDraftExercise();
  }
});

function addDraftExercise() {
  const input = document.getElementById("new-exercise-name");
  const name = input.value.trim();
  if (!name) return;
  draftExercises.push(name);
  input.value = "";
  input.focus();
  renderDraftChips();
}

document.getElementById("draft-exercise-chips").addEventListener("click", (e) => {
  if (!e.target.matches("button")) return;
  draftExercises.splice(Number(e.target.dataset.i), 1);
  renderDraftChips();
});

function resetWorkoutForm() {
  editingWorkoutId = null;
  draftExercises = [];
  renderDraftChips();
  document.getElementById("workout-form").reset();
  document.getElementById("workout-submit-btn").textContent = "Enregistrer le programme";
  document.getElementById("workout-cancel-btn").classList.add("hidden");
}

document.getElementById("workout-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = document.getElementById("workout-name").value.trim();
  if (!name || draftExercises.length === 0) return;

  if (editingWorkoutId) {
    const w = workouts.find((w) => w.id === editingWorkoutId);
    w.name = name;
    w.exercises = [...draftExercises];
  } else {
    workouts.push({
      id: crypto.randomUUID(),
      name,
      exercises: [...draftExercises],
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
    container.innerHTML = `<p class="empty-state">Aucun programme encore. Crée-en un ci-dessus.</p>`;
    return;
  }

  container.innerHTML = workouts
    .map((w) => `
      <div class="workout-card">
        <div class="workout-card-head">
          <h3>${w.name}</h3>
          <div class="entry-actions">
            <button class="edit-btn" data-id="${w.id}">✎</button>
            <button class="delete-btn" data-id="${w.id}">✕</button>
          </div>
        </div>
        <p>${w.exercises.join(" · ")}</p>
      </div>
    `)
    .join("");
}

document.getElementById("workout-list").addEventListener("click", (e) => {
  if (e.target.matches(".delete-btn")) {
    if (!confirm("Supprimer ce programme ?")) return;
    workouts = workouts.filter((w) => w.id !== e.target.dataset.id);
    if (editingWorkoutId === e.target.dataset.id) resetWorkoutForm();
    saveWorkouts();
    renderWorkouts();
    populateProgramSelect();
    return;
  }

  if (e.target.matches(".edit-btn")) {
    const w = workouts.find((w) => w.id === e.target.dataset.id);
    if (!w) return;
    editingWorkoutId = w.id;
    document.getElementById("workout-name").value = w.name;
    draftExercises = [...w.exercises];
    renderDraftChips();
    document.getElementById("workout-submit-btn").textContent = "Mettre à jour le programme";
    document.getElementById("workout-cancel-btn").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

/* ---------- Progress view ---------- */

function populateProgressSelect() {
  const select = document.getElementById("progress-exercise-select");
  const current = select.value;
  const names = allExerciseNames();
  select.innerHTML = names.map((n) => `<option value="${n}">${n}</option>`).join("");
  if (names.includes(current)) select.value = current;
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

/* ---------- Réglages (backup) ---------- */

document.getElementById("export-btn").addEventListener("click", () => {
  const payload = { logs, workouts, exportedAt: new Date().toISOString() };
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
    saveLogs();
    saveWorkouts();
    resetLogForm();
    resetWorkoutForm();
    populateProgramSelect();
    renderLog();
    renderWorkouts();
    renderProgress();
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

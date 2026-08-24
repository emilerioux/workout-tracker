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

/* ---------- Rest timer ---------- */

let restTimerInterval = null;

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => ctx.close();
  } catch {}
}

function formatTimer(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function startRestTimer(seconds, onDone) {
  clearInterval(restTimerInterval);
  const bar = document.getElementById("rest-timer");
  const label = document.getElementById("rest-timer-label");
  let remaining = seconds;

  bar.classList.remove("hidden");
  label.textContent = `Repos : ${formatTimer(remaining)}`;

  restTimerInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(restTimerInterval);
      label.textContent = "Repos terminé 💪";
      if (navigator.vibrate) navigator.vibrate(300);
      beep();
      setTimeout(() => bar.classList.add("hidden"), 2500);
      if (onDone) onDone();
    } else {
      label.textContent = `Repos : ${formatTimer(remaining)}`;
    }
  }, 1000);
}

function stopRestTimer() {
  clearInterval(restTimerInterval);
  document.getElementById("rest-timer").classList.add("hidden");
}

document.getElementById("rest-timer-skip").addEventListener("click", stopRestTimer);

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
    workouts.map((w) => `<option value="${w.id}">${w.name}</option>`).join("");
  if (workouts.some((w) => w.id === current)) select.value = current;
}

function setupCombobox(input, dropdown, sourceFn, onSelect) {
  function open(filter = "") {
    const names = sourceFn();
    const q = filter.trim().toLowerCase();
    const matches = q ? names.filter((n) => n.toLowerCase().includes(q)) : names;

    dropdown.innerHTML = matches.length
      ? matches.map((n) => `<div class="combobox-option" data-name="${n}">${n}</div>`).join("")
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

const exerciseCombobox = setupCombobox(exerciseInput, document.getElementById("exercise-dropdown"), exerciseSuggestionSource, prefillFromProgram);

function closeExerciseDropdown() {
  exerciseCombobox.close();
}

document.getElementById("program-select").addEventListener("change", closeExerciseDropdown);

const newExerciseInput = document.getElementById("new-exercise-name");
const newExerciseCombobox = setupCombobox(newExerciseInput, document.getElementById("new-exercise-dropdown"), allExerciseNames);

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
  if (!wasEditing) {
    const progEx = program?.exercises.find((pe) => pe.name === exercise);
    if (progEx?.rest) startRestTimer(progEx.rest);
  }

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

// Assigns display labels (A, A1/A2 for supersets, B, C...) based on
// consecutive entries sharing the same `group` id.
function labelExerciseGroups(exercises) {
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
          <strong>${ex.name}</strong>
          <span>${[ex.sets && `${ex.sets} séries`, ex.reps && `${ex.reps} reps`, ex.rest && `${ex.rest}s repos`].filter(Boolean).join(" · ") || "—"}</span>
        </div>
        <div class="draft-actions">
          <button type="button" class="move-up" data-i="${i}" ${i === 0 ? "disabled" : ""}>▲</button>
          <button type="button" class="move-down" data-i="${i}" ${i === draftExercises.length - 1 ? "disabled" : ""}>▼</button>
          <button type="button" class="remove-draft" data-i="${i}">✕</button>
        </div>
      </div>
    `)
    .join("");
}

document.getElementById("add-exercise-btn").addEventListener("click", addDraftExercise);
newExerciseInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addDraftExercise();
  }
});

function addDraftExercise() {
  const name = newExerciseInput.value.trim();
  if (!name) return;

  const sets = document.getElementById("new-exercise-sets").value;
  const reps = document.getElementById("new-exercise-reps").value.trim();
  const rest = document.getElementById("new-exercise-rest").value;
  const superset = document.getElementById("new-exercise-superset").checked;

  const lastGroup = draftExercises.length ? draftExercises[draftExercises.length - 1].group : -1;
  const group = superset && draftExercises.length ? lastGroup : lastGroup + 1;

  draftExercises.push({
    name,
    sets: sets ? Number(sets) : null,
    reps: reps || null,
    rest: rest ? Number(rest) : null,
    group,
  });

  newExerciseInput.value = "";
  document.getElementById("new-exercise-sets").value = "";
  document.getElementById("new-exercise-reps").value = "";
  document.getElementById("new-exercise-rest").value = "";
  document.getElementById("new-exercise-superset").checked = false;
  newExerciseInput.focus();
  renderDraftChips();
}

document.getElementById("draft-exercise-list").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const i = Number(btn.dataset.i);

  if (btn.matches(".remove-draft")) {
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
    w.exercises = draftExercises.map((ex) => ({ ...ex }));
  } else {
    workouts.push({
      id: crypto.randomUUID(),
      name,
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
        ${labelExerciseGroups(w.exercises).map((ex) => `
          <div class="workout-exercise-row ${ex.inSuperset ? "in-superset" : ""}">
            <span class="group-label">${ex.label}</span>
            <span class="ex-name">${ex.name}</span>
            <span class="ex-detail">${[ex.sets && `${ex.sets}x${ex.reps || "?"}`, ex.rest && `${ex.rest}s`].filter(Boolean).join(" · ")}</span>
          </div>
        `).join("")}
        <button type="button" class="start-btn" data-id="${w.id}">▶ Démarrer la séance</button>
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
    draftExercises = w.exercises.map((ex) => ({ ...ex }));
    renderDraftChips();
    document.getElementById("workout-submit-btn").textContent = "Mettre à jour le programme";
    document.getElementById("workout-cancel-btn").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (e.target.matches(".start-btn")) {
    startGuidedSession(e.target.dataset.id);
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

/* ---------- Guided session ---------- */

let guidedSteps = [];
let guidedIndex = 0;
let guidedProgramName = "";

function startGuidedSession(programId) {
  const program = workouts.find((w) => w.id === programId);
  if (!program) return;
  guidedSteps = labelExerciseGroups(program.exercises);
  guidedIndex = 0;
  guidedProgramName = program.name;
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
    [step.sets && `${step.sets} séries`, step.reps && `${step.reps} reps`, step.rest && `${step.rest}s repos`]
      .filter(Boolean).join(" · ") || "Pas de cible définie";

  document.getElementById("guided-weight").value = "";
  document.getElementById("guided-sets").value = step.sets || "";
  const repsMatch = step.reps ? step.reps.match(/\d+/) : null;
  document.getElementById("guided-reps").value = repsMatch ? repsMatch[0] : "";
}

function advanceGuidedStep() {
  const step = guidedSteps[guidedIndex];
  const nextStep = guidedSteps[guidedIndex + 1];
  const isLastInGroup = !nextStep || nextStep.group !== step.group;

  guidedIndex++;

  if (isLastInGroup && step.rest) {
    startRestTimer(step.rest, renderGuidedStep);
  } else {
    renderGuidedStep();
  }
}

function closeGuidedSession() {
  document.getElementById("guided-overlay").classList.add("hidden");
  stopRestTimer();
  renderLog();
}

document.getElementById("guided-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const step = guidedSteps[guidedIndex];
  const program = workouts.find((w) => w.name === guidedProgramName);
  const now = new Date();

  logs.push({
    id: crypto.randomUUID(),
    exercise: step.name,
    weight: Number(document.getElementById("guided-weight").value),
    sets: Number(document.getElementById("guided-sets").value),
    reps: Number(document.getElementById("guided-reps").value),
    date: now.toISOString().slice(0, 10),
    createdAt: now.getTime(),
    workoutId: program ? program.id : null,
    workoutName: program ? program.name : null,
  });
  saveLogs();

  advanceGuidedStep();
});

document.getElementById("guided-skip").addEventListener("click", advanceGuidedStep);

document.getElementById("guided-quit").addEventListener("click", () => {
  if (confirm("Terminer la séance maintenant ?")) closeGuidedSession();
});

document.getElementById("guided-close").addEventListener("click", closeGuidedSession);

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

/* ============================================================
   data.js — modèle et stockage
   TOUT est préfixé wt2-. L'ancienne app (workout-logs,
   workout-templates…) partage la même origine GitHub Pages :
   le préfixe est ce qui garantit qu'on ne l'écrase jamais.
   On ne lit ses clés que sur demande explicite, dans l'import.
   ============================================================ */

const K = {
  programs:  "wt2-programs",
  logs:      "wt2-logs",
  bodyweight:"wt2-bodyweight",
  notes:     "wt2-notes",
  prs:       "wt2-prs",
  sessions:  "wt2-sessions",
  hint:      "wt2-hint-seen",
  accentFix: "wt2-accents-v1",
  groupFix: "wt2-groups-v1",
  tab:       "wt2-tab",
};

/* Clés de l'ancienne app — lecture seule, uniquement dans l'import. */
const OLD = {
  logs: "workout-logs",
  programs: "workout-templates",
  bodyweight: "bodyweight-logs",
  notes: "exercise-notes",
};

function load(key, fallback) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch (_) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { toast("Mémoire pleine — exporte et allège tes données"); return false; }
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => iso(new Date());

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Un poids s'affiche 135 ou 137.5, jamais 135.0 */
const fmt = (v) => (Math.round(Number(v) * 10) % 10 === 0 ? String(Math.round(v)) : Number(v).toFixed(1));

/* ── L'état ───────────────────────────────────────────────── */
const DB = {
  programs:   load(K.programs, []),
  logs:       load(K.logs, []),
  bodyweight: load(K.bodyweight, []),
  notes:      load(K.notes, {}),
  prs:        load(K.prs, {}),
  sessions:   load(K.sessions, []),
};

const persist = {
  programs:   () => save(K.programs, DB.programs),
  logs:       () => save(K.logs, DB.logs),
  bodyweight: () => save(K.bodyweight, DB.bodyweight),
  notes:      () => save(K.notes, DB.notes),
  prs:        () => save(K.prs, DB.prs),
  sessions:   () => save(K.sessions, DB.sessions),
};

/* ── Dérivés ──────────────────────────────────────────────── */

/* Tous les noms d'exercices connus : programmes + historique + notes. */
function allExercises() {
  const set = new Set();
  DB.programs.forEach((p) => p.exercises.forEach((e) => set.add(e.name)));
  DB.logs.forEach((l) => set.add(l.exercise));
  Object.keys(DB.notes).forEach((n) => set.add(n));
  return [...set].sort((a, b) => a.localeCompare(b, "fr"));
}

/* Le poids le plus lourd jamais soulevé sur un exercice. */
function bestWeight(name) {
  let best = 0;
  for (const l of DB.logs) {
    if (l.exercise !== name) continue;
    const w = l.perSet ? Math.max(...l.perSet.map((s) => s.weight)) : l.weight;
    if (w > best) best = w;
  }
  return best;
}

/* La dernière fois qu'on a touché à cet exercice. */
function lastEntry(name) {
  let best = null;
  for (const l of DB.logs) {
    if (l.exercise !== name) continue;
    if (!best || l.createdAt > best.createdAt) best = l;
  }
  return best;
}

const volumeOf = (l) =>
  l.perSet ? l.perSet.reduce((n, s) => n + s.weight * s.reps, 0) : (l.weight * l.reps * l.sets);

/* Un point par séance, du plus ancien au plus récent. */
function seriesFor(name, metric) {
  return DB.logs
    .filter((l) => l.exercise === name)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((l) => {
      const top = l.perSet ? l.perSet.reduce((a, b) => (b.weight > a.weight ? b : a)) : null;
      const value = metric === "reps"
        ? (top ? top.reps : l.reps)
        : (top ? top.weight : l.weight);
      return { x: l.createdAt, y: value, date: l.date, log: l };
    });
}

/* Nombre de semaines consécutives avec au moins une séance. */
function streakWeeks() {
  const s = new Set(DB.sessions);
  const monday = new Date(); monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  let n = 0;
  for (let w = 0; w < 260; w++) {
    const ws = new Date(monday); ws.setDate(ws.getDate() - 7 * w);
    let any = false;
    for (let k = 0; k < 7; k++) {
      const d = new Date(ws); d.setDate(d.getDate() + k);
      if (s.has(iso(d))) { any = true; break; }
    }
    if (any) n++; else break;
  }
  return n;
}

/* ── Écriture ─────────────────────────────────────────────── */

/* Ajoute une entrée d'historique et met à jour le record.
   Renvoie { pr, prev } si c'est un nouveau record. */
function addLog(entry) {
  const log = { id: uid(), date: today(), createdAt: Date.now(), ...entry };
  DB.logs.push(log);
  persist.logs();

  const top = log.perSet ? Math.max(...log.perSet.map((s) => s.weight)) : log.weight;
  const prev = DB.prs[log.exercise] ?? 0;
  let pr = false;
  if (top > prev) { DB.prs[log.exercise] = top; persist.prs(); pr = true; }

  if (!DB.sessions.includes(log.date)) { DB.sessions.push(log.date); persist.sessions(); }
  return { log, pr, prev };
}

function deleteLog(id) {
  const i = DB.logs.findIndex((l) => l.id === id);
  if (i < 0) return;
  const name = DB.logs[i].exercise;
  DB.logs.splice(i, 1);
  persist.logs();
  /* Le record se recalcule : sinon il resterait un fantôme. */
  const best = bestWeight(name);
  if (best > 0) DB.prs[name] = best; else delete DB.prs[name];
  persist.prs();
}

/* Renomme un exercice partout à la fois. */
function renameExercise(from, to) {
  from = from.trim(); to = to.trim();
  if (!to || from === to) return;
  DB.logs.forEach((l) => { if (l.exercise === from) l.exercise = to; });
  DB.programs.forEach((p) => p.exercises.forEach((e) => { if (e.name === from) e.name = to; }));
  if (DB.notes[from] !== undefined) { DB.notes[to] = DB.notes[from]; delete DB.notes[from]; }
  if (DB.prs[from] !== undefined) {
    DB.prs[to] = Math.max(DB.prs[to] ?? 0, DB.prs[from]);
    delete DB.prs[from];
  }
  persist.logs(); persist.programs(); persist.notes(); persist.prs();
}

/* ── Import depuis l'ancienne app (même origine) ──────────── */

/* Regarde ce qu'il y a à récupérer, sans rien écrire. */
function scanOldApp() {
  const logs = load(OLD.logs, []);
  const programs = load(OLD.programs, []);
  const bw = load(OLD.bodyweight, []);
  const notes = load(OLD.notes, {});
  return {
    logs: Array.isArray(logs) ? logs.length : 0,
    programs: Array.isArray(programs) ? programs.length : 0,
    bodyweight: Array.isArray(bw) ? bw.length : 0,
    notes: Object.keys(notes || {}).length,
    raw: { logs, programs, bw, notes },
  };
}

/* Copie l'ancienne app vers wt2-. Ne supprime jamais rien chez elle.
   Fusionne par id : réimporter deux fois ne duplique pas. */
function importOldApp() {
  const s = scanOldApp();
  const seenLogs = new Set(DB.logs.map((l) => l.id));
  let addedLogs = 0;
  (s.raw.logs || []).forEach((l) => {
    if (!l || seenLogs.has(l.id)) return;
    DB.logs.push({
      id: l.id || uid(),
      exercise: l.exercise,
      weight: Number(l.weight) || 0,
      sets: Number(l.sets) || 1,
      reps: Number(l.reps) || 0,
      ...(l.perSet ? { perSet: l.perSet } : {}),
      date: l.date || today(),
      createdAt: l.createdAt || Date.parse(l.date || "") || Date.now(),
      programId: l.workoutId || null,
      programName: l.workoutName || null,
    });
    addedLogs++;
  });

  const seenProgs = new Set(DB.programs.map((p) => p.id));
  let addedProgs = 0;
  (s.raw.programs || []).forEach((p) => {
    if (!p || seenProgs.has(p.id)) return;
    DB.programs.push({
      id: p.id || uid(),
      name: p.name || "Sans nom",
      accent: (DB.programs.length + addedProgs) % 6,
      exercises: (p.exercises || []).map((e, i) => ({
        name: e.name,
        sets: e.sets ?? null,
        reps: e.reps ?? null,
        /* Sans groupe d'origine, chaque exercice est seul : un `0`
           partout aurait fait un seul superset de tout le programme. */
        group: Number.isFinite(e.group) ? e.group : i,
      })),
    });
    addedProgs++;
  });

  const seenBw = new Set(DB.bodyweight.map((b) => b.id));
  let addedBw = 0;
  (s.raw.bw || []).forEach((b) => {
    if (!b || seenBw.has(b.id)) return;
    DB.bodyweight.push({ id: b.id || uid(), weight: Number(b.weight) || 0,
      date: b.date || today(), createdAt: b.createdAt || Date.now() });
    addedBw++;
  });

  let addedNotes = 0;
  Object.entries(s.raw.notes || {}).forEach(([k, v]) => {
    if (DB.notes[k] === undefined && v) { DB.notes[k] = v; addedNotes++; }
  });

  /* Les séances et les records se déduisent de l'historique importé. */
  const days = new Set(DB.sessions);
  DB.logs.forEach((l) => days.add(l.date));
  DB.sessions = [...days];

  DB.logs.forEach((l) => {
    const top = l.perSet ? Math.max(...l.perSet.map((x) => x.weight)) : l.weight;
    if (top > (DB.prs[l.exercise] ?? 0)) DB.prs[l.exercise] = top;
  });

  persist.logs(); persist.programs(); persist.bodyweight();
  persist.notes(); persist.sessions(); persist.prs();
  return { logs: addedLogs, programs: addedProgs, bodyweight: addedBw, notes: addedNotes };
}

/* ── Sauvegarde manuelle ──────────────────────────────────── */
function exportJSON() {
  const payload = { app: "reps", version: 1, exportedAt: new Date().toISOString(), data: DB };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `reps-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function importJSON(file, done) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const p = JSON.parse(r.result);
      const d = p.data || p;
      if (!d || typeof d !== "object") throw new Error("format");
      ["programs", "logs", "bodyweight", "sessions"].forEach((k) => { if (Array.isArray(d[k])) DB[k] = d[k]; });
      ["notes", "prs"].forEach((k) => { if (d[k] && typeof d[k] === "object") DB[k] = d[k]; });
      Object.values(persist).forEach((f) => f());
      done(null);
    } catch (e) { done(e); }
  };
  r.onerror = () => done(new Error("lecture"));
  r.readAsText(file);
}

/* ── Photos de progression (IndexedDB, base propre à Reps) ── */
const PHOTO_DB = "reps-photos", PHOTO_STORE = "photos";
function photoDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(PHOTO_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PHOTO_STORE)) {
        req.result.createObjectStore(PHOTO_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function addPhoto(dataUrl) {
  const db = await photoDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).put({ id: uid(), date: today(), createdAt: Date.now(), dataUrl });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
async function allPhotos() {
  const db = await photoDB();
  return new Promise((res, rej) => {
    const req = db.transaction(PHOTO_STORE, "readonly").objectStore(PHOTO_STORE).getAll();
    req.onsuccess = () => res(req.result.sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => rej(req.error);
  });
}
async function removePhoto(id) {
  const db = await photoDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}

/* Redimensionne avant stockage : une photo de 4 Mo ne rentre pas. */
function shrinkImage(file, max = 1100) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = rej;
      img.src = r.result;
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

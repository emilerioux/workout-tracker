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
  journal:   "wt2-journal",
  muscles:   "wt2-muscles",
  lastExport:"wt2-last-export",
  backupSnooze: "wt2-backup-snooze",
  goals:     "wt2-goals",
  links:     "wt2-links",
  live:      "wt2-live-session",
  badges:    "wt2-badges-seen",
  gifts:     "wt2-gifts",
  hint:     "wt2-hint-seen",
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
  /* Les notes de séance : { id, date, createdAt, programId,
     programName, text }. Une par séance, pas par jour — deux
     séances le même jour gardent chacune la leur. */
  journal:    load(K.journal, []),
  /* Muscle choisi à la main pour un exercice. Sans entrée ici,
     le muscle est deviné d'après le nom (guessMuscle). */
  muscles:    load(K.muscles, {}),
  /* Objectifs : { id, exercise, metric ("weight" | "minutes" |
     "distance"), start, target, deadline|null, createdAt,
     doneAt|null }. `start` = le niveau au moment de le fixer. */
  goals:      load(K.goals, []),
  /* Lien vers une vidéo de technique, par nom d'exercice. */
  links:      load(K.links, {}),
};

const persist = {
  programs:   () => save(K.programs, DB.programs),
  logs:       () => save(K.logs, DB.logs),
  bodyweight: () => save(K.bodyweight, DB.bodyweight),
  notes:      () => save(K.notes, DB.notes),
  prs:        () => save(K.prs, DB.prs),
  sessions:   () => save(K.sessions, DB.sessions),
  journal:    () => save(K.journal, DB.journal),
  muscles:    () => save(K.muscles, DB.muscles),
  goals:      () => save(K.goals, DB.goals),
  links:      () => save(K.links, DB.links),
};

/* ── Cardio ─────────────────────────────────────────────────
   Un exercice cardio porte `kind: "cardio"`, dans le programme
   comme dans l'historique. Pas de poids ni de reps : une durée
   (obligatoire), une distance et des calories (facultatives), et
   une intensité sur trois niveaux. Il n'entre jamais dans un
   record ni dans un volume en lb. */
const INTENSITY = ["", "Facile", "Modéré", "Intense"];
const cardioLog = (l) => !!l && l.kind === "cardio";

/* Un nom est « cardio » s'il a déjà été rangé comme tel quelque
   part — sert à pré-choisir le bon type dans les formulaires. */
function isCardio(name) {
  if (!name) return false;
  if (DB.logs.some((l) => l.exercise === name && cardioLog(l))) return true;
  return DB.programs.some((p) => p.exercises.some((e) => e.name === name && e.kind === "cardio"));
}

/* « 32 min · 5,2 km · 310 cal · Modéré » — les champs vides tombent. */
function cardioText(l) {
  return [
    `${fmt(l.minutes)} min`,
    l.distance ? `${fmt(l.distance)} km` : null,
    l.calories ? `${Math.round(l.calories)} cal` : null,
    INTENSITY[l.intensity] || null,
  ].filter(Boolean).join(" · ");
}

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
    if (l.exercise !== name || cardioLog(l)) continue;
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

const volumeOf = (l) => cardioLog(l) ? 0 :
  l.perSet ? l.perSet.reduce((n, s) => n + s.weight * s.reps, 0) : (l.weight * l.reps * l.sets);

/* Un point par séance, du plus ancien au plus récent. Pour le
   cardio, `metric` vaut "minutes" ou "distance" ; une séance sans
   distance notée n'a pas de point sur la courbe des distances. */
function seriesFor(name, metric) {
  return DB.logs
    .filter((l) => l.exercise === name)
    .sort((a, b) => a.createdAt - b.createdAt)
    .filter((l) => !(cardioLog(l) && metric === "distance" && !l.distance))
    .map((l) => {
      if (cardioLog(l)) {
        return { x: l.createdAt, y: metric === "distance" ? l.distance : l.minutes, date: l.date, log: l };
      }
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

/* ── Muscles ───────────────────────────────────────────────
   Un muscle principal par exercice. Deviné d'après le nom (FR et
   EN) ; l'ordre des règles compte : « leg curl » est une jambe
   avant d'être un curl, « relevé de jambes » un abdo avant d'être
   une jambe, « développé militaire » une épaule avant d'être un
   développé. */
const MUSCLES = ["Pectoraux", "Dos", "Épaules", "Biceps", "Triceps", "Jambes", "Abdos", "Autre"];
const MUSCLE_RULES = [
  ["Abdos",     /abdo|\babs?\b|crunch|plank|planche|gainage|core|releve de jambe|leg raise|russian twist|ab wheel/],
  ["Jambes",    /squat|leg |leg$|jambe|presse|lunge|fente|hip thrust|mollet|calf|rdl|roumain|romanian|ischio|quadri|hack|adducteur|abducteur|fessier|glute|step.?up|bulgar/],
  ["Épaules",   /militaire|overhead|ohp|shoulder|epaule|lateral|elevation|face pull|delt|arnold|oiseau|rear delt/],
  ["Biceps",    /curl|biceps|marteau|hammer/],
  ["Triceps",   /tricep|dips|pushdown|push.?down|skull|barre au front|extension|kickback|close.?grip/],
  ["Pectoraux", /bench|couche|chest|pec|fly|ecarte|pompe|push.?up|incline|decline|developpe/],
  ["Dos",       /row|rowing|tirage|pull|lat\b|lats|traction|deadlift|souleve de terre|chin|shrug|haussement|dos/],
];
const deaccent = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function guessMuscle(name) {
  const n = deaccent(name || "");
  for (const [m, re] of MUSCLE_RULES) if (re.test(n)) return m;
  return "Autre";
}
const muscleOf = (name) => DB.muscles[name] || guessMuscle(name);

/* Lundi 00:00 de la semaine qui contient `d`, décalé de `k` semaines. */
function mondayOf(d = new Date(), k = 0) {
  const m = new Date(d); m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7) + 7 * k);
  return m;
}
const setsOf = (l) => cardioLog(l) ? 0 : (l.perSet ? l.perSet.length : Number(l.sets) || 0);

/* Entrées dont la date tombe dans [lundi + 7·k, +7·n jours). */
function logsInWeeks(k, n = 1) {
  const from = iso(mondayOf(new Date(), k));
  const end = mondayOf(new Date(), k); end.setDate(end.getDate() + 7 * n);
  const to = iso(end);
  return DB.logs.filter((l) => l.date >= from && l.date < to);
}

function weekStats(k = 0) {
  const logs = logsInWeeks(k);
  return {
    sessions: new Set(logs.map((l) => l.date)).size,
    volume: logs.reduce((n, l) => n + volumeOf(l), 0),
    cardio: logs.reduce((n, l) => n + (cardioLog(l) ? Number(l.minutes) || 0 : 0), 0),
    sets: logs.reduce((n, l) => n + setsOf(l), 0),
  };
}

/* Séries par muscle sur `n` semaines finissant cette semaine
   (k = 0) ou la précédente (k = -n). */
function setsByMuscle(k, n) {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
  logsInWeeks(k, n).forEach((l) => { if (!cardioLog(l)) out[muscleOf(l.exercise)] += setsOf(l); });
  return out;
}

/* ── Objectifs ─────────────────────────────────────────────
   Un objectif vise un niveau sur UN exercice : un poids (le
   record) en musculation, une durée ou une distance (la meilleure
   séance) en cardio. Atteint une fois = atteint pour de bon, même
   si une correction fait redescendre le record ensuite. */
const GOAL_UNIT = { weight: "lb", minutes: "min", distance: "km" };

function goalLevel(exercise, metric) {
  if (metric === "weight") return DB.prs[exercise] ?? bestWeight(exercise);
  return DB.logs
    .filter((l) => l.exercise === exercise && cardioLog(l))
    .reduce((m, l) => Math.max(m, Number(l[metric]) || 0), 0);
}

function goalProgress(g) {
  const cur = goalLevel(g.exercise, g.metric);
  const span = g.target - g.start;
  const p = g.doneAt ? 1 : span > 0 ? Math.max(0, Math.min(1, (cur - g.start) / span)) : (cur >= g.target ? 1 : 0);
  return { cur, p };
}

/* Marque les objectifs qui viennent d'être atteints et les renvoie. */
function checkGoals() {
  const hit = [];
  DB.goals.forEach((g) => {
    if (!g.doneAt && goalLevel(g.exercise, g.metric) >= g.target) { g.doneAt = Date.now(); hit.push(g); }
  });
  if (hit.length) persist.goals();
  return hit;
}

/* ── Jalons ────────────────────────────────────────────────
   Calculés à partir de l'historique, jamais stockés : seul ce
   qui a déjà été FÊTÉ est retenu (wt2-badges-seen), pour ne
   célébrer chaque jalon qu'une fois. */
const BADGES = [
  ...[1, 10, 25, 50, 100, 250].map((n) => ({ id: `s${n}`, stat: "sessions", n, big: String(n), unit: n > 1 ? "séances" : "séance",
    title: n === 1 ? "Première séance" : `${n} séances` })),
  ...[4, 8, 12, 26, 52].map((n) => ({ id: `w${n}`, stat: "streak", n, big: String(n), unit: "semaines",
    title: `${n} semaines d'affilée` })),
  ...[10000, 100000, 500000, 1000000].map((n) => ({ id: `v${n}`, stat: "volume", n, big: n >= 1e6 ? "1M" : `${n / 1000}k`, unit: "lb",
    title: `${n.toLocaleString("fr-CA")} lb soulevées` })),
  ...[10, 50, 100, 250].map((n) => ({ id: `k${n}`, stat: "km", n, big: String(n), unit: "km", title: `${n} km de cardio` })),
  ...[10, 50].map((n) => ({ id: `h${n}`, stat: "hours", n, big: String(n), unit: "heures", title: `${n} h de cardio` })),
];
const BADGE_GROUPS = [["sessions", "Séances"], ["streak", "Constance"], ["volume", "Volume"], ["km", "Cardio — distance"], ["hours", "Cardio — temps"]];

/* La plus longue suite de semaines avec au moins une séance. */
function bestStreak() {
  const weeks = new Set(DB.sessions.map((d) => iso(mondayOf(new Date(d + "T00:00:00")))));
  let best = 0;
  weeks.forEach((w) => {
    const prev = new Date(w + "T00:00:00"); prev.setDate(prev.getDate() - 7);
    if (weeks.has(iso(prev))) return;              // pas le début d'une suite
    let n = 0;
    const cur = new Date(w + "T00:00:00");
    while (weeks.has(iso(cur))) { n++; cur.setDate(cur.getDate() + 7); }
    best = Math.max(best, n);
  });
  return best;
}

function badgeStats() {
  return {
    sessions: DB.sessions.length,
    streak: bestStreak(),
    volume: DB.logs.reduce((n, l) => n + volumeOf(l), 0),
    km: DB.logs.reduce((n, l) => n + (cardioLog(l) ? Number(l.distance) || 0 : 0), 0),
    hours: DB.logs.reduce((n, l) => n + (cardioLog(l) ? Number(l.minutes) || 0 : 0), 0) / 60,
  };
}

function badgeList() {
  const s = badgeStats();
  return BADGES.map((b) => ({ ...b, value: s[b.stat], earned: s[b.stat] >= b.n }));
}

/* Les jalons gagnés depuis la dernière fois. Au tout premier appel,
   ce qui est déjà acquis est noté sans fête : quelqu'un qui a déjà
   80 séances ne veut pas quinze bandeaux d'un coup. */
function newBadges() {
  const earned = badgeList().filter((b) => b.earned);
  const raw = localStorage.getItem(K.badges);
  const seen = new Set(raw ? JSON.parse(raw) : []);
  const fresh = raw ? earned.filter((b) => !seen.has(b.id)) : [];
  earned.forEach((b) => seen.add(b.id));
  try { localStorage.setItem(K.badges, JSON.stringify([...seen])); } catch (_) {}
  return fresh;
}

/* ── Rappel de sauvegarde ──────────────────────────────────
   Les données ne vivent QUE dans le téléphone. Au-delà de 30
   jours sans export (ou jamais, une fois qu'il y a deux semaines
   d'historique), on le rappelle. « Plus tard » repousse d'une
   semaine. */
function backupDue() {
  if (DB.logs.length < 5) return null;
  const now = Date.now(), DAY = 86400000;
  const snooze = Number(localStorage.getItem(K.backupSnooze)) || 0;
  if (snooze > now) return null;
  const last = Number(localStorage.getItem(K.lastExport)) || 0;
  if (last) {
    const days = Math.floor((now - last) / DAY);
    return days >= 30 ? { days, never: false } : null;
  }
  const first = Math.min(...DB.logs.map((l) => l.createdAt || now));
  return now - first >= 14 * DAY ? { days: null, never: true } : null;
}

/* ── Écriture ─────────────────────────────────────────────── */

/* Ajoute une entrée d'historique et met à jour le record.
   Renvoie { pr, prev } si c'est un nouveau record. */
function addLog(entry) {
  const log = { id: uid(), date: today(), createdAt: Date.now(), ...entry };
  DB.logs.push(log);
  persist.logs();

  const prev = DB.prs[log.exercise] ?? 0;
  let pr = false;
  if (!cardioLog(log)) {
    const top = log.perSet ? Math.max(...log.perSet.map((s) => s.weight)) : log.weight;
    if (top > prev) { DB.prs[log.exercise] = top; persist.prs(); pr = true; }
  }

  if (!DB.sessions.includes(log.date)) { DB.sessions.push(log.date); persist.sessions(); }
  return { log, pr, prev };
}

/* Réécrit une entrée existante — en séance, un exercice déjà écrit
   dans l'historique peut encore recevoir une série de plus. */
function updateLog(id, fields) {
  const l = DB.logs.find((x) => x.id === id);
  if (!l) return null;
  Object.assign(l, fields);
  persist.logs();
  if (!cardioLog(l)) {
    const best = bestWeight(l.exercise);
    if (best > (DB.prs[l.exercise] ?? 0)) { DB.prs[l.exercise] = best; persist.prs(); }
  }
  return l;
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

/* Corrige une entrée passée (Historique). Contrairement à
   updateLog, le record peut aussi BAISSER : on le recalcule à
   partir de tout l'historique. Changer la date déplace aussi le
   jour d'entraînement dans le calendrier. */
function editLog(id, fields) {
  const l = DB.logs.find((x) => x.id === id);
  if (!l) return null;
  const oldDate = l.date;
  Object.assign(l, fields);
  if (!l.perSet) delete l.perSet;
  persist.logs();

  if (!cardioLog(l)) {
    const best = bestWeight(l.exercise);
    if (best > 0) DB.prs[l.exercise] = best; else delete DB.prs[l.exercise];
    persist.prs();
  }
  if (l.date !== oldDate) {
    if (!DB.sessions.includes(l.date)) DB.sessions.push(l.date);
    if (!DB.logs.some((x) => x.date === oldDate)) DB.sessions = DB.sessions.filter((d) => d !== oldDate);
    persist.sessions();
  }
  return l;
}

/* Renomme un exercice partout à la fois. */
function renameExercise(from, to) {
  from = from.trim(); to = to.trim();
  if (!to || from === to) return;
  DB.logs.forEach((l) => { if (l.exercise === from) l.exercise = to; });
  DB.programs.forEach((p) => p.exercises.forEach((e) => { if (e.name === from) e.name = to; }));
  if (DB.notes[from] !== undefined) { DB.notes[to] = DB.notes[from]; delete DB.notes[from]; }
  if (DB.links[from] !== undefined) { DB.links[to] = DB.links[from]; delete DB.links[from]; persist.links(); }
  if (DB.goals.some((g) => g.exercise === from)) {
    DB.goals.forEach((g) => { if (g.exercise === from) g.exercise = to; });
    persist.goals();
  }
  if (DB.muscles[from] !== undefined) { DB.muscles[to] = DB.muscles[from]; delete DB.muscles[from]; persist.muscles(); }
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
    if (cardioLog(l)) return;
    const top = l.perSet ? Math.max(...l.perSet.map((x) => x.weight)) : l.weight;
    if (top > (DB.prs[l.exercise] ?? 0)) DB.prs[l.exercise] = top;
  });

  persist.logs(); persist.programs(); persist.bodyweight();
  persist.notes(); persist.sessions(); persist.prs();
  return { logs: addedLogs, programs: addedProgs, bodyweight: addedBw, notes: addedNotes };
}

/* ── Programmes livrés avec une mise à jour ─────────────────
   Les données vivent dans le stockage de l'icône : pour qu'un
   programme préparé ailleurs arrive sur le téléphone, il voyage
   dans le code. Chacun n'est ajouté qu'UNE fois par appareil
   (`wt2-gifts`) : le supprimer ne le fait pas revenir. Les notes
   et muscles ne remplacent jamais ceux déjà choisis. */
const GIFTS = [
  {
    id: "gift-muscles-oublies",
    name: "Muscles oubliés",
    exercises: [
      { name: "Face pull", sets: 3, reps: "12-15", group: 0 },
      { name: "Mollets debout", sets: 3, reps: "10-12", group: 0 },
      { name: "Rotation externe à la poulie", sets: 3, reps: "12-15", group: 1 },
      { name: "Tibia raises", sets: 3, reps: "15-20", group: 1 },
      { name: "Y-raise sur banc incliné", sets: 3, reps: "10-12", group: 2 },
      { name: "Back extension 90°", sets: 3, reps: "10-12", group: 2 },
      { name: "Abduction de hanche", sets: 3, reps: "12-15", group: 3 },
      { name: "Adduction de hanche", sets: 3, reps: "12-15", group: 3 },
      { name: "Curl poignet", sets: 2, reps: "15-20", group: 4 },
      { name: "Reverse curl", sets: 2, reps: "12-15", group: 4 },
      { name: "Farmer's carry", sets: 2, reps: "30-40", group: 4 },
    ],
    /* Le nom seul se devine mal : « incliné » serait un pec,
       « extension » un triceps. */
    muscles: {
      "Rotation externe à la poulie": "Épaules",
      "Tibia raises": "Jambes",
      "Y-raise sur banc incliné": "Dos",
      "Back extension 90°": "Dos",
      "Abduction de hanche": "Jambes",
      "Adduction de hanche": "Jambes",
      "Curl poignet": "Autre",
      "Farmer's carry": "Autre",
    },
    notes: {
      "Face pull": "Corde à hauteur du visage, tire vers le front en écartant les mains. Coudes hauts.",
      "Mollets debout": "Pause de 2 s en bas, étirement complet.",
      "Rotation externe à la poulie": "Reps par bras. Coude collé au corps (serviette roulée sous le bras), charge légère.",
      "Tibia raises": "Dos au mur, talons à ~30 cm du mur : lève la pointe des pieds le plus haut possible.",
      "Y-raise sur banc incliné": "Couché ventre sur le banc, bras en Y, pouces vers le haut. Haltères très légers.",
      "Back extension 90°": "Coussin sous les hanches. Remonte jusqu'à la ligne droite, sans cambrer. Disque contre la poitrine si trop facile.",
      "Curl poignet": "Avant-bras sur les cuisses, paumes vers le haut, poignets dans le vide. Laisse rouler la barre au bout des doigts, puis referme et plie le poignet. Seul le poignet bouge.",
      "Reverse curl": "Barre EZ, prise par-dessus (paumes vers le bas). Coudes fixes.",
      "Farmer's carry": "Reps = mètres marchés. Haltères lourds, épaules basses, gainé.",
    },
  },
];

/* Ajoute les programmes livrés pas encore reçus. Renvoie leurs noms. */
function addGifts() {
  const got = load(K.gifts, []);
  const fresh = GIFTS.filter((g) => !got.includes(g.id));
  if (!fresh.length) return [];
  fresh.forEach((g) => {
    if (!DB.programs.some((p) => p.id === g.id)) {
      DB.programs.push({ id: g.id, name: g.name, accent: nextAccent(), exercises: g.exercises.map((e) => ({ ...e })) });
    }
    Object.entries(g.muscles || {}).forEach(([n, m]) => { if (!DB.muscles[n]) DB.muscles[n] = m; });
    Object.entries(g.notes || {}).forEach(([n, t]) => { if (!DB.notes[n]) DB.notes[n] = t; });
    got.push(g.id);
  });
  persist.programs(); persist.muscles(); persist.notes();
  save(K.gifts, got);
  return fresh.map((g) => g.name);
}

/* ── Sauvegarde manuelle ──────────────────────────────────── */
function exportJSON() {
  const payload = { app: "reps", version: 1, exportedAt: new Date().toISOString(), data: DB };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `workouts-${today()}.json`;
  try { localStorage.setItem(K.lastExport, String(Date.now())); } catch (_) {}
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
      ["programs", "logs", "bodyweight", "sessions", "journal", "goals"].forEach((k) => { if (Array.isArray(d[k])) DB[k] = d[k]; });
      ["notes", "prs", "muscles", "links"].forEach((k) => { if (d[k] && typeof d[k] === "object") DB[k] = d[k]; });
      Object.values(persist).forEach((f) => f());
      done(null);
    } catch (e) { done(e); }
  };
  r.onerror = () => done(new Error("lecture"));
  r.readAsText(file);
}

/* ── Photos de progression (IndexedDB, base à part) ────────
   Le nom « reps-photos » date du nom d'origine de l'app et ne
   change pas : renommer la base orphelinerait les photos déjà
   enregistrées sur l'appareil. */
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

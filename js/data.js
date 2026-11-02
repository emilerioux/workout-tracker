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
  blocks:    "wt2-blocks",
  hint:     "wt2-hint-seen",
  scrub:    "wt2-scrub-learned",
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
  /* Objectifs : { id, exercise, metric ("weight" | "reps" | "minutes" |
     "distance" | "bodyweight"), start, target, weight|null, deadline|null,
     createdAt, doneAt|null }. `start` = le niveau au moment de le
     fixer ; `weight` = poids minimum d'un objectif de reps. */
  goals:      load(K.goals, []),
  /* Lien vers une vidéo de technique, par nom d'exercice. */
  links:      load(K.links, {}),
  /* Blocs du coach : { id, n, name, focus, weeks, start|null,
     endedAt|null, programIds, goals, swaps, deliveredAt }. Voir
     « Blocs du coach » plus bas. */
  blocks:     load(K.blocks, []),
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
  blocks:     () => save(K.blocks, DB.blocks),
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
      if (metric === "e1rm") {
        return { x: l.createdAt, y: Math.round(Math.max(...(l.perSet || [l]).map((s) => e1rm(s.weight, s.reps)))), date: l.date, log: l };
      }
      const top = l.perSet ? l.perSet.reduce((a, b) => (b.weight > a.weight ? b : a)) : null;
      const value = metric === "reps"
        ? (top ? top.reps : l.reps)
        : (top ? top.weight : l.weight);
      return { x: l.createdAt, y: value, date: l.date, log: l };
    })
    .filter((p) => metric !== "e1rm" || p.y > 0);
}

/* 1RM estimé (Epley) : ce qu'une série vaudrait en une seule rep,
   pour comparer 155 lb × 10 à 185 lb × 5. Sans poids, rien à estimer. */
function e1rm(weight, reps) {
  const w = Number(weight), r = Number(reps);
  if (!(w > 0) || !(r > 0)) return 0;
  return r === 1 ? w : w * (1 + r / 30);
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
   record) ou des reps (la meilleure série, à un poids minimum ou
   non) en musculation, une durée ou une distance (la meilleure
   séance) en cardio. Le poids corporel, lui, vise la dernière pesée
   et peut descendre. Atteint une fois = atteint pour de bon, même
   si une correction fait redescendre le record ensuite. */
const GOAL_UNIT = { weight: "lb", reps: "reps", minutes: "min", distance: "km", bodyweight: "lb" };
const BODY_GOAL = "Poids corporel";

/* La pesée la plus récente, 0 s'il n'y en a pas. */
function currentBodyweight() {
  let last = null;
  for (const b of DB.bodyweight) if (!last || b.createdAt > last.createdAt) last = b;
  return last ? Number(last.weight) || 0 : 0;
}

/* « 1 rep », « 10 reps », « 185 lb » */
const goalAmount = (metric, n) => metric === "reps"
  ? `${fmt(n)} rep${n > 1 ? "s" : ""}`
  : `${fmt(n)} ${GOAL_UNIT[metric]}`;
const goalWeightText = (g) => g.metric === "reps" && g.weight ? `à ${fmt(g.weight)} lb` : "";
/* « 10 reps à 135 lb » */
const goalLabel = (g) => [goalAmount(g.metric, g.target), goalWeightText(g)].filter(Boolean).join(" ");

/* Le plus de reps en une série, à `minWeight` lb ou plus. */
function bestReps(name, minWeight = 0) {
  let best = 0;
  for (const l of DB.logs) {
    if (l.exercise !== name || cardioLog(l)) continue;
    for (const s of l.perSet || [l]) {
      if (Number(s.weight) >= minWeight && Number(s.reps) > best) best = Number(s.reps);
    }
  }
  return best;
}

function goalLevel(exercise, metric, minWeight = 0) {
  if (metric === "weight") return DB.prs[exercise] ?? bestWeight(exercise);
  if (metric === "reps") return bestReps(exercise, minWeight || 0);
  if (metric === "bodyweight") return currentBodyweight();
  return DB.logs
    .filter((l) => l.exercise === exercise && cardioLog(l))
    .reduce((m, l) => Math.max(m, Number(l[metric]) || 0), 0);
}

/* Seul le poids corporel peut viser plus bas qu'au départ. */
const goalDown = (g) => g.metric === "bodyweight" && g.target < g.start;
const goalReached = (g, cur) => goalDown(g) ? cur > 0 && cur <= g.target : cur >= g.target;

function goalProgress(g) {
  const cur = goalLevel(g.exercise, g.metric, g.weight);
  const span = Math.abs(g.target - g.start);
  const moved = goalDown(g) ? g.start - cur : cur - g.start;
  const p = g.doneAt ? 1 : (g.metric === "bodyweight" ? span > 0 : g.target > g.start)
    ? Math.max(0, Math.min(1, moved / span))
    : (goalReached(g, cur) ? 1 : 0);
  return { cur, p };
}

/* Le niveau en comptant aussi les séries de la séance en cours, qui
   n'entrent dans l'historique qu'une fois l'exercice terminé. */
function liveLevel(g, sets = []) {
  return sets.reduce((m, s) => {
    if (g.metric !== "reps") return Math.max(m, Number(s[g.metric]) || 0);
    return Number(s.weight) >= (g.weight || 0) ? Math.max(m, Number(s.reps) || 0) : m;
  }, goalLevel(g.exercise, g.metric, g.weight));
}

/* Marque les objectifs qui viennent d'être atteints et les renvoie.
   `live` = { exercise, sets } : l'exercice en cours en séance. */
function checkGoals(live = null) {
  const hit = [];
  DB.goals.forEach((g) => {
    if (g.doneAt) return;
    const cur = live && g.exercise === live.exercise ? liveLevel(g, live.sets) : goalLevel(g.exercise, g.metric, g.weight);
    if (goalReached(g, cur)) { g.doneAt = Date.now(); hit.push(g); }
  });
  if (hit.length) persist.goals();
  return hit;
}

/* ── Récap du mois ─────────────────────────────────────────
   Tout se recalcule depuis l'historique. Un record du mois = une
   entrée qui dépasse tout ce qui précède ; la toute première fois
   sur un exercice n'en est pas un. */
function monthStats(year, month) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const inMonth = (l) => String(l.date).startsWith(prefix);
  const logs = DB.logs.filter(inMonth);

  const best = {}, records = {};
  [...DB.logs].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.createdAt - b.createdAt).forEach((l) => {
    if (cardioLog(l)) return;
    const top = Math.max(...(l.perSet || [l]).map((s) => Number(s.weight) || 0));
    const prev = best[l.exercise] || 0;
    if (top <= prev) return;
    best[l.exercise] = top;
    if (!prev || !inMonth(l)) return;
    records[l.exercise] = { name: l.exercise, weight: top, prev: records[l.exercise]?.prev ?? prev };
  });

  const muscles = {};
  logs.forEach((l) => { if (!cardioLog(l)) muscles[muscleOf(l.exercise)] = (muscles[muscleOf(l.exercise)] || 0) + setsOf(l); });

  return {
    sessions: new Set(logs.map((l) => l.date)).size,
    volume: logs.reduce((n, l) => n + volumeOf(l), 0),
    cardio: logs.reduce((n, l) => n + (cardioLog(l) ? Number(l.minutes) || 0 : 0), 0),
    sets: logs.reduce((n, l) => n + setsOf(l), 0),
    records: Object.values(records),
    goals: DB.goals.filter((g) => {
      if (!g.doneAt) return false;
      const d = new Date(g.doneAt);
      return d.getFullYear() === year && d.getMonth() === month;
    }),
    muscles: Object.entries(muscles).sort((a, b) => b[1] - a[1]),
  };
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

/* Plan d'un exercice de bloc sur 6 semaines : `s1` séries, puis `s2`
   à partir de la semaine 3, même fourchette de reps (double progression). */
const weeksOf = (reps, cue = "", s1 = 3, s2 = 3, n = 6) =>
  Array.from({ length: n }, (_, k) => ({ sets: k >= 2 ? s2 : s1, reps, ...(cue ? { cue } : {}) }));

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
  {
    id: "gift-bras",
    name: "Bras",
    exercises: [
      { name: "Développé couché prise serrée", sets: 3, reps: "8-10", group: 0 },
      { name: "Curl barre EZ", sets: 3, reps: "8-10", group: 0 },
      { name: "Extension triceps au-dessus de la tête", sets: 3, reps: "10-12", group: 1 },
      { name: "Curl incliné haltères", sets: 3, reps: "10-12", group: 1 },
      { name: "Pushdown triceps (corde)", sets: 3, reps: "12-15", group: 2 },
      { name: "Curl marteau", sets: 3, reps: "10-12", group: 2 },
      { name: "Dips", sets: 2, reps: "8-12", group: 3 },
      { name: "Curl à la poulie basse", sets: 2, reps: "12-15", group: 3 },
    ],
    /* « couché » serait deviné pectoraux. */
    muscles: {
      "Développé couché prise serrée": "Triceps",
    },
    notes: {
      "Développé couché prise serrée": "Mains largeur d'épaules, coudes près du corps. La barre descend vers le bas des pecs.",
      "Curl barre EZ": "Coudes collés aux côtes, sans balancer le dos. Descente en 2-3 s.",
      "Extension triceps au-dessus de la tête": "Poulie, corde. Dos à la poulie, corde derrière la tête ; tends vers l'avant et le haut, coudes pointés devant.",
      "Curl incliné haltères": "Banc à ~45°, bras qui pendent derrière le corps. Charge légère, gros étirement.",
      "Pushdown triceps (corde)": "Coudes fixes contre le corps, écarte la corde en bas.",
      "Curl marteau": "Pouces vers le haut, coudes fixes.",
      "Dips": "Buste plutôt droit pour cibler les triceps. Machine assistée si 8 reps est trop dur.",
      "Curl à la poulie basse": "Barre droite, coudes fixes, serre en haut.",
    },
  },
  {
    id: "gift-dos-pecs",
    name: "Dos & Pecs",
    exercises: [
      { name: "Dumbbell bench press", sets: 4, reps: "6-8", group: 0 },
      { name: "Chest-supported dumbbell row", sets: 4, reps: "6-8", group: 0 },
      { name: "Incline dumbbell press", sets: 3, reps: "8-10", group: 1 },
      { name: "Pull-ups", sets: 3, reps: "6-10", group: 1 },
      { name: "Cable fly", sets: 3, reps: "12-15", group: 2 },
      { name: "Single-arm lat pulldown", sets: 3, reps: "10-12", group: 2 },
      { name: "Push-ups", sets: 2, reps: "10-15", group: 3 },
      { name: "Cable pullover", sets: 2, reps: "12-15", group: 3 },
    ],
    /* « chest » serait deviné pectoraux. */
    muscles: {
      "Chest-supported dumbbell row": "Dos",
    },
    notes: {
      "Dumbbell bench press": "Banc plat, omoplates serrées et basses, pieds au sol. Descends les haltères à hauteur de poitrine, coudes à ~45°.",
      "Chest-supported dumbbell row": "Couché ventre sur le banc incliné à ~30-45°, bras qui pendent. Tire les coudes vers les hanches, serre les omoplates en haut.",
      "Incline dumbbell press": "Banc à ~30°. Descends jusqu'à sentir l'étirement des pecs, pousse en rapprochant les haltères.",
      "Pull-ups": "Prise un peu plus large que les épaules. Machine assistée ou tirage vertical si 6 reps est trop dur.",
      "Cable fly": "Poulies à hauteur d'épaules, un pas en avant, coudes légèrement fléchis. Ramène les mains devant le milieu de la poitrine, comme pour un câlin.",
      "Single-arm lat pulldown": "Reps par bras. À genoux de côté sous la poulie haute, poignée simple. Laisse le bras monter pour étirer le dorsal, puis tire le coude vers la hanche.",
      "Push-ups": "Corps gainé en planche. Poitrine jusqu'à quelques cm du sol.",
      "Cable pullover": "Debout face à la poulie haute, barre droite ou corde. Bras presque tendus, descends les mains en arc jusqu'aux cuisses en contractant les dorsaux.",
    },
  },
  /* Bloc 1 du coach (2026-11-02), préparé avec /coach à partir de
     l'export du 2 nov. : 5 séances par rotation, deux jambes au lieu
     d'une, relancer le DB incline, monter vers 6 tractions. Les noms
     d'exercices déjà connus sont gardés à l'identique. */
  {
    id: "gift-bloc-1",
    block: {
      n: 1,
      name: "Fondations 5 jours",
      focus: "Deux séances de jambes par rotation, relancer le DB incline et monter vers 6 tractions, sans perdre ton bench.",
      weeks: 6,
      goals: [
        { exercise: "Pull Ups", metric: "reps", target: 6, weight: null, deadline: "bloc",
          why: "Ton record est 4 : l'étape vers tes 10 d'avril." },
        { exercise: "DB incline bench", metric: "reps", target: 10, weight: 70, deadline: "bloc",
          why: "Bloqué à 60 lb depuis 3 séances ; ton record à 70 lb est 7 reps." },
        { exercise: "Goblet Squat", metric: "weight", target: 65, deadline: "bloc",
          why: "Tu es passé de 30 à 45 lb en 5 séances : on continue." },
      ],
    },
    programs: [
      { key: "push", name: "Push", exercises: [
        { name: "BB bench press", sets: 3, reps: "3-5", group: 0, weeks: weeksOf("3-5", "+5 lb quand toutes les séries font 5", 3, 4) },
        { name: "DB incline bench", sets: 3, reps: "8-10", group: 1, weeks: weeksOf("8-10", "Repars à 60 lb ; 10 reps partout → +5 lb", 3, 4) },
        { name: "Chest fly", sets: 3, reps: "10-12", group: 2, weeks: weeksOf("10-12", "Étirement contrôlé en bas") },
        { name: "Dips", sets: 3, reps: "10-15", group: 3, weeks: weeksOf("10-15", "15 reps partout → ajoute du poids") },
        { name: "Skull crusher", sets: 3, reps: "10-12", group: 3, weeks: weeksOf("10-12", "Essaie 30 lb, même à 8 reps") },
        { name: "Seated DB shoulder press", sets: 3, reps: "8-10", group: 4, isNew: true, weeks: weeksOf("8-10", "Dos appuyé ; 10 reps partout → +5 lb") },
      ] },
      { key: "pull", name: "Pull", exercises: [
        { name: "Pull Ups", sets: 3, reps: "max", group: 0, weeks: weeksOf("max", "Note tes reps : on vise 6") },
        { name: "Negative pull-ups", sets: 3, reps: "3-5", group: 1, isNew: true, weeks: [
          ...weeksOf("3-5", "Saute en haut, descends en 4-5 s").slice(0, 3),
          ...weeksOf("4-6", "Descente de 5 s, contrôlée jusqu'en bas").slice(3) ] },
        { name: "Lateral Row", sets: 3, reps: "10-12", group: 2, weeks: [
          ...weeksOf("10-12", "+5 lb quand 12 reps partout").slice(0, 2),
          ...weeksOf("8-10", "Plus lourd, moins de reps", 4, 4).slice(2, 4),
          ...weeksOf("6-8", "Monte vers 170 lb", 4, 4).slice(4) ] },
        { name: "Vertical pull down", sets: 3, reps: "10-12", group: 3, weeks: weeksOf("10-12", "+5 lb quand 12 reps partout") },
        { name: "Reverse cable flys", sets: 3, reps: "10-12", group: 4, weeks: weeksOf("10-12") },
        { name: "Shrugs DB", sets: 3, reps: "15", group: 5, weeks: weeksOf("15", "Pause 1 s en haut") },
        { name: "Curl Marteau", sets: 3, reps: "10-12", group: 5, weeks: weeksOf("10-12", "12 reps partout → 40 lb") },
      ] },
      { key: "legs", name: "Legs", exercises: [
        { name: "Goblet Squat", sets: 3, reps: "10-12", group: 0, weeks: weeksOf("10-12", "+5 lb chaque semaine", 3, 4) },
        { name: "Single leg leg press", sets: 3, reps: "10-12", group: 1, isNew: true, weeks: weeksOf("10-12", "Reps par jambe ; commence léger") },
        { name: "Leg Extension", sets: 3, reps: "10-12", group: 2, weeks: weeksOf("10-12", "+5 lb quand 12 reps partout", 3, 4) },
        { name: "Leg Curl", sets: 3, reps: "12-15", group: 3, weeks: weeksOf("12-15") },
        { name: "Mollets debout", sets: 3, reps: "10-12", group: 4, weeks: weeksOf("10-12", "Pause 2 s en bas, étirement complet") },
      ] },
      { key: "upper", name: "Upper", exercises: [
        { name: "Military press", sets: 3, reps: "4-6", group: 0, weeks: weeksOf("4-6", "+5 lb quand 4 × 6 passe", 3, 4) },
        { name: "DB bench press", sets: 4, reps: "6-8", group: 1, weeks: weeksOf("6-8", "8 reps partout → +5 lb", 4, 4) },
        { name: "T bar row", sets: 4, reps: "6-8", group: 1, weeks: weeksOf("6-8", "+10 lb quand 8 reps partout", 4, 4) },
        { name: "Close grip lat pulldown", sets: 3, reps: "12", group: 2, weeks: weeksOf("12") },
        { name: "Lateral raise", sets: 3, reps: "15", group: 3, weeks: weeksOf("15") },
        { name: "Face pull", sets: 3, reps: "12-15", group: 3, isNew: true, weeks: weeksOf("12-15", "Coudes hauts, tire vers le front") },
        { name: "Curl barre EZ", sets: 3, reps: "8-10", group: 4, weeks: weeksOf("8-10") },
        { name: "Pushdown triceps (corde)", sets: 3, reps: "12-15", group: 4, weeks: weeksOf("12-15") },
        { name: "7-7-7", sets: 2, reps: "21", group: 5, weeks: weeksOf("21", "", 2, 2) },
      ] },
      { key: "lower", name: "Lower", exercises: [
        { name: "Barbell Hip Trust", sets: 3, reps: "8-10", group: 0, weeks: [
          ...weeksOf("8-10", "+10 lb quand 10 reps partout", 3, 4).slice(0, 4),
          ...weeksOf("6-8", "Vise 245 lb", 4, 4).slice(4) ] },
        { name: "DB Romanian deadlift", sets: 3, reps: "8-10", group: 1, isNew: true, weeks: weeksOf("8-10", "Hanches en arrière, dos plat, sens les ischios") },
        { name: "Leg press", sets: 3, reps: "10-12", group: 2, isNew: true, weeks: weeksOf("10-12", "Pieds largeur d'épaules, descends à 90°", 3, 4) },
        { name: "Abducteur machine", sets: 3, reps: "10-12", group: 3, weeks: weeksOf("10-12") },
        { name: "Abdo machine", sets: 3, reps: "12-15", group: 4, weeks: weeksOf("12-15") },
      ] },
    ],
    /* « close grip » serait deviné triceps. */
    muscles: { "Close grip lat pulldown": "Dos" },
    notes: {
      "Seated DB shoulder press": "Banc à 80-90°, dos collé. Haltères à hauteur des oreilles, pousse au-dessus de la tête sans cambrer.",
      "Negative pull-ups": "Monte en sautant (ou avec un banc), menton au-dessus de la barre, puis descends le plus lentement possible jusqu'aux bras tendus.",
      "Single leg leg press": "Une jambe à la fois, pied au milieu de la plateforme. Descends contrôlé sans que le bas du dos décolle.",
      "Face pull": "Corde à hauteur du visage, tire vers le front en écartant les mains. Coudes hauts.",
      "DB Romanian deadlift": "Haltères devant les cuisses, genoux légèrement fléchis. Pousse les hanches en arrière, dos plat, jusqu'à sentir l'étirement des ischios, puis remonte en serrant les fessiers.",
      "Leg press": "Pieds largeur d'épaules au milieu de la plateforme. Descends jusqu'à ~90° aux genoux, sans décoller le bas du dos. Ne verrouille pas les genoux en haut.",
    },
  },
];

/* Ajoute les programmes livrés pas encore reçus. Renvoie leurs noms. */
function addGifts() {
  const got = load(K.gifts, []);
  const fresh = GIFTS.filter((g) => !got.includes(g.id));
  if (!fresh.length) return [];
  fresh.forEach((g) => {
    if (g.block) addBlockGift(g);
    else if (!DB.programs.some((p) => p.id === g.id)) {
      DB.programs.push({ id: g.id, name: g.name, accent: nextAccent(), exercises: g.exercises.map((e) => ({ ...e })) });
    }
    Object.entries(g.muscles || {}).forEach(([n, m]) => { if (!DB.muscles[n]) DB.muscles[n] = m; });
    Object.entries(g.notes || {}).forEach(([n, t]) => { if (!DB.notes[n]) DB.notes[n] = t; });
    got.push(g.id);
  });
  persist.programs(); persist.muscles(); persist.notes(); persist.blocks();
  save(K.gifts, got);
  return fresh.map((g) => g.block ? `Bloc ${g.block.n} du coach` : g.name);
}

/* ── Blocs du coach ─────────────────────────────────────────
   Un bloc = 6 à 8 semaines préparées avec Claude (skill /coach) à
   partir du bilan du bloc d'avant. Il arrive comme un programme
   livré, mais avec PLUSIEURS programmes (une rotation A → B → C, pas
   des jours fixes : la fréquence change d'une semaine à l'autre).

   Le plan semaine par semaine vit DANS chaque exercice
   (`e.weeks = [{ sets, reps, cue }]`) : remplacer l'exercice garde
   son plan. `e.isNew` = ajouté par le coach, pour essayer.

   Rien n'est jamais supprimé : un bloc fini garde ses programmes,
   rangés sous « Mes blocs ». Le compteur ne part qu'au toucher de
   « Commencer le bloc » (`start`), pas à la livraison. */
const WEEK = 7 * 86400000;

function addBlockGift(g) {
  if (DB.blocks.some((b) => b.id === g.id)) return;
  const programIds = g.programs.map((p, k) => {
    const id = `${g.id}-${p.key || k}`;
    if (!DB.programs.some((x) => x.id === id)) {
      DB.programs.push({ id, name: p.name, accent: nextAccent(), blockId: g.id, exercises: p.exercises.map((e) => ({ ...e })) });
    }
    return id;
  });
  DB.blocks.push({
    id: g.id, n: g.block.n, name: g.block.name, focus: g.block.focus || "", weeks: g.block.weeks,
    start: null, endedAt: null, programIds,
    goals: (g.block.goals || []).map((x, k) => ({ id: `${g.id}-goal-${k}`, ...x, status: null })),
    swaps: [], deliveredAt: Date.now(),
  });
}

const blockById = (id) => DB.blocks.find((b) => b.id === id) || null;
/* Les blocs pas encore remplacés, du plus récent au plus ancien :
   d'habitude un seul, deux quand un nouveau attend d'être commencé. */
const liveBlocks = () => DB.blocks.filter((b) => !b.endedAt).sort((a, b) => b.n - a.n);
/* Celui qu'on suit en séance : le plus récent qui a commencé. */
const runningBlock = () => liveBlocks().find((b) => b.start) || null;
const blockPrograms = (b) => b.programIds.map((id) => DB.programs.find((p) => p.id === id)).filter(Boolean);

/* Semaine 1…n depuis le lundi de la semaine du départ ; 0 = pas commencé. */
function blockWeek(b) {
  if (!b || !b.start) return 0;
  return Math.floor((mondayOf() - mondayOf(new Date(b.start + "T00:00:00"))) / WEEK) + 1;
}
/* Dimanche de la dernière semaine prévue. */
function blockPlannedEnd(b) {
  const d = mondayOf(new Date(b.start + "T00:00:00"), b.weeks);
  d.setDate(d.getDate() - 1);
  return iso(d);
}
/* « pending » | « running » | « finished » (semaines écoulées) | « ended » (remplacé). */
function blockState(b) {
  if (b.endedAt) return "ended";
  if (!b.start) return "pending";
  return blockWeek(b) > b.weeks ? "finished" : "running";
}
/* Dernier jour couvert par le bilan : la fin réelle, ou aujourd'hui. */
const blockLastDay = (b) => b.endedAt || (blockState(b) === "finished" ? blockPlannedEnd(b) : today());

/* Le plan d'un exercice pour la semaine `w` ; au-delà du plan, la
   dernière semaine prévue continue. */
function weekPlan(e, w) {
  if (!e || !Array.isArray(e.weeks) || !e.weeks.length || w < 1) return null;
  return e.weeks[Math.min(w, e.weeks.length) - 1];
}

/* Commencer un bloc remplace celui d'avant : il est rangé, pas effacé. */
function startBlock(b) {
  DB.blocks.forEach((x) => { if (x !== b && !x.endedAt && x.start) x.endedAt = today(); });
  b.start = today();
  /* Un objectif « pour la fin du bloc » accepté avant le départ
     reçoit sa date maintenant qu'elle est connue. */
  const end = blockPlannedEnd(b);
  DB.goals.forEach((g) => {
    if (g.coach === b.id && !g.deadline && b.goals.some((cg) => cg.deadline === "bloc" && cg.exercise === g.exercise)) g.deadline = end;
  });
  persist.blocks(); persist.goals();
}

/* Un exercice retiré ou remplacé dans un programme du coach : c'est
   ce qui lui dit quoi ne plus proposer. `to: null` = retiré. */
function recordSwap(program, from, to) {
  const b = program && blockById(program.blockId);
  if (!b || from === to) return;
  b.swaps.push({ from, to: to || null, program: program.name, date: today() });
  persist.blocks();
}

/* Le prochain programme de la rotation : celui qui suit le dernier fait. */
function nextInRotation(b) {
  const ids = b.programIds;
  const last = DB.logs.filter((l) => ids.includes(l.programId) && l.date >= (b.start || "9999"))
    .sort((x, y) => y.createdAt - x.createdAt)[0];
  if (!last) return ids[0];
  return ids[(ids.indexOf(last.programId) + 1) % ids.length];
}

/* Accepter un objectif proposé le place dans les objectifs, parti
   du niveau actuel. `deadline: "bloc"` = la fin du bloc. */
function acceptCoachGoal(b, cg) {
  const deadline = cg.deadline === "bloc" ? (b.start ? blockPlannedEnd(b) : null) : (cg.deadline || null);
  DB.goals.push({
    id: uid(), exercise: cg.exercise, metric: cg.metric, target: cg.target, weight: cg.weight || null,
    deadline, start: goalLevel(cg.exercise, cg.metric, cg.weight) || 0, createdAt: Date.now(), doneAt: null, coach: b.id,
  });
  cg.status = "accepted";
  persist.goals(); persist.blocks();
}

/* ── Bilan d'un bloc ───────────────────────────────────────
   Tout se recalcule depuis l'historique, entre le départ et la fin. */
function blockSummary(b) {
  const from = b.start, to = blockLastDay(b);
  const logs = DB.logs.filter((l) => l.date >= from && l.date <= to);
  /* Semaines écoulées — un bloc gardé plus longtemps que prévu en a plus. */
  const nWeeks = Math.max(1, Math.round((mondayOf(new Date(to + "T00:00:00")) - mondayOf(new Date(from + "T00:00:00"))) / WEEK) + 1);

  const weeks = Array.from({ length: Math.max(b.weeks, nWeeks) }, (_, k) => {
    const m = mondayOf(new Date(from + "T00:00:00"), k), e = new Date(m); e.setDate(e.getDate() + 7);
    const wl = logs.filter((l) => l.date >= iso(m) && l.date < iso(e));
    return { n: k + 1, sessions: new Set(wl.map((l) => l.date)).size, sets: wl.reduce((s, l) => s + setsOf(l), 0), future: k >= nWeeks };
  });

  /* Records : une entrée qui dépasse tout ce qui précède, PENDANT le bloc. */
  const best = {}, records = {};
  [...DB.logs].sort((x, y) => String(x.date).localeCompare(String(y.date)) || x.createdAt - y.createdAt).forEach((l) => {
    if (cardioLog(l) || l.date > to) return;
    const top = Math.max(...(l.perSet || [l]).map((s) => Number(s.weight) || 0));
    const prev = best[l.exercise] || 0;
    if (top <= prev) return;
    best[l.exercise] = top;
    if (!prev || l.date < from) return;
    records[l.exercise] = { name: l.exercise, weight: top, prev: records[l.exercise]?.prev ?? prev };
  });

  /* Progrès par exercice : 1RM estimé de la première à la dernière séance du bloc. */
  const byEx = {};
  [...logs].sort((x, y) => x.createdAt - y.createdAt).forEach((l) => {
    if (cardioLog(l)) return;
    const v = Math.round(Math.max(...(l.perSet || [l]).map((s) => e1rm(s.weight, s.reps))));
    if (!(v > 0)) return;
    const x = byEx[l.exercise] || (byEx[l.exercise] = { name: l.exercise, first: v, last: v, n: 0 });
    x.last = v; x.n++;
  });
  const progress = Object.values(byEx).map((x) => ({ ...x, pct: Math.round(((x.last - x.first) / x.first) * 100) }))
    .sort((x, y) => y.pct - x.pct);

  const muscles = Object.fromEntries(MUSCLES.filter((m) => m !== "Autre").map((m) => [m, 0]));
  logs.forEach((l) => { if (!cardioLog(l)) { const m = muscleOf(l.exercise); if (m in muscles) muscles[m] += setsOf(l); } });

  const planned = new Set(blockPrograms(b).flatMap((p) => p.exercises.map((e) => e.name)));
  const done = new Set(logs.map((l) => l.exercise));

  return {
    from, to, nWeeks, weeks,
    sessions: new Set(logs.map((l) => l.date)).size,
    sets: logs.reduce((s, l) => s + setsOf(l), 0),
    volume: logs.reduce((s, l) => s + volumeOf(l), 0),
    records: Object.values(records),
    progress,
    /* Séries par semaine, en moyenne sur les semaines écoulées. */
    muscles: Object.entries(muscles).map(([m, n]) => [m, Math.round((n / nWeeks) * 10) / 10]).sort((x, y) => y[1] - x[1]),
    neverDone: [...planned].filter((n) => !done.has(n)),
    goals: DB.goals.filter((g) => g.coach === b.id || (g.doneAt && iso(new Date(g.doneAt)) >= from && iso(new Date(g.doneAt)) <= to)),
    bodyweight: DB.bodyweight.filter((w) => w.date >= from && w.date <= to).sort((x, y) => x.createdAt - y.createdAt),
  };
}

/* Les exercices faits le plus souvent, toute l'histoire confondue :
   c'est ce qu'il aime, le coach part de là. */
function favoriteExercises(n = 30) {
  const c = {};
  DB.logs.forEach((l) => { c[l.exercise] = (c[l.exercise] || 0) + 1; });
  return Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, n)
    .map(([name, times]) => ({ name, times, muscle: muscleOf(name), cardio: isCardio(name), best: DB.prs[name] || null }));
}

/* Ce qui part chez le coach. Un bilan de bloc, ou — sans bloc —
   tout, pour préparer le premier. */
function coachPayload(b) {
  const base = {
    app: "reps", kind: b ? "coach-bilan" : "coach-start", version: 1, exportedAt: new Date().toISOString(),
    favorites: favoriteExercises(),
    goals: DB.goals,
    blocks: DB.blocks.map(({ id, n, name, focus, weeks, start, endedAt, swaps }) => ({ id, n, name, focus, weeks, start, endedAt, swaps })),
    notes: DB.notes, muscles: DB.muscles,
    bodyweight: [...DB.bodyweight].sort((x, y) => x.createdAt - y.createdAt).slice(-30),
  };
  if (!b) return { ...base, programs: DB.programs, logs: DB.logs, journal: DB.journal };
  const s = blockSummary(b);
  return {
    ...base,
    block: { ...b, week: blockWeek(b), state: blockState(b) },
    summary: s,
    programs: blockPrograms(b),
    otherPrograms: DB.programs.filter((p) => !p.blockId).map((p) => ({ name: p.name, exercises: p.exercises.map((e) => e.name) })),
    logs: DB.logs.filter((l) => l.date >= s.from && l.date <= s.to),
    journal: DB.journal.filter((j) => j.date >= s.from && j.date <= s.to),
  };
}

/* Partage (feuille iOS : Mail, OneDrive, AirDrop…) ; sinon téléchargement. */
async function shareJSON(filename, payload) {
  const text = JSON.stringify(payload, null, 2);
  try {
    const file = new File([text], filename, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Pour le coach" });
      return "shared";
    }
  } catch (e) { if (e && e.name === "AbortError") return "cancel"; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return "saved";
}
const sendToCoach = (b) => shareJSON(`coach-${b ? `bilan-bloc${b.n}` : "depart"}-${today()}.json`, coachPayload(b));

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
      ["programs", "logs", "bodyweight", "sessions", "journal", "goals", "blocks"].forEach((k) => { if (Array.isArray(d[k])) DB[k] = d[k]; });
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

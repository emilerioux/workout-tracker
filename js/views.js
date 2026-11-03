/* ============================================================
   views.js — les quatre onglets, la navigation poussée,
   les feuilles modales et les sélecteurs.
   ============================================================ */

const $ = (id) => document.getElementById(id);

/* Dix accents de programme — identité visuelle, jamais porteuse
   d'information : le nom du programme dit déjà tout. Les six
   premiers gardent leur rang historique : `accent` est stocké
   comme un index, et réordonner repeindrait les programmes
   existants. Les quatre derniers complètent la palette des
   accents d'app. */
const ACCENTS = [
  ["#30D158", "#1E8E44"], ["#0A84FF", "#0A5BC4"], ["#BF5AF2", "#7D3BAF"],
  ["#FF9F0A", "#C46E00"], ["#FF375F", "#B4223F"], ["#64D2FF", "#2E93BE"],
  ["#40D9C0", "#268C7C"], ["#5E5CE6", "#3A3897"], ["#FFD426", "#C09B0B"],
  ["#A0A4AD", "#63666E"],
];
const accentOf = (p) => ACCENTS[(p.accent ?? 0) % ACCENTS.length];

/* Le dégradé d'un programme, prêt à poser dans un style. */
const stripeOf = (p) => { const [a, b] = accentOf(p); return `linear-gradient(160deg,${a},${b})`; };

/* Un programme = une couleur à lui. On prend la première libre ;
   au-delà de dix programmes il faut bien recommencer, et c'est
   alors la couleur la moins portée qui repasse. */
function freeAccent(taken) {
  for (let i = 0; i < ACCENTS.length; i++) if (!taken.has(i)) return i;
  const count = new Map();
  DB.programs.forEach((p) => count.set(p.accent ?? 0, (count.get(p.accent ?? 0) || 0) + 1));
  let best = 0, low = Infinity;
  for (let i = 0; i < ACCENTS.length; i++) {
    const n = count.get(i) || 0;
    if (n < low) { low = n; best = i; }
  }
  return best;
}
const nextAccent = () => freeAccent(new Set(DB.programs.map((p) => p.accent ?? 0)));

/* Les programmes venus de l'ancienne app se partageaient six
   couleurs en boucle : deux pouvaient tomber sur la même. Une
   redistribution, UNE SEULE FOIS — la relancer à chaque démarrage
   défferait un choix de couleur volontairement en double. */
function normalizeAccents() {
  if (localStorage.getItem(K.accentFix)) return;
  try { localStorage.setItem(K.accentFix, "1"); } catch (_) {}
  const seen = new Set();
  let changed = false;
  DB.programs.forEach((p) => {
    let a = p.accent ?? 0;
    if (!Number.isInteger(a) || a < 0 || a >= ACCENTS.length || seen.has(a)) {
      a = freeAccent(seen);
      p.accent = a;
      changed = true;
    }
    seen.add(a);
  });
  if (changed) persist.programs();
}

/* L'ancienne app n'avait pas de supersets : l'import posait `group:
   0` partout, ce qui transformait un programme entier en un seul
   superset géant. On renumérote — UNE SEULE FOIS, et seulement au-
   delà de 2 exercices, pour ne pas casser un vrai superset. */
function normalizeGroups() {
  if (localStorage.getItem(K.groupFix)) return;
  try { localStorage.setItem(K.groupFix, "1"); } catch (_) {}
  let changed = false;
  DB.programs.forEach((p) => {
    const ex = p.exercises || [];
    if (ex.length < 3) return;
    if (!ex.every((e) => e.group === ex[0].group)) return;
    ex.forEach((e, i) => { e.group = i; });
    changed = true;
  });
  if (changed) persist.programs();
}

/* La couleur d'une entrée d'historique vient de son programme.
   Une entrée manuelle, ou dont le programme a été supprimé, garde
   un filet neutre : l'alignement des lignes ne bouge pas. */
function logStripe(log) {
  const p = log.programId ? DB.programs.find((x) => x.id === log.programId) : null;
  return p ? stripeOf(p) : "var(--line)";
}

/* ── Toast ────────────────────────────────────────────────── */
let toastTimer = 0;
const toastS = new Spring(0, { response: 0.4, damping: 0.82, restDelta: 0.004, onUpdate: (v) => {
  const t = $("toast");
  t.style.transform = `translate3d(-50%,${(1 - v) * 22}px,0) scale(${0.96 + 0.04 * v})`;
  t.style.opacity = String(v);
}, onRest: () => { if (toastS.t === 0) $("toast").hidden = true; } });

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  toastS.to(1, { damping: 0.8, response: 0.4 });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastS.to(0, { damping: 1, response: 0.32 }), 2400);
}

/* ── Feuille modale générique ─────────────────────────────── */
let sheetH2 = 1, closingSheet2 = false, onSheetClose = null;
const sheetY2 = new Spring(0, { response: 0.42, damping: 0.85, restDelta: 0.4, onUpdate: (y) => {
  const sh = $("sheet");
  const p = Math.max(0, Math.min(1, 1 - y / sheetH2));
  sh.style.transform = `translate3d(0,${y}px,0) scale(${0.97 + 0.03 * p})`;
  $("scrim").style.opacity = String(p);
  const b = 8 + 24 * p;
  sh.style.backdropFilter = `blur(${b}px) saturate(180%)`;
  sh.style.webkitBackdropFilter = `blur(${b}px) saturate(180%)`;
}, onRest: () => {
  if (closingSheet2) {
    $("sheet").hidden = true; $("scrim").hidden = true; closingSheet2 = false;
    $("sheet-body").innerHTML = "";
    if (onSheetClose) { const f = onSheetClose; onSheetClose = null; f(); }
  }
} });

/* La hauteur sert à trois choses : la position fermée, l'échelle et
   l'opacité du voile, et le seuil du glissé. Elle se relit dès que
   le contenu change de taille. */
function measureSheet() {
  sheetH2 = $("sheet").offsetHeight || 1;
  return sheetH2;
}

function openSheet(html, opts = {}) {
  const sh = $("sheet");
  $("sheet-body").innerHTML = html;

  /* Repoussée hors écran AVANT d'être affichée, et en pourcentage :
     sa hauteur n'est pas encore connue. Sans ça elle apparaissait
     une image à la position laissée par la feuille précédente — une
     feuille plus haute que la précédente montrait son haut avant de
     redescendre. C'est le sursaut qu'on voyait en changeant
     d'exercice. */
  sh.style.transform = "translate3d(0,100%,0) scale(.97)";
  $("scrim").style.opacity = "0";

  sh.hidden = false; $("scrim").hidden = false; closingSheet2 = false;
  onSheetClose = opts.onClose || null;

  requestAnimationFrame(() => {
    sheetY2.hold(measureSheet());
    sheetY2.to(0, { velocity: 0, damping: 0.82, response: 0.46 });
    if (opts.focus) { const f = $("sheet-body").querySelector(opts.focus); if (f) f.focus(); }
  });
}
function closeSheet(velocity = 0) {
  closingSheet2 = true;
  sheetY2.to(sheetH2, { velocity, damping: 1, response: 0.34 });
}

function initSheetGestures() {
  const sh = $("sheet"), scroller = sh.querySelector(".sheet-scroll");
  let sd = null;
  sh.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, input, textarea, label")) return;
    sd = { id: e.pointerId, y0: e.clientY, from: sheetY2.x, armed: false, tr: tracker() };
    sd.tr.add(e.clientY, e.timeStamp);
  });
  sh.addEventListener("pointermove", (e) => {
    if (!sd || e.pointerId !== sd.id) return;
    const dy = e.clientY - sd.y0;
    if (!sd.armed) {
      if (Math.abs(dy) < 10) return;
      if (dy < 0 || scroller.scrollTop > 0) { sd = null; return; }
      sd.armed = true; capture(sh, e.pointerId);
    }
    sd.tr.add(e.clientY, e.timeStamp);
    let y = sd.from + dy;
    if (y < 0) y = -rubberband(-y, sheetH2);
    sheetY2.hold(y);
  });
  const rel = (e) => {
    if (!sd || e.pointerId !== sd.id) return;
    const armed = sd.armed, v = sd.tr.velocity();
    sd = null;
    if (!armed) return;
    if (sheetY2.x + project(v) > sheetH2 * 0.4) closeSheet(v);
    else sheetY2.to(0, { velocity: v, damping: 0.8, response: 0.42 });
  };
  sh.addEventListener("pointerup", rel);
  sh.addEventListener("pointercancel", rel);
  $("scrim").addEventListener("click", () => closeSheet());
}

/* ── Vue poussée : entre par la droite, sort par la droite ── */
let pushedOpen = false, pushW = 1, onPop = null, popGuard = null;
const pushX = new Spring(1, { response: 0.42, damping: 1, restDelta: 0.002, onUpdate: (v) => {
  const p = $("pushed"), pages = $("pages");
  p.style.transform = `translate3d(${v * 100}%,0,0)`;
  /* La page dessous recule légèrement : la hiérarchie se voit. */
  const back = 1 - v;
  pages.style.transform = `translate3d(${-back * 22}%,0,0) scale(${1 - back * 0.04})`;
  pages.style.opacity = String(1 - back * 0.4);
}, onRest: () => {
  if (pushX.t === 1) {
    $("pushed").hidden = true; pushedOpen = false;
    $("pushed").innerHTML = "";
    $("pages").style.transform = ""; $("pages").style.opacity = "";
    if (onPop) { const f = onPop; onPop = null; f(); }
  }
} });

function pushView(html, opts = {}) {
  $("pushed").innerHTML = html;
  $("pushed").hidden = false;
  pushedOpen = true;
  onPop = opts.onPop || null;
  /* `guard()` → true = des changements non enregistrés : on ne
     quitte pas, c'est lui qui demande quoi faire. */
  popGuard = opts.guard || null;
  pushW = $("app").clientWidth || 1;
  pushX.hold(1);
  pushX.to(0, { damping: 1, response: 0.44 });
  const back = $("pushed").querySelector("[data-back]");
  if (back) back.addEventListener("click", () => popView());
}
function popView(velocity = 0, force = false) {
  if (!pushedOpen) return;
  if (!force && popGuard && popGuard()) {
    pushX.to(0, { velocity, damping: 1, response: 0.4 });
    return;
  }
  popGuard = null;
  pushX.to(1, { velocity, damping: 1, response: 0.36 });
}

/* Retour au geste depuis le bord gauche — 1:1, décidé à la vitesse. */
function initEdgeBack() {
  const p = $("pushed");
  let g = null;
  p.addEventListener("pointerdown", (e) => {
    if (!pushedOpen) return;
    const r = p.getBoundingClientRect();
    if (e.clientX - r.left > 28) return;          // bande de bord seulement
    pushW = r.width || 1;
    g = { id: e.pointerId, x0: e.clientX, from: pushX.x, armed: false, tr: tracker() };
    g.tr.add(e.clientX, e.timeStamp);
  });
  p.addEventListener("pointermove", (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0;
    if (!g.armed) { if (dx < 10) return; g.armed = true; capture(p, e.pointerId); }
    g.tr.add(e.clientX, e.timeStamp);
    let v = g.from + dx / pushW;
    if (v < 0) v = -rubberband(-v * pushW, pushW) / pushW;
    pushX.hold(Math.min(1, v));
  });
  const rel = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const armed = g.armed, vx = g.tr.velocity() / pushW;
    g = null;
    if (!armed) return;
    const projected = pushX.x + project(vx);
    if (projected > 0.4) popView(vx);
    else pushX.to(0, { velocity: vx, damping: 1, response: 0.4 });
  };
  p.addEventListener("pointerup", rel);
  p.addEventListener("pointercancel", rel);
}

/* ── Sélecteur d'exercice (recherche + création) ──────────── */
/* `create: false` quand on ne fait que choisir parmi l'existant
   (Progrès) : y créer un exercice n'aurait aucun sens.
   `kind` ("cardio" ou "force") ne montre que les exercices de ce
   type : en ajoutant un cardio, un squat dans la liste ne sert à
   rien. Sans `kind`, tout est proposé. */
function pickExercise(current, onPick, { create = true, kind = null } = {}) {
  const every = allExercises();
  const names = kind ? every.filter((n) => (kind === "cardio") === isCardio(n)) : every;
  const other = kind === "cardio" ? "musculation" : "cardio";
  openSheet(
    `<h2 class="sheet-h">${kind === "cardio" ? "Exercice cardio" : kind === "force" ? "Exercice de musculation" : "Exercice"}</h2>
     <input type="search" class="input search" id="ex-search" placeholder="${create ? "Chercher ou créer…" : "Chercher…"}" autocomplete="off">
     <div class="pick-list" id="ex-pick-list"></div>`
  );
  /* Pas d'autofocus : le clavier iOS montait pendant que la feuille
     arrivait, deux mouvements en même temps, et il recouvrait la
     liste — qui est justement ce qu'on vient voir. */
  const list = $("ex-pick-list"), search = $("ex-search");
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const hits = names.filter((n) => n.toLowerCase().includes(q));
    list.innerHTML =
      hits.map((n) => `<button type="button" class="pick-row${n === current ? " on" : ""}" data-name="${esc(n)}">
          <span>${esc(n)}</span>${n === current ? '<svg viewBox="0 0 24 24" class="tick"><path d="m5 12.5 4.5 4.5L19 7"/></svg>' : ""}
        </button>`).join("") +
      /* Un nom qui existe déjà de l'AUTRE type n'est pas recréé :
         deux exercices du même nom se mélangeraient partout. */
      (create && search.value.trim() && !every.some((n) => n.toLowerCase() === q)
        ? `<button type="button" class="pick-row create" data-name="${esc(search.value.trim())}">
             <span>Créer « ${esc(search.value.trim())} »</span>
             <svg viewBox="0 0 24 24" class="tick"><path d="M12 5v14M5 12h14"/></svg></button>`
        : "") +
      (kind && search.value.trim() && !names.some((n) => n.toLowerCase() === q) && every.some((n) => n.toLowerCase() === q)
        ? `<p class="muted pad">« ${esc(search.value.trim())} » existe déjà comme exercice de ${other}.</p>` : "") +
      (!hits.length && !search.value.trim() ? `<p class="muted pad">${kind === "cardio" ? "Aucun exercice cardio" : kind === "force" ? "Aucun exercice de musculation" : "Aucun exercice"} pour l'instant.${create ? " Tape un nom pour en créer un." : ""}</p>` : "") +
      (!create && !hits.length && search.value.trim() ? `<p class="muted pad">Aucun exercice ne correspond.</p>` : "");
  };
  draw();
  search.addEventListener("input", () => { draw(); measureSheet(); });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-name]");
    if (!b) return;
    buzz(8);
    closeSheet();
    onSheetClose = () => onPick(b.dataset.name);
  });
}

/* ══════════════════════════════════════════════════════════
   ONGLET 1 — PROGRAMMES
   ══════════════════════════════════════════════════════════ */
/* ── Bilan de la semaine ───────────────────────────────────
   Lundi → aujourd'hui, comparé à la semaine d'avant ENTIÈRE. Le
   delta dit « où j'en suis par rapport à la dernière fois », pas
   un jugement : il reste en encre neutre, jamais en rouge. */
const statDelta = (x, y, f = (v) => Math.round(v).toLocaleString("fr-CA")) => {
  const d = x - y;
  if (!y && !x) return "";
  if (!d) return "=";
  return `${d > 0 ? "+" : "−"}${f(Math.abs(d))}`;
};
const statTile = (val, key, d) =>
  `<div class="stat"><span class="stat-val tnum">${val}</span><span class="stat-key">${key}</span>${d ? `<span class="stat-delta tnum">${d}</span>` : ""}</div>`;
const volumeText = (v) => (v >= 10000 ? `${fmt(v / 1000)}k` : Math.round(v).toLocaleString("fr-CA"));

function renderWeek() {
  const host = $("week-card");
  if (!DB.logs.length) { host.innerHTML = ""; return; }
  const a = weekStats(0), b = weekStats(-1);
  host.innerHTML =
    `<section class="card-surface week-card" aria-label="Bilan de la semaine">
       <header class="week-head"><h3>Cette semaine</h3><span class="week-range">${esc(weekRange())}</span></header>
       <div class="stat-row">
         ${statTile(a.sessions, `Séance${a.sessions > 1 ? "s" : ""}`, statDelta(a.sessions, b.sessions))}
         ${statTile(volumeText(a.volume), "Volume (lb)", statDelta(a.volume, b.volume, volumeText))}
         ${statTile(fmt(a.cardio), "Cardio (min)", statDelta(a.cardio, b.cardio))}
       </div>
       <p class="week-foot">Petit chiffre : écart avec la semaine passée.</p>
     </section>`;
}
function weekRange() {
  const m = mondayOf(), s = new Date(m); s.setDate(s.getDate() + 6);
  const f = (d) => `${d.getDate()} ${MOIS_L[d.getMonth()]}`;
  return m.getMonth() === s.getMonth() ? `${m.getDate()} – ${f(s)}` : `${f(m)} – ${f(s)}`;
}

/* ── Rappel de sauvegarde ─────────────────────────────────── */
function renderBackup() {
  const host = $("backup-card"), due = backupDue();
  if (!due) { host.innerHTML = ""; return; }
  host.innerHTML =
    `<section class="card-surface backup-card" role="status">
       <p class="backup-k">Sauvegarde</p>
       <p class="backup-t">${due.never
         ? "Tu n'as jamais exporté tes données. Elles vivent seulement dans ce téléphone."
         : `Ta dernière sauvegarde date de <b>${due.days} jours</b>.`}</p>
       <div class="backup-act">
         <button type="button" class="nudge-yes" id="backup-now">Exporter maintenant</button>
         <button type="button" class="nudge-no" id="backup-later">Plus tard</button>
       </div>
     </section>`;
  $("backup-now").addEventListener("click", () => {
    exportJSON();
    buzz(9);
    toast("Fichier exporté — garde-le dans Fichiers ou iCloud");
    renderBackup(); renderSettings();
  });
  $("backup-later").addEventListener("click", () => {
    try { localStorage.setItem(K.backupSnooze, String(Date.now() + 7 * 86400000)); } catch (_) {}
    buzz(6);
    renderBackup();
  });
}

/* ── Objectifs ──────────────────────────────────────────────
   Une barre par objectif, une seule couleur (l'accent) : la barre
   dit « où j'en suis », le texte dit les chiffres. Les objectifs
   en cours d'abord, les atteints ensuite (les 3 plus récents). */
const daysLeft = (dateStr) => Math.ceil((new Date(dateStr + "T23:59:59") - Date.now()) / 86400000);
/* « Ordre » : les objectifs en cours se glissent par leur poignée,
   le plus important en haut. L'ordre vit dans DB.goals lui-même. */
let goalsReorder = false;

function renderGoals() {
  const host = $("goals-card");
  if (!DB.logs.length && !DB.goals.length) { host.innerHTML = ""; return; }
  const active = DB.goals.filter((g) => !g.doneAt);
  const done = DB.goals.filter((g) => g.doneAt).sort((a, b) => b.doneAt - a.doneAt).slice(0, 3);
  const row = (g) => {
    const { cur, p } = goalProgress(g), u = GOAL_UNIT[g.metric];
    const at = goalWeightText(g);
    let sub;
    if (g.doneAt) {
      const d = new Date(g.doneAt);
      sub = [at, `Atteint le ${d.getDate()} ${MOIS_L[d.getMonth()]}`].filter(Boolean).join(" · ");
    } else {
      const left = Math.abs(g.target - cur);
      const dir = g.metric === "bodyweight" ? (goalDown(g) ? " à perdre" : " à prendre") : "";
      const dl = g.deadline ? daysLeft(g.deadline) : null;
      sub = [at, `reste ${goalAmount(g.metric, left)}${dir}`,
        dl == null ? null : dl > 1 ? `${dl} jours` : dl === 1 ? "dernier jour" : "échéance passée"].filter(Boolean).join(" · ");
    }
    const inner = `<span class="goal-top"><b>${esc(g.exercise)}</b>
          <span class="tnum">${g.doneAt ? `${CHECK_PATH}` : ""}${fmt(g.doneAt ? g.target : cur)} / ${fmt(g.target)} ${u}</span></span>
        <span class="goal-track"><span class="goal-fill" style="width:${Math.round(p * 100)}%"></span></span>
        <span class="goal-sub">${sub}</span>`;
    if (goalsReorder) return `<div class="goal-r" data-id="${esc(g.id)}"><div class="goal">${inner}</div>
        <span class="drag-handle" role="button" tabindex="0" aria-label="Déplacer ${esc(g.exercise)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg></span></div>`;
    return `<button type="button" class="goal${g.doneAt ? " done" : ""}" data-goal="${esc(g.id)}"
        aria-label="${esc(g.exercise)} : ${fmt(cur)} sur ${fmt(g.target)} ${u}${at ? ` ${at}` : ""}">${inner}</button>`;
  };
  if (active.length < 2) goalsReorder = false;
  host.innerHTML =
    `<section class="card-surface goals-card" aria-label="Objectifs">
       <header class="week-head"><h3>Objectifs</h3>
         <span class="goal-btns">
           ${active.length > 1 ? `<button type="button" class="mini-btn${goalsReorder ? " on" : ""}" id="goal-order">${goalsReorder ? "OK" : `
             <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16m0 0-3-3m3 3 3-3M16 20V4m0 0-3 3m3-3 3 3"/></svg>Ordre`}</button>` : ""}
           ${goalsReorder ? "" : `<button type="button" class="mini-btn" id="goal-add">
             <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Ajouter</button>`}</span></header>
       ${goalsReorder ? `<p class="goal-hint">Glisse la poignée : le plus important en haut.</p>` : ""}
       ${active.length || done.length
         ? `<div class="goal-list${goalsReorder ? " ordering" : ""}">${active.map(row).join("")}${goalsReorder ? "" : done.map(row).join("")}</div>`
         : `<p class="goal-empty">Un poids ou un nombre de reps sur un exercice, une distance en cardio, ou ton poids corporel — avec une date si tu veux.</p>`}
     </section>`;
  if ($("goal-add")) $("goal-add").addEventListener("click", () => goalSheet());
  if ($("goal-order")) $("goal-order").addEventListener("click", () => {
    goalsReorder = !goalsReorder;
    buzz(goalsReorder ? 8 : 6);
    renderGoals();
  });
  if (goalsReorder) {
    /* Seuls les objectifs en cours bougent ; les atteints gardent
       leur place derrière. */
    const move = (from, to) => {
      const list = DB.goals.filter((g) => !g.doneAt);
      list.splice(to, 0, list.splice(from, 1)[0]);
      DB.goals = [...list, ...DB.goals.filter((g) => g.doneAt)];
      persist.goals();
      renderGoals();
    };
    const list = host.querySelector(".goal-list");
    dragToReorder(list, { rowSelector: ".goal-r", gap: 6, onCommit: move });
    list.querySelectorAll(".drag-handle").forEach((h, i) => h.addEventListener("keydown", (ev) => {
      const d = ev.key === "ArrowUp" ? -1 : ev.key === "ArrowDown" ? 1 : 0;
      if (!d || i + d < 0 || i + d >= active.length) return;
      ev.preventDefault();
      buzz(8);
      move(i, i + d);
      host.querySelectorAll(".goal-list .drag-handle")[i + d].focus();
    }));
  }
  host.querySelectorAll("[data-goal]").forEach((b) => b.addEventListener("click", () => {
    const g = DB.goals.find((x) => x.id === b.dataset.goal);
    if (g) goalSheet({ ...g });
  }));
}

/* Créer ou modifier un objectif. `g` voyage en paramètre à travers
   le sélecteur d'exercice (même raison que addExerciseSheet). */
function goalSheet(g = null) {
  const isNew = !g || !DB.goals.some((x) => x.id === g.id);
  g = g || { id: uid(), exercise: "", metric: "weight", target: null, weight: null, deadline: null };
  const cardio = g.exercise && isCardio(g.exercise);
  const isBody = () => g.metric === "bodyweight";
  if (g.exercise && !cardio && g.metric !== "reps" && !isBody()) g.metric = "weight";
  if (cardio && (g.metric === "weight" || g.metric === "reps")) g.metric = "distance";
  const level = () => g.exercise ? goalLevel(g.exercise, g.metric, g.weight) : null;
  const metrics = cardio ? [["distance", "Distance"], ["minutes", "Durée"]] : [["weight", "Poids"], ["reps", "Reps"]];
  const STEP = { weight: 20, reps: 2, distance: 1, minutes: 10 };
  const SOURCE = { weight: "ton record", reps: "ta meilleure série", bodyweight: "ta dernière pesée" };
  const title = () => g.exercise ? esc(g.exercise) : "Choisis un exercice";
  /* Pour revenir à l'exercice choisi après un détour par Poids corporel. */
  let backEx = "", backMetric = "weight";

  /* « Actuellement » suit le poids tapé : 12 reps à 135 lb ne dit
     rien de ce qu'on fait à 185. */
  const curHtml = () => {
    const cur = level(), at = goalWeightText(g);
    return `Actuellement : <b>${cur ? goalAmount(g.metric, cur) : "rien encore"}${at ? ` ${at}` : ""}</b> (${SOURCE[g.metric] || "ta meilleure séance"})`;
  };
  const dateField = `<div class="field"><label for="goal-date">Pour le (facultatif)</label>
         <input class="input" id="goal-date" type="date" min="${today()}" value="${esc(g.deadline || "")}"></div>`;
  const hint = () => { const cur = level(); return cur && STEP[g.metric] ? fmt(cur + STEP[g.metric]) : ""; };

  /* Ce qui dépend de la mesure : changer de mesure ne repaint que
     ça, la feuille reste ouverte et le reste ne bouge pas. */
  const paintFields = () => {
    $("goal-title").innerHTML = title();
    $("goal-ex-part").hidden = isBody();
    /* Première pesée : sans elle, impossible de savoir si on vise à
       perdre ou à prendre. Elle est demandée ici plutôt que d'envoyer
       ailleurs. */
    const noWeighIn = isBody() && !currentBodyweight();
    const target = `<div class="field"><label for="goal-target">Objectif (${GOAL_UNIT[g.metric]})</label>
           <input class="input" id="goal-target" type="number" inputmode="decimal" step="any" min="0" value="${g.target ?? ""}"
                  placeholder="${hint()}"></div>`;
    const second = g.metric === "reps"
      ? `<div class="field"><label for="goal-weight">À quel poids (lb)</label>
           <input class="input" id="goal-weight" type="number" inputmode="decimal" step="any" min="0" value="${g.weight ?? ""}"
                  placeholder="Tout poids"></div>`
      : noWeighIn
        ? `<div class="field"><label for="goal-now">Poids actuel (lb)</label>
             <input class="input" id="goal-now" type="number" inputmode="decimal" step="any" min="0"></div>`
        : dateField;
    $("goal-fields").innerHTML =
      `${g.exercise && !noWeighIn ? `<p class="muted" id="goal-cur">${curHtml()}</p>` : ""}
       ${noWeighIn ? `<p class="muted">Aucune pesée pour l'instant : entre ton poids d'aujourd'hui, il comptera comme une pesée.</p>` : ""}
       <div class="row2">${target}${second}</div>
       ${g.metric === "reps" || noWeighIn ? dateField : ""}
       ${g.metric === "reps" ? `<p class="fineprint goal-rule">Compte quand une seule série atteint ces reps, à ce poids ou plus.</p>` : ""}`;
    if (g.metric === "reps") $("goal-weight").addEventListener("input", () => {
      const w = Number($("goal-weight").value.replace(",", "."));
      g.weight = w > 0 ? w : null;
      if ($("goal-cur")) $("goal-cur").innerHTML = curHtml();
      $("goal-target").placeholder = hint();
    });
  };

  openSheet(
    `<p class="sheet-kicker">${isNew ? "Nouvel objectif" : "Objectif"}</p>
     <h2 class="sheet-h" id="goal-title"></h2>
     ${isNew ? `<div class="segmented" id="goal-kind">
         <button type="button" data-k="ex" class="${isBody() ? "" : "on"}">Exercice</button>
         <button type="button" data-k="body" class="${isBody() ? "on" : ""}">Poids corporel</button></div>` : ""}
     <div id="goal-ex-part">
       <button type="button" class="picker-pill wide${g.exercise && !isBody() ? " filled" : ""}" id="goal-pick">
         <span>${g.exercise && !isBody() ? esc(g.exercise) : "Choisir un exercice"}</span>
         <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>
       <div class="segmented" id="goal-metric">
         ${metrics.map(([m, label]) => `<button type="button" data-m="${m}" class="${g.metric === m ? "on" : ""}">${label}</button>`).join("")}</div>
     </div>
     <div id="goal-fields"></div>
     <button class="primary" id="goal-save"><span class="primary-label">${isNew ? "Fixer l'objectif" : "Enregistrer"}</span></button>
     ${isNew ? "" : `<button class="ghost-btn danger-btn" id="goal-del">Supprimer l'objectif</button>`}`
  );
  paintFields();

  const grab = () => {
    const t = Number($("goal-target").value.replace(",", "."));
    g.target = t > 0 ? (g.metric === "reps" ? Math.round(t) : t) : null;
    g.deadline = $("goal-date").value || null;
  };
  $("goal-pick").addEventListener("click", () => {
    grab();
    closeSheet();
    onSheetClose = () => pickExercise(g.exercise, (name) => { g.exercise = name; g.target = null; g.weight = null; goalSheet(g); }, { create: false });
  });
  $("goal-metric").addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]");
    if (!b || b.dataset.m === g.metric) return;
    grab(); g.metric = b.dataset.m; g.target = null;
    $("goal-metric").querySelectorAll("[data-m]").forEach((x) => x.classList.toggle("on", x === b));
    buzz(6);
    paintFields();
  });
  if (isNew) $("goal-kind").addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]");
    if (!b || (b.dataset.k === "body") === isBody()) return;
    grab();
    if (b.dataset.k === "body") {
      backEx = g.exercise; backMetric = g.metric;
      g.exercise = BODY_GOAL; g.metric = "bodyweight";
    } else {
      g.exercise = backEx; g.metric = backMetric;
    }
    g.target = null;
    $("goal-kind").querySelectorAll("[data-k]").forEach((x) => x.classList.toggle("on", x === b));
    buzz(6);
    paintFields();
  });
  $("goal-save").addEventListener("click", () => {
    grab();
    const u = GOAL_UNIT[g.metric];
    if (g.metric !== "reps") g.weight = null;
    const nowInput = $("goal-now");
    const now = nowInput ? Number(nowInput.value.replace(",", ".")) : 0;
    const cur = now > 0 ? now : level();
    if (!g.exercise) { toast("Choisis d'abord un exercice"); return; }
    if (nowInput && !(now > 0)) { toast("Entre ton poids actuel"); return; }
    if (!g.target) { toast(`Entre un objectif en ${u}`); return; }
    if (isNew && isBody() && g.target === cur) { toast(`Tu es déjà à ${fmt(cur)} lb`); return; }
    if (isNew && !isBody() && cur && g.target <= cur) {
      toast(`Tu es déjà à ${[goalAmount(g.metric, cur), goalWeightText(g)].filter(Boolean).join(" ")} — vise plus haut`);
      return;
    }
    if (now > 0) {
      DB.bodyweight.push({ id: uid(), weight: now, date: today(), createdAt: Date.now() });
      persist.bodyweight();
    }
    const i = DB.goals.findIndex((x) => x.id === g.id);
    if (i >= 0) {
      /* Autre mesure ou autre poids : la barre repart du niveau de
         cette mesure-là, pas de l'ancienne. Pareil si un objectif de
         poids corporel change de sens (perdre ↔ prendre). */
      const old = DB.goals[i];
      const flipped = isBody() && (g.target - g.start) * (old.target - old.start) <= 0;
      if (old.metric !== g.metric || (old.weight || 0) !== (g.weight || 0) || flipped) g.start = cur || 0;
      /* Un objectif relevé au-dessus du niveau actuel redevient en cours. */
      if (g.doneAt && !goalReached(g, cur)) g.doneAt = null;
      DB.goals[i] = g;
    } else {
      DB.goals.push({ ...g, start: cur || 0, createdAt: Date.now(), doneAt: null });
    }
    persist.goals();
    closeSheet();
    onSheetClose = () => { renderGoals(); buzz(9); toast(isNew ? "Objectif fixé — let's go" : "Objectif mis à jour"); };
  });
  if (!isNew) $("goal-del").addEventListener("click", () => {
    DB.goals = DB.goals.filter((x) => x.id !== g.id);
    persist.goals();
    closeSheet();
    onSheetClose = () => { renderGoals(); toast("Objectif supprimé"); };
  });
}

/* ── Récap du mois ───────────────────────────────────────────
   Une ligne compacte sur Programmes ; le détail dans une feuille,
   où les flèches changent de mois sans la refermer. */
const moisDe = (m) => `${/^[ao]/.test(MOIS_L[m]) ? "d'" : "de "}${MOIS_L[m]}`;

function renderMonth() {
  const host = $("month-card");
  if (!DB.logs.length) { host.innerHTML = ""; return; }
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const s = monthStats(y, m);
  const bits = [s.records.length ? `${s.records.length} record${s.records.length > 1 ? "s" : ""}` : null,
    s.goals.length ? `${s.goals.length} objectif${s.goals.length > 1 ? "s" : ""}` : null,
    s.sets ? `${s.sets} série${s.sets > 1 ? "s" : ""}` : null].filter(Boolean);
  host.innerHTML =
    `<button type="button" class="card-surface badges-row month-row" id="month-open">
       <span class="badges-count"><b class="tnum">${s.sessions}</b><i>séance${s.sessions > 1 ? "s" : ""}</i></span>
       <span class="badges-txt"><b>Récap ${esc(moisDe(m))}</b>
         <em>${bits.length ? esc(bits.join(" · ")) : "Rien encore ce mois-ci"}</em></span>
       <svg viewBox="0 0 24 24" class="chev" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
     </button>`;
  $("month-open").addEventListener("click", () => monthSheet(y, m));
}

function monthSheet(year, month) {
  /* Pas plus loin en arrière que la première entrée. */
  const firstDate = DB.logs.reduce((d, l) => (!d || l.date < d ? l.date : d), null) || today();
  const minKey = Number(firstDate.slice(0, 4)) * 12 + Number(firstDate.slice(5, 7)) - 1;
  const now = new Date(), maxKey = now.getFullYear() * 12 + now.getMonth();
  let key = year * 12 + month;

  openSheet(
    `<p class="sheet-kicker">Récap du mois</p>
     <header class="cal-nav month-nav">
       <button type="button" class="icon-btn" id="month-prev" aria-label="Mois précédent"><svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg></button>
       <div class="cal-month"><span class="cal-title" id="month-title" aria-live="polite"></span></div>
       <button type="button" class="icon-btn" id="month-next" aria-label="Mois suivant"><svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg></button>
     </header>
     <div id="month-body"></div>`
  );

  const paint = () => {
    const y = Math.floor(key / 12), m = key % 12;
    const s = monthStats(y, m), p = monthStats(Math.floor((key - 1) / 12), (key - 1) % 12);
    $("month-title").textContent = `${MOIS_L[m]} ${y}`;
    $("month-prev").disabled = key <= minKey;
    $("month-next").disabled = key >= maxKey;
    const rows = (items) => `<ul class="month-list">${items.join("")}</ul>`;
    $("month-body").innerHTML =
      `<div class="stat-row month-stats">
         ${statTile(s.sessions, `Séance${s.sessions > 1 ? "s" : ""}`, statDelta(s.sessions, p.sessions))}
         ${statTile(volumeText(s.volume), "Volume (lb)", statDelta(s.volume, p.volume, volumeText))}
         ${statTile(fmt(s.cardio), "Cardio (min)", statDelta(s.cardio, p.cardio))}
       </div>
       <p class="week-foot">Petit chiffre : écart avec le mois d'avant.</p>
       ${s.records.length ? `<p class="block-key">Records battus</p>${rows(s.records.map((r) =>
         `<li><span>${esc(r.name)}</span><span class="tnum"><i>${fmt(r.prev)} →</i> <b>${fmt(r.weight)} lb</b></span></li>`))}` : ""}
       ${s.goals.length ? `<p class="block-key">Objectifs atteints</p>${rows(s.goals.map((g) =>
         `<li><span>${esc(g.exercise)}</span><span class="tnum"><b>${esc(goalLabel(g))}</b></span></li>`))}` : ""}
       ${s.muscles.length ? `<p class="block-key">Séries par muscle</p>${rows(s.muscles.map(([name, n]) =>
         `<li><span>${esc(name)}</span><span class="tnum"><b>${n}</b></span></li>`))}` : ""}
       ${s.sessions ? "" : `<p class="muted pad">Aucune séance ce mois-là.</p>`}`;
  };
  paint();
  const go = (d) => { key = Math.max(minKey, Math.min(maxKey, key + d)); buzz(6); paint(); };
  $("month-prev").addEventListener("click", () => go(-1));
  $("month-next").addEventListener("click", () => go(1));
}

/* ── Jalons ──────────────────────────────────────────────────
   Une ligne compacte sur Programmes (combien, et le prochain à
   portée) ; toute la collection dans une feuille. */
function renderBadges() {
  const host = $("badges-card");
  if (!DB.logs.length) { host.innerHTML = ""; return; }
  const all = badgeList();
  const got = all.filter((b) => b.earned).length;
  /* Le prochain = le moins loin, en proportion. */
  const next = all.filter((b) => !b.earned).sort((a, b) => b.value / b.n - a.value / a.n)[0];
  host.innerHTML =
    `<button type="button" class="card-surface badges-row" id="badges-open">
       <span class="badges-count"><b class="tnum">${got}</b><i>/ ${all.length}</i></span>
       <span class="badges-txt"><b>Jalons</b>
         <em>${next ? `Prochain : ${esc(next.title)} — ${badgeValue(next)} / ${esc(next.big)}` : "Tout débloqué. Respect."}</em></span>
       <svg viewBox="0 0 24 24" class="chev" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
     </button>`;
  $("badges-open").addEventListener("click", badgesSheet);
}
const badgeValue = (b) => b.stat === "volume"
  ? (b.value >= 1e6 ? `${fmt(b.value / 1e6)}M` : `${fmt(Math.floor(b.value / 100) / 10)}k`)
  : fmt(Math.floor(b.value * 10) / 10);

function badgesSheet() {
  const all = badgeList();
  openSheet(
    `<p class="sheet-kicker">${all.filter((b) => b.earned).length} sur ${all.length} débloqués</p>
     <h2 class="sheet-h">Jalons</h2>
     ${BADGE_GROUPS.map(([stat, label]) => `
       <p class="block-key">${esc(label)}</p>
       <div class="badge-grid">${all.filter((b) => b.stat === stat).map((b) => `
         <div class="bdg${b.earned ? " on" : ""}" aria-label="${esc(b.title)} — ${b.earned ? "débloqué" : `${badgeValue(b)} sur ${b.big}`}">
           <span class="bdg-big tnum">${esc(b.big)}</span>
           <span class="bdg-unit">${esc(b.unit)}</span>
           ${b.earned ? "" : `<span class="bdg-track"><span style="width:${Math.min(100, Math.round((b.value / b.n) * 100))}%"></span></span>`}
         </div>`).join("")}</div>`).join("")}`
  );
}

/* ══ Bloc du coach ══════════════════════════════════════════
   La carte du haut dit où on en est (semaine N sur M), propose les
   objectifs du coach et, à la fin, invite à lui envoyer le bilan.
   Les blocs passés vivent sous « Mes blocs », jamais effacés. */
const MOIS_ABR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const shortDay = (s) => { const d = new Date(s + "T00:00:00"); return `${d.getDate()} ${MOIS_ABR[d.getMonth()]}`; };
const blockDates = (b) => b.start ? `${shortDay(b.start)} – ${shortDay(b.endedAt || blockPlannedEnd(b))}` : "pas encore commencé";
const BLOCK_STATE = { pending: "à commencer", running: "en cours", finished: "terminé", ended: "terminé" };

/* « Bloc 2 · semaine 4 sur 6 » */
function blockTitle(b) {
  const st = blockState(b);
  return st === "running" ? `Bloc ${b.n} · semaine ${blockWeek(b)} sur ${b.weeks}` : `Bloc ${b.n} · ${BLOCK_STATE[st]}`;
}

/* Une case par semaine, une seule couleur : faites, celle-ci, à venir. */
function weekBar(b) {
  const w = b.endedAt ? b.weeks + 1 : blockWeek(b);
  return `<span class="bk-weeks" aria-hidden="true">${Array.from({ length: b.weeks }, (_, k) =>
    `<i class="${k + 1 < w ? "on" : k + 1 === w ? "now" : ""}"></i>`).join("")}</span>`;
}

/* Le plan d'un programme du coach, en une ligne : « 3 × 10 → 4 × 6 sur 6 sem. » */
const planSpan = (weeks) => {
  const a = weeks[0], z = weeks[weeks.length - 1], t = (x) => `${x.sets} × ${esc(x.reps)}`;
  return `${t(a)}${t(a) !== t(z) ? ` → ${t(z)}` : ""} sur ${weeks.length} sem.`;
};

function renderBlock() {
  const host = $("block-card");
  const live = liveBlocks();
  /* Un nouveau bloc qui attend passe devant : c'est lui la prochaine étape. */
  const b = live.find((x) => !x.start) || live[0];
  if (!b) { host.innerHTML = ""; return; }
  const st = blockState(b), cur = runningBlock();
  const proposed = b.goals.filter((g) => !g.status);
  const nextP = st !== "pending" && DB.programs.find((p) => p.id === nextInRotation(b));
  const doneN = st !== "pending" ? blockSummary(b).sessions : 0;
  const lw = st === "running" ? lightWeek(b) : null;
  /* La prochaine période allégée prévue par le coach, pour la voir venir. */
  const soon = (b.light || []).find((r) => r.to >= today() && !(lw && r.from <= today()));

  const body = {
    pending: `<p class="bk-meta">${b.weeks} semaines · ${b.programIds.length} programme${b.programIds.length > 1 ? "s" : ""} en rotation${cur ? ` · remplace le bloc ${cur.n}` : ""}</p>`,
    running: `${weekBar(b)}
      ${nextP ? `<button type="button" class="bk-next" data-prog="${esc(nextP.id)}">
         <span class="row-stripe" style="background:${stripeOf(nextP)}"></span>
         <span><em>Prochaine séance</em><b>${esc(nextP.name)}</b></span>
         <svg viewBox="0 0 24 24" class="chev" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>` : ""}
      <p class="bk-meta">${doneN} séance${doneN > 1 ? "s" : ""} depuis le ${shortDay(b.start)} · fin le ${shortDay(blockPlannedEnd(b))}</p>
      ${lw ? `<div class="bk-light">
         <span><b>Semaine chargée${lw.why ? ` · ${esc(lw.why)}` : ""}</b>
           <em>Fais ce que tu peux : 2 ou 3 séances suffisent, en version courte si tu veux. La rotation reprend où tu étais.</em></span>
         <button type="button" class="nudge-no" id="bk-light-off">Pas cette semaine</button></div>`
       : soon ? `<p class="bk-meta">${esc(soon.why || "Semaines chargées")} : séances courtes proposées du ${shortDay(soon.from)} au ${shortDay(soon.to)}.</p>` : ""}`,
    finished: `${weekBar(b)}
      <p class="bk-meta">Envoie ton bilan au coach pour préparer le bloc ${b.n + 1}. D'ici là, continue celui-ci.</p>`,
  }[st];

  const actions = {
    pending: `<button type="button" class="nudge-yes" id="bk-start">Commencer le bloc</button>
              <button type="button" class="nudge-no" id="bk-see">Voir les programmes</button>`,
    running: `<button type="button" class="nudge-no" id="bk-bilan">Bilan jusqu'ici</button>
              ${lw ? "" : `<button type="button" class="nudge-no" id="bk-light-on">Semaine chargée</button>`}`,
    finished: `<button type="button" class="nudge-yes" id="bk-send">Envoyer au coach</button>
               <button type="button" class="nudge-no" id="bk-bilan">Voir le bilan</button>`,
  }[st];

  host.innerHTML =
    `<section class="card-surface bk-card${st === "finished" ? " done" : ""}" aria-label="Bloc du coach">
       <p class="bk-k">${st === "pending" ? "Nouveau bloc du coach" : esc(blockTitle(b))}</p>
       <h3 class="bk-t">${st === "pending" ? `Bloc ${b.n} · ` : ""}${esc(b.name)}</h3>
       ${b.focus ? `<p class="bk-focus">${esc(b.focus)}</p>` : ""}
       ${body}
       ${proposed.length ? `<div class="bk-goals">
         <p class="bk-sub">Objectifs proposés</p>
         ${proposed.map((g) => `<div class="bk-goal">
            <span class="bk-goal-t"><b>${esc(g.exercise)} · ${esc(goalLabel(g))}</b>${g.why ? `<em>${esc(g.why)}</em>` : ""}</span>
            <span class="bk-goal-act">
              <button type="button" class="nudge-yes" data-acc="${esc(g.id)}">Accepter</button>
              <button type="button" class="nudge-no" data-dis="${esc(g.id)}">Non merci</button></span>
          </div>`).join("")}</div>` : ""}
       <div class="backup-act">${actions}</div>
     </section>`;

  const on = (id, f) => { if ($(id)) $(id).addEventListener("click", f); };
  on("bk-start", () => askStartBlock(b));
  on("bk-see", () => blocksPage());
  on("bk-bilan", () => blockSheet(b));
  on("bk-send", () => coachSend(b));
  on("bk-light-on", () => { setLightWeek(b, true); buzz(9); toast("Séances courtes proposées cette semaine"); renderPrograms(); });
  on("bk-light-off", () => { setLightWeek(b, false); buzz(6); toast("Semaine normale"); renderPrograms(); });
  host.querySelectorAll("[data-prog]").forEach((x) => x.addEventListener("click", () => showProgram(x.dataset.prog)));
  host.querySelectorAll("[data-acc], [data-dis]").forEach((x) => x.addEventListener("click", () => {
    const g = b.goals.find((y) => y.id === (x.dataset.acc || x.dataset.dis));
    if (!g) return;
    if (x.dataset.acc) { acceptCoachGoal(b, g); buzz(9); toast("Objectif ajouté — let's go"); }
    else { g.status = "dismissed"; persist.blocks(); buzz(6); toast("Pas retenu"); }
    renderBlock(); renderGoals();
  }));
}

/* Commencer un bloc range celui d'avant : on le dit avant de le faire. */
function askStartBlock(b) {
  const cur = runningBlock();
  const go = () => {
    startBlock(b);
    renderPrograms();
    buzz([10, 40, 18]);
    toast(`Bloc ${b.n} commencé — semaine 1`);
  };
  if (!cur || cur === b) { go(); return; }
  openSheet(
    `<p class="sheet-kicker">Bloc ${b.n}</p>
     <h2 class="sheet-h">Commencer ${esc(b.name)} ?</h2>
     <p class="muted">Le bloc ${cur.n} (${esc(cur.name)}) sera rangé dans Mes blocs, avec ses programmes et son bilan. Rien n'est effacé.</p>
     <button class="primary sheet-cta" id="bs-yes"><span class="primary-label">Commencer le bloc ${b.n}</span></button>
     <button class="ghost-btn" id="bs-no">Pas tout de suite</button>`
  );
  $("bs-yes").addEventListener("click", () => { closeSheet(); onSheetClose = go; });
  $("bs-no").addEventListener("click", () => closeSheet());
}

async function coachSend(b) {
  const r = await sendToCoach(b);
  if (r === "cancel") return;
  buzz(9);
  toast(r === "shared" ? "Envoyé — dis « /coach » à Claude" : "Fichier enregistré — donne-le à Claude avec « /coach »");
}

/* ── Bilan d'un bloc ─────────────────────────────────────── */
function blockSheet(b) {
  if (!b.start) { blocksPage(); return; }
  const s = blockSummary(b), st = blockState(b);
  const rows = (items) => `<ul class="month-list">${items.join("")}</ul>`;
  const maxS = Math.max(4, ...s.weeks.map((w) => w.sessions));
  const ups = s.progress.filter((x) => x.n >= 2 && x.pct > 0).slice(0, 5);
  const flat = s.progress.filter((x) => x.n >= 3 && x.pct <= 0);
  const goalRow = (g) => {
    const { cur } = goalProgress(g);
    return `<li><span>${esc(g.exercise)}</span><span class="tnum">${g.doneAt ? `<b>${esc(goalLabel(g))}</b> ✓` : `<i>${fmt(cur)} /</i> <b>${esc(goalLabel(g))}</b>`}</span></li>`;
  };
  const low = s.muscles.filter(([, n]) => n < 4);

  openSheet(
    `<p class="sheet-kicker">Bilan · Bloc ${b.n}</p>
     <h2 class="sheet-h">${esc(b.name)}</h2>
     <p class="muted">${esc(blockDates(b))} · ${st === "running" ? `semaine ${blockWeek(b)} sur ${b.weeks}` : `${s.nWeeks} semaines`}</p>
     <div class="stat-row month-stats">
       ${statTile(s.sessions, `Séance${s.sessions > 1 ? "s" : ""}`)}
       ${statTile(s.sets, "Séries")}
       ${statTile(volumeText(s.volume), "Volume (lb)")}
     </div>

     <p class="block-key">Régularité</p>
     <div class="mbars">${s.weeks.map((w) => `
       <div class="mbar static${w.sessions ? "" : " zero"}">
         <span class="mbar-name">Semaine ${w.n}</span>
         <span class="mbar-track"><span class="mbar-fill" style="width:${Math.round((w.sessions / maxS) * 100)}%"></span></span>
         <span class="mbar-val"><b class="tnum">${w.future ? "–" : w.sessions}</b><i>${w.future ? "à venir" : `séance${w.sessions > 1 ? "s" : ""}`}</i></span>
       </div>`).join("")}</div>

     ${s.goals.length ? `<p class="block-key">Objectifs</p>${rows(s.goals.map(goalRow))}` : ""}
     ${s.records.length ? `<p class="block-key">Records battus</p>${rows(s.records.map((r) =>
       `<li><span>${esc(r.name)}</span><span class="tnum"><i>${fmt(r.prev)} →</i> <b>${fmt(r.weight)} lb</b></span></li>`))}` : ""}
     ${ups.length ? `<p class="block-key">Plus gros progrès · 1RM estimé</p>${rows(ups.map((x) =>
       `<li><span>${esc(x.name)}</span><span class="tnum"><i>${x.first} →</i> <b>${x.last} lb</b> <i>+${x.pct} %</i></span></li>`))}` : ""}
     ${flat.length ? `<p class="block-key">Qui stagnent</p>${rows(flat.map((x) =>
       `<li><span>${esc(x.name)}</span><span class="tnum"><b>${x.last} lb</b> <i>${x.n} séances</i></span></li>`))}` : ""}
     <p class="block-key">Séries par muscle · par semaine</p>
     ${rows(s.muscles.map(([m, n]) => `<li><span>${esc(m)}</span><span class="tnum">${n < 4 ? "<i>peu ·</i> " : ""}<b>${fmt(n)}</b></span></li>`))}
     ${b.swaps.length ? `<p class="block-key">Exercices changés</p>${rows(b.swaps.map((x) =>
       `<li><span>${esc(x.from)}</span><span class="tnum">${x.to ? `<i>→</i> <b>${esc(x.to)}</b>` : "<i>retiré</i>"}</span></li>`))}` : ""}
     ${s.neverDone.length && st !== "running" ? `<p class="block-key">Jamais fait pendant le bloc</p>${rows(s.neverDone.map((n) => `<li><span>${esc(n)}</span></li>`))}` : ""}

     <p class="block-key">Programmes du bloc</p>
     <div class="bk-progs">${blockPrograms(b).map((p) => bkProgRow(p)).join("")}</div>

     <button class="primary sheet-cta bk-send" id="bks-send"><span class="primary-label">Envoyer au coach</span></button>
     <p class="fineprint">Un fichier part par la feuille de partage (courriel, OneDrive…). Donne-le à Claude en lui disant « /coach » : il prépare le bloc suivant à partir de ce bilan${low.length ? `, et de tes muscles peu travaillés (${low.map(([m]) => m.toLowerCase()).join(", ")})` : ""}.</p>`
  );
  $("bks-send").addEventListener("click", () => coachSend(b));
  bindBkProgs($("sheet-body"), () => { closeSheet(); });
}

/* Une rangée de programme dans un bloc. */
const bkProgRow = (p) => `<button type="button" class="bk-prog" data-prog="${esc(p.id)}">
    <span class="row-stripe" style="background:${stripeOf(p)}"></span>
    <span class="bk-prog-t"><b>${esc(p.name)}</b><em>${p.exercises.length} exercice${p.exercises.length > 1 ? "s" : ""}${p.exercises.some((e) => e.isNew) ? ` · ${p.exercises.filter((e) => e.isNew).length} nouveau${p.exercises.filter((e) => e.isNew).length > 1 ? "x" : ""}` : ""}</em></span>
    <svg viewBox="0 0 24 24" class="chev" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
  </button>`;
/* Ouvrir un programme depuis une feuille ou Mes blocs : on referme
   d'abord ce qui est ouvert, puis la fiche programme glisse. */
function bindBkProgs(host, close) {
  host.querySelectorAll(".bk-prog").forEach((x) => x.addEventListener("click", () => {
    const id = x.dataset.prog;
    buzz(6);
    close();
    setTimeout(() => showProgram(id), 240);
  }));
}

/* ── Mes blocs ───────────────────────────────────────────── */
function renderBlocksRow() {
  const host = $("blocks-row");
  if (!DB.blocks.length && !DB.logs.length) { host.innerHTML = ""; return; }
  const live = liveBlocks()[0];
  const done = DB.blocks.filter((b) => b.endedAt).length;
  host.innerHTML =
    `<button type="button" class="card-surface badges-row" id="blocks-open">
       <span class="badges-count"><b class="tnum">${DB.blocks.length}</b><i>bloc${DB.blocks.length > 1 ? "s" : ""}</i></span>
       <span class="badges-txt"><b>Mes blocs</b>
         <em>${DB.blocks.length
           ? [live ? `Bloc ${live.n} ${BLOCK_STATE[blockState(live)]}` : null, done ? `${done} terminé${done > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")
           : "Envoie tes données au coach pour recevoir ton premier bloc"}</em></span>
       <svg viewBox="0 0 24 24" class="chev" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
     </button>`;
  $("blocks-open").addEventListener("click", () => blocksPage());
}

function blocksPage() {
  const list = [...DB.blocks].sort((a, b) => b.n - a.n);
  const item = (b) => {
    const st = blockState(b);
    const s = b.start ? blockSummary(b) : null;
    return `<section class="card-surface bk-item${st === "running" ? " live" : ""}">
        <header class="bk-item-head"><span class="bk-k">Bloc ${b.n} · ${BLOCK_STATE[st]}</span><span class="week-range">${esc(blockDates(b))}</span></header>
        <h3 class="bk-t">${esc(b.name)}</h3>
        ${b.focus ? `<p class="bk-focus">${esc(b.focus)}</p>` : ""}
        ${b.start ? weekBar(b) : ""}
        <p class="bk-meta">${b.weeks} semaines${s ? ` · ${s.sessions} séance${s.sessions > 1 ? "s" : ""}` : ""}${s && s.records.length ? ` · ${s.records.length} record${s.records.length > 1 ? "s" : ""}` : ""}${b.swaps.length ? ` · ${b.swaps.length} changement${b.swaps.length > 1 ? "s" : ""}` : ""}</p>
        <div class="bk-progs">${blockPrograms(b).map((p) => bkProgRow(p)).join("")}</div>
        ${b.start
          ? `<button type="button" class="ghost-btn" data-bilan="${esc(b.id)}">${st === "running" ? "Bilan jusqu'ici" : "Voir le bilan"}</button>`
          : `<button type="button" class="primary compact bk-go" data-start="${esc(b.id)}"><span class="primary-label">Commencer le bloc</span></button>`}
      </section>`;
  };

  pushView(
    `<header class="pushed-bar">
       <button class="icon-btn" data-back aria-label="Retour">
         <svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>
       </button>
       <span class="pushed-title">Mes blocs</span>
       <span class="icon-btn ghost-slot"></span>
     </header>
     <div class="pushed-scroll">
       <h1 class="big-title">Mes blocs</h1>
       <p class="big-sub">Chaque bloc de 6 à 8 semaines préparé par ton coach, avec ses programmes et son bilan.</p>
       ${list.length ? list.map(item).join("") : `<div class="empty"><p class="empty-title">Pas encore de bloc</p>
         <p class="empty-body">Envoie tes données au coach : il part des exercices que tu fais déjà, en ajoute quelques-uns, et vise tes objectifs.</p></div>`}
       <div class="card-surface block coach-how">
         <h3>Comment ça marche</h3>
         <ol class="how-list">
           <li>Tu suis le bloc : chaque exercice affiche la cible de la semaine.</li>
           <li>Un exercice ne te plaît pas ? Remplace-le — le plan suit, et le coach s'en souvient.</li>
           <li>À la fin, tu envoies le bilan. Le bloc suivant arrive dans l'app.</li>
         </ol>
         <button type="button" class="ghost-btn" id="coach-all">${list.length ? "Envoyer toutes mes données au coach" : "Envoyer mes données au coach"}</button>
       </div>
     </div>`
  );
  const host = $("pushed");
  bindBkProgs(host, () => popView());
  host.querySelectorAll("[data-bilan]").forEach((x) => x.addEventListener("click", () => blockSheet(blockById(x.dataset.bilan))));
  host.querySelectorAll("[data-start]").forEach((x) => x.addEventListener("click", () => {
    const b = blockById(x.dataset.start);
    popView();
    setTimeout(() => askStartBlock(b), 240);
  }));
  $("coach-all").addEventListener("click", () => coachSend(null));
}

function progCard(p, next) {
  const last = DB.logs.filter((l) => l.programId === p.id).sort((a, b) => b.createdAt - a.createdAt)[0];
  const when = last ? relDay(last.date) : "jamais fait";
  return `<button type="button" class="prog-card" data-id="${esc(p.id)}">
      <span class="prog-stripe" style="background:${stripeOf(p)}"></span>
      <span class="prog-body">
        <span class="prog-name">${esc(p.name)}${next ? `<span class="prog-next">Prochaine</span>` : ""}</span>
        <span class="prog-meta">${p.exercises.length} exercice${p.exercises.length > 1 ? "s" : ""} · ${esc(when)}</span>
      </span>
      <svg viewBox="0 0 24 24" class="chev" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
    </button>`;
}

function renderPrograms() {
  renderWeek();
  renderBackup();
  renderBlock();
  renderBlocksRow();
  renderGoals();
  renderMonth();
  renderBadges();
  const host = $("program-list");
  const n = streakWeeks();
  $("prog-sub").textContent = DB.programs.length
    ? (n > 1 ? `${n} semaines d'entraînement d'affilée.` : "Choisis un programme et lance-toi.")
    : "";

  /* Les blocs encore actifs d'abord, chacun sous son titre ; puis les
     programmes à soi. Ceux d'un bloc terminé vivent dans Mes blocs. */
  const sections = liveBlocks().map((b) => ({
    title: blockTitle(b), progs: blockPrograms(b),
    next: b.start ? nextInRotation(b) : null,
  })).filter((s) => s.progs.length);
  const others = DB.programs.filter((p) => !p.blockId || !blockById(p.blockId));
  if (others.length) sections.push({ title: sections.length ? "Autres programmes" : null, progs: others, next: null });

  if (!sections.length) {
    host.innerHTML =
      `<div class="empty">
         <p class="empty-title">Rien ici pour l'instant</p>
         <p class="empty-body">${DB.programs.length
           ? "Tes programmes sont rangés dans Mes blocs. Crée-en un nouveau, ou attends le prochain bloc du coach."
           : "Crée ton premier programme, ou récupère ceux de ton ancienne app depuis les Réglages."}</p>
       </div>`;
    return;
  }

  host.innerHTML = sections.map((s) =>
    `${s.title ? `<p class="prog-sec">${esc(s.title)}</p>` : ""}${s.progs.map((p) => progCard(p, p.id === s.next)).join("")}`).join("");

  host.querySelectorAll(".prog-card").forEach((b) => {
    b.addEventListener("pointerdown", () => b.classList.add("pressed"));
    ["pointerup", "pointercancel", "pointerleave"].forEach((ev) =>
      b.addEventListener(ev, () => b.classList.remove("pressed")));
    b.addEventListener("click", () => showProgram(b.dataset.id));
  });
}

function relDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - d) / 86400000);
  if (diff <= 0) return "aujourd'hui";
  if (diff === 1) return "hier";
  if (diff < 7) return `il y a ${diff} jours`;
  if (diff < 14) return "la semaine dernière";
  if (diff < 60) return `il y a ${Math.round(diff / 7)} semaines`;
  return `il y a ${Math.round(diff / 30)} mois`;
}

/* Une rangée d'exercice de la fiche programme. Extraite parce que
   les exercices d'un superset la réutilisent telle quelle, à
   l'intérieur de leur encadré. */
function exRow(e, badge, stripe, w = 0, light = false) {
  const sub = exPlanSub(e, w) + (light && e.opt ? " · facultatif cette semaine" : "");
  return `<li class="ex-row${badge.superset ? " ss" : ""}">
      <span class="row-stripe" style="background:${stripe}" aria-hidden="true"></span>
      <span class="ex-num">${badge.superset ? `<b>${badge.text}</b>` : badge.text}</span>
      <span class="ex-main">
        <span class="ex-title">${esc(e.name)}${e.isNew ? `<span class="new-pill">Nouveau</span>` : ""}</span>
        <span class="ex-sub">${sub}</span>
      </span>
      <span class="ex-best">${e.kind !== "cardio" && DB.prs[e.name] ?`${fmt(DB.prs[e.name])}<em>lb</em>` : ""}</span>
    </li>`;
}

/* Texte clair ou foncé sur le dégradé d'un programme : celui qui
   garde le meilleur contraste aux DEUX bouts. Du noir sur le bleu
   foncé ou l'indigo se lisait mal. */
const lum = (hex) => {
  const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
function heroInk(stops) {
  const L = stops.map(lum);
  const light = Math.min(...L.map((l) => contrast(l, 1)));
  const dark = Math.min(...L.map((l) => contrast(l, lum("#06140A"))));
  return light > dark ? "light" : "dark";
}

/* Sous le nom : la taille du programme et la dernière fois. */
function heroMeta(p) {
  const n = p.exercises.length;
  const sets = p.exercises.reduce((a, e) => a + (e.kind === "cardio" ? 0 : (e.sets || 0)), 0);
  const last = DB.logs.filter((l) => l.programId === p.id).sort((a, b) => b.createdAt - a.createdAt)[0];
  return [
    `${n} exercice${n > 1 ? "s" : ""}`,
    sets ? `${sets} séries` : null,
    last ? `fait ${relDay(last.date)}` : "jamais fait",
  ].filter(Boolean).map(esc).join(" · ");
}

/* Semaine chargée : la séance courte est proposée, la complète
   reste à un toucher. Rien n'est imposé. */
function chooseLength(p, w, lw) {
  const full = p.exercises.map((e) => { const x = weekPlan(e, w); return x ? { ...e, sets: x.sets ?? e.sets } : e; });
  const short = shortVersion(full);
  const ex = (n) => `${n} exercice${n > 1 ? "s" : ""}`;
  openSheet(
    `<p class="sheet-kicker">Semaine chargée${lw.why ? ` · ${esc(lw.why)}` : ""}</p>
     <h2 class="sheet-h">Séance courte ou complète ?</h2>
     <p class="muted">La courte garde les gros mouvements, avec une série de moins. La rotation continue pareil.</p>
     <div class="menu-list">
       <button type="button" class="pick-row" id="len-short"><span>Version courte
         <em class="pick-sub">${ex(short.length)} · ${setsCount(short)} séries · sans les accessoires</em></span>
         <svg viewBox="0 0 24 24" class="tick"><path d="m9 6 6 6-6 6"/></svg></button>
       <button type="button" class="pick-row" id="len-full"><span>Séance complète
         <em class="pick-sub">${ex(full.length)} · ${setsCount(full)} séries</em></span>
         <svg viewBox="0 0 24 24" class="tick"><path d="m9 6 6 6-6 6"/></svg></button>
     </div>`
  );
  const go = (sh) => () => {
    buzz(8);
    closeSheet();
    onSheetClose = () => { popView(); setTimeout(() => startSession(p, null, { short: sh }), 220); };
  };
  $("len-short").addEventListener("click", go(true));
  $("len-full").addEventListener("click", go(false));
}

function showProgram(id) {
  const p = DB.programs.find((x) => x.id === id);
  if (!p) return;
  const [c1, c2] = accentOf(p);
  const stripe = stripeOf(p);
  const badges = supersetLabels(p.exercises);
  const blk = p.blockId ? blockById(p.blockId) : null;
  /* Dans un bloc en cours, chaque exercice dit sa cible de la semaine. */
  const w = blk && blk.start && !blk.endedAt ? blockWeek(blk) : 0;
  const lw = w && blockState(blk) === "running" ? lightWeek(blk) : null;

  pushView(
    `<header class="pushed-bar">
       <button class="icon-btn" data-back aria-label="Retour">
         <svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>
       </button>
       <span class="pushed-title">Programme</span>
       <button class="icon-btn" id="edit-prog" aria-label="Modifier">
         <svg viewBox="0 0 24 24"><path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
       </button>
     </header>
     <div class="pushed-scroll">
       <div class="prog-hero ink-${heroInk([c1, c2])}" style="background:linear-gradient(160deg,${c1},${c2})">
         ${blk ? `<p class="hero-k">${esc(blockTitle(blk))}${lw ? " · semaine chargée" : ""}</p>` : ""}
         <h1>${esc(p.name)}</h1>
         <p>${heroMeta(p)}</p>
       </div>
       <ol class="ex-list">
         ${supersetRuns(p.exercises).map((run) => {
           const rows = run.map((i) => exRow(p.exercises[i], badges[i], stripe, w, !!lw)).join("");
           if (run.length < 2) return rows;
           const tours = Math.max(...run.map((i) => p.exercises[i].sets || 0));
           return `<li class="ss-group">
             <p class="ss-head"><b>Superset ${badges[run[0]].letter}</b>
               <em>${tours ? `${tours} tours · ` : ""}enchaînés sans repos</em></p>
             <ol class="ss-rows">${rows}</ol>
           </li>`;
         }).join("")}
       </ol>
       <button class="ghost-btn" id="dup-prog">Dupliquer le programme</button>
       <button class="ghost-btn danger-btn" id="del-prog">Supprimer le programme</button>
     </div>
     <footer class="pushed-foot">
       <button class="primary" id="start-session"><span class="primary-label">Commencer la séance</span></button>
     </footer>`
  );

  $("start-session").addEventListener("click", () => {
    if (lw) { chooseLength(p, w, lw); return; }
    popView();
    setTimeout(() => startSession(p), 220);
  });
  $("edit-prog").addEventListener("click", () => { popView(); setTimeout(() => editProgram(p), 220); });
  /* La copie est enregistrée tout de suite, puis ouverte dans
     l'éditeur : on la renomme ou on l'ajuste dans la foulée. Elle
     prend sa propre couleur, comme tout nouveau programme. */
  $("dup-prog").addEventListener("click", () => {
    const copy = {
      id: uid(),
      name: `${p.name} (copie)`,
      accent: nextAccent(),
      /* La copie est à soi : sans le plan ni les pastilles du coach. */
      exercises: p.exercises.map(({ weeks, isNew, ...e }) => ({ ...e })),
    };
    DB.programs.splice(DB.programs.indexOf(p) + 1, 0, copy);
    persist.programs();
    renderPrograms();
    buzz(9);
    popView();
    setTimeout(() => { editProgram(copy); toast("Copie créée"); }, 220);
  });
  $("del-prog").addEventListener("click", () => {
    confirmSheet(`Supprimer « ${p.name} » ?`, "L'historique des séances déjà faites est conservé.", "Supprimer", () => {
      DB.programs = DB.programs.filter((x) => x.id !== p.id);
      persist.programs();
      popView();
      renderPrograms();
      toast("Programme supprimé");
    });
  });
}

/* ── Supersets dans l'éditeur ──────────────────────────────
   Le premier numéro de groupe libre. On prend max+1 plutôt que de
   combler un trou : deux exercices éloignés qui retomberaient sur
   le même numéro se souderaient si on les rapprochait un jour. */
const freeGroup = (list) =>
  list.reduce((m, e) => (Number.isFinite(e.group) && e.group > m ? e.group : m), -1) + 1;

/* Lier un exercice à celui du dessus, ou l'en détacher. Détacher ne
   casse que ce maillon-là : ce qui le suit reste soudé à lui, sinon
   défaire un tri-set le ferait exploser en trois. */
function toggleLink(list, i) {
  if (i < 1) return;
  const prev = list[i - 1];
  const linked = sameGroup(prev, list[i]);
  const tail = [i];
  for (let k = i + 1; k < list.length && sameGroup(list[k - 1], list[k]); k++) tail.push(k);
  let g;
  if (linked) {
    g = freeGroup(list);
  } else {
    if (prev.group == null) prev.group = freeGroup(list);
    g = prev.group;
  }
  tail.forEach((k) => { list[k].group = g; });
}

const LINK_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7h2a5 5 0 0 1 0 10h-2M9 17H7A5 5 0 0 1 7 7h2"/><path d="M8 12h8"/></svg>';
const LINK_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7h2a5 5 0 0 1 0 10h-2M9 17H7A5 5 0 0 1 7 7h2"/><path d="M9.5 12h1M13.5 12h1"/></svg>';

/* ── Éditeur de programme ─────────────────────────────────── */
function editProgram(existing) {
  /* `...existing` garde `blockId` : un programme du coach reste dans son bloc. */
  const draft = existing
    ? { ...existing, accent: existing.accent ?? 0, exercises: existing.exercises.map((e) => ({ ...e })) }
    : { id: uid(), name: "", accent: nextAccent(), exercises: [] };
  /* Remplacé ou retiré dans un programme du coach : noté à
     l'enregistrement, pour qu'il ne le repropose pas. */
  const swaps = [];

  /* Les couleurs portées par les AUTRES programmes s'affichent en
     retrait : rien n'empêche de les reprendre, mais on le voit. */
  const taken = new Set(DB.programs.filter((p) => p.id !== draft.id).map((p) => p.accent ?? 0));

  pushView(
    `<header class="pushed-bar">
       <button class="icon-btn" data-back aria-label="Retour">
         <svg viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></svg>
       </button>
       <span class="pushed-title">${existing ? "Modifier" : "Nouveau programme"}</span>
       <span class="icon-btn ghost-slot"></span>
     </header>
     <div class="pushed-scroll">
       <div class="field">
         <label for="pname">Nom</label>
         <input class="input" id="pname" placeholder="Ex : Push Day" value="${esc(draft.name)}" autocomplete="off">
       </div>
       <p class="block-key">Couleur</p>
       <div class="accent-row" id="accent-row">
         ${ACCENTS.map((c, i) => `<button type="button" class="accent${i === draft.accent ? " on" : ""}${taken.has(i) ? " used" : ""}" data-i="${i}"
            style="background:linear-gradient(160deg,${c[0]},${c[1]})"
            aria-label="Couleur ${i + 1}${taken.has(i) ? " — déjà prise par un autre programme" : ""}"></button>`).join("")}
       </div>
       <p class="block-key">Exercices</p>
       <p class="fineprint" style="margin:-4px 0 10px">Touche un exercice pour le modifier. Glisse la poignée pour changer l'ordre. Le maillon lie un exercice à celui du dessus — les deux deviennent un superset.</p>
       <div id="draft-list" class="draft-list"></div>
       <button class="tile-btn" id="add-ex">
         <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Ajouter un exercice
       </button>
       <button class="primary big" id="save-prog"><span class="primary-label">Enregistrer</span></button>
     </div>`,
    { guard: () => {
      if (snap() === start) return false;
      confirmSheet("Quitter sans enregistrer ?", "Tes changements à ce programme seront perdus.", "Quitter sans enregistrer",
        () => popView(0, true));
      return true;
    } }
  );

  /* Photo de l'éditeur à l'ouverture : la flèche retour ne jette
     plus des changements sans le dire. */
  const snap = () => JSON.stringify([$("pname").value.trim(), draft.accent, draft.exercises]);
  const start = snap();

  const linked = (i) => i > 0 && sameGroup(draft.exercises[i - 1], draft.exercises[i]);

  const drawDraft = () => {
    const host = $("draft-list");
    const badges = supersetLabels(draft.exercises);
    if (!draft.exercises.length) {
      host.innerHTML = `<p class="muted pad">Aucun exercice. Ajoute le premier ci-dessous.</p>`;
      return;
    }
    host.innerHTML = draft.exercises.map((e, i) => `
      <div class="swipe-row" data-i="${i}">
        <button type="button" class="swipe-action" aria-label="Supprimer">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/></svg>
        </button>
        <div class="swipe-surface draft-row${badges[i].superset ? " ss" : ""}">
          <span class="row-stripe" style="background:${stripeOf(draft)}" aria-hidden="true"></span>
          <span class="ex-num">${badges[i].superset ? `<b>${badges[i].text}</b>` : badges[i].text}</span>
          <span class="ex-main">
            <span class="ex-title">${esc(e.name)}${e.isNew ? `<span class="new-pill">Nouveau</span>` : ""}</span>
            <span class="ex-sub">${exPlanSub(e)}</span>
          </span>
          ${i === 0 || e.kind === "cardio" || draft.exercises[i - 1].kind === "cardio"
            ? `<span class="link-btn spacer" aria-hidden="true"></span>`
            : `<button type="button" class="link-btn${linked(i) ? " on" : ""}" data-i="${i}"
                 aria-pressed="${linked(i)}"
                 aria-label="${linked(i) ? "Détacher" : "Mettre en superset avec"} « ${esc(draft.exercises[i - 1].name)} »"
                 >${linked(i) ? LINK_ON : LINK_OFF}</button>`}
          <span class="drag-handle" role="button" tabindex="0" aria-label="Déplacer ${esc(e.name)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg>
          </span>
        </div>
      </div>`).join("");
    host.querySelectorAll(".link-btn[data-i]").forEach((b) => {
      b.addEventListener("click", () => {
        toggleLink(draft.exercises, Number(b.dataset.i));
        buzz(9);
        drawDraft();
      });
    });

    host.querySelectorAll(".swipe-row").forEach((row) => {
      swipeToReveal(row, { onCommit: () => {
        swaps.push([draft.exercises[Number(row.dataset.i)].name, null]);
        draft.exercises.splice(Number(row.dataset.i), 1);
        drawDraft();
      } });
      /* Toucher la rangée modifie l'exercice : lequel, ses séries,
         ses reps (ou sa durée). Le maillon et la poignée gardent
         leur propre rôle ; une rangée glissée se referme d'abord. */
      row.addEventListener("click", (e) => {
        if (!e.target.closest(".swipe-surface") || e.target.closest(".link-btn, .drag-handle")) return;
        if (row._swipeOpen && row._swipeOpen()) { row._closeSwipe(); return; }
        const i = Number(row.dataset.i), cur = draft.exercises[i];
        buzz(6);
        addExerciseSheet({
          edit: cur,
          programName: $("pname").value.trim() || null,
          onAdd: (ex) => {
            /* Le groupe (superset) et la place ne bougent pas. Le plan
               du coach suit un exercice remplacé ; il ne cède que si
               on change soi-même les séries ou les reps. */
            const next = { ...ex, group: cur.group };
            const numbers = String(ex.sets ?? "") !== String(cur.sets ?? "") || String(ex.reps ?? "") !== String(cur.reps ?? "");
            if (cur.weeks && !numbers) next.weeks = cur.weeks;
            if (cur.isNew && ex.name === cur.name) next.isNew = true;
            if (ex.name !== cur.name) swaps.push([cur.name, ex.name]);
            draft.exercises[i] = next;
            drawDraft();
          },
          /* Même effet que le glissé vers la gauche, en visible. */
          onRemove: () => {
            swaps.push([cur.name, null]);
            draft.exercises.splice(i, 1);
            drawDraft();
          },
        });
      });
    });

    /* Glisser la poignée réordonne ; le clavier aussi, sinon
       l'ordre ne serait accessible qu'au doigt. */
    dragToReorder(host, { onCommit: (from, to) => {
      draft.exercises.splice(to, 0, draft.exercises.splice(from, 1)[0]);
      drawDraft();
    } });
    host.querySelectorAll(".drag-handle").forEach((h, i) => {
      h.addEventListener("keydown", (ev) => {
        const d = ev.key === "ArrowUp" ? -1 : ev.key === "ArrowDown" ? 1 : 0;
        if (!d) return;
        const to = i + d;
        if (to < 0 || to >= draft.exercises.length) return;
        ev.preventDefault();
        draft.exercises.splice(to, 0, draft.exercises.splice(i, 1)[0]);
        buzz(8);
        drawDraft();
        host.querySelectorAll(".drag-handle")[to].focus();
      });
    });
  };
  drawDraft();

  $("accent-row").addEventListener("click", (e) => {
    const b = e.target.closest(".accent");
    if (!b) return;
    draft.accent = Number(b.dataset.i);
    $("accent-row").querySelectorAll(".accent").forEach((x) => x.classList.toggle("on", x === b));
    $("draft-list").querySelectorAll(".row-stripe").forEach((x) => { x.style.background = stripeOf(draft); });
    pop(b, 1.14, 0.5);
    buzz(6);
  });

  $("add-ex").addEventListener("click", () => addExerciseSheet({
    prev: draft.exercises[draft.exercises.length - 1],
    programName: $("pname").value.trim() || null,
    onAdd: (ex, { superset }) => {
      const lastGroup = draft.exercises.length ? draft.exercises[draft.exercises.length - 1].group : -1;
      ex.group = superset && draft.exercises.length ? lastGroup : lastGroup + 1;
      draft.exercises.push(ex);
      drawDraft();
    },
  }));

  $("save-prog").addEventListener("click", () => {
    const name = $("pname").value.trim();
    if (!name) { toast("Donne un nom au programme"); $("pname").focus(); return; }
    if (!draft.exercises.length) { toast("Ajoute au moins un exercice"); return; }
    draft.name = name;
    const i = DB.programs.findIndex((p) => p.id === draft.id);
    if (i >= 0) DB.programs[i] = draft; else DB.programs.push(draft);
    persist.programs();
    swaps.forEach(([from, to]) => recordSwap(draft, from, to));
    popView(0, true);
    renderPrograms();
    toast(existing ? "Programme mis à jour" : "Programme créé");
  });
}

/* Le sous-titre d'un exercice de programme. */
const exSub = (e) => e.kind === "cardio"
  ? ["Cardio", e.minutes ? `${fmt(e.minutes)} min` : null].filter(Boolean).join(" · ")
  : [e.sets ? `${e.sets} séries` : null, e.reps ? `${esc(e.reps)} reps` : null].filter(Boolean).join(" · ") || "libre";

/* Avec un plan du coach : la cible de la semaine `w` du bloc, ou
   tout le plan d'un coup quand le bloc n'a pas commencé (éditeur). */
function exPlanSub(e, w = 0) {
  if (!Array.isArray(e.weeks) || !e.weeks.length) return exSub(e);
  const p = weekPlan(e, w);
  return p ? `Semaine ${w} : ${p.sets} séries · ${esc(p.reps)} reps` : `Plan du coach · ${planSpan(e.weeks)}`;
}

/* Ajouter un exercice — depuis l'éditeur de programme OU en pleine
   séance. `ctx` : { prev, session, onAdd(ex, { superset, keep }) }.
   `picked` et `kind` voyagent en paramètres : la feuille est
   reconstruite après le sélecteur, et une variable locale y serait
   remise à zéro — le choix serait perdu sans que rien ne le dise. */
function addExerciseSheet(ctx, picked = "", kind = null) {
  /* `ctx.edit` : on modifie un exercice déjà dans le programme. Ses
     propres séries/reps/durée priment sur « la dernière fois ». */
  const ed = ctx.edit || null;
  if (ed && !picked) { picked = ed.name; kind = ed.kind === "cardio" ? "cardio" : "force"; }
  if (picked && isCardio(picked)) kind = "cardio";
  kind = kind || "force";
  const last = picked ? lastEntry(picked) : null;
  const lf = ed && ed.kind !== "cardio" ? { sets: ed.sets ?? "", reps: ed.reps ?? "" } : last && !cardioLog(last) ? last : null;
  const lc = ed && ed.kind === "cardio" ? (ed.minutes ? { minutes: ed.minutes } : null) : cardioLog(last) ? last : null;
  const prev = ctx.prev;
  const kicker = ctx.session ? "Ajouter à la séance"
    : ctx.programName ? `Dans « ${ctx.programName} »` : "Nouveau programme";
  openSheet(
    `<p class="sheet-kicker">${esc(kicker)}</p>
     ${ed ? "" : `<div class="segmented fx-kind" id="ex-kind" role="radiogroup" aria-label="Type d'exercice">
       <button type="button" data-kind="force" class="${kind === "force" ? "on" : ""}">Musculation</button>
       <button type="button" data-kind="cardio" class="${kind === "cardio" ? "on" : ""}">Cardio</button>
     </div>`}
     <button type="button" class="fx-title${picked ? "" : " empty"}" id="pick-ex">
       <span id="pick-ex-label">${picked ? esc(picked) : kind === "cardio" ? "Choisir — ex. Tapis roulant" : "Choisir un exercice"}</span>
       <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
     </button>
     <div data-for="force" ${kind === "force" ? "" : "hidden"}>
       ${stepperRow("ex-sets", lf ? lf.sets : 3, { label: "Séries", placeholder: "3" })}
       ${stepperRow("ex-reps", lf ? lf.reps : "", { label: "Reps", sub: "Ou une fourchette", kind: "range", placeholder: "8-10" })}
       ${prev && prev.kind !== "cardio" && !ctx.session && !ed ? `<label class="check-row"><input type="checkbox" id="ex-ss"><span>Superset avec « ${esc(prev.name)} »</span></label>` : ""}
       ${ed && Array.isArray(ed.weeks) && ed.weeks.length ? `<p class="fineprint fx-plan">Plan du coach : ${planSpan(ed.weeks)} Changer l'exercice garde ce plan ; changer les séries ou les reps le remplace par tes chiffres.</p>` : ""}
     </div>
     <div data-for="cardio" ${kind === "cardio" ? "" : "hidden"}>
       ${stepperRow("ex-min", lc ? lc.minutes : "", { label: "Durée visée", sub: "Facultative", unit: "min", placeholder: "20" })}
     </div>
     ${ctx.session && ctx.keepable !== false ? `<label class="check-row"><input type="checkbox" id="ex-keep"><span>Le garder aussi dans le programme</span></label>` : ""}
     ${picked ? globalHTML(picked) : ""}
     ${ficheFoot(ed ? "Enregistrer" : "Ajouter", ed && ctx.onRemove ? "Retirer de ce programme" : "")}`
  );

  const sets = bindStepper("ex-sets", { min: 1, max: 20 });
  const reps = bindStepper("ex-reps", { min: 1, max: 100, kind: "range" });
  const mins = bindStepper("ex-min", { step: 5, min: 1, max: 600 });
  const glob = picked ? bindGlobal(picked) : null;

  /* Le type se change sur place : rouvrir la feuille ferait
     redescendre puis remonter tout le formulaire. */
  if ($("ex-kind")) $("ex-kind").addEventListener("click", (e) => {
    const b = e.target.closest("[data-kind]");
    if (!b || b.dataset.kind === kind) return;
    kind = b.dataset.kind;
    $("ex-kind").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    $("sheet-body").querySelectorAll("[data-for]").forEach((x) => { x.hidden = x.dataset.for !== kind; });
    /* Un exercice déjà choisi de l'autre type ne suit pas : un
       squat ne devient pas du cardio parce qu'on a changé d'onglet. */
    if (picked && allExercises().includes(picked) && (kind === "cardio") !== isCardio(picked)) {
      closeSheet();
      onSheetClose = () => addExerciseSheet(ctx, "", kind);
      return;
    }
    if (!picked) $("pick-ex-label").textContent = kind === "cardio" ? "Choisir — ex. Tapis roulant" : "Choisir un exercice";
    buzz(6);
    measureSheet();
  });

  $("pick-ex").addEventListener("click", () => {
    closeSheet();
    onSheetClose = () => pickExercise(picked, (name) => addExerciseSheet(ctx, name, kind), { kind });
  });

  $("fx-save").addEventListener("click", () => {
    if (!picked) { toast("Choisis d'abord un exercice"); return; }
    const err = glob && glob.check();
    if (err) { toast(err); return; }
    if (glob) glob.apply();
    const ex = kind === "cardio"
      ? { name: picked, kind: "cardio", minutes: mins() || null }
      : { name: picked, sets: sets() || null, reps: reps() || null };
    const opts = {
      superset: kind === "force" && !!($("ex-ss") && $("ex-ss").checked),
      keep: !!($("ex-keep") && $("ex-keep").checked),
    };
    closeSheet();
    onSheetClose = () => { ctx.onAdd(ex, opts); buzz(9); };
  });

  if ($("fx-danger")) $("fx-danger").addEventListener("click", () => {
    closeSheet();
    onSheetClose = () => { ctx.onRemove(); buzz(8); };
  });
}

/* ══════════════════════════════════════════════════════════
   ONGLET 2 — HISTORIQUE
   ══════════════════════════════════════════════════════════ */
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function prettyDay(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - d) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  const j = JOURS[d.getDay()];
  return `${j.charAt(0).toUpperCase()}${j.slice(1)} ${d.getDate()} ${MOIS_L[d.getMonth()]}`;
}

/* ── Calendrier mensuel ────────────────────────────────────
   L'historique se lit mois par mois : le calendrier navigue,
   la liste dessous suit. Une case pleine = une séance ce
   jour-là ; toucher la case isole la journée. */
const MOIS_C = ["janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

let calY = new Date().getFullYear(), calM = new Date().getMonth();
let calDay = null;                     /* jour isolé, ou null */

const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, "0")}`;
/* Date relue à chaque fois : une PWA reste ouverte des semaines. */
function isFutureMonth(y, m) {
  const n = new Date();
  return y > n.getFullYear() || (y === n.getFullYear() && m > n.getMonth());
}
/* Après une séance ou un import, on revient sur le mois en cours :
   sinon la nouvelle entrée s'écrirait dans un mois qu'on ne
   regarde pas. */
function calToNow() {
  const n = new Date();
  calY = n.getFullYear(); calM = n.getMonth(); calDay = null;
}

/* Toutes les entrées d'un mois, du plus récent au plus ancien. */
const logsOfMonth = (y, m) => DB.logs
  .filter((l) => l.date.startsWith(monthKey(y, m)))
  .sort((a, b) => b.createdAt - a.createdAt);

function renderCalendar() {
  const key = monthKey(calY, calM);
  const mLogs = logsOfMonth(calY, calM);
  const days = new Set(mLogs.map((l) => l.date));
  const vol = mLogs.reduce((n, l) => n + volumeOf(l), 0);

  $("cal-title").textContent = `${MOIS_C[calM]} ${calY}`;
  $("cal-sum").textContent = days.size
    ? `${days.size} séance${days.size > 1 ? "s" : ""} · ${Math.round(vol).toLocaleString("fr-CA")} lb`
    : "aucune séance ce mois-ci";
  $("cal-next").disabled = isFutureMonth(calY, calM + 1);

  /* Grille lundi → dimanche. On ne dessine que les semaines que
     le mois touche vraiment : une sixième rangée vide mangerait
     un tiers de l'écran pour rien. */
  const first = new Date(calY, calM, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(calY, calM, 1 - lead);
  const nDays = new Date(calY, calM + 1, 0).getDate();
  const cells = Math.ceil((lead + nDays) / 7) * 7;
  const tIso = today();

  let html = "";
  for (let i = 0; i < cells; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const key2 = iso(d);
    const out = d.getMonth() !== calM;
    const on = days.has(key2);
    html += `<button type="button" class="cal-day${out ? " out" : ""}${on ? " on" : ""}` +
      `${key2 === tIso && !out ? " today" : ""}${key2 === calDay ? " sel" : ""}" data-day="${key2}"` +
      `${on ? "" : " tabindex=\"-1\" aria-disabled=\"true\""}>${d.getDate()}</button>`;
  }
  $("cal-grid").innerHTML = html;
  $("cal-clear").hidden = !calDay;

  $("cal-grid").querySelectorAll(".cal-day").forEach((b) => {
    b.addEventListener("click", () => {
      if (!b.classList.contains("on")) return;
      calDay = calDay === b.dataset.day ? null : b.dataset.day;
      buzz(8);
      renderHistory();
    });
  });
  return key;
}

/* Changement de mois : le contenu entre du côté d'où vient le
   geste, avec un ressort qui repart de la vitesse du doigt. */
const calSlide = new Spring(0, { response: 0.42, damping: 0.88, restDelta: 0.4,
  onUpdate: (x) => {
    const el = $("cal-slide");
    el.style.transform = `translate3d(${x}px,0,0)`;
    el.style.opacity = String(Math.max(0.35, 1 - Math.abs(x) / 260));
  } });

function goMonth(delta, velocity = 0) {
  const y = calY, m = calM + delta;
  if (isFutureMonth(y, m)) { calSlide.to(0, { velocity, damping: 1, response: 0.34 }); return; }
  const d = new Date(y, m, 1);
  calY = d.getFullYear(); calM = d.getMonth();
  calDay = null;
  renderHistory();
  const w = $("cal-viewport").clientWidth || 300;
  calSlide.hold(delta > 0 ? w * 0.3 : -w * 0.3);
  calSlide.to(0, { velocity, damping: 0.86, response: 0.44 });
  buzz(7);
}

/* Glissé horizontal sur le calendrier. Il résiste au lieu de
   suivre au pixel : la page ne part pas, elle annonce qu'il y a
   un mois de l'autre côté, et le relâchement décide. */
function initCalendarGestures() {
  const vp = $("cal-viewport");
  let g = null;
  vp.addEventListener("pointerdown", (e) => {
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, axis: null, tr: tracker() };
    g.tr.add(e.clientX, e.timeStamp);
  });
  vp.addEventListener("pointermove", (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) <= Math.abs(dy)) { g = null; return; }
      g.axis = "x";
      capture(vp, e.pointerId);
    }
    g.tr.add(e.clientX, e.timeStamp);
    calSlide.hold(rubberband(dx, vp.clientWidth || 300, 0.42));
  });
  const end = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const armed = g.axis === "x", v = g.tr.velocity();
    g = null;
    uncapture(vp, e.pointerId);
    if (!armed) return;
    const projected = calSlide.x + project(v, 0.99);
    if (projected < -46) goMonth(1, v);
    else if (projected > 46) goMonth(-1, v);
    else calSlide.to(0, { velocity: v, damping: 1, response: 0.34 });
  };
  vp.addEventListener("pointerup", end);
  vp.addEventListener("pointercancel", end);

  $("cal-prev").addEventListener("click", () => goMonth(-1));
  $("cal-next").addEventListener("click", () => goMonth(1));
  $("cal-clear").addEventListener("click", () => { calDay = null; buzz(6); renderHistory(); });
}

function renderHistory() {
  const host = $("log-list");
  const all = DB.logs;
  const week = all.filter((l) => Date.now() - l.createdAt < 7 * 86400000);
  $("hist-sub").textContent = all.length
    ? `${week.length} entrée${week.length > 1 ? "s" : ""} cette semaine · ${all.length} au total`
    : "";

  renderCalendar();

  /* La liste suit le calendrier : le mois affiché, ou la seule
     journée choisie. */
  const logs = calDay
    ? all.filter((l) => l.date === calDay).sort((a, b) => b.createdAt - a.createdAt)
    : logsOfMonth(calY, calM);
  const notes = DB.journal
    .filter((n) => (calDay ? n.date === calDay : n.date.startsWith(monthKey(calY, calM))))
    .sort((a, b) => a.createdAt - b.createdAt);

  if (!logs.length && !notes.length) {
    host.innerHTML = all.length
      ? `<div class="empty">
           <p class="empty-title">Rien en ${esc(MOIS_C[calM])}</p>
           <p class="empty-body">Glisse le calendrier ou touche les flèches pour changer de mois.</p>
         </div>`
      : `<div class="empty">
           <p class="empty-title">Historique vide</p>
           <p class="empty-body">Lance une séance depuis Programmes, ajoute une entrée à la main, ou importe tes données depuis les Réglages.</p>
         </div>`;
    return;
  }

  const byDay = {}, notesByDay = {};
  logs.forEach((l) => { (byDay[l.date] ||= []).push(l); });
  notes.forEach((n) => { byDay[n.date] ||= []; (notesByDay[n.date] ||= []).push(n); });

  host.innerHTML = Object.keys(byDay).sort().reverse().map((day) => {
    const items = byDay[day];
    const vol = items.reduce((n, l) => n + volumeOf(l), 0);
    const mins = items.reduce((n, l) => n + (cardioLog(l) ? Number(l.minutes) || 0 : 0), 0);
    const head = [
      vol ? `${Math.round(vol).toLocaleString("fr-CA")} lb` : null,
      mins ? `${fmt(mins)} min de cardio` : null,
    ].filter(Boolean).join(" · ");
    return `<section class="day">
      <header class="day-head">
        <span class="day-name">${esc(prettyDay(day))}</span>
        <span class="day-vol tnum">${head}</span>
      </header>
      ${(notesByDay[day] || []).map((n) => `
        <button type="button" class="day-note" data-note="${esc(n.id)}">
          <span class="day-note-k">Note${n.programName ? ` · ${esc(n.programName)}` : ""}</span>
          <span class="day-note-t">${esc(n.text)}</span>
        </button>`).join("")}
      ${items.map((l) => {
        const detail = cardioLog(l) ? cardioText(l) : l.perSet
          ? l.perSet.map((s) => `${fmt(s.weight)}×${s.reps}`).join("  ")
          : `${fmt(l.weight)} lb × ${l.reps} × ${l.sets} série${l.sets > 1 ? "s" : ""}`;
        return `<div class="swipe-row" data-log="${esc(l.id)}">
          <button type="button" class="swipe-action" aria-label="Supprimer">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/></svg>
          </button>
          <div class="swipe-surface log-row">
            <span class="row-stripe" style="background:${logStripe(l)}" aria-hidden="true"></span>
            <span class="log-main">
              <span class="log-name">${esc(l.exercise)}</span>
              <span class="log-detail tnum">${esc(detail)}</span>
            </span>
            ${l.programName ? `<span class="log-tag">${esc(l.programName)}</span>` : ""}
          </div>
        </div>`;
      }).join("")}
    </section>`;
  }).join("");

  host.querySelectorAll(".swipe-row").forEach((row) => {
    swipeToReveal(row, { onCommit: () => {
      deleteLog(row.dataset.log);
      renderHistory();
      renderProgress();
      toast("Entrée supprimée");
    } });
  });

  /* Toucher une ligne la corrige. Une ligne glissée (bouton
     supprimer visible) se referme d'abord : même geste qu'iOS. */
  host.querySelectorAll(".swipe-row[data-log]").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (!e.target.closest(".swipe-surface")) return;
      if (row._swipeOpen && row._swipeOpen()) { row._closeSwipe(); return; }
      buzz(6);
      editLogSheet(row.dataset.log);
    });
  });

  host.querySelectorAll(".day-note").forEach((b) => {
    b.addEventListener("click", () => journalSheet(b.dataset.note));
  });
}

/* ── Historique d'un exercice ──────────────────────────────
   Toutes les séances d'un exercice, série par série, de la plus
   récente à la plus ancienne. Ouvrable en pleine séance (menu ⋯)
   comme depuis Progrès. */
const histCount = (name) => {
  const n = DB.logs.filter((l) => l.exercise === name).length;
  return n ? `${n} séance${n > 1 ? "s" : ""} enregistrée${n > 1 ? "s" : ""}` : "Aucune séance pour l'instant";
};

function exerciseHistorySheet(name) {
  const logs = DB.logs.filter((l) => l.exercise === name).sort((a, b) => b.createdAt - a.createdAt);
  const cardio = isCardio(name);
  const pr = DB.prs[name];
  /* L'anneau « record » ne marque QU'UNE série : la première fois
     que ce poids a été atteint. Sur chaque série à égalité, il ne
     voudrait plus rien dire. */
  const topW = (l) => (l.perSet ? Math.max(...l.perSet.map((s) => s.weight)) : l.weight);
  const prLog = pr ? logs.filter((l) => !cardioLog(l) && topW(l) === pr).sort((a, b) => a.createdAt - b.createdAt)[0] : null;
  openSheet(
    `<p class="sheet-kicker">${cardio ? "Cardio" : esc(muscleOf(name))} · ${histCount(name)}</p>
     <h2 class="sheet-h">${esc(name)}</h2>
     ${!cardio && pr ? `<p class="muted">Record : <b>${fmt(pr)} lb</b></p>` : ""}
     ${logs.length ? `<ol class="hist-list">${logs.map((l) => {
       const top = cardioLog(l) ? null : (l.perSet ? Math.max(...l.perSet.map((s) => s.weight)) : l.weight);
       const sets = cardioLog(l)
         ? `<span class="hist-set">${esc(cardioText(l))}</span>`
         : (l.perSet || Array.from({ length: l.sets || 1 }, () => ({ weight: l.weight, reps: l.reps })))
             .map((s, k, all) => {
               const isPr = l === prLog && all.findIndex((x) => x.weight === pr) === k;
               return `<span class="hist-set${isPr ? " pr" : ""}"${isPr ? ' title="Record"' : ""}>${fmt(s.weight)}<i>×</i>${s.reps}${isPr ? '<b class="hist-pr">record</b>' : ""}</span>`;
             }).join("");
       return `<li class="hist-item">
         <p class="hist-head"><b>${esc(prettyDay(l.date))}</b>${l.programName ? `<em>${esc(l.programName)}</em>` : ""}
           ${top != null ? `<span class="tnum">${fmt(top)} lb</span>` : ""}</p>
         <p class="hist-sets tnum">${sets}</p>
       </li>`;
     }).join("")}</ol>` : `<p class="muted pad">Rien encore — la première séance s'écrira ici.</p>`}`
  );
}

/* ── Corriger une entrée passée ────────────────────────────
   Toucher une ligne de l'Historique. Série par série pour une
   entrée de séance ; durée, distance, calories et intensité pour
   un cardio. La date se corrige aussi. */
function editLogSheet(id) {
  const l = DB.logs.find((x) => x.id === id);
  if (!l) return;
  const cardio = cardioLog(l);
  /* Une vieille entrée « 135 × 8 × 3 » s'édite série par série :
     on la déplie, elle sera réécrite au format détaillé. */
  const rows = cardio ? [] : (l.perSet
    ? l.perSet.map((s) => ({ ...s }))
    : Array.from({ length: l.sets || 1 }, () => ({ weight: l.weight, reps: l.reps })));
  let intensity = l.intensity || 2;

  openSheet(
    `<p class="sheet-kicker">Entrée · ${esc(prettyDay(l.date))}</p>
     <h2 class="sheet-h">${esc(l.exercise)}</h2>
     <div class="field"><label for="el-date">Date</label>
       <input class="input" id="el-date" type="date" value="${esc(l.date)}" max="${today()}"></div>
     ${cardio ? `
       ${stepperRow("el-min", l.minutes, { label: "Durée", unit: "min", kind: "dec" })}
       ${stepperRow("el-km", l.distance || "", { label: "Distance", sub: "Facultative", unit: "km", kind: "dec", placeholder: "—" })}
       ${stepperRow("el-cal", l.calories ? Math.round(l.calories) : "", { label: "Calories", sub: "Facultatives", placeholder: "—" })}
       <div class="segmented" id="el-int" role="radiogroup" aria-label="Intensité">${[1, 2, 3].map((n) => `<button type="button" data-int="${n}" class="${n === intensity ? "on" : ""}">${INTENSITY[n]}</button>`).join("")}</div>`
     : `<p class="block-key">Séries</p>
        <div id="el-sets" class="edit-sets"></div>
        <button type="button" class="tile-btn" id="el-add"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Ajouter une série</button>`}
     ${globalHTML(l.exercise)}
     ${ficheFoot("Enregistrer", "Supprimer l'entrée")}`
  );

  const glob = bindGlobal(l.exercise);
  let sets = null, min, km, cal;
  if (cardio) {
    min = bindStepper("el-min", { min: 1, max: 600, kind: "dec" });
    km = bindStepper("el-km", { step: 0.5, max: 500, kind: "dec" });
    cal = bindStepper("el-cal", { step: 10, max: 9999 });
    $("el-int").addEventListener("click", (e) => {
      const b = e.target.closest("[data-int]");
      if (!b) return;
      intensity = Number(b.dataset.int);
      $("el-int").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      buzz(6);
    });
  } else {
    sets = setRowsEditor("el-sets", rows);
    $("el-add").addEventListener("click", () => sets.add());
  }

  $("fx-save").addEventListener("click", () => {
    const date = $("el-date").value || l.date;
    if (date > today()) { toast("La date ne peut pas être dans le futur"); return; }
    const err = glob.check();
    if (err) { toast(err); return; }
    let fields;
    if (cardio) {
      const pos = (v) => (v > 0 ? v : null);
      const minutes = pos(min());
      if (!minutes) { toast("Entre au moins une durée"); return; }
      fields = { date, minutes, distance: pos(km()), calories: pos(cal()), intensity };
    } else {
      const all = sets.read();
      if (all.some((s) => !(s.weight >= 0) || !(s.reps >= 1))) { toast("Chaque série a besoin d'un poids et de reps"); return; }
      const top = all.reduce((a, b) => (b.weight > a.weight ? b : a));
      fields = { date, perSet: all, weight: top.weight, reps: top.reps, sets: all.length };
    }
    glob.apply();
    editLog(id, fields);
    closeSheet();
    onSheetClose = () => {
      renderHistory(); renderProgress(); renderPrograms();
      if (!celebrateOutside()) { toast("Entrée corrigée"); buzz(9); }
    };
  });

  $("fx-danger").addEventListener("click", () => {
    closeSheet();
    onSheetClose = () => confirmSheet(`Supprimer l'entrée « ${l.exercise} » ?`, prettyDay(l.date), "Supprimer", () => {
      deleteLog(id);
      renderHistory(); renderProgress(); renderPrograms();
      toast("Entrée supprimée");
    });
  });
}

/* Relire, corriger ou effacer une note de séance. */
function journalSheet(id) {
  const n = DB.journal.find((x) => x.id === id);
  if (!n) return;
  openSheet(
    `<p class="sheet-kicker">${esc(prettyDay(n.date))}${n.programName ? ` · ${esc(n.programName)}` : ""}</p>
     <h2 class="sheet-h">Note de séance</h2>
     <div class="field"><textarea class="input" id="jn-text" rows="4" aria-label="Note de séance">${esc(n.text)}</textarea></div>
     <button class="primary" id="jn-save"><span class="primary-label">Enregistrer</span></button>
     <button class="ghost-btn danger-btn" id="jn-del">Supprimer la note</button>`
  );
  $("jn-save").addEventListener("click", () => {
    const t = $("jn-text").value.trim();
    if (t) n.text = t; else DB.journal = DB.journal.filter((x) => x.id !== id);
    persist.journal();
    closeSheet();
    onSheetClose = () => { renderHistory(); toast(t ? "Note mise à jour" : "Note supprimée"); };
  });
  $("jn-del").addEventListener("click", () => {
    DB.journal = DB.journal.filter((x) => x.id !== id);
    persist.journal();
    closeSheet();
    onSheetClose = () => { renderHistory(); toast("Note supprimée"); };
  });
}

function quickLogSheet(picked = "", kind = null) {
  /* Appelée directement comme écouteur de clic : le 1er argument
     est alors l'événement, pas un nom. */
  if (typeof picked !== "string") picked = "";
  if (picked && isCardio(picked)) kind = "cardio";
  kind = kind || "force";
  const lastAny = picked ? lastEntry(picked) : null;
  const last = lastAny && !cardioLog(lastAny) ? lastAny : null;
  const lc = cardioLog(lastAny) ? lastAny : null;
  let intensity = lc && lc.intensity ? lc.intensity : 2;
  /* On part de la dernière fois, série par série. */
  const rows = last
    ? (last.perSet ? last.perSet.map((x) => ({ ...x })) : Array.from({ length: last.sets || 1 }, () => ({ weight: last.weight, reps: last.reps })))
    : Array.from({ length: 3 }, () => ({ weight: 0, reps: 10 }));
  openSheet(
    `<p class="sheet-kicker">Nouvelle entrée · aujourd'hui</p>
     <div class="segmented fx-kind" id="ql-kind" role="radiogroup" aria-label="Type d'entrée">
       <button type="button" data-kind="force" class="${kind === "force" ? "on" : ""}">Musculation</button>
       <button type="button" data-kind="cardio" class="${kind === "cardio" ? "on" : ""}">Cardio</button>
     </div>
     <button type="button" class="fx-title${picked ? "" : " empty"}" id="ql-pick">
       <span id="ql-label">${picked ? esc(picked) : kind === "cardio" ? "Choisir — ex. Tapis roulant" : "Choisir un exercice"}</span>
       <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
     </button>
     <div data-for="cardio" ${kind === "cardio" ? "" : "hidden"}>
       ${stepperRow("ql-min", lc ? lc.minutes : 30, { label: "Durée", unit: "min", kind: "dec" })}
       ${stepperRow("ql-km", "", { label: "Distance", sub: "Facultative", unit: "km", kind: "dec", placeholder: "—" })}
       ${stepperRow("ql-cal", "", { label: "Calories", sub: "Facultatives", placeholder: "—" })}
       <div class="segmented" id="ql-int" role="radiogroup" aria-label="Intensité">
         ${[1, 2, 3].map((n) => `<button type="button" data-int="${n}" class="${n === intensity ? "on" : ""}">${INTENSITY[n]}</button>`).join("")}
       </div>
       <p class="fineprint">${lc ? `Dernière fois : ${esc(cardioText(lc))}` : picked ? "Première entrée pour cet exercice." : ""}</p>
     </div>
     <div data-for="force" ${kind === "force" ? "" : "hidden"}>
       <p class="block-key">Séries</p>
       <div id="ql-sets" class="edit-sets"></div>
       <button type="button" class="tile-btn" id="ql-add"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Ajouter une série</button>
       <p class="fineprint">${last
          ? `Dernière fois : ${esc(prettyDay(last.date))}${DB.prs[picked] ? ` · record ${fmt(DB.prs[picked])} lb` : ""}`
          : (picked ? "Première entrée pour cet exercice." : "")}</p>
     </div>
     ${picked ? globalHTML(picked) : ""}
     ${ficheFoot("Ajouter")}`
  );

  const min = bindStepper("ql-min", { min: 1, max: 600, kind: "dec" });
  const km = bindStepper("ql-km", { step: 0.5, max: 500, kind: "dec" });
  const cal = bindStepper("ql-cal", { step: 10, max: 9999 });
  const sets = setRowsEditor("ql-sets", rows);
  $("ql-add").addEventListener("click", () => sets.add());
  const glob = picked ? bindGlobal(picked) : null;

  $("ql-kind").addEventListener("click", (e) => {
    const b = e.target.closest("[data-kind]");
    if (!b || b.dataset.kind === kind) return;
    kind = b.dataset.kind;
    if (picked && allExercises().includes(picked) && (kind === "cardio") !== isCardio(picked)) {
      closeSheet();
      onSheetClose = () => quickLogSheet("", kind);
      return;
    }
    $("ql-kind").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    $("sheet-body").querySelectorAll("[data-for]").forEach((x) => { x.hidden = x.dataset.for !== kind; });
    if (!picked) $("ql-label").textContent = kind === "cardio" ? "Choisir — ex. Tapis roulant" : "Choisir un exercice";
    buzz(6);
    measureSheet();
  });
  $("ql-int").addEventListener("click", (e) => {
    const b = e.target.closest("[data-int]");
    if (!b) return;
    intensity = Number(b.dataset.int);
    $("ql-int").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    buzz(6);
  });

  $("ql-pick").addEventListener("click", () => {
    closeSheet();
    onSheetClose = () => pickExercise(picked, (name) => quickLogSheet(name, kind), { kind });
  });

  $("fx-save").addEventListener("click", () => {
    if (!picked) { toast("Choisis un exercice"); return; }
    const err = glob && glob.check();
    if (err) { toast(err); return; }
    if (kind === "cardio") {
      const pos = (v) => (v > 0 ? v : null);
      const minutes = pos(min());
      if (!minutes) { toast("Entre au moins une durée"); return; }
      if (glob) glob.apply();
      addLog({ exercise: picked, kind: "cardio", minutes, distance: pos(km()),
        calories: pos(cal()), intensity, programId: null, programName: null });
      closeSheet();
      onSheetClose = () => {
        calToNow();
        renderHistory(); renderProgress(); renderPrograms();
        if (!celebrateOutside()) { toast("Cardio ajouté"); buzz(9); }
      };
      return;
    }
    const all = sets.read();
    if (all.some((x) => !(x.weight >= 0) || !(x.reps >= 1))) { toast("Chaque série a besoin d'un poids et de reps"); return; }
    if (glob) glob.apply();
    const top = all.reduce((a, b) => (b.weight > a.weight ? b : a));
    const res = addLog({ exercise: picked, perSet: all, weight: top.weight, sets: all.length, reps: top.reps, programId: null, programName: null });
    closeSheet();
    onSheetClose = () => {
      calToNow();
      renderHistory(); renderProgress(); renderPrograms();
      if (celebrateOutside()) return;
      if (res.pr) { toast(`🏆 Record : ${fmt(top.weight)} lb`); buzz([14, 45, 22]); }
      else { toast("Entrée ajoutée"); buzz(9); }
    };
  });
}

/* Hors séance (entrée manuelle, correction), un objectif atteint
   ou un jalon débloqué se fête par un toast. Renvoie vrai s'il y
   avait quelque chose à fêter. */
function celebrateOutside() {
  const goals = checkGoals(), badges = newBadges();
  if (!goals.length && !badges.length) return false;
  const g = goals[0], b = badges[0];
  toast(g ? `Objectif atteint : ${g.exercise} · ${goalLabel(g)}` : `Jalon débloqué : ${b.title}`);
  buzz([12, 40, 12, 40, 24]);
  renderPrograms();
  return true;
}

/* ══════════════════════════════════════════════════════════
   ONGLET 3 — PROGRÈS
   ══════════════════════════════════════════════════════════ */
let progMode = "exercices", currentEx = null, metric = "weight";

function renderProgress() {
  ["exercices", "muscles", "poids", "photos"].forEach((m) => { $(`mode-${m}`).hidden = m !== progMode; });
  $("prog-mode").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.mode === progMode));
  if (progMode === "exercices") renderExerciseProgress();
  else if (progMode === "muscles") renderMuscles();
  else if (progMode === "poids") renderBodyweight();
  else renderPhotos();
}

function renderExerciseProgress() {
  const names = allExercises();
  if (!names.length) {
    $("ex-picker-label").textContent = "Aucun exercice";
    $("ex-stats").innerHTML = "";
    $("ex-chart").innerHTML = `<p class="chart-empty">Rien à afficher : commence par logger une séance.</p>`;
    $("ex-table").hidden = true;
    return;
  }
  if (!currentEx || !names.includes(currentEx)) {
    /* Par défaut, l'exercice le plus travaillé — c'est celui qui l'intéresse. */
    const count = {};
    DB.logs.forEach((l) => { count[l.exercise] = (count[l.exercise] || 0) + 1; });
    currentEx = names.slice().sort((a, b) => (count[b] || 0) - (count[a] || 0))[0];
  }
  $("ex-picker-label").textContent = currentEx;

  /* Le cardio n'a ni poids ni reps : le même interrupteur bascule
     sur Durée / Distance. */
  const cardio = isCardio(currentEx);
  const choices = cardio ? [["minutes", "Durée"], ["distance", "Distance"]] : [["weight", "Poids"], ["reps", "Reps"], ["e1rm", "1RM estimé"]];
  if (!choices.some(([k]) => k === metric)) metric = choices[0][0];
  $("metric-toggle").querySelectorAll("button").forEach((b, k) => {
    b.hidden = !choices[k];
    if (!choices[k]) return;
    b.dataset.metric = choices[k][0];
    b.textContent = choices[k][1];
    b.classList.toggle("on", b.dataset.metric === metric);
  });
  $("ex-e1rm-note").hidden = metric !== "e1rm";

  if (cardio) { renderCardioProgress(); return; }

  const pts = seriesFor(currentEx, metric);
  const unit = metric === "reps" ? "reps" : "lb";
  const isE1rm = metric === "e1rm";
  if (!pts.length) $("ex-e1rm-note").hidden = true;

  /* Les records ne sont PAS une deuxième couleur : anneau + étiquette. */
  const prSet = new Set();
  let best = -Infinity;
  seriesFor(currentEx, isE1rm ? "e1rm" : "weight").forEach((p) => { if (p.y > best) { best = p.y; prSet.add(p.x); } });
  const showPR = metric !== "reps";

  const first = pts[0], last = pts[pts.length - 1];
  const delta = pts.length > 1 ? last.y - first.y : 0;
  $("ex-stats").innerHTML = pts.length ? `
    <div class="stat"><span class="stat-val tnum">${fmt(isE1rm ? best : DB.prs[currentEx] ?? bestWeight(currentEx))}</span><span class="stat-key">${isE1rm ? "Meilleur" : "Record"} (lb)</span></div>
    <div class="stat"><span class="stat-val tnum">${fmt(last.y)}</span><span class="stat-key">Dernière (${unit})</span></div>
    <div class="stat"><span class="stat-val tnum">${delta > 0 ? "+" : ""}${fmt(delta)}</span><span class="stat-key">Depuis le début</span></div>` : "";

  renderChart($("ex-chart"), pts, {
    unit, prSet: showPR ? prSet : new Set(),
    label: `${isE1rm ? "1RM estimé" : "Progression"} — ${currentEx}`,
    empty: isE1rm ? "Il faut une série avec un poids pour estimer un 1RM." : "Aucune donnée pour cet exercice.",
  });

  /* Vue tableau : l'information ne doit jamais exister qu'en image. */
  $("ex-table").innerHTML = pts.slice().reverse().map((p) =>
    `<div class="vrow"><span>${esc(longDate(p.x))}</span><b class="tnum">${fmt(p.y)} ${esc(unit)}</b>${prSet.has(p.x) && showPR ? '<em>record</em>' : ""}</div>`).join("");
}

/* ── Séries par muscle ─────────────────────────────────────
   Une seule série de données → une seule couleur (l'accent),
   comme les autres graphiques de l'app. Chaque barre porte son
   chiffre en texte : pas besoin d'infobulle ni de légende. Les
   muscles restent dans un ordre FIXE d'une semaine à l'autre, pour
   qu'on compare les mêmes lignes ; un muscle à zéro reste visible,
   c'est justement lui qu'on cherche. */
let muscleSpan = 1;

function renderMuscles() {
  $("muscle-span").querySelectorAll("button").forEach((b) => b.classList.toggle("on", Number(b.dataset.span) === muscleSpan));
  const cur = setsByMuscle(1 - muscleSpan, muscleSpan);
  const prev = setsByMuscle(1 - 2 * muscleSpan, muscleSpan);
  const shown = MUSCLES.filter((m) => m !== "Autre" || cur.Autre || prev.Autre);
  const max = Math.max(1, ...shown.map((m) => cur[m]));
  const total = shown.reduce((n, m) => n + cur[m], 0);
  const label = muscleSpan === 1 ? "sem. dernière" : "4 sem. d'avant";

  $("muscle-sum").innerHTML = total
    ? `<b class="tnum">${total}</b> série${total > 1 ? "s" : ""} ${muscleSpan === 1 ? "cette semaine" : "sur 4 semaines"}`
    : `Aucune série ${muscleSpan === 1 ? "cette semaine" : "sur 4 semaines"} pour l'instant.`;

  $("muscle-bars").innerHTML = shown.map((m) => {
    const v = cur[m], w = (v / max) * 100;
    return `<button type="button" class="mbar${v ? "" : " zero"}" data-m="${esc(m)}"
        aria-label="${esc(m)} : ${v} séries, ${prev[m]} la période d'avant">
        <span class="mbar-name">${esc(m)}</span>
        <span class="mbar-track"><span class="mbar-fill" style="width:${v ? Math.max(w, 3) : 0}%"></span></span>
        <span class="mbar-val tnum"><b>${v}</b><i>${label} ${prev[m]}</i></span>
      </button>`;
  }).join("");

  $("muscle-bars").querySelectorAll(".mbar").forEach((b) =>
    b.addEventListener("click", () => muscleSheet(b.dataset.m)));
}

/* Les exercices rangés sous un muscle, pour vérifier ou corriger
   la devinette. */
function muscleSheet(m) {
  const names = allExercises().filter((n) => !isCardio(n) && muscleOf(n) === m);
  openSheet(
    `<p class="sheet-kicker">Muscle</p>
     <h2 class="sheet-h">${esc(m)}</h2>
     <p class="muted">Le muscle est deviné d'après le nom de l'exercice. Touche un exercice s'il est mal rangé.</p>
     <div class="pick-list">${names.length ? names.map((n) => `
       <button type="button" class="pick-row" data-name="${esc(n)}">
         <span>${esc(n)}<em class="pick-sub">${DB.muscles[n] ? "choisi à la main" : "deviné"}</em></span>
         <svg viewBox="0 0 24 24" class="tick"><path d="m9 6 6 6-6 6"/></svg></button>`).join("")
       : `<p class="muted pad">Aucun exercice rangé ici.</p>`}</div>`
  );
  $("sheet-body").querySelectorAll("[data-name]").forEach((b) => b.addEventListener("click", () => {
    closeSheet();
    onSheetClose = () => muscleChooser(b.dataset.name, () => renderMuscles());
  }));
}

/* Choisir le muscle d'un exercice — en pastilles, d'un seul tap. */
function muscleChips(name) {
  const cur = muscleOf(name);
  return `<div class="chips" id="muscle-chips" role="radiogroup" aria-label="Muscle principal">${MUSCLES.map((m) =>
    `<button type="button" class="chip${m === cur ? " on" : ""}" data-m="${esc(m)}" role="radio" aria-checked="${m === cur}">${esc(m)}</button>`).join("")}</div>`;
}
function bindMuscleChips(onPick) {
  $("muscle-chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-m]");
    if (!b) return;
    $("muscle-chips").querySelectorAll(".chip").forEach((x) => {
      x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b));
    });
    pop(b, 1.1, 0.6);
    buzz(6);
    onPick(b.dataset.m);
  });
}
function setMuscle(name, m) {
  if (m === guessMuscle(name)) delete DB.muscles[name]; else DB.muscles[name] = m;
  persist.muscles();
}

function muscleChooser(name, after) {
  openSheet(
    `<p class="sheet-kicker">Muscle principal</p>
     <h2 class="sheet-h">${esc(name)}</h2>
     ${muscleChips(name)}`
  );
  bindMuscleChips((m) => {
    setMuscle(name, m);
    setTimeout(() => { closeSheet(); onSheetClose = () => { if (after) after(); toast(`${name} → ${m}`); }; }, 220);
  });
}

function renderCardioProgress() {
  const pts = seriesFor(currentEx, metric);
  const unit = metric === "distance" ? "km" : "min";
  const all = DB.logs.filter((l) => l.exercise === currentEx && cardioLog(l));
  const best = pts.reduce((m, p) => Math.max(m, p.y), 0);
  const last = pts[pts.length - 1];

  $("ex-stats").innerHTML = pts.length ? `
    <div class="stat"><span class="stat-val tnum">${fmt(best)}</span><span class="stat-key">Plus ${metric === "distance" ? "loin" : "long"} (${unit})</span></div>
    <div class="stat"><span class="stat-val tnum">${fmt(last.y)}</span><span class="stat-key">Dernière (${unit})</span></div>
    <div class="stat"><span class="stat-val tnum">${all.length}</span><span class="stat-key">Séances</span></div>` : "";

  renderChart($("ex-chart"), pts, {
    unit, prSet: new Set(),
    label: `${metric === "distance" ? "Distance" : "Durée"} — ${currentEx}`,
    empty: metric === "distance" ? "Aucune distance notée pour cet exercice." : "Aucune donnée pour cet exercice.",
  });

  $("ex-table").innerHTML = pts.slice().reverse().map((p) =>
    `<div class="vrow"><span>${esc(longDate(p.x))}</span><b class="tnum">${esc(cardioText(p.log))}</b></div>`).join("");
}

function renderBodyweight() {
  const pts = [...DB.bodyweight].sort((a, b) => a.createdAt - b.createdAt)
    .map((b) => ({ x: b.createdAt, y: b.weight, date: b.date, id: b.id }));

  if (pts.length) {
    const last = pts[pts.length - 1], first = pts[0];
    const d = last.y - first.y;
    $("bw-stats").innerHTML = `
      <div class="stat"><span class="stat-val tnum">${fmt(last.y)}</span><span class="stat-key">Actuel (lb)</span></div>
      <div class="stat"><span class="stat-val tnum">${d > 0 ? "+" : ""}${fmt(d)}</span><span class="stat-key">Variation</span></div>
      <div class="stat"><span class="stat-val tnum">${pts.length}</span><span class="stat-key">Mesures</span></div>`;
  } else $("bw-stats").innerHTML = "";

  renderChart($("bw-chart"), pts, {
    unit: "lb", color: "#0A84FF", label: "Poids corporel",
    empty: "Ajoute ton poids pour voir la courbe.",
  });

  $("bw-list").innerHTML = [...DB.bodyweight].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40).map((b) =>
    `<div class="swipe-row" data-bw="${esc(b.id)}">
       <button type="button" class="swipe-action" aria-label="Supprimer">
         <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/></svg>
       </button>
       <div class="swipe-surface log-row">
         <span class="log-main"><span class="log-name tnum">${fmt(b.weight)} lb</span>
         <span class="log-detail">${esc(prettyDay(b.date))}</span></span>
       </div>
     </div>`).join("");

  $("bw-list").querySelectorAll(".swipe-row").forEach((row) => {
    swipeToReveal(row, { onCommit: () => {
      DB.bodyweight = DB.bodyweight.filter((x) => x.id !== row.dataset.bw);
      persist.bodyweight();
      renderBodyweight();
      toast("Mesure supprimée");
    } });
  });
}

async function renderPhotos() {
  const grid = $("photo-grid");
  let photos = [];
  try { photos = await allPhotos(); } catch (_) { grid.innerHTML = `<p class="muted pad">Photos indisponibles sur cet appareil.</p>`; return; }
  if (!photos.length) {
    grid.innerHTML = `<p class="muted pad">Aucune photo. Une tous les mois suffit pour voir la différence.</p>`;
    return;
  }
  grid.innerHTML = photos.map((p) =>
    `<figure class="photo" data-id="${esc(p.id)}">
       <img src="${p.dataUrl}" alt="Photo du ${esc(p.date)}" loading="lazy">
       <figcaption>${esc(prettyDay(p.date))}</figcaption>
     </figure>`).join("");
  grid.querySelectorAll(".photo").forEach((f) => {
    f.addEventListener("click", () => {
      $("lightbox-img").src = f.querySelector("img").src;
      $("lightbox").hidden = false;
      $("lightbox").dataset.id = f.dataset.id;
    });
  });
}

/* ══════════════════════════════════════════════════════════
   ONGLET 4 — RÉGLAGES
   ══════════════════════════════════════════════════════════ */
function renderSettings() {
  const s = scanOldApp();
  const total = s.logs + s.programs + s.bodyweight;
  $("import-scan").innerHTML = total
    ? `<b>${total}</b> élément${total > 1 ? "s" : ""} de <b>Mes Workouts</b> attendent encore sur cet appareil.`
    : `Rien trouvé de <b>Mes Workouts</b> sur cet appareil.`;
  renderAppearance();
  const last = Number(localStorage.getItem(K.lastExport)) || 0;
  $("backup-line").textContent = last
    ? `Dernière sauvegarde : ${relDay(iso(new Date(last)))}.`
    : "Aucune sauvegarde pour l'instant.";
  $("version-line").textContent = `${DB.logs.length} entrées · ${DB.programs.length} programmes`;
  const nd = similarExercises().length;
  $("manage-ex-btn").textContent = nd ? `Gérer mes exercices · ${nd} doublon${nd > 1 ? "s" : ""}` : "Gérer mes exercices";
}

/* Le détail vit dans une feuille : la récupération ne sert qu'une
   fois, elle n'a pas à occuper le haut des réglages pour toujours. */
function importSheet() {
  const s = scanOldApp();
  const total = s.logs + s.programs + s.bodyweight;

  openSheet(
    `<h2 class="sheet-h">Récupérer mes données</h2>
     <p class="muted">${total
        ? `Cette app a remplacé <b>Mes Workouts</b>. Tes anciennes séances sont toujours
           dans cet appareil : ceci en fait une <b>copie</b> ici. L'ancienne app n'est
           jamais modifiée, et réimporter deux fois ne duplique rien.`
        : `Cette app a remplacé <b>Mes Workouts</b>. Cette option copie les anciennes
           données ici, sans jamais toucher à l'ancienne app.`}</p>
     ${total
        ? `<div class="stat-row">
             <div class="stat"><span class="stat-val tnum">${s.logs}</span><span class="stat-key">Entrées</span></div>
             <div class="stat"><span class="stat-val tnum">${s.programs}</span><span class="stat-key">Programmes</span></div>
             <div class="stat"><span class="stat-val tnum">${s.bodyweight}</span><span class="stat-key">Pesées</span></div>
           </div>
           <button class="primary" id="do-import"><span class="primary-label">Copier mes données</span></button>`
        : `<p class="fineprint">Rien trouvé ici. Sur iPhone, une app ajoutée à l'écran
             d'accueil a son propre espace de stockage : les anciennes données sont dans
             celui de l'ancienne icône. Ouvre cette app depuis cette icône-là, ou importe
             un fichier exporté depuis l'ancienne app.</p>`}`
  );

  if (!total) return;
  $("do-import").addEventListener("click", () => {
    const r = importOldApp();
    closeSheet();
    onSheetClose = () => {
      refreshAll();
      toast(`Importé : ${r.logs} entrées, ${r.programs} programmes`);
      buzz([10, 40, 18]);
    };
  });
}

/* ── Apparence : mode et accent ───────────────────────────── */
const CHECK_PATH = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';

function renderAppearance() {
  $("theme-mode").querySelectorAll("button").forEach((b) =>
    b.classList.toggle("on", b.dataset.mode === themeMode));

  $("accent-grid").innerHTML = ACCENT_CHOICES.map((a) => {
    const on = a.id === accentId;
    return `<button type="button" class="sw${on ? " on" : ""}" data-accent="${a.id}"
        style="background:${a.hex};color:${a.ink}" aria-pressed="${on}"
        aria-label="${esc(a.name)}">${on ? CHECK_PATH : ""}</button>`;
  }).join("");

  $("accent-name").innerHTML = `Accent : <b>${esc(currentAccent().name)}</b>`;
}

const MERGE_IC = '<svg viewBox="0 0 24 24" class="tick"><path d="M6 4l6 7 6-7M12 11v9"/></svg>';
const entriesOf = (n) => DB.logs.filter((l) => l.exercise === n).length;

function manageExercisesSheet() {
  const names = allExercises();
  if (!names.length) { toast("Aucun exercice pour l'instant"); return; }
  const dupes = similarExercises();
  openSheet(
    `<h2 class="sheet-h">Mes exercices</h2>
     <p class="muted">Touche un exercice pour le renommer partout ou lui donner une note.</p>
     ${dupes.length ? `<p class="block-key">Doublons possibles</p>
       <div class="menu-list">${dupes.map(([a, b], k) => `<button type="button" class="pick-row" data-dupe="${k}">
         <span>${esc(a)} · ${esc(b)}<em class="pick-sub">Même mouvement ? Touche pour fusionner</em></span>${MERGE_IC}</button>`).join("")}</div>` : ""}
     <div class="menu-list">
       <button type="button" class="pick-row" id="mx-merge"><span>Fusionner deux exercices
         <em class="pick-sub">Un même mouvement noté sous deux noms</em></span>${MERGE_IC}</button>
     </div>
     <p class="block-key">Tous</p>
     <div class="pick-list">
       ${names.map((n) => `<button type="button" class="pick-row" data-name="${esc(n)}">
          <span>${esc(n)}<em class="pick-sub">${DB.notes[n] ? esc(DB.notes[n]) : `${DB.logs.filter((l) => l.exercise === n).length} entrées`}</em></span>
          <svg viewBox="0 0 24 24" class="tick"><path d="m9 6 6 6-6 6"/></svg>
        </button>`).join("")}
     </div>`
  );
  $("sheet-body").querySelectorAll("[data-name]").forEach((b) => {
    b.addEventListener("click", () => {
      const n = b.dataset.name;
      closeSheet();
      onSheetClose = () => editExerciseSheet(n);
    });
  });
  $("sheet-body").querySelectorAll("[data-dupe]").forEach((b) => b.addEventListener("click", () => {
    const [x, y] = dupes[Number(b.dataset.dupe)];
    closeSheet();
    onSheetClose = () => mergeSheet(x, y, true);
  }));
  /* Deux noms qui ne se ressemblent pas (« Incline dumbbell press » /
     « DB incline bench ») : on les choisit l'un après l'autre. */
  $("mx-merge").addEventListener("click", () => {
    closeSheet();
    onSheetClose = () => pickExercise("", (a) => pickExercise(a, (b) => {
      if (b === a) { toast("Choisis deux exercices différents"); return; }
      mergeSheet(a, b);
    }, { create: false }), { create: false });
  });
}

/* Garder quel nom ? Celui qui a le plus d'entrées est proposé en premier. */
function mergeSheet(a, b, detected = false) {
  const [x, y] = entriesOf(b) > entriesOf(a) ? [b, a] : [a, b];
  const opt = (keep, drop) => `<button type="button" class="pick-row" data-keep="${esc(keep)}" data-drop="${esc(drop)}">
      <span>Garder « ${esc(keep)} »<em class="pick-sub">${entriesOf(keep)} entrée${entriesOf(keep) > 1 ? "s" : ""}${DB.prs[keep] ? ` · record ${fmt(DB.prs[keep])} lb` : ""}</em></span>${MERGE_IC}</button>`;
  openSheet(
    `<p class="sheet-kicker">Fusionner</p>
     <h2 class="sheet-h">Garder quel nom ?</h2>
     <p class="muted">Les ${entriesOf(x) + entriesOf(y)} entrées, les records, les objectifs et les programmes passent sous le nom gardé. L'autre disparaît.</p>
     <div class="menu-list">${opt(x, y)}${opt(y, x)}</div>
     ${detected ? `<button class="ghost-btn" id="mg-not">Ce ne sont pas les mêmes</button>` : ""}
     <button class="ghost-btn" id="mg-no">Annuler</button>`
  );
  $("sheet-body").querySelectorAll("[data-keep]").forEach((bt) => bt.addEventListener("click", () => {
    const keep = bt.dataset.keep, drop = bt.dataset.drop;
    mergeExercises(keep, drop);
    buzz([10, 40, 14]);
    closeSheet();
    onSheetClose = () => { refreshAll(); toast(`Fusionné sous « ${keep} »`); };
  }));
  if ($("mg-not")) $("mg-not").addEventListener("click", () => {
    markNotDupe(a, b);
    closeSheet();
    onSheetClose = () => { refreshAll(); toast("Gardés séparés"); };
  });
  $("mg-no").addEventListener("click", () => closeSheet());
}

function editExerciseSheet(name) {
  const n = DB.logs.filter((l) => l.exercise === name).length;
  openSheet(
    `<p class="sheet-kicker">Mes exercices</p>
     <h2 class="sheet-h">${esc(name)}</h2>
     <p class="muted">${n ? `${n} entrée${n > 1 ? "s" : ""} dans l'historique` : "Pas encore dans l'historique"}</p>
     ${globalHTML(name, { open: true, rename: true })}
     ${ficheFoot()}`
  );
  const glob = bindGlobal(name);
  $("fx-save").addEventListener("click", () => {
    const err = glob.check();
    if (err) { toast(err); return; }
    glob.apply();
    closeSheet();
    onSheetClose = () => { refreshAll(); toast("Exercice mis à jour"); };
  });
}

function confirmSheet(title, body, cta, onYes) {
  openSheet(
    `<h2 class="sheet-h">${esc(title)}</h2>
     <p class="muted">${esc(body)}</p>
     <button class="primary danger-solid" id="cf-yes"><span class="primary-label">${esc(cta)}</span></button>
     <button class="ghost-btn" id="cf-no">Annuler</button>`
  );
  $("cf-yes").addEventListener("click", () => { closeSheet(); onSheetClose = onYes; });
  $("cf-no").addEventListener("click", () => closeSheet());
}

/* ── Rafraîchit tout ce qui est visible ───────────────────── */
function refreshAll() {
  calToNow();
  renderPrograms();
  renderHistory();
  renderProgress();
  renderSettings();
}

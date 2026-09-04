/* ============================================================
   session.js — l'écran de séance
   Reprend le prototype validé, mais branché sur de vrais
   programmes et sur l'historique : chaque exercice terminé
   devient une entrée d'historique, avec le détail par série.
   ============================================================ */

const S = {
  program: null,
  exercises: [],
  state: [],
  cards: [],
  dots: [],
  idx: 0,
  startedAt: 0,
  beatenPRs: [],
  logged: new Set(),
  open: false,
  clockTimer: 0,
};

const sEl = (id) => document.getElementById(id);
const sessionRoot = () => sEl("session");
const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';

/* Étiquettes d'exercice : un groupe de superset porte une lettre
   (A, B…), les exercices seuls gardent leur propre numérotation.
   Sinon la liste saute — 1, A, A, 4 — et ça se lit mal. */
function supersetLabels(exs) {
  const count = {};
  exs.forEach((e) => { count[e.group] = (count[e.group] || 0) + 1; });
  const letters = {};
  let nextLetter = 0, nextNum = 0;
  return exs.map((e) => {
    if (count[e.group] > 1) {
      if (letters[e.group] === undefined) letters[e.group] = String.fromCharCode(65 + nextLetter++);
      return { text: letters[e.group], superset: true };
    }
    return { text: String(++nextNum), superset: false };
  });
}

/* Première valeur numérique d'une consigne « 8-10 » → 8 */
const firstNum = (s, fallback) => {
  const m = String(s ?? "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : fallback;
};

/* ── Ouverture ────────────────────────────────────────────── */
function startSession(program) {
  if (!program.exercises.length) { toast("Ce programme n'a pas encore d'exercices"); return; }

  S.program = program;
  S.exercises = program.exercises.map((e) => ({ ...e }));
  S.badges = supersetLabels(S.exercises);
  S.idx = 0;
  S.beatenPRs = [];
  S.logged = new Set();
  S.startedAt = Date.now();

  /* Le point de départ, c'est ce que tu as fait la dernière fois. */
  S.state = S.exercises.map((ex) => {
    const last = lastEntry(ex.name);
    const lastTop = last && last.perSet
      ? last.perSet.reduce((a, b) => (b.weight > a.weight ? b : a))
      : null;
    return {
      done: [],
      last,
      draft: {
        weight: lastTop ? lastTop.weight : (last ? last.weight : 0),
        reps: lastTop ? lastTop.reps : (last ? last.reps : firstNum(ex.reps, 10)),
      },
      target: ex.sets || (last ? last.sets : 3),
    };
  });

  buildCards();
  sEl("program-name").textContent = program.name;
  sEl("sheet-title").textContent = program.name;
  sEl("head-count").textContent = `1 sur ${S.exercises.length}`;
  sEl("stat-time").textContent = "0:00";

  sessionRoot().hidden = false;
  S.open = true;
  document.body.classList.add("in-session");
  requestAnimationFrame(() => {
    sessionLayout();
    sPos.hold(0);
    progressS.hold(0);
    updateButton();
    presentS.to(1, { damping: 1, response: 0.42 });
  });

  clearInterval(S.clockTimer);
  S.clockTimer = setInterval(() => {
    sEl("clock").textContent = mmss(Date.now() - S.startedAt);
  }, 1000);

  if (!localStorage.getItem(K.hint)) setTimeout(showHint, 700);
}

/* L'écran monte depuis le bas et repart par le bas. */
const presentS = new Spring(0, { response: 0.42, damping: 1, restDelta: 0.003, onUpdate: (v) => {
  const r = sessionRoot();
  r.style.transform = `translate3d(0,${(1 - v) * 100}%,0)`;
  r.style.opacity = String(Math.min(1, v * 2));
}, onRest: () => {
  if (presentS.t === 0) {
    sessionRoot().hidden = true;
    S.open = false;
    document.body.classList.remove("in-session");
  }
} });

function closeSession() {
  clearInterval(S.clockTimer);
  presentS.to(0, { damping: 1, response: 0.36 });
  refreshAll();
}

/* ── Les cartes ───────────────────────────────────────────── */
function buildCards() {
  const stack = sEl("stack"), dotsEl = sEl("dots");
  stack.innerHTML = ""; dotsEl.innerHTML = "";

  S.cards = S.exercises.map((ex, i) => {
    const badge = S.badges[i].superset ? S.badges[i].text : null;
    const st = S.state[i];
    const target = [
      st.target ? `<b>${st.target}</b> séries` : null,
      ex.reps ? `<b>${esc(ex.reps)}</b> reps` : null,
    ].filter(Boolean).join(" · ");
    const note = DB.notes[ex.name];
    const lastTxt = st.last
      ? `dernière fois <b>${fmt(st.last.perSet ? Math.max(...st.last.perSet.map((s) => s.weight)) : st.last.weight)} lb</b>`
      : `<b>première fois</b>`;

    const el = document.createElement("article");
    el.className = "card";
    el.innerHTML =
      `<div class="card-inner">` +
      (badge ? `<span class="badge">Superset ${badge}</span>` : "") +
      `<h2 class="ex-name">${esc(ex.name)}</h2>` +
      `<p class="ex-target">${target ? `<span>${target}</span><span class="dot-sep"></span>` : ""}<span>${lastTxt}</span></p>` +
      (note ? `<p class="ex-note">${esc(note)}</p>` : "") +
      `<ol class="sets"></ol>` +
      `</div>`;
    stack.appendChild(el);

    const d = document.createElement("span");
    d.className = "dot";
    dotsEl.appendChild(d);
    S.dots.push(d);

    return { el, sets: el.querySelector(".sets") };
  });
  S.dots = [...dotsEl.children];
  S.exercises.forEach((_, i) => renderSets(i));
}

function renderSets(i) {
  const st = S.state[i], ol = S.cards[i].sets;
  const n = Math.max(st.target, st.done.length);
  ol.innerHTML = "";
  for (let j = 0; j < n; j++) {
    const rec = st.done[j];
    const active = j === st.done.length;
    const li = document.createElement("li");
    li.className = "set" + (rec ? " done" : active ? " active" : "");

    let vals;
    if (rec) {
      vals = `<span class="num">${fmt(rec.weight)}</span><span class="unit">lb</span><span class="times">×</span><span class="num">${rec.reps}</span>`;
    } else if (active) {
      const unset = !st.last && !st.draft.weight ? " unset" : "";
      vals = `<span class="num${unset}" data-k="weight">${fmt(st.draft.weight)}</span><span class="unit">lb</span><span class="times">×</span><span class="num" data-k="reps">${st.draft.reps}</span>`;
    } else {
      vals = `<span class="num">—</span><span class="unit">lb</span><span class="times">×</span><span class="num">—</span>`;
    }

    li.innerHTML =
      `<span class="set-idx">${j + 1}</span>` +
      `<span class="set-vals">${vals}</span>` +
      `<span class="set-check">${CHECK}</span>` +
      (active
        ? `<p class="scrub-hint">${!st.last && !st.draft.weight
             ? "Première fois sur cet exercice — règle le poids en le tirant vers le haut"
             : "Tire un chiffre vers le haut ou le bas"}</p>`
        : "");
    ol.appendChild(li);
    if (active) li.querySelectorAll(".num[data-k]").forEach((el) => bindScrub(el, el.dataset.k, i));
  }
}

/* Molette verticale sur un chiffre. */
function bindScrub(el, kind, i) {
  let g = null;
  el.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    capture(el, e.pointerId);
    el.classList.add("scrubbing");
    g = { id: e.pointerId, y0: e.clientY, base: S.state[i].draft[kind] };
    buzz(5);
  });
  el.addEventListener("pointermove", (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dy = g.y0 - e.clientY;
    if (Math.abs(dy) < 5 && !g.moved) return;
    g.moved = true;
    dismissHint();
    const step = kind === "weight" ? 2.5 : 1;
    const per  = kind === "weight" ? 13 : 17;
    const lo   = kind === "weight" ? 0 : 1;
    const hi   = kind === "weight" ? 900 : 100;
    const v = Math.max(lo, Math.min(hi, g.base + Math.round(dy / per) * step));
    if (v !== S.state[i].draft[kind]) {
      S.state[i].draft[kind] = v;
      el.textContent = kind === "weight" ? fmt(v) : String(v);
      el.classList.remove("unset");
      buzz(4);
      pop(el, 1.06, 0.7);
    }
  });
  const end = (e) => {
    if (!g || e.pointerId !== g.id) return;
    el.classList.remove("scrubbing");
    uncapture(el, e.pointerId);
    g = null;
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

/* ── Pile + glissé horizontal ─────────────────────────────── */
let pageW = 1;
const sPos = new Spring(0, { response: 0.42, damping: 1, restDelta: 0.0015, onUpdate: paintStack });

function paintStack(p) {
  for (let i = 0; i < S.cards.length; i++) {
    const d = i - p, ad = Math.min(Math.abs(d), 1.4), el = S.cards[i].el;
    el.style.transform = `translate3d(${d * pageW}px,0,0) scale(${1 - 0.055 * ad})`;
    el.style.opacity = String(Math.max(0, 1 - 0.75 * ad));
    el.style.visibility = ad >= 1.3 ? "hidden" : "visible";
    el.style.pointerEvents = Math.abs(d) < 0.5 ? "auto" : "none";
  }
  for (let i = 0; i < S.dots.length; i++) {
    const t = Math.max(0, 1 - Math.abs(i - p));
    const base = exDone(i) ? "rgba(48,209,88,.45)" : "rgba(255,255,255,.22)";
    S.dots[i].style.transform = `scale(${1 + 0.95 * t})`;
    S.dots[i].style.background = t > 0.02 ? `color-mix(in srgb, var(--green) ${Math.round(t * 100)}%, ${base})` : base;
  }
}

function sessionLayout() { pageW = sEl("stack").clientWidth || 1; paintStack(sPos.x); }
addEventListener("resize", () => { if (S.open) sessionLayout(); });

const exDone = (i) => S.state[i] && S.state[i].done.length >= S.state[i].target;
const allDone = () => S.state.every((_, i) => exDone(i));
const doneSets = () => S.state.reduce((n, s) => n + s.done.length, 0);
const totalSets = () => S.state.reduce((n, s) => n + s.target, 0);

let sDrag = null;
function initStackGestures() {
  const stack = sEl("stack");
  stack.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".num[data-k]")) return;
    sessionLayout();
    sDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from: sPos.x, at: S.idx, axis: null, tr: tracker() };
    sDrag.tr.add(e.clientX, e.timeStamp);
  });
  stack.addEventListener("pointermove", (e) => {
    if (!sDrag || e.pointerId !== sDrag.id) return;
    const dx = e.clientX - sDrag.x0, dy = e.clientY - sDrag.y0;
    if (!sDrag.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) <= Math.abs(dy)) { sDrag = null; return; }
      sDrag.axis = "x";
      capture(stack, e.pointerId);
      dismissHint();
    }
    sDrag.tr.add(e.clientX, e.timeStamp);
    let p = sDrag.from - dx / pageW;
    const max = S.cards.length - 1;
    if (p < 0) p = -rubberband(-p * pageW, pageW) / pageW;
    if (p > max) p = max + rubberband((p - max) * pageW, pageW) / pageW;
    sPos.hold(p);
  });
  const rel = (e) => {
    if (!sDrag || e.pointerId !== sDrag.id) return;
    const wasX = sDrag.axis === "x", vPx = sDrag.tr.velocity(), from = sDrag.at;
    sDrag = null;
    if (!wasX) return;
    const vIdx = -vPx / pageW;
    let target = Math.round(sPos.x + project(vIdx));
    target = Math.max(from - 1, Math.min(from + 1, target));
    target = Math.max(0, Math.min(S.cards.length - 1, target));
    const flick = Math.abs(vIdx) > 0.35;
    sPos.to(target, { velocity: vIdx, damping: flick ? 0.8 : 1, response: 0.4 });
    setSessionIndex(target);
  };
  stack.addEventListener("pointerup", rel);
  stack.addEventListener("pointercancel", rel);
}

function goTo(i) { sPos.to(i, { velocity: 0, damping: 1, response: 0.42 }); setSessionIndex(i); }

function setSessionIndex(i) {
  if (i === S.idx) return;
  S.idx = i;
  buzz(7);
  sEl("head-count").textContent = `${i + 1} sur ${S.cards.length}`;
  updateButton();
}

/* ── Progression, bouton ──────────────────────────────────── */
const progressS = new Spring(0, { response: 0.5, damping: 1, restDelta: 0.001,
  onUpdate: (v) => { sEl("progress-fill").style.transform = `scaleX(${v})`; } });
const fillS = new Spring(0, { response: 0.38, damping: 1, restDelta: 0.002,
  onUpdate: (v) => { const f = sEl("primary-fill"); f.style.transform = `scaleY(${v})`; f.style.opacity = String(v); } });

function updateButton() {
  const st = S.state[S.idx];
  let label, go;
  if (st.done.length < st.target) { label = `Valider la série ${st.done.length + 1}`; go = false; }
  else if (allDone()) { label = "Terminer la séance"; go = true; }
  else { label = "Exercice suivant"; go = true; }
  sEl("commit-label").textContent = label;
  sEl("commit").classList.toggle("go", go);
  fillS.to(go ? 1 : 0);
}

function nextIncomplete() {
  for (let k = 1; k <= S.cards.length; k++) {
    const i = (S.idx + k) % S.cards.length;
    if (!exDone(i)) return i;
  }
  return S.idx;
}

/* ── Valider une série ────────────────────────────────────── */
function commitSet() {
  const st = S.state[S.idx], ex = S.exercises[S.idx];
  const entry = { ...st.draft };
  const prev = DB.prs[ex.name] ?? 0;
  const isPR = entry.weight > prev;

  st.done.push(entry);
  renderSets(S.idx);
  const row = S.cards[S.idx].sets.children[st.done.length - 1];
  if (row) pop(row, 1.045, 0.5);

  if (isPR) {
    DB.prs[ex.name] = entry.weight;
    persist.prs();
    const found = S.beatenPRs.find((p) => p.name === ex.name);
    if (found) found.weight = entry.weight;
    else S.beatenPRs.push({ name: ex.name, weight: entry.weight, prev });
    celebrate(ex.name, entry.weight, row);
    buzz([14, 45, 22]);
  } else {
    buzz(11);
  }

  progressS.to(doneSets() / (totalSets() || 1));
  paintStack(sPos.x);
  updateButton();
  dismissHint();

  if (exDone(S.idx)) {
    flushExercise(S.idx);
    if (!allDone()) {
      const at = S.idx;
      setTimeout(() => { if (exDone(at) && S.idx === at) goTo(nextIncomplete()); }, isPR ? 900 : 420);
    }
  }
}

/* Un exercice terminé devient UNE entrée d'historique, avec le
   détail par série. On l'écrit dès qu'il est bouclé : si l'app
   se ferme en pleine séance, rien n'est perdu. */
function flushExercise(i) {
  if (S.logged.has(i)) return;
  const st = S.state[i], ex = S.exercises[i];
  if (!st.done.length) return;
  S.logged.add(i);

  const perSet = st.done.map((d) => ({ weight: d.weight, reps: d.reps }));
  const top = perSet.reduce((a, b) => (b.weight > a.weight ? b : a));
  addLog({
    exercise: ex.name,
    weight: top.weight,
    reps: top.reps,
    sets: perSet.length,
    perSet,
    programId: S.program.id,
    programName: S.program.name,
  });
}

/* ── Célébration ──────────────────────────────────────────── */
let bannerTimer = 0;
const bannerS = new Spring(0, { response: 0.42, damping: 0.8, restDelta: 0.003, onUpdate: (v) => {
  const b = sEl("pr-banner");
  b.style.transform = `translate3d(0,${(v - 1) * 140}%,0)`;
  b.style.opacity = String(Math.max(0, Math.min(1, v * 1.6)));
} });

function celebrate(name, weight, row) {
  sEl("pr-detail").textContent = `${name} · ${fmt(weight)} lb`;
  bannerS.to(1, { damping: 0.78, response: 0.44 });
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => bannerS.to(0, { damping: 1, response: 0.4 }), 2300);

  if (!row || REDUCED.matches) return;
  const num = row.querySelector(".num");
  if (!num) return;
  const glow = document.createElement("span");
  glow.className = "num-glow";
  num.appendChild(glow);
  const g = new Spring(0, { response: 0.62, damping: 1, restDelta: 0.004,
    onUpdate: (v) => { glow.style.transform = `scale(${0.5 + v * 1.7})`; glow.style.opacity = String(Math.max(0, 1 - v) * 0.9); },
    onRest: () => glow.remove() });
  g.to(1);
}

/* ── Coach-mark ───────────────────────────────────────────── */
let hintShown = false;
const hintS = new Spring(0, { response: 0.4, damping: 0.85, restDelta: 0.004, onUpdate: (v) => {
  const h = sEl("hint");
  h.style.transform = `translate3d(0,${(1 - v) * 16}px,0) scale(${0.97 + 0.03 * v})`;
  h.style.opacity = String(v);
}, onRest: () => { if (hintS.t === 0) sEl("hint").hidden = true; } });

function showHint() {
  if (localStorage.getItem(K.hint) || !S.open) return;
  sEl("hint").hidden = false; hintShown = true;
  hintS.to(1, { damping: 0.82, response: 0.45 });
  setTimeout(dismissHint, 6000);
}
function dismissHint() {
  if (!hintShown) return;
  hintShown = false;
  localStorage.setItem(K.hint, "1");
  hintS.to(0, { damping: 1, response: 0.34 });
}

const mmss = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/* ── Feuille de fin ───────────────────────────────────────── */
let sheetH = 1, closingSheet = false;
const scSheetY = new Spring(0, { response: 0.42, damping: 0.85, restDelta: 0.4, onUpdate: (y) => {
  const sh = sEl("sc-sheet");
  const p = Math.max(0, Math.min(1, 1 - y / sheetH));
  sh.style.transform = `translate3d(0,${y}px,0) scale(${0.97 + 0.03 * p})`;
  sEl("sc-scrim").style.opacity = String(p);
  const b = 8 + 24 * p;
  sh.style.backdropFilter = `blur(${b}px) saturate(180%)`;
  sh.style.webkitBackdropFilter = `blur(${b}px) saturate(180%)`;
}, onRest: () => {
  if (closingSheet) { sEl("sc-sheet").hidden = true; sEl("sc-scrim").hidden = true; closingSheet = false; }
} });

function openSummary() {
  S.state.forEach((_, i) => flushExercise(i));
  clearInterval(S.clockTimer);
  fillSummary();
  sEl("sc-sheet").hidden = false; sEl("sc-scrim").hidden = false; closingSheet = false;
  sheetH = sEl("sc-sheet").offsetHeight || 1;
  scSheetY.hold(sheetH);
  scSheetY.to(0, { velocity: 0, damping: 0.82, response: 0.46 });
  buzz([10, 40, 10, 40, 18]);
}
function closeSummary(velocity = 0) {
  closingSheet = true;
  scSheetY.to(sheetH, { velocity, damping: 1, response: 0.34 });
  setTimeout(closeSession, 180);
}

function fillSummary() {
  sEl("stat-time").textContent = mmss(Date.now() - S.startedAt);
  const vol = S.state.reduce((n, s) => n + s.done.reduce((m, x) => m + x.weight * x.reps, 0), 0);
  sEl("stat-volume").textContent = Math.round(vol).toLocaleString("fr-CA");
  sEl("stat-sets").textContent = String(doneSets());

  sEl("pr-block").hidden = S.beatenPRs.length === 0;
  sEl("pr-list").innerHTML = S.beatenPRs.map((p) =>
    `<li><b>${esc(p.name)}</b><i>${p.prev ? `avant ${fmt(p.prev)}` : "premier record"}</i><span>${fmt(p.weight)} lb</span></li>`).join("");

  const days = new Set(DB.sessions);
  const cal = sEl("cal"); cal.innerHTML = "";
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const monday = new Date(t0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = new Date(monday); start.setDate(start.getDate() - 28);
  for (let i = 0; i < 35; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const c = document.createElement("span");
    c.className = "cal-cell" + (days.has(iso(d)) ? " on" : "") + (iso(d) === iso(t0) ? " today" : "");
    cal.appendChild(c);
  }
  sEl("streak-num").textContent = String(streakWeeks());
}

/* ── Câblage ──────────────────────────────────────────────── */
function initSession() {
  initStackGestures();
  sEl("commit").addEventListener("click", () => {
    const st = S.state[S.idx];
    if (st.done.length < st.target) commitSet();
    else if (allDone()) openSummary();
    else goTo(nextIncomplete());
  });
  sEl("quit").addEventListener("click", () => {
    if (doneSets() > 0) openSummary();
    else closeSession();
  });
  sEl("sheet-close").addEventListener("click", () => closeSummary());
  sEl("sc-scrim").addEventListener("click", () => closeSummary());

  /* Glissé vers le bas pour refermer la feuille. */
  const sh = sEl("sc-sheet"), scroller = sh.querySelector(".sheet-scroll");
  let sd = null;
  sh.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    sd = { id: e.pointerId, y0: e.clientY, from: scSheetY.x, armed: false, tr: tracker() };
    sd.tr.add(e.clientY, e.timeStamp);
  });
  sh.addEventListener("pointermove", (e) => {
    if (!sd || e.pointerId !== sd.id) return;
    const dy = e.clientY - sd.y0;
    if (!sd.armed) {
      if (Math.abs(dy) < 10) return;
      if (dy < 0 || scroller.scrollTop > 0) { sd = null; return; }
      sd.armed = true;
      capture(sh, e.pointerId);
    }
    sd.tr.add(e.clientY, e.timeStamp);
    let y = sd.from + dy;
    if (y < 0) y = -rubberband(-y, sheetH);
    scSheetY.hold(y);
  });
  const rel = (e) => {
    if (!sd || e.pointerId !== sd.id) return;
    const armed = sd.armed, v = sd.tr.velocity();
    sd = null;
    if (!armed) return;
    if (scSheetY.x + project(v) > sheetH * 0.4) closeSummary(v);
    else scSheetY.to(0, { velocity: v, damping: 0.8, response: 0.42 });
  };
  sh.addEventListener("pointerup", rel);
  sh.addEventListener("pointercancel", rel);
}

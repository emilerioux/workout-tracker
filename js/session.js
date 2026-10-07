/* ============================================================
   session.js — l'écran de séance
   Reprend le prototype validé, mais branché sur de vrais
   programmes et sur l'historique : chaque exercice terminé
   devient une entrée d'historique, avec le détail par série.
   ============================================================ */

const S = {
  program: null,
  exercises: [],
  blocks: [],
  state: [],
  cards: [],
  dots: [],
  idx: 0,
  startedAt: 0,
  beatenPRs: [],
  /* exercice → id de son entrée d'historique. Une entrée déjà
     écrite se RÉÉCRIT si l'exercice reçoit une série de plus. */
  logIds: new Map(),
  open: false,
  clockTimer: 0,
};

const sEl = (id) => document.getElementById(id);
const sessionRoot = () => sEl("session");
const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';

/* Un superset, ce sont des exercices QUI SE SUIVENT et qui portent
   le même groupe. Compter les groupes sans regarder l'ordre laissait
   passer un « A … B … A » impossible à enchaîner dans la salle. */
const sameGroup = (a, b) =>
  !!a && !!b && a.group != null && b.group != null && a.group === b.group &&
  /* Le cardio ne s'enchaîne pas en superset : il a sa propre carte. */
  a.kind !== "cardio" && b.kind !== "cardio";

function supersetRuns(exs) {
  const runs = [];
  exs.forEach((e, i) => {
    if (i && sameGroup(exs[i - 1], e)) runs[runs.length - 1].push(i);
    else runs.push([i]);
  });
  return runs;
}

/* Étiquettes : une suite de 2+ porte une lettre et un rang (A1, A2…),
   les exercices seuls gardent leur propre numérotation. Sinon la
   liste saute — 1, A, A, 4 — et ça se lit mal. */
function supersetLabels(exs) {
  const out = [];
  let nextLetter = 0, nextNum = 0;
  supersetRuns(exs).forEach((run) => {
    if (run.length > 1) {
      const letter = String.fromCharCode(65 + nextLetter++);
      run.forEach((i, k) => { out[i] = { text: `${letter}${k + 1}`, letter, pos: k, superset: true }; });
    } else {
      out[run[0]] = { text: String(++nextNum), letter: null, pos: 0, superset: false };
    }
  });
  return out;
}

/* Une carte de séance = un bloc. Un superset entier tient sur une
   seule carte : dans la salle on fait A1 puis A2 sans repos, alors
   les faire glisser l'un après l'autre n'avait aucun sens. */
function groupBlocks(exs) {
  const badges = supersetLabels(exs);
  return supersetRuns(exs).map((members) => ({
    members,
    superset: members.length > 1,
    letter: badges[members[0]].letter,
  }));
}

/* Première valeur numérique d'une consigne « 8-10 » → 8 */
const firstNum = (s, fallback) => {
  const m = String(s ?? "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : fallback;
};

/* L'état de départ d'un exercice : ce que tu as fait la dernière
   fois. `skipped` = passé aujourd'hui, réversible jusqu'à la fin. */
function initState(ex) {
  const last = lastEntry(ex.name);
  if (ex.kind === "cardio") {
    const lc = cardioLog(last) ? last : null;
    return {
      done: [], last: lc, skipped: false, target: 1,
      draft: {
        minutes: ex.minutes || (lc ? lc.minutes : 20),
        distance: null, calories: null,
        intensity: lc && lc.intensity ? lc.intensity : 2,
      },
    };
  }
  const lw = last && !cardioLog(last) ? last : null;
  const lastTop = lw && lw.perSet
    ? lw.perSet.reduce((a, b) => (b.weight > a.weight ? b : a))
    : null;
  return {
    done: [],
    last: lw,
    skipped: false,
    draft: {
      weight: lastTop ? lastTop.weight : (lw ? lw.weight : 0),
      reps: lastTop ? lastTop.reps : (lw ? lw.reps : firstNum(ex.reps, 10)),
    },
    target: ex.sets || (lw ? lw.sets : 3),
    nudge: plateauOf(ex.name),
  };
}

/* Même poids aux 3 dernières séances d'un exercice → on SUGGÈRE
   d'en rajouter. Rien ne change tant qu'on ne touche pas
   « Essayer » : le poids de départ reste celui de la dernière fois. */
function plateauOf(name) {
  const topOf = (l) => (l.perSet ? Math.max(...l.perSet.map((x) => x.weight)) : l.weight);
  const last3 = DB.logs
    .filter((l) => l.exercise === name && !cardioLog(l))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 3);
  if (last3.length < 3) return null;
  const w = topOf(last3[0]);
  if (!(w > 0) || !last3.every((l) => topOf(l) === w)) return null;
  return { weight: w, next: w + (w >= 100 ? 5 : 2.5), n: 3 };
}

/* ── Ouverture ────────────────────────────────────────────── */
/* `program.free` = séance libre : pas de programme, on ajoute les
   exercices au fil de l'eau. `resume` = une séance interrompue
   (app fermée, appel, batterie) qu'on rouvre là où elle était. */
function startSession(program, resume = null) {
  if (!resume && !program.free && !program.exercises.length) { toast("Ce programme n'a pas encore d'exercices"); return; }

  S.program = program;
  if (resume) {
    S.exercises = resume.exercises;
    S.state = resume.state;
    S.logIds = new Map(resume.logIds || []);
    S.startedAt = resume.startedAt;
    S.beatenPRs = resume.beatenPRs || [];
    S.goalsHit = resume.goalsHit || [];
    sEl("session-note").value = resume.note || "";
  } else {
    S.exercises = program.exercises.map((e) => ({ ...e }));
    S.state = S.exercises.map(initState);
    S.logIds = new Map();
    S.startedAt = Date.now();
    S.beatenPRs = [];
    S.goalsHit = [];
    sEl("session-note").value = "";
  }
  S.blocks = groupBlocks(S.exercises);
  S.idx = resume ? Math.max(0, Math.min(resume.idx || 0, S.blocks.length - 1)) : 0;

  buildCards();
  sEl("program-name").textContent = program.name;
  sEl("sheet-title").textContent = program.name;
  headCount();
  sEl("stat-time").textContent = "0:00";
  sEl("clock").textContent = mmss(Date.now() - S.startedAt);

  sessionRoot().hidden = false;
  S.open = true;
  document.body.classList.add("in-session");
  requestAnimationFrame(() => {
    sessionLayout();
    sPos.hold(S.idx);
    progressS.hold(doneSets() / (totalSets() || 1));
    updateButton();
    presentS.to(1, { damping: 1, response: 0.42 });
  });
  saveLive();

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

/* ── Séance en cours, gardée au chaud ──────────────────────
   Tout l'état de la séance est recopié dans localStorage à chaque
   changement. Si l'app se ferme en pleine séance, la rouvrir y
   ramène — jusqu'à 6 h plus tard ; au-delà, c'est une séance
   oubliée, et ses séries sont déjà dans l'historique de toute
   façon (chaque exercice bouclé s'y écrit tout de suite). */
const LIVE_MAX = 6 * 3600 * 1000;

function saveLive() {
  if (!S.open || !S.program) return;
  try {
    localStorage.setItem(K.live, JSON.stringify({
      program: { id: S.program.id || null, name: S.program.name, free: !!S.program.free },
      exercises: S.exercises, state: S.state, logIds: [...S.logIds],
      startedAt: S.startedAt, idx: S.idx, beatenPRs: S.beatenPRs, goalsHit: S.goalsHit,
      note: sEl("session-note").value, savedAt: Date.now(),
    }));
  } catch (_) {}
}
function clearLive() { try { localStorage.removeItem(K.live); } catch (_) {} }

function resumeLive() {
  const d = load(K.live, null);
  if (!d || !Array.isArray(d.exercises)) return false;
  if (Date.now() - (d.savedAt || 0) > LIVE_MAX) { clearLive(); return false; }
  const program = (d.program.id && DB.programs.find((p) => p.id === d.program.id))
    || { id: d.program.id, name: d.program.name, free: d.program.free, exercises: [] };
  startSession(program, d);
  setTimeout(() => toast("Séance reprise là où tu l'avais laissée"), 500);
  return true;
}

function headCount() {
  sEl("head-count").textContent = S.blocks.length ? `${S.idx + 1} sur ${S.blocks.length}` : "aucun exercice";
}

function closeSession() {
  clearLive();
  clearInterval(S.clockTimer);
  presentS.to(0, { damping: 1, response: 0.36 });
  refreshAll();
}

/* ── Les cartes ───────────────────────────────────────────── */
function buildCards() {
  const stack = sEl("stack"), dotsEl = sEl("dots");
  stack.innerHTML = ""; dotsEl.innerHTML = "";

  /* Séance libre qui commence : rien encore, on invite à ajouter. */
  if (!S.blocks.length) {
    stack.innerHTML =
      `<article class="card"><div class="card-inner empty-session">
         <span class="badge">Séance libre</span>
         <h2 class="ex-name">Qu'est-ce qu'on fait aujourd'hui ?</h2>
         <p class="ex-target">Ajoute un premier exercice — les suivants s'ajoutent au fil de la séance, avec le bouton sous chaque carte. À la fin, tu pourras en faire un programme.</p>
       </div></article>`;
    S.cards = []; S.dots = [];
    return;
  }

  S.cards = S.blocks.map((blk) => {
    const el = document.createElement("article");
    el.className = "card" + (blk.superset ? " card-ss" : "");
    el.innerHTML = `<div class="card-inner">${blk.superset ? ssHead(blk) : soloHead(blk.members[0])}<ol class="sets"></ol></div>`;
    stack.appendChild(el);

    const d = document.createElement("span");
    d.className = "dot";
    dotsEl.appendChild(d);

    return { el, sets: el.querySelector(".sets") };
  });
  S.dots = [...dotsEl.children];
  S.cards.forEach((_, b) => renderCard(b));
}

/* Combien de rangées pour un exercice : sa cible, ou plus si des
   séries en trop ont été validées. */
/* Un exercice passé n'attend plus rien : il garde seulement les
   séries déjà faites. */
const nRows = (i) => S.state[i].skipped
  ? S.state[i].done.length
  : Math.max(S.state[i].target, S.state[i].done.length);
const ssRounds = (blk) => Math.max(0, ...blk.members.map(nRows));

const lastTxt = (i) => {
  const st = S.state[i];
  if (!st.last) return `<b>première fois</b>`;
  if (cardioLog(st.last)) return `dernière fois <b>${fmt(st.last.minutes)} min</b>`;
  return `dernière fois <b>${fmt(st.last.perSet ? Math.max(...st.last.perSet.map((s) => s.weight)) : st.last.weight)} lb</b>`;
};

/* En-tête d'un exercice seul. */
function soloHead(i) {
  const ex = S.exercises[i], st = S.state[i];
  const target = ex.kind === "cardio"
    ? [`<b>Cardio</b>`, ex.minutes ? `<b>${fmt(ex.minutes)}</b> min visées` : null].filter(Boolean).join(" · ")
    : [
      st.target ? `<b>${st.target}</b> séries` : null,
      ex.reps ? `<b>${esc(ex.reps)}</b> reps` : null,
    ].filter(Boolean).join(" · ");
  const note = DB.notes[ex.name];
  return `<h2 class="ex-name">${esc(ex.name)}</h2>` +
    `<p class="ex-target">${target ? `<span>${target}</span><span class="dot-sep"></span>` : ""}<span>${lastTxt(i)}</span></p>` +
    (note ? `<p class="ex-note">${esc(note)}</p>` : "") +
    techLink(ex.name);
}

/* Le lien vers la vidéo de technique : il s'ouvre à côté (YouTube,
   TikTok…), la séance reste où elle est. */
const LINK_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
function techLink(name, withName = false) {
  const url = DB.links[name];
  if (!url) return "";
  return `<a class="tech-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${LINK_IC}` +
    `<span>${withName ? `${esc(name)} — ` : ""}voir la technique</span></a>`;
}

/* En-tête d'un superset : les noms enchaînés, puis le nombre de
   tours. Le détail séries/reps se lit dans les rangées — le répéter
   ici pousserait le premier tour hors de l'écran. */
function ssHead(blk) {
  const names = blk.members
    .map((i) => `<span>${esc(S.exercises[i].name)}</span>`)
    .join(`<i aria-hidden="true">+</i>`);
  const notes = blk.members
    .filter((i) => DB.notes[S.exercises[i].name])
    .map((i) => `<p class="ex-note"><b>${esc(S.exercises[i].name)}</b> — ${esc(DB.notes[S.exercises[i].name])}</p>`)
    .join("");
  return `<span class="badge">Superset ${blk.letter}</span>` +
    `<h2 class="ex-name ss-title">${names}</h2>` +
    `<p class="ex-target"><b>${ssRounds(blk)}</b> tours<span class="dot-sep"></span>` +
    `<span>${blk.members.length} exercices enchaînés</span></p>` +
    notes +
    blk.members.map((i) => techLink(S.exercises[i].name, true)).join("");
}

/* La série en attente d'un bloc : on descend tour par tour, et dans
   un tour on suit l'ordre des exercices. C'est l'ordre réel du
   superset — A1, A2, puis on remonte au tour suivant. */
function activeCell(b) {
  const blk = S.blocks[b];
  for (let r = 0; r < ssRounds(blk); r++) {
    for (let k = 0; k < blk.members.length; k++) {
      const i = blk.members[k];
      if (r < nRows(i) && S.state[i].done.length === r) return { i, k, r };
    }
  }
  return null;
}

function renderCard(b) {
  const blk = S.blocks[b], ol = S.cards[b].sets;
  ol.innerHTML = "";
  blk.members.forEach((i) => { const n = nudgeRow(i, blk); if (n) ol.appendChild(n); });
  S.cards[b].el.classList.toggle("is-skipped", blk.members.every((i) => S.state[i].skipped));

  if (!blk.superset) {
    const i = blk.members[0];
    if (S.exercises[i].kind === "cardio") ol.appendChild(cardioRow(i));
    else {
      for (let j = 0; j < nRows(i); j++) {
        ol.appendChild(setRow(i, j, String(j + 1), null, j === S.state[i].done.length));
      }
    }
    appendSkipped(ol, blk);
    appendAddMore(ol);
    saveLive();
    return;
  }

  const cell = activeCell(b);
  for (let r = 0; r < ssRounds(blk); r++) {
    const head = document.createElement("li");
    head.className = "round-key" +
      (blk.members.every((i) => r >= nRows(i) || S.state[i].done.length > r) ? " done" : "");
    head.innerHTML = `<span>Tour ${r + 1}</span>`;
    ol.appendChild(head);
    blk.members.forEach((i, k) => {
      if (r >= nRows(i)) return;
      ol.appendChild(setRow(i, r, `${blk.letter}${k + 1}`, S.exercises[i].name,
        !!cell && cell.i === i && cell.r === r));
    });
  }
  appendSkipped(ol, blk);
  appendAddMore(ol);
  saveLive();
}

/* En séance libre, on bâtit la séance au fil de l'eau : le bouton
   pour ajouter l'exercice suivant est sous CHAQUE carte, là où on
   regarde — pas caché dans le menu ⋯. */
function appendAddMore(ol) {
  if (!S.program || !S.program.free) return;
  const li = document.createElement("li");
  li.className = "add-more";
  li.innerHTML = `<button type="button" class="tile-btn">` +
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Ajouter un exercice</button>`;
  li.querySelector("button").addEventListener("click", () => { buzz(8); addToSession(); });
  ol.appendChild(li);
}

/* La bulle de progression : seulement avant la première série,
   et une seule fois — « Pas aujourd'hui » la fait disparaître. */
function nudgeRow(i, blk) {
  const st = S.state[i], nd = st.nudge;
  if (!nd || st.nudgeSeen || st.skipped || st.done.length) return null;
  const li = document.createElement("li");
  li.className = "nudge";
  li.innerHTML =
    `<span class="nudge-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg></span>` +
    `<span class="nudge-txt"><b>${nd.n} séances de suite à ${fmt(nd.weight)} lb${blk.superset ? ` · ${esc(S.exercises[i].name)}` : ""}</b>` +
    `<span>Let's go — essaie <em>${fmt(nd.next)} lb</em> aujourd'hui ?</span></span>` +
    `<span class="nudge-act"><button type="button" class="nudge-yes">Essayer ${fmt(nd.next)} lb</button>` +
    `<button type="button" class="nudge-no">Pas aujourd'hui</button></span>`;
  li.querySelector(".nudge-yes").addEventListener("click", () => {
    st.draft.weight = nd.next;
    st.nudgeSeen = true;
    buzz([8, 30, 12]);
    const b = S.blocks.indexOf(blk);
    renderCard(b);
    const num = S.cards[b].sets.querySelector(`.set.active[data-ex="${i}"] .num[data-k="weight"]`);
    if (num) pop(num, 1.18, 0.55);
  });
  li.querySelector(".nudge-no").addEventListener("click", () => {
    st.nudgeSeen = true;
    buzz(6);
    renderCard(S.blocks.indexOf(blk));
  });
  return li;
}

/* Un exercice passé laisse une ligne sur sa carte, avec de quoi
   revenir sur la décision — passer n'est jamais définitif. */
function appendSkipped(ol, blk) {
  blk.members.forEach((i) => {
    if (!S.state[i].skipped) return;
    const li = document.createElement("li");
    li.className = "skip-row";
    li.innerHTML =
      `<span class="skip-txt"><b>${esc(S.exercises[i].name)}</b> passé aujourd'hui` +
      `${S.state[i].done.length ? ` · ${S.state[i].done.length} série${S.state[i].done.length > 1 ? "s" : ""} gardée${S.state[i].done.length > 1 ? "s" : ""}` : ""}</span>` +
      `<button type="button" class="skip-undo">Reprendre</button>`;
    li.querySelector("button").addEventListener("click", () => toggleSkip(i));
    ol.appendChild(li);
  });
}

/* La carte d'un cardio : pas de séries, un seul relevé. La durée
   est obligatoire, distance et calories se laissent vides. */
function cardioRow(i) {
  const st = S.state[i], rec = st.done[0];
  const li = document.createElement("li");
  li.dataset.ex = String(i);
  li.dataset.r = "0";

  if (rec) {
    li.className = "set done cardio-done";
    li.innerHTML = `<span class="set-idx">${CARDIO_ICON}</span>` +
      `<span class="set-vals"><span class="num">${esc(cardioText(rec))}</span></span>` +
      `<span class="set-check">${CHECK}</span>`;
    return li;
  }
  if (st.skipped) { li.hidden = true; return li; }

  const d = st.draft, lc = st.last;
  const field = (k, label, unit, main) =>
    `<label class="cf${main ? " main" : ""}"><span class="cf-key">${label}</span>` +
    `<span class="cf-in"><input type="number" inputmode="decimal" min="0" step="any" data-k="${k}"` +
    ` value="${d[k] ?? ""}" placeholder="${lc && lc[k] ? fmt(lc[k]) : "—"}"><em>${unit}</em></span></label>`;

  li.className = "cardio-form";
  li.innerHTML =
    `<div class="cf-grid">${field("minutes", "Durée", "min", true)}${field("distance", "Distance", "km")}${field("calories", "Calories", "cal")}</div>` +
    `<p class="cf-key cf-int-key">Intensité</p>` +
    `<div class="segmented intensity" role="radiogroup" aria-label="Intensité">` +
    [1, 2, 3].map((n) => `<button type="button" role="radio" data-int="${n}" class="${d.intensity === n ? "on" : ""}" aria-checked="${d.intensity === n}">${INTENSITY[n]}</button>`).join("") +
    `</div>`;

  li.querySelectorAll("input[data-k]").forEach((inp) => {
    inp.addEventListener("input", () => {
      const v = inp.value.trim() === "" ? null : Number(inp.value.replace(",", "."));
      d[inp.dataset.k] = Number.isFinite(v) && v >= 0 ? v : null;
      saveLive();
    });
  });
  li.querySelector(".intensity").addEventListener("click", (e) => {
    const bt = e.target.closest("[data-int]");
    if (!bt) return;
    d.intensity = Number(bt.dataset.int);
    li.querySelectorAll("[data-int]").forEach((x) => {
      const on = x === bt;
      x.classList.toggle("on", on);
      x.setAttribute("aria-checked", String(on));
    });
    buzz(6);
  });
  return li;
}

const CARDIO_ICON = '<svg viewBox="0 0 24 24" class="cardio-ic" aria-hidden="true"><path d="M3 12h4l2.5-6 4 12 2.5-6H21"/></svg>';

/* Une rangée de série. `name` n'est rempli que dans un superset :
   sans lui on ne saurait pas de quel exercice parle la rangée. */
function setRow(i, j, tag, name, active) {
  const st = S.state[i], rec = st.done[j];
  const li = document.createElement("li");
  li.className = "set" + (rec ? " done" : active ? " active" : "") + (name ? " ss-set" : "");
  li.dataset.ex = String(i);
  li.dataset.r = String(j);

  let vals;
  if (rec) {
    vals = `<span class="num">${fmt(rec.weight)}</span><span class="unit">lb</span><span class="times">×</span><span class="num">${rec.reps}</span>`;
  } else if (active) {
    const unset = !st.last && !st.draft.weight ? " unset" : "";
    vals = `<span class="num${unset}" data-k="weight">${fmt(st.draft.weight)}</span><span class="unit">lb</span><span class="times">×</span><span class="num" data-k="reps">${st.draft.reps}</span>`;
  } else {
    /* Série à venir : elle partira de la valeur en cours, alors on
       la montre en pâle — suivie au doigt quand on tire un chiffre. */
    const unset = !st.last && !st.draft.weight;
    vals = `<span class="num" data-plan="weight">${unset ? "—" : fmt(st.draft.weight)}</span><span class="unit">lb</span><span class="times">×</span><span class="num" data-plan="reps">${st.draft.reps}</span>`;
  }

  li.innerHTML =
    `<span class="set-idx">${esc(tag)}</span>` +
    (name
      ? `<span class="ss-cell"><span class="ss-ex">${esc(name)}</span><span class="set-vals">${vals}</span></span>`
      : `<span class="set-vals">${vals}</span>`) +
    `<span class="set-check">${CHECK}</span>` +
    (active && !st.last && !st.draft.weight
      ? `<p class="scrub-hint">Première fois sur cet exercice — règle le poids en le tirant vers le haut</p>`
      : active && !localStorage.getItem(K.scrub)
      ? `<p class="scrub-hint">Tire un chiffre vers le haut ou le bas</p>`
      : "");

  if (active) li.querySelectorAll(".num[data-k]").forEach((el) => bindScrub(el, el.dataset.k, i));
  return li;
}

/* Dans un superset, la série suivante change d'exercice : si elle
   tombe hors de l'écran, on va la chercher. */
function revealActive(b) {
  const card = S.cards[b].el, row = card.querySelector(".set.active");
  if (!row) return;
  const cr = card.getBoundingClientRect(), rr = row.getBoundingClientRect();
  if (rr.top >= cr.top + 24 && rr.bottom <= cr.bottom - 24) return;
  row.scrollIntoView({ behavior: REDUCED.matches ? "auto" : "smooth", block: "center" });
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
      document.querySelectorAll(`#stack .set:not(.done):not(.active)[data-ex="${i}"] .num[data-plan="${kind}"]`)
        .forEach((n) => { n.textContent = el.textContent; });
      if (!g.learned) { g.learned = true; localStorage.setItem(K.scrub, "1"); }
      buzz(4);
      pop(el, 1.06, 0.7);
    }
  });
  const end = (e) => {
    if (!g || e.pointerId !== g.id) return;
    el.classList.remove("scrubbing");
    uncapture(el, e.pointerId);
    g = null;
    saveLive();
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
    const base = blockDone(i) ? "color-mix(in srgb, var(--accent) 45%, transparent)" : "var(--dot)";
    S.dots[i].style.transform = `scale(${1 + 0.95 * t})`;
    S.dots[i].style.background = t > 0.02 ? `color-mix(in srgb, var(--accent) ${Math.round(t * 100)}%, ${base})` : base;
  }
}

function sessionLayout() { pageW = sEl("stack").clientWidth || 1; paintStack(sPos.x); }
addEventListener("resize", () => { if (S.open) sessionLayout(); });

const exDone = (i) => S.state[i] && (S.state[i].skipped || S.state[i].done.length >= S.state[i].target);
const blockDone = (b) => S.blocks[b] && S.blocks[b].members.every(exDone);
const allDone = () => S.state.every((_, i) => exDone(i));
const doneSets = () => S.state.reduce((n, s) => n + s.done.length, 0);
const totalSets = () => S.state.reduce((n, s) => n + (s.skipped ? s.done.length : Math.max(s.target, s.done.length)), 0);

let sDrag = null;
function initStackGestures() {
  const stack = sEl("stack");
  stack.addEventListener("pointerdown", (e) => {
    /* Les champs du cardio se tapent : un glissé qui partirait
       d'eux changerait de carte au lieu de placer le curseur. */
    if (e.target.closest(".num[data-k], input")) return;
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
  headCount();
  updateButton();
  saveLive();
}

/* ── Progression, bouton ──────────────────────────────────── */
const progressS = new Spring(0, { response: 0.5, damping: 1, restDelta: 0.001,
  onUpdate: (v) => { sEl("progress-fill").style.transform = `scaleX(${v})`; } });
const fillS = new Spring(0, { response: 0.38, damping: 1, restDelta: 0.002,
  onUpdate: (v) => { const f = sEl("primary-fill"); f.style.transform = `scaleY(${v})`; f.style.opacity = String(v); } });

function updateButton() {
  if (!S.blocks.length) {
    sEl("commit-label").textContent = "Ajouter un exercice";
    sEl("commit").classList.add("go");
    fillS.to(1);
    return;
  }
  const blk = S.blocks[S.idx], cell = activeCell(S.idx);
  let label, go;
  if (cell) {
    /* Dans un superset le bouton dit quel exercice il valide : la
       rangée active est plus bas dans la carte, pas sous le pouce. */
    label = blk.superset
      ? `Valider ${blk.letter}${cell.k + 1} · tour ${cell.r + 1}`
      : S.exercises[cell.i].kind === "cardio" ? "Valider le cardio"
      : `Valider la série ${cell.r + 1}`;
    go = false;
  }
  else if (allDone()) { label = "Terminer la séance"; go = true; }
  else { label = S.blocks[nextIncomplete()].superset ? "Superset suivant" : "Exercice suivant"; go = true; }
  sEl("commit-label").textContent = label;
  sEl("commit").classList.toggle("go", go);
  fillS.to(go ? 1 : 0);
}

function nextIncomplete() {
  for (let k = 1; k <= S.cards.length; k++) {
    const b = (S.idx + k) % S.cards.length;
    if (!blockDone(b)) return b;
  }
  return S.idx;
}

/* ── Valider une série ────────────────────────────────────── */
function commitSet() {
  const b = S.idx, blk = S.blocks[b], cell = activeCell(b);
  if (!cell) return;
  const st = S.state[cell.i], ex = S.exercises[cell.i];
  const cardio = ex.kind === "cardio";
  if (cardio && !(st.draft.minutes > 0)) { toast("Entre au moins une durée"); return; }
  if (cardio && document.activeElement) document.activeElement.blur();
  const entry = { ...st.draft };
  const prev = DB.prs[ex.name] ?? 0;
  const isPR = !cardio && entry.weight > prev;

  st.done.push(entry);
  renderCard(b);
  const row = S.cards[b].sets.querySelector(`[data-ex="${cell.i}"][data-r="${cell.r}"]`);
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

  if (exDone(cell.i) || S.logIds.has(cell.i)) flushExercise(cell.i);

  /* Un objectif atteint a son propre bandeau — après celui du
     record s'il y en a un, pour que les deux se lisent. */
  const hit = checkGoals();
  if (hit.length) {
    S.goalsHit.push(...hit.map((g) => g.id));
    const g = hit[0];
    setTimeout(() => {
      showBanner("Objectif atteint", `${g.exercise} · ${fmt(g.target)} ${GOAL_UNIT[g.metric]}`);
      buzz([12, 40, 12, 40, 24]);
    }, isPR ? 2600 : 0);
  }
  saveLive();

  /* On ne quitte la carte qu'une fois le bloc entier bouclé — sinon
     un superset renverrait ailleurs entre A1 et A2. */
  if (blockDone(b)) {
    if (!allDone()) {
      setTimeout(() => { if (blockDone(b) && S.idx === b) goTo(nextIncomplete()); }, isPR ? 900 : 420);
    }
  } else if (blk.superset) {
    revealActive(b);
  }
}

/* Un exercice terminé devient UNE entrée d'historique, avec le
   détail par série. On l'écrit dès qu'il est bouclé : si l'app
   se ferme en pleine séance, rien n'est perdu. */
function flushExercise(i) {
  const st = S.state[i], ex = S.exercises[i];
  if (!st.done.length) return;

  let fields;
  if (ex.kind === "cardio") {
    const d = st.done[st.done.length - 1];
    fields = { kind: "cardio", minutes: d.minutes, distance: d.distance || null,
      calories: d.calories || null, intensity: d.intensity || null };
  } else {
    const perSet = st.done.map((d) => ({ weight: d.weight, reps: d.reps }));
    const top = perSet.reduce((a, b) => (b.weight > a.weight ? b : a));
    fields = { weight: top.weight, reps: top.reps, sets: perSet.length, perSet };
  }

  const id = S.logIds.get(i);
  if (id && updateLog(id, fields)) return;
  const { log } = addLog({ exercise: ex.name, ...fields, programId: S.program.id, programName: S.program.name });
  S.logIds.set(i, log.id);
}

/* ── Célébration ──────────────────────────────────────────── */
let bannerTimer = 0;
const bannerS = new Spring(0, { response: 0.42, damping: 0.8, restDelta: 0.003, onUpdate: (v) => {
  const b = sEl("pr-banner");
  b.style.transform = `translate3d(0,${(v - 1) * 140}%,0)`;
  b.style.opacity = String(Math.max(0, Math.min(1, v * 1.6)));
} });

function showBanner(title, detail) {
  sEl("pr-banner").querySelector(".pr-text strong").textContent = title;
  sEl("pr-detail").textContent = detail;
  bannerS.to(1, { damping: 0.78, response: 0.44 });
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => bannerS.to(0, { damping: 1, response: 0.4 }), 2300);
}

function celebrate(name, weight, row) {
  showBanner("Record personnel", `${name} · ${fmt(weight)} lb`);

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
  /* La feuille garde son défilement d'une séance à l'autre : sans
     ça, la seconde s'ouvrait sans son en-tête. Après l'avoir
     affichée — un élément caché ignore scrollTop. */
  sEl("sc-sheet").querySelector(".sheet-scroll").scrollTop = 0;
  sheetH = sEl("sc-sheet").offsetHeight || 1;
  scSheetY.hold(sheetH);
  scSheetY.to(0, { velocity: 0, damping: 0.82, response: 0.46 });
  buzz([10, 40, 10, 40, 18]);
}
/* Seul « Terminer la séance » termine. Refermer la feuille autrement
   (toucher en haut, la glisser vers le bas, « Continuer ») ramène à
   la séance : le X n'est plus un point de non-retour. */
function closeSummary(velocity = 0, finish = false) {
  if (closingSheet) return;
  closingSheet = true;
  scSheetY.to(sheetH, { velocity, damping: 1, response: 0.34 });
  if (finish) {
    saveSessionNote();
    setTimeout(closeSession, 180);
    return;
  }
  clearInterval(S.clockTimer);
  S.clockTimer = setInterval(() => {
    sEl("clock").textContent = mmss(Date.now() - S.startedAt);
  }, 1000);
  saveLive();
  buzz(8);
}

function fillSummary() {
  sEl("stat-time").textContent = mmss(Date.now() - S.startedAt);
  const vol = S.state.reduce((n, s) => n + s.done.reduce((m, x) => m + (x.weight || 0) * (x.reps || 0), 0), 0);
  sEl("stat-volume").textContent = Math.round(vol).toLocaleString("fr-CA");
  sEl("stat-sets").textContent = String(doneSets());

  sEl("pr-block").hidden = S.beatenPRs.length === 0;
  sEl("pr-list").innerHTML = S.beatenPRs.map((p) =>
    `<li><b>${esc(p.name)}</b><i>${p.prev ? `avant ${fmt(p.prev)}` : "premier record"}</i><span>${fmt(p.weight)} lb</span></li>`).join("");

  /* Objectifs atteints pendant la séance, et jalons débloqués par
     elle — chacun n'est fêté qu'une fois. */
  const goals = (S.goalsHit || []).map((id) => DB.goals.find((g) => g.id === id)).filter(Boolean);
  const badges = newBadges();
  sEl("win-block").hidden = !goals.length && !badges.length;
  sEl("win-list").innerHTML =
    goals.map((g) => `<li><span class="win-ic">${GOAL_IC}</span><span class="win-t"><b>Objectif atteint</b>` +
      `<i>${esc(g.exercise)} · ${fmt(g.target)} ${GOAL_UNIT[g.metric]}</i></span></li>`).join("") +
    badges.map((b) => `<li><span class="win-ic badge-ic">${esc(b.big)}</span><span class="win-t"><b>${esc(b.title)}</b>` +
      `<i>Jalon débloqué</i></span></li>`).join("");

  /* Une séance libre réussie peut devenir un programme. */
  sEl("save-as-prog").hidden = !(S.program.free && S.exercises.some((_, i) => S.state[i].done.length));

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

const GOAL_IC = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/></svg>';

/* Séance libre → programme. Seuls les exercices réellement faits
   sont gardés, avec le nombre de séries faites. Les entrées de la
   séance sont rattachées au nouveau programme : elles prennent sa
   couleur dans l'historique. */
function saveFreeAsProgram() {
  const d = new Date();
  const exercises = [];
  S.exercises.forEach((e, i) => {
    const st = S.state[i];
    if (!st.done.length) return;
    exercises.push(e.kind === "cardio"
      ? { name: e.name, kind: "cardio", minutes: e.minutes || st.done[0].minutes || null, group: exercises.length }
      : { name: e.name, sets: st.done.length, reps: e.reps || String(st.done[0].reps), group: exercises.length });
  });
  const p = { id: uid(), name: `Séance du ${d.getDate()} ${MOIS_L[d.getMonth()]}`, accent: nextAccent(), exercises };
  DB.programs.push(p);
  persist.programs();
  S.logIds.forEach((id) => { const l = DB.logs.find((x) => x.id === id); if (l) { l.programId = p.id; l.programName = p.name; } });
  persist.logs();
  sEl("save-as-prog").hidden = true;
  buzz(9);
  toast(`« ${p.name} » ajouté à tes programmes`);
}

/* La note de séance s'écrit en refermant la feuille, quel que
   soit le chemin (bouton, voile, glissé). Vide = rien d'écrit. */
function saveSessionNote() {
  const el = sEl("session-note"), text = el.value.trim();
  el.blur();
  if (!text || !S.program) return;
  DB.journal.push({ id: uid(), date: today(), createdAt: Date.now(),
    programId: S.program.id, programName: S.program.name, text });
  persist.journal();
  el.value = "";
}

/* ══ Modifier la séance en cours ════════════════════════════
   Tout ce qui se change ici ne vaut que pour AUJOURD'HUI : le
   programme ne bouge pas, sauf si on coche explicitement « garder
   dans le programme » en ajoutant un exercice. */

/* Reconstruit la pile après un changement de structure (exercice
   ajouté ou remplacé) et se place sur la carte de `focusEx`. */
function rebuildStack(focusEx, animate = false) {
  const from = S.idx;
  S.blocks = groupBlocks(S.exercises);
  buildCards();
  const b = Math.max(0, S.blocks.findIndex((bl) => bl.members.includes(focusEx)));
  sessionLayout();
  if (animate && b !== from) {
    sPos.hold(Math.min(from, S.cards.length - 1));
    S.idx = -1;
    goTo(b);
  } else {
    S.idx = b;
    sPos.hold(b);
  }
  headCount();
  progressS.to(doneSets() / (totalSets() || 1));
  updateButton();
  saveLive();
}

/* Après un changement qui ne touche qu'une carte (séries, passer). */
function refreshBlockOf(i) {
  const b = S.blocks.findIndex((bl) => bl.members.includes(i));
  if (b >= 0) renderCard(b);
  if (exDone(i) || S.logIds.has(i)) flushExercise(i);
  progressS.to(doneSets() / (totalSets() || 1));
  paintStack(sPos.x);
  updateButton();
}

function toggleSkip(i) {
  const st = S.state[i];
  st.skipped = !st.skipped;
  buzz(st.skipped ? [8, 30, 8] : 9);
  refreshBlockOf(i);
  toast(st.skipped ? `${S.exercises[i].name} passé` : `${S.exercises[i].name} repris`);
  const b = S.idx;
  if (st.skipped && blockDone(b) && !allDone()) setTimeout(() => { if (S.idx === b) goTo(nextIncomplete()); }, 380);
}

const MENU_IC = {
  swap: '<svg viewBox="0 0 24 24" class="tick"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>',
  skip: '<svg viewBox="0 0 24 24" class="tick"><path d="M6 5v14l9-7zM18 5v14"/></svg>',
  resume: '<svg viewBox="0 0 24 24" class="tick"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/></svg>',
  hist: '<svg viewBox="0 0 24 24" class="tick"><path d="M3 12a9 9 0 1 0 2.6-6.4"/><path d="M3 4v4h4"/><path d="M12 8v4.5l3 1.8"/></svg>',
  add: '<svg viewBox="0 0 24 24" class="tick"><path d="M12 5v14M5 12h14"/></svg>',
};

function sessionMenu(focus) {
  const blk = S.blocks[S.idx];
  if (!blk) { addToSession(); return; }
  const cell = activeCell(S.idx);
  const i = focus != null && blk.members.includes(focus) ? focus : (cell ? cell.i : blk.members[0]);
  const ex = S.exercises[i], st = S.state[i];
  const cardio = ex.kind === "cardio";
  const doneTxt = `${st.done.length} faite${st.done.length > 1 ? "s" : ""}`;

  openSheet(
    `<p class="sheet-kicker">Cette séance seulement</p>
     <h2 class="sheet-h">${esc(ex.name)}</h2>
     ${blk.superset ? `<div class="segmented small who" id="sm-who">${blk.members.map((m, k) =>
        `<button type="button" data-i="${m}" class="${m === i ? "on" : ""}">${blk.letter}${k + 1} · ${esc(S.exercises[m].name)}</button>`).join("")}</div>` : ""}
     ${!cardio && !st.skipped ? stepperRow("sm-count", st.target, { label: "Séries", sub: doneTxt }) : ""}
     <div class="menu-list">
       ${st.done.length ? "" : `<button type="button" class="pick-row" id="sm-swap"><span>Remplacer par un autre exercice</span>${MENU_IC.swap}</button>`}
       <button type="button" class="pick-row${st.skipped ? "" : " warn"}" id="sm-skip">
         <span>${st.skipped ? "Reprendre cet exercice" : "Passer cet exercice"}
           <em class="pick-sub">${st.skipped ? "Il revient dans la séance" : st.done.length ? "Les séries déjà faites sont gardées" : "Rien n'est écrit dans l'historique"}</em></span>
         ${st.skipped ? MENU_IC.resume : MENU_IC.skip}</button>
       <button type="button" class="pick-row" id="sm-hist">
         <span>Historique de cet exercice<em class="pick-sub">${histCount(ex.name)}</em></span>
         ${MENU_IC.hist}</button>
     </div>
     ${globalHTML(ex.name)}
     <p class="block-key">Séance</p>
     <div class="menu-list">
       <button type="button" class="pick-row" id="sm-add"><span>Ajouter un exercice</span>${MENU_IC.add}</button>
     </div>
     ${ficheFoot()}`
  );

  /* Les séries ne descendent jamais sous ce qui est déjà fait. */
  const count = !cardio && !st.skipped
    ? bindStepper("sm-count", { min: Math.max(1, st.done.length), max: 20 })
    : null;
  const glob = bindGlobal(ex.name);

  /* Ce qui a été changé s'écrit avant toute action : passer ou
     remplacer ne jette pas le nombre de séries ni la note. Renvoie
     faux si quelque chose cloche (un lien invalide). */
  const commit = () => {
    const err = glob.check();
    if (err) { toast(err); return false; }
    const n = count ? count() : null;
    const noteBefore = DB.notes[ex.name] || "", linkBefore = DB.links[ex.name] || "";
    glob.apply();
    const techChanged = (DB.notes[ex.name] || "") !== noteBefore || (DB.links[ex.name] || "") !== linkBefore;
    if (n && n !== st.target) { st.target = n; refreshBlockOf(i); saveLive(); }
    if (techChanged) rebuildStack(i);
    return true;
  };
  const then = (fn) => () => {
    if (!commit()) return;
    closeSheet();
    onSheetClose = fn;
  };

  if (blk.superset) {
    $("sm-who").addEventListener("click", (e) => {
      const bt = e.target.closest("[data-i]");
      if (!bt || Number(bt.dataset.i) === i) return;
      buzz(6);
      then(() => sessionMenu(Number(bt.dataset.i)))();
    });
  }

  /* On remplace par un exercice du MÊME type : le sélecteur ne
     propose que du cardio pour un cardio, que de la musculation
     sinon — et un nom neuf prend le type de celui qu'il remplace. */
  if ($("sm-swap")) $("sm-swap").addEventListener("click", then(() => pickExercise(ex.name, (name) => {
    if (name === ex.name) return;
    const next = { ...ex, name };
    S.exercises[i] = next;
    S.state[i] = initState(next);
    rebuildStack(i);
    toast(`Remplacé par ${name}`);
  }, { kind: ex.kind === "cardio" ? "cardio" : "force" })));

  $("sm-skip").addEventListener("click", then(() => toggleSkip(i)));
  $("sm-hist").addEventListener("click", then(() => exerciseHistorySheet(ex.name)));
  $("sm-add").addEventListener("click", then(addToSession));
  $("fx-save").addEventListener("click", then(() => buzz(9)));
}

/* Ajouter un exercice à la séance en cours. En séance libre, il
   n'y a pas de programme où le garder : la case disparaît. */
function addToSession() {
  addExerciseSheet({
    session: true,
    keepable: !S.program.free,
    onAdd: (nx, { keep }) => {
      nx.group = freeGroup(S.exercises);
      S.exercises.push(nx);
      S.state.push(initState(nx));
      if (keep && !S.program.free) {
        S.program.exercises.push({ ...nx, group: freeGroup(S.program.exercises) });
        persist.programs();
      }
      rebuildStack(S.exercises.length - 1, true);
      toast(keep ? "Ajouté — et gardé dans le programme" : S.program.free ? `${nx.name} ajouté` : "Ajouté pour aujourd'hui");
    },
  });
}

/* Un lien collé sans « https:// » (youtu.be/…) est complété ; ce
   qui n'est pas une adresse web est refusé. */
function cleanUrl(raw) {
  const s = raw.trim();
  if (!s) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.href : null;
  } catch (_) { return null; }
}

/* ── Câblage ──────────────────────────────────────────────── */
function initSession() {
  initStackGestures();
  sEl("session-menu").addEventListener("click", () => sessionMenu());
  sEl("save-as-prog").addEventListener("click", saveFreeAsProgram);
  sEl("session-note").addEventListener("input", saveLive);
  sEl("commit").addEventListener("click", () => {
    if (!S.blocks.length) addToSession();
    else if (activeCell(S.idx)) commitSet();
    else if (allDone()) openSummary();
    else goTo(nextIncomplete());
  });
  /* Rien de validé : il n'y a pas de bilan à montrer, mais on
     demande quand même — un X touché par erreur ne jette pas la
     séance. */
  sEl("quit").addEventListener("click", () => {
    if (doneSets() > 0) openSummary();
    else confirmSheet("Quitter la séance ?", "Aucune série n'a été validée — rien ne sera écrit.", "Quitter", closeSession);
  });
  sEl("sheet-close").addEventListener("click", () => closeSummary(0, true));
  sEl("sheet-resume").addEventListener("click", () => closeSummary());
  sEl("sc-scrim").addEventListener("click", () => closeSummary());

  /* Glissé vers le bas pour refermer la feuille. */
  const sh = sEl("sc-sheet"), scroller = sh.querySelector(".sheet-scroll");
  let sd = null;
  sh.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, textarea")) return;
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

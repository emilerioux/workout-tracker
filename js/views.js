/* ============================================================
   views.js — les quatre onglets, la navigation poussée,
   les feuilles modales et les sélecteurs.
   ============================================================ */

const $ = (id) => document.getElementById(id);

/* Six accents de programme — identité visuelle, jamais porteuse
   d'information : le nom du programme dit déjà tout. */
const ACCENTS = [
  ["#30D158", "#1E8E44"], ["#0A84FF", "#0A5BC4"], ["#BF5AF2", "#7D3BAF"],
  ["#FF9F0A", "#C46E00"], ["#FF375F", "#B4223F"], ["#64D2FF", "#2E93BE"],
];
const accentOf = (p) => ACCENTS[(p.accent ?? 0) % ACCENTS.length];

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

function openSheet(html, opts = {}) {
  $("sheet-body").innerHTML = html;
  $("sheet").hidden = false; $("scrim").hidden = false; closingSheet2 = false;
  onSheetClose = opts.onClose || null;
  requestAnimationFrame(() => {
    sheetH2 = $("sheet").offsetHeight || 1;
    sheetY2.hold(sheetH2);
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
let pushedOpen = false, pushW = 1, onPop = null;
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
  pushW = $("app").clientWidth || 1;
  pushX.hold(1);
  pushX.to(0, { damping: 1, response: 0.44 });
  const back = $("pushed").querySelector("[data-back]");
  if (back) back.addEventListener("click", () => popView());
}
function popView(velocity = 0) {
  if (!pushedOpen) return;
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
    if (projected > 0.4) pushX.to(1, { velocity: vx, damping: 1, response: 0.36 });
    else pushX.to(0, { velocity: vx, damping: 1, response: 0.4 });
  };
  p.addEventListener("pointerup", rel);
  p.addEventListener("pointercancel", rel);
}

/* ── Sélecteur d'exercice (recherche + création) ──────────── */
function pickExercise(current, onPick) {
  const names = allExercises();
  openSheet(
    `<h2 class="sheet-h">Exercice</h2>
     <input type="search" class="input search" id="ex-search" placeholder="Chercher ou créer…" autocomplete="off">
     <div class="pick-list" id="ex-pick-list"></div>`,
    { focus: "#ex-search" }
  );
  const list = $("ex-pick-list"), search = $("ex-search");
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const hits = names.filter((n) => n.toLowerCase().includes(q));
    list.innerHTML =
      hits.map((n) => `<button type="button" class="pick-row${n === current ? " on" : ""}" data-name="${esc(n)}">
          <span>${esc(n)}</span>${n === current ? '<svg viewBox="0 0 24 24" class="tick"><path d="m5 12.5 4.5 4.5L19 7"/></svg>' : ""}
        </button>`).join("") +
      (search.value.trim() && !names.some((n) => n.toLowerCase() === q)
        ? `<button type="button" class="pick-row create" data-name="${esc(search.value.trim())}">
             <span>Créer « ${esc(search.value.trim())} »</span>
             <svg viewBox="0 0 24 24" class="tick"><path d="M12 5v14M5 12h14"/></svg></button>`
        : "") +
      (!hits.length && !search.value.trim() ? `<p class="muted pad">Aucun exercice pour l'instant. Tape un nom pour en créer un.</p>` : "");
  };
  draw();
  search.addEventListener("input", draw);
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
function renderPrograms() {
  const host = $("program-list");
  const n = streakWeeks();
  $("prog-sub").textContent = DB.programs.length
    ? (n > 1 ? `${n} semaines d'entraînement d'affilée.` : "Choisis un programme et lance-toi.")
    : "";

  if (!DB.programs.length) {
    host.innerHTML =
      `<div class="empty">
         <p class="empty-title">Rien ici pour l'instant</p>
         <p class="empty-body">Crée ton premier programme, ou récupère ceux de ton ancienne app depuis les Réglages.</p>
       </div>`;
    return;
  }

  host.innerHTML = DB.programs.map((p) => {
    const [c1, c2] = accentOf(p);
    const last = DB.logs.filter((l) => l.programId === p.id).sort((a, b) => b.createdAt - a.createdAt)[0];
    const when = last ? relDay(last.date) : "jamais faite";
    return `<button type="button" class="prog-card" data-id="${esc(p.id)}">
        <span class="prog-stripe" style="background:linear-gradient(160deg,${c1},${c2})"></span>
        <span class="prog-body">
          <span class="prog-name">${esc(p.name)}</span>
          <span class="prog-meta">${p.exercises.length} exercice${p.exercises.length > 1 ? "s" : ""} · ${esc(when)}</span>
        </span>
        <svg viewBox="0 0 24 24" class="chev" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </button>`;
  }).join("");

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

function showProgram(id) {
  const p = DB.programs.find((x) => x.id === id);
  if (!p) return;
  const [c1, c2] = accentOf(p);
  const badges = supersetLabels(p.exercises);

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
       <div class="prog-hero" style="background:linear-gradient(160deg,${c1},${c2})">
         <h1>${esc(p.name)}</h1>
         <p>${p.exercises.length} exercice${p.exercises.length > 1 ? "s" : ""}</p>
       </div>
       <ol class="ex-list">
         ${p.exercises.map((e, i) => `
           <li class="ex-row${badges[i].superset ? " ss" : ""}">
             <span class="ex-num">${badges[i].superset ? `<b>${badges[i].text}</b>` : badges[i].text}</span>
             <span class="ex-main">
               <span class="ex-title">${esc(e.name)}</span>
               <span class="ex-sub">${[e.sets ? `${e.sets} séries` : null, e.reps ? `${esc(e.reps)} reps` : null].filter(Boolean).join(" · ") || "libre"}</span>
             </span>
             <span class="ex-best">${DB.prs[e.name] ? `${fmt(DB.prs[e.name])}<em>lb</em>` : ""}</span>
           </li>`).join("")}
       </ol>
       <button class="primary big" id="start-session"><span class="primary-label">Commencer la séance</span></button>
       <button class="ghost-btn danger-btn" id="del-prog">Supprimer le programme</button>
     </div>`
  );

  $("start-session").addEventListener("click", () => {
    popView();
    setTimeout(() => startSession(p), 220);
  });
  $("edit-prog").addEventListener("click", () => { popView(); setTimeout(() => editProgram(p), 220); });
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

/* ── Éditeur de programme ─────────────────────────────────── */
function editProgram(existing) {
  const draft = existing
    ? { id: existing.id, name: existing.name, accent: existing.accent ?? 0, exercises: existing.exercises.map((e) => ({ ...e })) }
    : { id: uid(), name: "", accent: DB.programs.length % ACCENTS.length, exercises: [] };

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
         ${ACCENTS.map((c, i) => `<button type="button" class="accent${i === draft.accent ? " on" : ""}" data-i="${i}"
            style="background:linear-gradient(160deg,${c[0]},${c[1]})" aria-label="Couleur ${i + 1}"></button>`).join("")}
       </div>
       <p class="block-key">Exercices</p>
       <div id="draft-list" class="draft-list"></div>
       <button class="tile-btn" id="add-ex">
         <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Ajouter un exercice
       </button>
       <button class="primary big" id="save-prog"><span class="primary-label">Enregistrer</span></button>
     </div>`
  );

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
        <div class="swipe-surface draft-row">
          <span class="ex-num">${badges[i].superset ? `<b>${badges[i].text}</b>` : badges[i].text}</span>
          <span class="ex-main">
            <span class="ex-title">${esc(e.name)}</span>
            <span class="ex-sub">${[e.sets ? `${e.sets} séries` : null, e.reps ? `${esc(e.reps)} reps` : null].filter(Boolean).join(" · ") || "libre"}</span>
          </span>
        </div>
      </div>`).join("");
    host.querySelectorAll(".swipe-row").forEach((row) => {
      swipeToReveal(row, { onCommit: () => {
        draft.exercises.splice(Number(row.dataset.i), 1);
        drawDraft();
      } });
    });
  };
  drawDraft();

  $("accent-row").addEventListener("click", (e) => {
    const b = e.target.closest(".accent");
    if (!b) return;
    draft.accent = Number(b.dataset.i);
    $("accent-row").querySelectorAll(".accent").forEach((x) => x.classList.toggle("on", x === b));
    pop(b, 1.14, 0.5);
    buzz(6);
  });

  $("add-ex").addEventListener("click", () => addExerciseSheet(draft, drawDraft));

  $("save-prog").addEventListener("click", () => {
    const name = $("pname").value.trim();
    if (!name) { toast("Donne un nom au programme"); $("pname").focus(); return; }
    if (!draft.exercises.length) { toast("Ajoute au moins un exercice"); return; }
    draft.name = name;
    const i = DB.programs.findIndex((p) => p.id === draft.id);
    if (i >= 0) DB.programs[i] = draft; else DB.programs.push(draft);
    persist.programs();
    popView();
    renderPrograms();
    toast(existing ? "Programme mis à jour" : "Programme créé");
  });
}

/* `picked` voyage en paramètre : la feuille est reconstruite après le
   sélecteur, et une variable locale y serait remise à zéro — le choix
   serait perdu sans que rien ne le dise. */
function addExerciseSheet(draft, redraw, picked = "") {
  const prev = draft.exercises[draft.exercises.length - 1];
  const last = picked ? lastEntry(picked) : null;
  openSheet(
    `<h2 class="sheet-h">Ajouter un exercice</h2>
     <button type="button" class="picker-pill wide${picked ? " filled" : ""}" id="pick-ex">
       <span id="pick-ex-label">${picked ? esc(picked) : "Choisir un exercice"}</span>
       <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
     </button>
     <div class="row2">
       <div class="field"><label for="ex-sets">Séries</label>
         <input class="input" id="ex-sets" type="number" min="1" max="20" inputmode="numeric"
                placeholder="3" value="${last ? last.sets : ""}"></div>
       <div class="field"><label for="ex-reps">Reps</label>
         <input class="input" id="ex-reps" placeholder="8-10" autocomplete="off"
                value="${last ? esc(String(last.reps)) : ""}"></div>
     </div>
     ${prev ? `<label class="check-row"><input type="checkbox" id="ex-ss"><span>Superset avec « ${esc(prev.name)} »</span></label>` : ""}
     <button class="primary" id="ex-add"><span class="primary-label">Ajouter</span></button>`
  );

  $("pick-ex").addEventListener("click", () => {
    closeSheet();
    onSheetClose = () => pickExercise(picked, (name) => addExerciseSheet(draft, redraw, name));
  });

  $("ex-add").addEventListener("click", () => {
    if (!picked) { toast("Choisis d'abord un exercice"); return; }
    const ss = $("ex-ss") && $("ex-ss").checked;
    const lastGroup = draft.exercises.length ? draft.exercises[draft.exercises.length - 1].group : -1;
    draft.exercises.push({
      name: picked,
      sets: Number($("ex-sets").value) || null,
      reps: $("ex-reps").value.trim() || null,
      group: ss && draft.exercises.length ? lastGroup : lastGroup + 1,
    });
    closeSheet();
    onSheetClose = () => { redraw(); buzz(9); };
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

function renderHistory() {
  const host = $("log-list");
  const logs = [...DB.logs].sort((a, b) => b.createdAt - a.createdAt);

  const week = logs.filter((l) => Date.now() - l.createdAt < 7 * 86400000);
  $("hist-sub").textContent = logs.length
    ? `${week.length} entrée${week.length > 1 ? "s" : ""} cette semaine · ${logs.length} au total`
    : "";

  if (!logs.length) {
    host.innerHTML =
      `<div class="empty">
         <p class="empty-title">Historique vide</p>
         <p class="empty-body">Lance une séance depuis Programmes, ajoute une entrée à la main, ou importe tes données depuis les Réglages.</p>
       </div>`;
    return;
  }

  const byDay = {};
  logs.forEach((l) => { (byDay[l.date] ||= []).push(l); });

  host.innerHTML = Object.keys(byDay).sort().reverse().map((day) => {
    const items = byDay[day];
    const vol = items.reduce((n, l) => n + volumeOf(l), 0);
    return `<section class="day">
      <header class="day-head">
        <span class="day-name">${esc(prettyDay(day))}</span>
        <span class="day-vol tnum">${Math.round(vol).toLocaleString("fr-CA")} lb</span>
      </header>
      ${items.map((l) => {
        const detail = l.perSet
          ? l.perSet.map((s) => `${fmt(s.weight)}×${s.reps}`).join("  ")
          : `${fmt(l.weight)} lb × ${l.reps} × ${l.sets} série${l.sets > 1 ? "s" : ""}`;
        return `<div class="swipe-row" data-log="${esc(l.id)}">
          <button type="button" class="swipe-action" aria-label="Supprimer">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/></svg>
          </button>
          <div class="swipe-surface log-row">
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
}

function quickLogSheet(picked = "") {
  const last = picked ? lastEntry(picked) : null;
  openSheet(
    `<h2 class="sheet-h">Nouvelle entrée</h2>
     <button type="button" class="picker-pill wide${picked ? " filled" : ""}" id="ql-pick">
       <span id="ql-label">${picked ? esc(picked) : "Choisir un exercice"}</span>
       <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
     </button>
     <div class="row3">
       <div class="field"><label for="ql-w">Poids (lb)</label>
         <input class="input" id="ql-w" type="number" step="0.5" min="0" inputmode="decimal"
                value="${last ? last.weight : ""}"></div>
       <div class="field"><label for="ql-s">Séries</label>
         <input class="input" id="ql-s" type="number" min="1" inputmode="numeric" value="${last ? last.sets : 3}"></div>
       <div class="field"><label for="ql-r">Reps</label>
         <input class="input" id="ql-r" type="number" min="1" inputmode="numeric" value="${last ? last.reps : 10}"></div>
     </div>
     <p class="fineprint">${last
        ? `Dernière fois : ${fmt(last.weight)} lb × ${last.reps} × ${last.sets}${DB.prs[picked] ? ` · record ${fmt(DB.prs[picked])} lb` : ""}`
        : (picked ? "Première entrée pour cet exercice." : "")}</p>
     <button class="primary" id="ql-save"><span class="primary-label">Ajouter</span></button>`
  );

  $("ql-pick").addEventListener("click", () => {
    closeSheet();
    onSheetClose = () => pickExercise(picked, (name) => quickLogSheet(name));
  });

  $("ql-save").addEventListener("click", () => {
    const w = Number($("ql-w").value), st = Number($("ql-s").value), r = Number($("ql-r").value);
    if (!picked) { toast("Choisis un exercice"); return; }
    if (!(w >= 0) || !(st >= 1) || !(r >= 1)) { toast("Poids, séries et reps sont requis"); return; }
    const res = addLog({ exercise: picked, weight: w, sets: st, reps: r, programId: null, programName: null });
    closeSheet();
    onSheetClose = () => {
      renderHistory(); renderProgress(); renderPrograms();
      if (res.pr) { toast(`🏆 Record : ${fmt(w)} lb`); buzz([14, 45, 22]); }
      else { toast("Entrée ajoutée"); buzz(9); }
    };
  });
}

/* ══════════════════════════════════════════════════════════
   ONGLET 3 — PROGRÈS
   ══════════════════════════════════════════════════════════ */
let progMode = "exercices", currentEx = null, metric = "weight";

function renderProgress() {
  ["exercices", "poids", "photos"].forEach((m) => { $(`mode-${m}`).hidden = m !== progMode; });
  $("prog-mode").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.mode === progMode));
  if (progMode === "exercices") renderExerciseProgress();
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
  $("metric-toggle").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.metric === metric));

  const pts = seriesFor(currentEx, metric);
  const unit = metric === "weight" ? "lb" : "reps";

  /* Les records ne sont PAS une deuxième couleur : anneau + étiquette. */
  const prSet = new Set();
  let best = -Infinity;
  seriesFor(currentEx, "weight").forEach((p) => { if (p.y > best) { best = p.y; prSet.add(p.x); } });

  const first = pts[0], last = pts[pts.length - 1];
  const delta = pts.length > 1 ? last.y - first.y : 0;
  $("ex-stats").innerHTML = pts.length ? `
    <div class="stat"><span class="stat-val tnum">${fmt(DB.prs[currentEx] ?? bestWeight(currentEx))}</span><span class="stat-key">Record (lb)</span></div>
    <div class="stat"><span class="stat-val tnum">${fmt(last.y)}</span><span class="stat-key">Dernière (${unit})</span></div>
    <div class="stat"><span class="stat-val tnum">${delta > 0 ? "+" : ""}${fmt(delta)}</span><span class="stat-key">Depuis le début</span></div>` : "";

  renderChart($("ex-chart"), pts, {
    unit, color: "#30D158", prSet: metric === "weight" ? prSet : new Set(),
    label: `Progression — ${currentEx}`,
    empty: "Aucune donnée pour cet exercice.",
  });

  /* Vue tableau : l'information ne doit jamais exister qu'en image. */
  $("ex-table").innerHTML = pts.slice().reverse().map((p) =>
    `<div class="vrow"><span>${esc(longDate(p.x))}</span><b class="tnum">${fmt(p.y)} ${esc(unit)}</b>${prSet.has(p.x) && metric === "weight" ? '<em>record</em>' : ""}</div>`).join("");
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
  const card = $("import-card");
  if (!total) {
    $("import-scan").textContent = "Rien trouvé de l'ancienne app sur cet appareil. Si tes données sont sur ton téléphone, ouvre Reps depuis le même navigateur — ou importe un fichier exporté depuis l'ancienne app.";
    $("import-old-btn").hidden = true;
  } else {
    $("import-scan").innerHTML =
      `Trouvé dans <b>Mes Workouts</b> : ${s.logs} entrée${s.logs > 1 ? "s" : ""} d'historique, ` +
      `${s.programs} programme${s.programs > 1 ? "s" : ""}, ${s.bodyweight} pesée${s.bodyweight > 1 ? "s" : ""}.`;
    $("import-old-btn").hidden = false;
  }
  card.hidden = false;
  $("version-line").textContent = `${DB.logs.length} entrées · ${DB.programs.length} programmes`;
}

function manageExercisesSheet() {
  const names = allExercises();
  if (!names.length) { toast("Aucun exercice pour l'instant"); return; }
  openSheet(
    `<h2 class="sheet-h">Mes exercices</h2>
     <p class="muted">Touche un exercice pour le renommer partout ou lui donner une note.</p>
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
}

function editExerciseSheet(name) {
  openSheet(
    `<h2 class="sheet-h">${esc(name)}</h2>
     <div class="field"><label for="ex-rename">Nom</label>
       <input class="input" id="ex-rename" value="${esc(name)}" autocomplete="off"></div>
     <div class="field"><label for="ex-note">Note technique</label>
       <textarea class="input" id="ex-note" rows="3" placeholder="Ex : grip large, coudes serrés">${esc(DB.notes[name] || "")}</textarea></div>
     <p class="fineprint">Renommer met à jour l'historique, les programmes et les records d'un coup.</p>
     <button class="primary" id="ex-save"><span class="primary-label">Enregistrer</span></button>`
  );
  $("ex-save").addEventListener("click", () => {
    const nn = $("ex-rename").value.trim();
    const note = $("ex-note").value.trim();
    if (!nn) { toast("Le nom ne peut pas être vide"); return; }
    if (nn !== name) renameExercise(name, nn);
    if (note) DB.notes[nn] = note; else delete DB.notes[nn];
    persist.notes();
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
  renderPrograms();
  renderHistory();
  renderProgress();
  renderSettings();
}

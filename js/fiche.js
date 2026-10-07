/* ══ La fiche d'exercice ══════════════════════════════════
   Une seule feuille pour modifier un exercice, d'où qu'on vienne :
   l'éditeur de programme, le menu ⋯ en séance, une entrée
   d'historique, Réglages → Mes exercices. Toujours le même ordre :

     ÉTIQUETTE — ce qu'on modifie (ce programme, cette séance…)
     Nom de l'exercice
     ce qui ne vaut qu'ici : séries, reps, poids…
     L'EXERCICE — PARTOUT : muscle, note et vidéo
     actions propres à l'endroit
     [ Enregistrer ]  ← vert, toujours en bas
     action destructive, discrète, tout en dessous

   Rien ne s'écrit avant « Enregistrer » ; une action (passer,
   remplacer…) enregistre d'abord ce qui a été changé.
   Les chiffres sont des − / + qu'on peut toucher pour taper. */

const FX_CHEV = '<svg viewBox="0 0 24 24" class="tick" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';

/* ── Compteur − / + ───────────────────────────────────────
   kind : "int" (séries, reps), "dec" (poids, km), "range" (reps
   d'un programme : « 8-10 » — le − / + décale les deux bornes). */
function stepperHTML(id, value, { kind = "int", unit = "", aria = "", placeholder = "" } = {}) {
  const mode = kind === "range" ? "text" : kind === "dec" ? "decimal" : "numeric";
  const v = value == null || value === "" ? "" : kind === "range" ? String(value) : fmt(value);
  return `<div class="stepper" data-step="${id}">
      <button type="button" data-d="-1" aria-label="Moins — ${esc(aria)}">−</button>
      <label class="step-val"><input id="${id}" class="tnum${kind === "range" ? " range" : ""}" inputmode="${mode}" autocomplete="off" enterkeyhint="done"
        value="${esc(v)}" placeholder="${esc(placeholder)}" aria-label="${esc(aria)}">${unit ? `<em>${esc(unit)}</em>` : ""}</label>
      <button type="button" data-d="1" aria-label="Plus — ${esc(aria)}">+</button>
    </div>`;
}

function stepperRow(id, value, { label, sub = "", ...o }) {
  return `<div class="stepper-row">
      <span><b>${esc(label)}</b>${sub ? `<em id="${id}-sub">${sub}</em>` : ""}</span>
      ${stepperHTML(id, value, { aria: label, ...o })}
    </div>`;
}

/* Renvoie get() : un nombre (ou null si vide), ou le texte d'une
   fourchette « 8-10 ». */
function bindStepper(id, { step = 1, min = 0, max = 9999, kind = "int", onChange } = {}) {
  const inp = $(id), box = inp.closest(".stepper");
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const round = (v) => Math.round(v * 100) / 100;
  const num = (s) => {
    const v = Number(String(s).replace(",", ".").trim());
    return String(s).trim() !== "" && Number.isFinite(v) ? v : null;
  };
  const okRange = (s) => /^\d+(\s*[-–]\s*\d+)?$/.test(s.trim());
  let good = inp.value;
  /* Une fourchette « 10-12 » s'affiche en entier : le champ prend
     la largeur de son texte au lieu d'une largeur fixe. */
  const fit = () => {
    if (kind !== "range") return;
    const n = (inp.value || inp.placeholder || "").length;
    inp.style.width = `${Math.max(2.4, n * 0.92 + 0.6)}ch`;
  };
  fit();
  inp.addEventListener("input", fit);

  const write = (s) => {
    if (s === inp.value) { buzz(3); pop(inp.parentNode, 1.03, 0.5); return; }
    inp.value = s; good = s; fit();
    pop(inp.parentNode, 1.12, 0.6);
    buzz(6);
    if (onChange) onChange(get());
  };

  box.addEventListener("click", (e) => {
    const b = e.target.closest("[data-d]");
    if (!b) return;
    const d = Number(b.dataset.d);
    if (kind === "range") {
      const src = inp.value.trim() || inp.placeholder;
      if (!/\d/.test(src)) return;
      write(src.replace(/\d+/g, (n) => String(clamp(Number(n) + d * step))).replace(/\s*[-–]\s*/, "-"));
      return;
    }
    const cur = num(inp.value) ?? num(inp.placeholder);
    const next = cur == null ? (d > 0 ? Math.max(min, step) : min) : clamp(round(cur + d * step));
    write(fmt(next));
  });

  /* Tapé au clavier : on vérifie en quittant le champ. Ce qui ne
     veut rien dire revient à la dernière valeur correcte. */
  inp.addEventListener("change", () => {
    const s = inp.value.trim();
    if (s === "") { good = ""; if (onChange) onChange(get()); return; }
    if (kind === "range") {
      if (okRange(s)) { inp.value = s.replace(/\s*[-–]\s*/, "-"); good = inp.value; if (onChange) onChange(get()); }
      else { inp.value = good; toast("Des reps comme « 8 » ou « 8-10 »"); }
      fit();
      return;
    }
    const v = num(s);
    if (v == null) { inp.value = good; return; }
    inp.value = fmt(clamp(round(v)));
    good = inp.value;
    if (onChange) onChange(get());
  });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); });
  inp.addEventListener("focus", () => inp.select());

  const get = () => {
    const s = inp.value.trim();
    if (kind === "range") return s && okRange(s) ? s : null;
    return num(s);
  };
  return get;
}

/* ── L'exercice — partout ─────────────────────────────────
   Muscle, note et vidéo suivent l'exercice dans tous les
   programmes. Repliés par défaut, sauf dans Mes exercices où
   c'est tout ce qu'il y a à faire. `rename` : le nom se change
   aussi (Mes exercices seulement — renommer touche tout). */
function globalHTML(name, { open = false, rename = false } = {}) {
  const cardio = isCardio(name);
  const note = DB.notes[name] || "", url = DB.links[name] || "";
  const techSub = [note || null, url ? "vidéo liée" : null].filter(Boolean).map(esc).join(" · ") || "Aucune";
  const row = (panel, title, sub, subId) => `
    <button type="button" class="pick-row disclose${open ? " open" : ""}" data-panel="${panel}" aria-expanded="${open}" aria-controls="${panel}">
      <span>${title}<em class="pick-sub" id="${subId}">${sub}</em></span>${FX_CHEV}</button>`;
  return `<p class="block-key">L'exercice — partout</p>
    <div class="menu-list fx-global">
      ${rename ? `<div class="field fx-name"><label for="fx-rename">Nom</label>
        <input class="input" id="fx-rename" value="${esc(name)}" autocomplete="off"></div>` : ""}
      ${cardio ? "" : row("fx-muscle", "Muscle principal", esc(muscleOf(name)), "fx-muscle-sub")}
      ${cardio ? "" : `<div class="fx-panel" id="fx-muscle"${open ? "" : " hidden"}>${muscleChips(name)}</div>`}
      ${row("fx-tech", "Note et vidéo de technique", techSub, "fx-tech-sub")}
      <div class="fx-panel" id="fx-tech"${open ? "" : " hidden"}>
        <textarea class="input" id="fx-note" rows="3" placeholder="Note — ex. : grip large, coudes serrés" aria-label="Note technique">${esc(note)}</textarea>
        <input class="input" id="fx-url" type="url" inputmode="url" autocomplete="off" placeholder="Lien vidéo — YouTube, TikTok…" aria-label="Vidéo de technique" value="${esc(url)}">
        <p class="fineprint">Elles s'affichent sur la carte à chaque séance.${rename ? " Renommer met à jour l'historique, les programmes et les records d'un coup." : ""}</p>
      </div>
    </div>`;
}

function bindGlobal(name) {
  let muscle = isCardio(name) ? null : muscleOf(name);
  $("sheet-body").querySelectorAll(".disclose").forEach((b) => b.addEventListener("click", () => {
    const p = $(b.dataset.panel), open = p.hidden;
    p.hidden = !open;
    b.classList.toggle("open", open);
    b.setAttribute("aria-expanded", String(open));
    buzz(5);
    measureSheet();
  }));
  if (muscle) bindMuscleChips((m) => { muscle = m; $("fx-muscle-sub").textContent = m; });
  return {
    /* Un message d'erreur, ou null si tout est bon. */
    check() {
      if ($("fx-rename") && !$("fx-rename").value.trim()) return "Le nom ne peut pas être vide";
      return cleanUrl($("fx-url").value) === null ? "Ce lien n'a pas l'air d'une adresse web" : null;
    },
    /* Écrit muscle, note et vidéo ; renvoie le nom (changé ou non). */
    apply() {
      let n = name;
      const nn = $("fx-rename") ? $("fx-rename").value.trim() : name;
      if (nn && nn !== name) { renameExercise(name, nn); n = nn; }
      if (muscle) setMuscle(n, muscle);
      const note = $("fx-note").value.trim(), url = cleanUrl($("fx-url").value);
      if (note) DB.notes[n] = note; else delete DB.notes[n];
      if (url) DB.links[n] = url; else delete DB.links[n];
      persist.notes(); persist.links();
      return n;
    },
  };
}

/* ── Bas de fiche ── */
function ficheFoot(label = "Enregistrer", danger = "") {
  return `<button class="primary sheet-cta" id="fx-save"><span class="primary-label">${esc(label)}</span></button>
    ${danger ? `<button type="button" class="fx-danger" id="fx-danger">${esc(danger)}</button>` : ""}`;
}

/* ── Séries une par une (correction d'une entrée) ──────────
   Chaque série : poids − / + et reps − / +. Les valeurs tapées
   sont relues avant chaque redessin, sinon ajouter une série
   effacerait ce qui vient d'être corrigé. */
function setRowsEditor(hostId, rows) {
  const host = $(hostId);
  const getters = [];
  const read = () => getters.forEach(([w, r], i) => {
    rows[i].weight = w() ?? 0;
    rows[i].reps = r() ?? 0;
  });
  const draw = () => {
    getters.length = 0;
    host.innerHTML = rows.map((s, i) => `
      <div class="fx-set" data-i="${i}">
        <span class="edit-idx">${i + 1}</span>
        ${stepperHTML(`fx-w${i}`, s.weight, { kind: "dec", unit: "lb", aria: `poids série ${i + 1}` })}
        <span class="times">×</span>
        ${stepperHTML(`fx-r${i}`, s.reps, { aria: `reps série ${i + 1}` })}
        <button type="button" class="icon-btn edit-del" aria-label="Retirer la série ${i + 1}"${rows.length < 2 ? " disabled" : ""}>
          <svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg></button>
      </div>`).join("");
    rows.forEach((_, i) => getters.push([
      bindStepper(`fx-w${i}`, { step: 2.5, max: 2000, kind: "dec" }),
      bindStepper(`fx-r${i}`, { min: 1, max: 200 }),
    ]));
    host.querySelectorAll(".edit-del").forEach((b) => b.addEventListener("click", () => {
      read();
      rows.splice(Number(b.closest(".fx-set").dataset.i), 1);
      buzz(8); draw(); measureSheet();
    }));
  };
  draw();
  return {
    add() { read(); rows.push({ ...rows[rows.length - 1] }); buzz(8); draw(); measureSheet(); },
    read() { read(); return rows; },
  };
}

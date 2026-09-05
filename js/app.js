/* ============================================================
   app.js — amorçage, onglets, câblage
   ============================================================ */

const TABS = ["programmes", "historique", "progres", "reglages"];
let currentTab = null;

/* Les onglets sont des pairs, pas une hiérarchie : ils se croisent
   en fondu court avec un léger décalage, ils ne glissent pas. */
function switchTab(tab, { instant = false } = {}) {
  if (tab === currentTab) { scrollTabTop(tab); return; }
  const from = currentTab;
  currentTab = tab;
  sessionStorage.setItem(K.tab, tab);

  document.querySelectorAll(".tab").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("on", on);
    b.setAttribute("aria-current", on ? "page" : "false");
  });

  const next = $(`page-${tab}`);

  /* L'onglet sortant disparaît d'un coup. Un fondu croisé
     superpose deux pages entières et lisibles : c'est illisible,
     et c'est pour ça qu'iOS échange ses onglets sans transition.
     Seul l'entrant se pose, brièvement. */
  if (from) $(`page-${from}`).hidden = true;
  /* Au tout premier affichage il n'y a pas d'onglet sortant : on
     cache toutes les autres pages. Sans ça, un onglet restauré
     depuis sessionStorage se superpose à Programmes, qui n'est
     pas marqué `hidden` dans le HTML. */
  else TABS.forEach((t) => { if (t !== tab) $(`page-${t}`).hidden = true; });
  next.hidden = false;

  if (!instant && !REDUCED.matches) {
    const s = new Spring(0, { response: 0.28, damping: 1, restDelta: 0.008,
      onUpdate: (v) => {
        next.style.opacity = String(0.55 + 0.45 * v);
        next.style.transform = `translate3d(0,${(1 - v) * 7}px,0)`;
      },
      onRest: () => { next.style.opacity = ""; next.style.transform = ""; } });
    s.to(1);
  } else {
    next.style.opacity = ""; next.style.transform = "";
  }

  /* Pas de retour haptique au tout premier affichage : il n'y a
     pas eu de geste, et le navigateur le refuse de toute façon. */
  if (!instant) buzz(6);
  requestAnimationFrame(refreshPageBars);
}

function scrollTabTop(tab) {
  const sc = $(`page-${tab}`).querySelector(".page-scroll");
  if (sc && sc.scrollTop > 0) sc.scrollTo({ top: 0, behavior: REDUCED.matches ? "auto" : "smooth" });
}

/* La barre compacte apparaît quand le grand titre sort de l'écran.
   Valeur continue liée au scroll — pas de ressort, pas de seuil sec. */
const barUpdaters = [];
function initPageBars() {
  document.querySelectorAll(".page").forEach((page) => {
    const sc = page.querySelector(".page-scroll");
    const bar = page.querySelector(".page-bar");
    const title = page.querySelector(".big-title");
    if (!sc || !bar || !title) return;
    const onScroll = () => {
      /* Un onglet caché n'a pas de layout : ses mesures valent 0 et
         la barre se croirait déjà scrollée. On ne calcule rien. */
      if (!title.offsetHeight) { bar.style.opacity = "0"; bar.style.pointerEvents = "none"; return; }
      const start = title.offsetTop + title.offsetHeight - 46;
      const p = Math.max(0, Math.min(1, (sc.scrollTop - start) / 24));
      bar.style.opacity = String(p);
      bar.style.pointerEvents = p > 0.5 ? "auto" : "none";
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    barUpdaters.push(onScroll);
    onScroll();
  });
}
const refreshPageBars = () => barUpdaters.forEach((f) => f());

/* ── Câblage ──────────────────────────────────────────────── */
function initApp() {
  document.querySelectorAll(".tab").forEach((b) => {
    b.addEventListener("pointerdown", () => pop(b.querySelector("svg"), 0.88, 0.6));
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });

  /* Programmes */
  $("new-program-btn").addEventListener("click", () => editProgram(null));

  /* Historique */
  $("quick-log-btn").addEventListener("click", quickLogSheet);
  initCalendarGestures();

  /* Progrès */
  $("prog-mode").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (!b) return;
    progMode = b.dataset.mode;
    buzz(6);
    renderProgress();
  });
  $("metric-toggle").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-metric]");
    if (!b) return;
    metric = b.dataset.metric;
    buzz(6);
    renderExerciseProgress();
  });
  $("ex-picker-btn").addEventListener("click", () => {
    pickExercise(currentEx, (n) => { currentEx = n; renderExerciseProgress(); });
  });
  $("ex-table-btn").addEventListener("click", () => {
    const t = $("ex-table"), open = t.hidden;
    t.hidden = !open;
    $("ex-table-btn").textContent = open ? "Masquer les valeurs" : "Voir les valeurs";
    $("ex-table-btn").setAttribute("aria-expanded", String(open));
  });

  $("bw-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const w = Number($("bw-input").value);
    if (!(w > 0)) { toast("Entre un poids valide"); return; }
    DB.bodyweight.push({ id: uid(), weight: w, date: today(), createdAt: Date.now() });
    persist.bodyweight();
    $("bw-input").value = "";
    $("bw-input").blur();
    buzz(9);
    renderBodyweight();
    toast("Pesée enregistrée");
  });

  $("add-photo-btn").addEventListener("click", () => $("photo-input").click());
  $("photo-input").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      toast("Traitement de la photo…");
      await addPhoto(await shrinkImage(f));
      buzz(9);
      renderPhotos();
      toast("Photo ajoutée");
    } catch (_) { toast("Impossible d'ajouter cette photo"); }
  });
  $("lightbox-close").addEventListener("click", () => { $("lightbox").hidden = true; });
  $("lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") $("lightbox").hidden = true; });
  $("lightbox-img").addEventListener("dblclick", () => {
    const id = $("lightbox").dataset.id;
    confirmSheet("Supprimer cette photo ?", "Elle sera effacée définitivement de cet appareil.", "Supprimer", async () => {
      await removePhoto(id);
      $("lightbox").hidden = true;
      renderPhotos();
      toast("Photo supprimée");
    });
  });

  /* Réglages — apparence */
  $("theme-mode").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (!b || b.dataset.mode === themeMode) return;
    setThemeMode(b.dataset.mode);
    renderAppearance();
    buzz(8);
  });
  $("accent-grid").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-accent]");
    if (!b || b.dataset.accent === accentId) return;
    setAccent(b.dataset.accent);
    renderAppearance();
    pop($("accent-grid").querySelector(".sw.on"), 1.18, 0.62);
    buzz(9);
  });

  /* Un graphique est du SVG : ses couleurs sont lues au tracé,
     pas héritées. Changer de thème ou d'accent le redessine. */
  addEventListener("reps:appearance", () => {
    if (currentTab === "progres") renderProgress();
  });

  /* Réglages */
  $("import-old-btn").addEventListener("click", importSheet);
  $("export-btn").addEventListener("click", () => { exportJSON(); toast("Fichier exporté"); });
  $("import-file").addEventListener("change", (e) => {
    const f = e.target.files[0];
    e.target.value = "";
    if (!f) return;
    importJSON(f, (err) => {
      if (err) { toast("Fichier illisible"); return; }
      refreshAll();
      toast("Sauvegarde restaurée");
    });
  });
  $("manage-ex-btn").addEventListener("click", manageExercisesSheet);
  $("wipe-btn").addEventListener("click", () => {
    confirmSheet("Tout effacer ?", "Programmes, historique, pesées et records de Reps seront supprimés de cet appareil. Ton ancienne app n'est pas touchée.", "Tout effacer", () => {
      Object.values(K).forEach((k) => localStorage.removeItem(k));
      location.reload();
    });
  });

  initSheetGestures();
  initEdgeBack();
  initSession();
  initPageBars();

  /* Un graphique se redessine quand la largeur change. */
  let rz = 0;
  addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { if (currentTab === "progres") renderProgress(); }, 180);
  });
}

/* ── Démarrage ────────────────────────────────────────────── */
normalizeAccents();
initApp();
refreshAll();
switchTab(TABS.includes(sessionStorage.getItem(K.tab)) ? sessionStorage.getItem(K.tab) : "programmes", { instant: true });

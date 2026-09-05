/* ============================================================
   theme.js — l'apparence : clair / sombre et couleur d'accent.

   Deux axes indépendants, tous deux réglables dans Réglages :
   le MODE (système, clair, sombre) et l'ACCENT (10 teintes).
   Les préférences vivent hors du préfixe de données wt2- utilisé
   par data.js : « Tout effacer » vide l'entraînement, pas les
   réglages d'affichage.
   ============================================================ */

const PREF = { accent: "wt2-accent", theme: "wt2-theme" };

/* Dix accents. Un seul hex par teinte : le dégradé clair, la
   version texte et les fonds teintés en sont dérivés en CSS
   (color-mix), donc rien à maintenir en double.
   `ink` = ce qui s'écrit PAR-DESSUS un aplat de cette couleur. */
const ACCENT_CHOICES = [
  { id: "vert",     name: "Vert",     hex: "#30D158", ink: "#04150A" },
  { id: "menthe",   name: "Menthe",   hex: "#40D9C0", ink: "#03150F" },
  { id: "cyan",     name: "Cyan",     hex: "#5AC8F5", ink: "#04131A" },
  { id: "bleu",     name: "Bleu",     hex: "#0A84FF", ink: "#FFFFFF" },
  { id: "indigo",   name: "Indigo",   hex: "#5E5CE6", ink: "#FFFFFF" },
  { id: "violet",   name: "Violet",   hex: "#BF5AF2", ink: "#FFFFFF" },
  { id: "rose",     name: "Rose",     hex: "#FF375F", ink: "#FFFFFF" },
  { id: "orange",   name: "Orange",   hex: "#FF9F0A", ink: "#1A0F00" },
  { id: "or",       name: "Or",       hex: "#FFD426", ink: "#1A1400" },
  { id: "graphite", name: "Graphite", hex: "#A0A4AD", ink: "#111318" },
];

const THEME_MODES = [
  { id: "auto",   name: "Système" },
  { id: "clair",  name: "Clair" },
  { id: "sombre", name: "Sombre" },
];

const DARK_Q = matchMedia("(prefers-color-scheme: dark)");

let accentId = localStorage.getItem(PREF.accent) || "vert";
let themeMode = localStorage.getItem(PREF.theme) || "auto";
if (!ACCENT_CHOICES.some((a) => a.id === accentId)) accentId = "vert";
if (!THEME_MODES.some((m) => m.id === themeMode)) themeMode = "auto";

const accentOfId = (id) => ACCENT_CHOICES.find((a) => a.id === id) || ACCENT_CHOICES[0];
const currentAccent = () => accentOfId(accentId);
/* Le mode « auto » se résout ici : le CSS n'a qu'un seul cas à
   connaître, `[data-theme="light"]`, et le reste est sombre. */
const resolvedTheme = () => (themeMode === "auto" ? (DARK_Q.matches ? "sombre" : "clair") : themeMode);

function applyAppearance() {
  const a = currentAccent();
  const light = resolvedTheme() === "clair";
  const root = document.documentElement;

  root.style.setProperty("--accent", a.hex);
  root.style.setProperty("--accent-ink", a.ink);
  root.dataset.theme = light ? "light" : "dark";

  /* La barre d'état iOS suit le fond réel de l'app. */
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", light ? "#F2F2F7" : "#000000");

  /* Les graphiques dessinent en SVG : leurs couleurs sont lues
     une fois au tracé, pas héritées. Il faut les redessiner. */
  dispatchEvent(new CustomEvent("reps:appearance"));
}

function setAccent(id) {
  if (!ACCENT_CHOICES.some((a) => a.id === id)) return;
  accentId = id;
  try { localStorage.setItem(PREF.accent, id); } catch (_) {}
  applyAppearance();
}

function setThemeMode(id) {
  if (!THEME_MODES.some((m) => m.id === id)) return;
  themeMode = id;
  try { localStorage.setItem(PREF.theme, id); } catch (_) {}
  applyAppearance();
}

/* En mode système, on suit les changements de l'OS en direct. */
DARK_Q.addEventListener("change", () => { if (themeMode === "auto") applyAppearance(); });

/* Appliqué avant le premier rendu — sinon un flash sombre. */
applyAppearance();

/* Lecture d'un token pour le code qui dessine (chart.js). */
const tok = (name, fallback = "") =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

/* ============================================================
   chart.js — graphiques de progression
   Un graphique = UNE série. C'est délibéré : deux séries de
   couleurs sur fond sombre échouaient au test daltonisme
   (vert↔orange ΔE 7.1, sous le seuil de 8). Les records sont
   donc marqués par la FORME et une étiquette, jamais par une
   deuxième teinte.
   ============================================================ */

const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}) => {
  const e = document.createElementNS(NS, n);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
};

const MOIS = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];
const shortDate = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MOIS[d.getMonth()]}`; };
const longDate = (ms) => {
  const d = new Date(ms);
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
};

/* Bornes d'axe « rondes » : sinon l'échelle raconte n'importe quoi. */
function niceScale(min, max, ticks = 4) {
  if (min === max) { min = Math.max(0, min - 5); max = max + 5; }
  const span = max - min;
  const raw = span / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return { lo, hi, ticks: out };
}

/* points: [{x: ms, y: number, date, log}] triés, croissants en x
   opts: { unit, color, prSet: Set(x), empty } */
function renderChart(host, points, opts = {}) {
  const unit = opts.unit || "";
  /* Les couleurs viennent des tokens : le SVG ne les hérite pas,
     il faut les lire à chaque tracé (thème clair, accent choisi). */
  const color = opts.color || tok("--accent", "#30D158");
  const cGrid = tok("--grid", "rgba(255,255,255,.07)");
  const cSoft = tok("--tx-3", "rgba(242,243,245,.42)");
  const cText = tok("--tx", "#F2F3F5");
  const cSurf = tok("--elev", "#0F1115");
  const cLine = tok("--line-hi", "rgba(255,255,255,.28)");
  const prSet = opts.prSet || new Set();
  host.innerHTML = "";

  if (!points.length) {
    host.innerHTML = `<p class="chart-empty">${esc(opts.empty || "Pas encore de données.")}</p>`;
    return;
  }
  if (points.length === 1) {
    const p = points[0];
    host.innerHTML =
      `<div class="chart-single">
         <span class="chart-single-val">${fmt(p.y)}<em>${esc(unit)}</em></span>
         <span class="chart-single-key">${esc(longDate(p.x))} — une seule mesure pour l'instant,
         le graphique apparaît à la deuxième.</span>
       </div>`;
    return;
  }

  const W = Math.max(260, host.clientWidth || 320), H = 208;
  const M = { t: 16, r: 16, b: 26, l: 40 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;

  const ys = points.map((p) => p.y);
  const sc = niceScale(Math.min(...ys), Math.max(...ys));
  const x0 = points[0].x, x1 = points[points.length - 1].x;
  const sx = (v) => M.l + (x1 === x0 ? iw / 2 : ((v - x0) / (x1 - x0)) * iw);
  const sy = (v) => M.t + ih - ((v - sc.lo) / (sc.hi - sc.lo || 1)) * ih;

  const svg = el("svg", {
    viewBox: `0 0 ${W} ${H}`, width: "100%", height: H,
    role: "img", "aria-label": opts.label || "Graphique de progression",
  });

  /* dégradé sous la courbe */
  const defs = el("defs");
  const grad = el("linearGradient", { id: "ch-grad", x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.append(el("stop", { offset: "0", "stop-color": color, "stop-opacity": ".26" }),
              el("stop", { offset: "1", "stop-color": color, "stop-opacity": "0" }));
  defs.append(grad);
  svg.append(defs);

  /* grille discrète — elle doit se faire oublier */
  sc.ticks.forEach((t) => {
    const y = sy(t);
    if (y < M.t - 1 || y > M.t + ih + 1) return;
    svg.append(el("line", { x1: M.l, y1: y, x2: M.l + iw, y2: y,
      stroke: cGrid, "stroke-width": 1 }));
    const lab = el("text", { x: M.l - 8, y: y + 3.5, "text-anchor": "end",
      fill: cSoft, "font-size": "10.5", "font-weight": "500" });
    lab.textContent = fmt(t);
    svg.append(lab);
  });

  const d = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  svg.append(el("path", {
    d: `${d} L${sx(x1).toFixed(1)},${M.t + ih} L${sx(x0).toFixed(1)},${M.t + ih} Z`,
    fill: "url(#ch-grad)",
  }));
  svg.append(el("path", { d, fill: "none", stroke: color, "stroke-width": 2,
    "stroke-linejoin": "round", "stroke-linecap": "round" }));

  /* Points. Un record porte un anneau plus large + une étiquette :
     l'identité ne passe jamais par la couleur seule. */
  points.forEach((p) => {
    const cx = sx(p.x), cy = sy(p.y), isPR = prSet.has(p.x);
    if (isPR) {
      svg.append(el("circle", { cx, cy, r: 7.5, fill: "none",
        stroke: color, "stroke-width": 2, opacity: ".55" }));
    }
    svg.append(el("circle", { cx, cy, r: isPR ? 4.6 : 3.4, fill: color,
      stroke: cSurf, "stroke-width": 2 }));
  });

  /* Dernière valeur étiquetée en clair — jamais toutes. */
  const last = points[points.length - 1];
  const lx = sx(last.x), ly = sy(last.y);
  const tag = el("text", {
    x: Math.min(lx + 9, M.l + iw), y: Math.max(ly - 10, M.t + 9),
    "text-anchor": lx > M.l + iw - 46 ? "end" : "start",
    fill: cText, "font-size": "12.5", "font-weight": "650",
  });
  tag.textContent = `${fmt(last.y)} ${unit}`.trim();
  svg.append(tag);

  /* dates aux extrémités */
  [[x0, "start", M.l], [x1, "end", M.l + iw]].forEach(([v, anchor, x]) => {
    const t = el("text", { x, y: H - 7, "text-anchor": anchor,
      fill: cSoft, "font-size": "10.5" });
    t.textContent = shortDate(v);
    svg.append(t);
  });

  /* ── Couche de survol : viseur + infobulle ─────────────── */
  const cross = el("line", { y1: M.t, y2: M.t + ih, stroke: cLine,
    "stroke-width": 1, opacity: "0" });
  const halo = el("circle", { r: 7, fill: "none", stroke: color, "stroke-width": 2, opacity: "0" });
  svg.append(cross, halo);

  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;

  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  wrap.append(svg, tip);
  host.append(wrap);

  const nearest = (px) => {
    const ratio = W / wrap.clientWidth;
    const vx = px * ratio;
    let best = points[0], bd = Infinity;
    for (const p of points) { const dd = Math.abs(sx(p.x) - vx); if (dd < bd) { bd = dd; best = p; } }
    return best;
  };

  function show(e) {
    const r = wrap.getBoundingClientRect();
    const p = nearest(e.clientX - r.left);
    const cx = sx(p.x), cy = sy(p.y);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx); cross.setAttribute("opacity", "1");
    halo.setAttribute("cx", cx); halo.setAttribute("cy", cy); halo.setAttribute("opacity", "1");
    tip.hidden = false;
    tip.innerHTML =
      `<b>${fmt(p.y)} ${esc(unit)}</b>` +
      `<i>${esc(longDate(p.x))}</i>` +
      (prSet.has(p.x) ? `<u>Record</u>` : "");
    const left = (cx / W) * wrap.clientWidth;
    tip.style.left = `${Math.max(4, Math.min(left, wrap.clientWidth - tip.offsetWidth - 4))}px`;
  }
  function hide() { cross.setAttribute("opacity", "0"); halo.setAttribute("opacity", "0"); tip.hidden = true; }

  wrap.addEventListener("pointerdown", (e) => { capture(wrap, e.pointerId); show(e); });
  wrap.addEventListener("pointermove", (e) => { if (e.buttons || e.pointerType === "mouse") show(e); });
  wrap.addEventListener("pointerup", hide);
  wrap.addEventListener("pointercancel", hide);
  wrap.addEventListener("pointerleave", hide);
}

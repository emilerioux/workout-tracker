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

/* Courbe lisse MONOTONE (Fritsch–Carlson, comme d3.curveMonotoneX) :
   arrondie, mais elle ne dépasse jamais un point — pas de faux pic
   au-dessus d'un record, pas de creux inventé entre deux séances. */
function smoothPath(P) {
  const n = P.length;
  if (n < 3) return P.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = (P[i + 1][0] - P[i][0]) || 1e-6;
    m[i] = (P[i + 1][1] - P[i][1]) / dx[i];
  }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    t[i] = m[i - 1] * m[i] <= 0 ? 0
      : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  }
  let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[i + 1], h = dx[i] / 3;
    d += ` C${(x0 + h).toFixed(1)},${(y0 + t[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - t[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

/* Le tracé se dessine à l'apparition — une fois par série, pas à
   chaque redimensionnement — et jamais avec « réduire les animations ». */
const drawnSigs = new WeakMap();

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

  const W = Math.max(260, host.clientWidth || 320), H = 228;
  const M = { t: 30, r: 14, b: 26, l: 40 };
  const iw = W - M.l - M.r, ih = H - M.t - M.b;

  /* Un peu d'air au-dessus et au-dessous : un point collé au bord du
     cadre se lit comme coupé, et la courbe paraît écrasée. */
  const ys = points.map((p) => p.y);
  const yMin = Math.min(...ys), yMax = Math.max(...ys), pad = (yMax - yMin) * 0.12;
  const sc = niceScale(Math.max(0, yMin - pad), yMax + pad);
  const x0 = points[0].x, x1 = points[points.length - 1].x;
  const sx = (v) => M.l + (x1 === x0 ? iw / 2 : ((v - x0) / (x1 - x0)) * iw);
  const sy = (v) => M.t + ih - ((v - sc.lo) / (sc.hi - sc.lo || 1)) * ih;

  const svg = el("svg", {
    viewBox: `0 0 ${W} ${H}`, width: "100%", height: H,
    role: "img", "aria-label": opts.label || "Graphique de progression",
  });

  /* Dégradé sous la courbe, ancré sur la courbe elle-même (du point
     le plus haut au bas du cadre) : il suit la forme au lieu d'un
     aplat. Un id par graphique — deux graphiques à l'écran ne se
     volent pas leur dégradé. */
  const gid = `ch-grad-${Math.random().toString(36).slice(2, 8)}`;
  const defs = el("defs");
  const grad = el("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse",
    x1: 0, y1: sy(yMax), x2: 0, y2: M.t + ih });
  grad.append(el("stop", { offset: "0", "stop-color": color, "stop-opacity": ".30" }),
              el("stop", { offset: ".6", "stop-color": color, "stop-opacity": ".08" }),
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

  const P = points.map((p) => [sx(p.x), sy(p.y)]);
  const d = smoothPath(P);
  const area = el("path", {
    d: `${d} L${sx(x1).toFixed(1)},${M.t + ih} L${sx(x0).toFixed(1)},${M.t + ih} Z`,
    fill: `url(#${gid})`,
  });
  const line = el("path", { d, fill: "none", stroke: color, "stroke-width": 2.5,
    "stroke-linejoin": "round", "stroke-linecap": "round" });
  svg.append(area, line);

  /* Points. Au-delà d'une douzaine, la courbe suffit : seuls les
     records et le dernier gardent leur point. Un record porte un
     anneau + « Record » dans l'infobulle : jamais la couleur seule. */
  const last = points[points.length - 1];
  const many = points.length > 12;
  const dots = el("g");
  points.forEach((p) => {
    const cx = sx(p.x), cy = sy(p.y), isPR = prSet.has(p.x);
    if (many && !isPR && p !== last) return;
    if (isPR) {
      dots.append(el("circle", { cx, cy, r: 8, fill: "none",
        stroke: color, "stroke-width": 1.5, opacity: ".5" }));
    }
    dots.append(el("circle", { cx, cy, r: p === last ? 5 : 4, fill: color,
      stroke: cSurf, "stroke-width": 2 }));
  });
  svg.append(dots);

  /* Dernière valeur dans une pastille au-dessus du point — jamais
     toutes, et jamais par-dessus la courbe. */
  const lx = sx(last.x), ly = sy(last.y);
  const label = `${fmt(last.y)} ${unit}`.trim();
  const tw = label.length * 7.2 + 16, th = 22;
  const tx = Math.max(M.l, Math.min(lx - tw / 2, M.l + iw - tw + 4));
  /* Au-dessus de TOUT ce que la pastille couvre en largeur (la courbe
     monotone ne dépasse jamais ses points) ; sans place, en dessous. */
  const under = P.filter(([x]) => x >= tx - 8 && x <= tx + tw + 8).map(([, y]) => y);
  let ty = Math.min(...under) - th - 10;
  if (ty < 2) ty = Math.min(Math.max(...under) + 12, H - th - 2);
  const pill = el("g");
  pill.append(
    el("rect", { x: tx, y: ty, width: tw, height: th, rx: 11, fill: cSurf, stroke: cLine, "stroke-width": 1 }),
  );
  const tag = el("text", { x: tx + tw / 2, y: ty + 15, "text-anchor": "middle",
    fill: cText, "font-size": "12.5", "font-weight": "650" });
  tag.textContent = label;
  pill.append(tag);
  svg.append(pill);

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

  /* La courbe se trace de gauche à droite, puis le dégradé, les
     points et la pastille apparaissent. Ressort amorti, sans rebond. */
  const sig = `${opts.label}|${points.length}|${last.x}|${last.y}`;
  if (!REDUCED.matches && drawnSigs.get(host) !== sig) {
    const len = line.getTotalLength();
    line.style.strokeDasharray = `${len} ${len}`;
    const after = [area, dots, pill];
    const paint = (v) => {
      line.style.strokeDashoffset = String(len * (1 - Math.min(1, v)));
      const f = Math.max(0, Math.min(1, (v - 0.55) / 0.45));
      after.forEach((n) => { n.style.opacity = String(f); });
    };
    paint(0);
    new Spring(0, { response: 0.75, damping: 1, restDelta: 0.002, onUpdate: paint,
      onRest: () => { line.style.strokeDasharray = ""; line.style.strokeDashoffset = ""; } }).to(1);
  }
  drawnSigs.set(host, sig);

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

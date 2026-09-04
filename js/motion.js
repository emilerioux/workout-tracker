/* ============================================================
   motion.js — le moteur physique de l'app
   Ressorts (amortissement + réponse, comme SwiftUI), projection
   de momentum, élastique aux bords, suivi de vitesse. Rien ici
   ne connaît l'entraînement : c'est de la mécanique pure.
   ============================================================ */

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");

const running = new Set();
let rafId = 0, lastT = 0;

function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 1 / 30);
  lastT = now;
  for (const s of [...running]) s._advance(dt);
  rafId = running.size ? requestAnimationFrame(frame) : 0;
}
function wake() {
  if (!rafId) { lastT = performance.now(); rafId = requestAnimationFrame(frame); }
}

class Spring {
  constructor(value, opts = {}) {
    this.x = value; this.t = value; this.v = 0;
    this.response = opts.response ?? 0.4;
    this.damping  = opts.damping  ?? 1.0;
    this.rest     = opts.restDelta ?? 0.004;
    this.onUpdate = opts.onUpdate || (() => {});
    this.onRest   = opts.onRest || null;
  }
  /* Nouvelle cible sans toucher à x ni v : c'est l'interruptibilité. */
  to(target, o = {}) {
    if (o.response !== undefined) this.response = o.response;
    if (o.damping  !== undefined) this.damping  = o.damping;
    this.t = target;
    if (o.velocity !== undefined) this.v = o.velocity;
    if (REDUCED.matches) {
      this.x = target; this.v = 0; running.delete(this);
      this.onUpdate(this.x); if (this.onRest) this.onRest();
      return;
    }
    running.add(this); wake();
  }
  /* Pendant un geste, le doigt écrit directement dans le ressort. */
  hold(value, velocity = 0) {
    running.delete(this);
    this.x = value; this.t = value; this.v = velocity;
    this.onUpdate(this.x);
  }
  _advance(dt) {
    const w = (2 * Math.PI) / this.response, z = this.damping;
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -w * w * (this.x - this.t) - 2 * z * w * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    if (Math.abs(this.v) < this.rest * 12 && Math.abs(this.t - this.x) < this.rest) {
      this.x = this.t; this.v = 0;
      running.delete(this);
      this.onUpdate(this.x);
      if (this.onRest) this.onRest();
      return;
    }
    this.onUpdate(this.x);
  }
}

/* Où le mouvement s'arrêterait tout seul — décélération exponentielle,
   la formule du code d'exemple « Designing Fluid Interfaces ». */
const project = (v, d = 0.998) => (v / 1000) * d / (1 - d);

/* Résistance progressive au-delà d'une limite, plutôt qu'un mur. */
const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

/* Historique court de positions → vitesse au relâchement. */
function tracker() {
  let pts = [];
  return {
    add(x, t) { pts.push([x, t]); if (pts.length > 8) pts.shift(); },
    velocity() {
      if (pts.length < 2) return 0;
      const end = pts[pts.length - 1];
      let start = pts[0];
      for (const p of pts) { if (end[1] - p[1] <= 90) { start = p; break; } }
      const dt = (end[1] - start[1]) / 1000;
      return dt > 0.004 ? (end[0] - start[0]) / dt : 0;
    },
  };
}

/* La capture peut échouer si le pointeur a disparu : jamais fatal. */
function capture(el, id) { try { el.setPointerCapture(id); } catch (_) {} }
function uncapture(el, id) { try { if (el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch (_) {} }

/* Haptique — réservée aux moments qui comptent. */
const buzz = (p) => { if (navigator.vibrate) { try { navigator.vibrate(p); } catch (_) {} } };

/* Petit rebond d'échelle réutilisable. */
function pop(el, from = 1.07, damping = 0.55) {
  if (REDUCED.matches) return;
  if (!el._pop) {
    el._pop = new Spring(1, { response: 0.34, damping, restDelta: 0.002,
      onUpdate: (v) => { el.style.transform = `scale(${v})`; } });
  }
  el._pop.damping = damping;
  el._pop.hold(from);
  el._pop.to(1);
}

/* Glissé horizontal pour révéler une action (supprimer).
   1:1 avec le doigt, élastique du mauvais côté, décidé à la vitesse. */
function swipeToReveal(el, { width = 88, onCommit }) {
  const surface = el.querySelector(".swipe-surface");
  if (!surface) return;
  let g = null, open = false;
  const s = new Spring(0, { response: 0.4, damping: 1, restDelta: 0.4,
    onUpdate: (x) => { surface.style.transform = `translate3d(${-x}px,0,0)`; } });

  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".swipe-action")) return;
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from: s.x, axis: null, tr: tracker() };
    g.tr.add(e.clientX, e.timeStamp);
  });
  el.addEventListener("pointermove", (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dx) <= Math.abs(dy)) { g = null; return; }
      g.axis = "x";
      capture(el, e.pointerId);
    }
    g.tr.add(e.clientX, e.timeStamp);
    let x = g.from - dx;
    if (x < 0) x = -rubberband(-x, width);
    if (x > width) x = width + rubberband(x - width, width);
    s.hold(x);
  });
  const end = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const armed = g.axis === "x", v = -g.tr.velocity();
    g = null;
    if (!armed) return;
    const projected = s.x + project(v);
    open = projected > width / 2;
    s.to(open ? width : 0, { velocity: v, damping: Math.abs(v) > 300 ? 0.82 : 1 });
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);

  const action = el.querySelector(".swipe-action");
  if (action) action.addEventListener("click", () => { buzz(12); onCommit(); });
  el._closeSwipe = () => { open = false; s.to(0); };
  return el._closeSwipe;
}

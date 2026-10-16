// The wheel: draws the slices as SVG, spins with an ease-out that starts at the
// spin's velocity, ticks the pointer on every peg, and lets you grab and flick it.
const NS = "http://www.w3.org/2000/svg";
const C = 500;
const R = 452;
const PEG_R = 437;
const LABEL_OUT = 416;
const LABEL_IN = 146;

const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const rad = (d) => (d * Math.PI) / 180;
const at = (r, deg) => [C + r * Math.sin(rad(deg)), C - r * Math.cos(rad(deg))];
const easeInOut = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

function el(name, attrs = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function sector(a0, a1) {
  const [x0, y0] = at(R, a0);
  const [x1, y1] = at(R, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${C} ${C}L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z`;
}

function makeMeter() {
  const svg = el("svg", { width: "0", height: "0", "aria-hidden": "true" });
  svg.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none";
  const text = el("text", { class: "wheel-label", "font-size": "100" });
  svg.append(text);
  document.body.append(svg);
  const cache = new Map();
  const measure = (s) => {
    if (!cache.has(s)) {
      text.textContent = s;
      cache.set(s, text.getComputedTextLength());
    }
    return cache.get(s);
  };
  measure.reset = () => cache.clear();
  return measure;
}

export function createWheel(root, hooks = {}) {
  const disc = root.querySelector("[data-disc]");
  const svg = disc.querySelector("svg");
  const flapper = root.querySelector("[data-flapper]");
  const measure = makeMeter();

  let slices = [];
  let angle = 0;
  let prevAngle = 0;
  let flap = 0;
  let flapVel = 0;
  let queue = [];
  let raf = 0;
  let lastTime = 0;
  let drag = null;
  let onDone = null;
  let winOutline = null;
  let slicesGroup = null;

  function fitLabel(raw, step) {
    let text = raw.toUpperCase();
    const half = rad(Math.min(step, 120) / 2);
    const top = step >= 90 ? 54 : step >= 40 ? 50 : step >= 24 ? 44 : 38;
    const fits = (f, w100) => {
      const inner = LABEL_OUT - (w100 * f) / 100;
      return inner >= LABEL_IN && f <= 2 * inner * Math.sin(half) * 0.62;
    };
    for (let f = top; f >= 15; f--) if (fits(f, measure(text))) return { text, size: f };
    while (text.length > 4 && (measure(text + "…") * 15) / 100 > LABEL_OUT - LABEL_IN) text = text.slice(0, -1).trimEnd();
    return { text: text === raw.toUpperCase() ? text : text + "…", size: 15 };
  }

  function fitAll(step) {
    const fitted = slices.map((s) => fitLabel(s.label, step));
    const sizes = fitted.map((f) => f.size).sort((a, b) => a - b);
    const cap = sizes.length ? sizes[Math.floor((sizes.length - 1) * 0.25)] : 0;
    return fitted.map((f) => ({ ...f, size: Math.min(f.size, cap) }));
  }

  function draw() {
    const n = slices.length;
    const step = 360 / Math.max(1, n);
    const labels = fitAll(step);
    svg.replaceChildren();

    const defs = el("defs");
    defs.innerHTML =
      '<radialGradient id="pegFill" cx="35%" cy="30%" r="75%">' +
      '<stop offset="0" stop-color="#FFF6DA"/><stop offset=".45" stop-color="#E2B158"/><stop offset="1" stop-color="#6E450F"/>' +
      "</radialGradient>";
    svg.append(defs);

    slicesGroup = el("g", { class: "slices" });
    if (n === 0) {
      slicesGroup.append(el("circle", { cx: C, cy: C, r: R, fill: "#1D1C29" }));
    }
    slices.forEach((s, i) => {
      const a0 = i * step;
      const a1 = (i + 1) * step;
      const g = el("g", { class: "slice", "data-i": String(i) });
      const shape =
        n === 1
          ? el("circle", { cx: C, cy: C, r: R, fill: s.fill })
          : el("path", { d: sector(a0, a1), fill: s.fill, stroke: "rgba(10,8,16,.28)", "stroke-width": "2" });
      const { text, size } = labels[i];
      const label = el("text", {
        class: "wheel-label",
        x: String(C + LABEL_OUT),
        y: String(C),
        dy: "0.36em",
        "text-anchor": "end",
        "font-size": String(size),
        fill: s.ink,
        transform: `rotate(${((a0 + a1) / 2 - 90).toFixed(3)} ${C} ${C})`,
      });
      label.textContent = text;
      g.append(shape, label);
      slicesGroup.append(g);
    });
    svg.append(slicesGroup);

    svg.append(el("circle", { cx: C, cy: C, r: R - 1.5, fill: "none", stroke: "rgba(8,6,14,.55)", "stroke-width": "3" }));

    const pegs = el("g", { class: "pegs" });
    if (n > 1) {
      for (let i = 0; i < n; i++) {
        const [x, y] = at(PEG_R, i * step);
        pegs.append(el("circle", { cx: x.toFixed(2), cy: y.toFixed(2), r: "8.5", fill: "url(#pegFill)", stroke: "rgba(40,24,4,.55)", "stroke-width": "1.5" }));
      }
    }
    svg.append(pegs);

    winOutline = el("path", { class: "win-outline", d: "", fill: "none" });
    svg.append(winOutline);
  }

  function indexAt(a) {
    const n = Math.max(1, slices.length);
    return Math.floor(mod(-a, 360) / (360 / n)) % n;
  }

  function paint() {
    disc.style.transform = `rotate(${angle.toFixed(3)}deg)`;
    if (flapper) flapper.style.transform = `rotate(${flap.toFixed(2)}deg)`;
    hooks.onAngle && hooks.onAngle(angle);
  }

  function frame(now) {
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;
    let finished = false;

    if (queue.length) {
      const seg = queue[0];
      if (seg.t0 == null) seg.t0 = now;
      const u = Math.min(1, (now - seg.t0) / (seg.dur * 1000));
      angle = seg.from + (seg.to - seg.from) * seg.ease(u);
      if (u >= 1) {
        queue.shift();
        if (queue.length) queue[0].t0 = now;
        else finished = true;
      }
    }

    const moved = angle - prevAngle;
    if (moved !== 0 && slices.length > 1) {
      const step = 360 / slices.length;
      if (Math.floor(angle / step) !== Math.floor(prevAngle / step)) {
        const speed = Math.abs(moved) / dt;
        flap = -Math.sign(moved) * Math.min(32, 11 + speed / 55);
        flapVel = 0;
        hooks.onTick && hooks.onTick(speed);
      }
    }
    prevAngle = angle;

    flapVel += (-950 * flap - 30 * flapVel) * dt;
    flap += flapVel * dt;
    if (Math.abs(flap) < 0.03 && Math.abs(flapVel) < 0.3) {
      flap = 0;
      flapVel = 0;
    }

    paint();

    if (finished) {
      angle = mod(angle, 360);
      prevAngle = angle;
      const done = onDone;
      onDone = null;
      done && done();
    }

    if (queue.length || drag || flap !== 0) raf = requestAnimationFrame(frame);
    else {
      raf = 0;
      lastTime = 0;
    }
  }

  function wake() {
    if (!raf) {
      lastTime = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  const busy = () => queue.length > 0 || onDone !== null;

  function spin({ index, velocity = 1200, dir = 1, windup = true, reduced = false }) {
    if (busy() || !slices.length) return Promise.resolve(null);
    const n = slices.length;
    const step = 360 / n;
    const target = (index + 0.22 + Math.random() * 0.56) * step;
    const power = reduced ? 2 : 3.1;
    const start = windup && !reduced ? angle - dir * Math.min(11, step * 0.42) : angle;
    const base = dir > 0 ? mod(-target - start, 360) : mod(start + target, 360);
    let travel;
    let dur;
    if (reduced) {
      travel = base;
      dur = 0.5;
    } else {
      const v = clamp(velocity, 500, 4200);
      const turns = Math.max(2, Math.round(((6.2 * v) / power - base) / 360));
      travel = base + 360 * turns;
      dur = clamp((power * travel) / v, 3.8, 9.5);
    }
    if (start !== angle) queue.push({ from: angle, to: start, dur: 0.26, ease: easeInOut, t0: null });
    queue.push({ from: start, to: start + dir * travel, dur, ease: (u) => 1 - Math.pow(1 - u, power), t0: null });
    clearHighlight();
    return new Promise((resolve) => {
      onDone = () => resolve(indexAt(angle));
      wake();
    });
  }

  function highlight(i) {
    if (!slicesGroup) return;
    const n = slices.length;
    const step = 360 / Math.max(1, n);
    slicesGroup.querySelectorAll(".slice").forEach((g) => {
      const on = Number(g.dataset.i) === i;
      g.classList.toggle("is-win", on);
      g.classList.toggle("is-dim", !on);
    });
    if (winOutline) winOutline.setAttribute("d", n > 1 ? sector(i * step, (i + 1) * step) : "");
    root.classList.add("has-winner");
  }

  function clearHighlight() {
    if (!slicesGroup) return;
    slicesGroup.querySelectorAll(".slice").forEach((g) => g.classList.remove("is-win", "is-dim"));
    if (winOutline) winOutline.setAttribute("d", "");
    root.classList.remove("has-winner");
  }

  function setSlices(list) {
    slices = list.slice();
    draw();
  }

  async function swap(list, { reduced = false } = {}) {
    if (reduced || !svg.animate) return setSlices(list);
    await svg
      .animate([{ transform: "scale(1) rotate(0deg)", opacity: 1 }, { transform: "scale(.9) rotate(-24deg)", opacity: 0 }], {
        duration: 150,
        easing: "cubic-bezier(.5,0,.75,0)",
      })
      .finished.catch(() => {});
    setSlices(list);
    svg.animate([{ transform: "scale(.86) rotate(36deg)", opacity: 0 }, { transform: "scale(1) rotate(0deg)", opacity: 1 }], {
      duration: 560,
      easing: "cubic-bezier(.16,1,.3,1)",
    });
  }

  function pointer(e, rect) {
    const x = e.clientX - (rect.left + rect.width / 2);
    const y = e.clientY - (rect.top + rect.height / 2);
    return { a: (Math.atan2(x, -y) * 180) / Math.PI, r: Math.hypot(x, y) / (rect.width / 2) };
  }

  disc.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || busy() || slices.length < 2 || (hooks.canGrab && !hooks.canGrab())) return;
    const rect = disc.getBoundingClientRect();
    const { a, r } = pointer(e, rect);
    if (r > 0.92 || r < 0.27) return;
    e.preventDefault();
    disc.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, rect, last: a, samples: [[performance.now(), angle]], travel: 0 };
    root.classList.add("is-grabbed");
    hooks.onGrab && hooks.onGrab();
    clearHighlight();
    wake();
  });

  disc.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { a } = pointer(e, drag.rect);
    let d = a - drag.last;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    drag.last = a;
    angle += d;
    drag.travel += Math.abs(d);
    const now = performance.now();
    drag.samples.push([now, angle]);
    while (drag.samples.length > 2 && now - drag.samples[0][0] > 240) drag.samples.shift();
  });

  // Speed of the last ~140ms of the drag. A finger that stopped before letting go doesn't spin.
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const now = performance.now();
    const s = drag.samples;
    const last = s[s.length - 1];
    let v = 0;
    if (s.length >= 2 && now - last[0] < 100) {
      let first = s.length - 2;
      while (first > 0 && last[0] - s[first - 1][0] <= 140) first--;
      const [t0, a0] = s[first];
      if (last[0] > t0) v = ((last[1] - a0) / (last[0] - t0)) * 1000;
    }
    const travel = drag.travel;
    drag = null;
    root.classList.remove("is-grabbed");
    if (Math.abs(v) > 200 && travel > 8 && hooks.onFlick) hooks.onFlick({ velocity: Math.abs(v), dir: Math.sign(v) });
  };
  disc.addEventListener("pointerup", release);
  disc.addEventListener("pointercancel", release);

  return {
    setSlices,
    swap,
    spin,
    highlight,
    clearHighlight,
    busy,
    resetMeasure() {
      measure.reset();
    },
    get count() {
      return slices.length;
    },
  };
}

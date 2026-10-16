// Confetti from both bottom corners, drawn on one full-screen canvas.
let canvas = null;
let ctx = null;
let parts = [];
let raf = 0;
let last = 0;

function size() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function mountConfetti(el) {
  canvas = el;
  ctx = canvas.getContext("2d");
  size();
  addEventListener("resize", size);
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function star(c, r) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}

function draw(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.scale(1, Math.cos(p.flip));
  ctx.globalAlpha = Math.min(1, p.life * 2.5);
  ctx.fillStyle = p.color;
  if (p.shape === "rect") {
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
  } else if (p.shape === "circle") {
    ctx.beginPath();
    ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.shape === "star") {
    star(ctx, p.w * 0.75);
  } else if (p.shape === "pearl") {
    const g = ctx.createRadialGradient(-p.w * 0.18, -p.w * 0.2, p.w * 0.05, 0, 0, p.w * 0.6);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, p.color);
    g.addColorStop(1, "rgba(120,140,150,.9)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, p.w * 0.55, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.shape === "streamer") {
    ctx.beginPath();
    ctx.moveTo(-p.h / 2, 0);
    ctx.bezierCurveTo(-p.h / 6, -p.w, p.h / 6, p.w, p.h / 2, 0);
    ctx.lineWidth = p.w * 0.45;
    ctx.strokeStyle = p.color;
    ctx.stroke();
  }
  ctx.restore();
}

function frame(t) {
  const dt = Math.min(0.033, (t - last) / 1000 || 0.016);
  last = t;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  for (const p of parts) {
    p.vy += 900 * dt;
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy *= Math.pow(p.drag, dt * 60);
    p.vx += Math.sin(p.flip * 0.7) * p.sway * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    p.flip += p.flipSpeed * dt;
    p.life -= dt / p.ttl;
    draw(p);
  }
  parts = parts.filter((p) => p.life > 0 && p.y < innerHeight + 60);
  if (parts.length) raf = requestAnimationFrame(frame);
  else {
    raf = 0;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
}

export function burst({ colors, shapes, count = 150 } = {}) {
  if (!ctx) return;
  const w = innerWidth;
  const h = innerHeight;
  const scale = Math.min(1.25, Math.max(0.65, Math.hypot(w, h) / 1500));
  const n = Math.round(count * (w < 600 ? 0.7 : 1));
  for (let i = 0; i < n; i++) {
    const left = i % 2 === 0;
    const angle = rand(55, 80) * (Math.PI / 180);
    const speed = rand(900, 1700) * scale;
    const shape = pick(shapes);
    parts.push({
      x: left ? rand(-10, w * 0.04) : rand(w * 0.96, w + 10),
      y: h + rand(0, 30),
      vx: Math.cos(angle) * speed * (left ? 1 : -1),
      vy: -Math.sin(angle) * speed,
      drag: rand(0.955, 0.972),
      sway: rand(20, 60),
      rot: rand(0, Math.PI * 2),
      spin: rand(-8, 8),
      flip: rand(0, Math.PI * 2),
      flipSpeed: rand(6, 14),
      w: shape === "streamer" ? rand(6, 9) : rand(7, 13),
      h: shape === "streamer" ? rand(26, 40) : rand(5, 9),
      color: pick(colors),
      shape,
      life: 1,
      ttl: rand(2.6, 4),
    });
  }
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

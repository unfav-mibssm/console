// Shared by index.html (TV) and controller.html (phone). To add a game, append one object to GAME_REGISTRY.
// Contract: id, title, description, accentColor, controllerLayout ("single-button" | "left-right" | "dpad-fire" | "custom"),
// optional controllerLabels {btnA:"DASH"} / controllerButtons (custom), init, update, render, cleanup.
export const W = 1280, H = 720; // logical canvas size
const TAU = Math.PI * 2, C = ["#00f5ff", "#ff007f"], rnd = (a, b) => a + Math.random() * (b - a);
const pad = (inp, i) => inp[i ? "p2" : "p1"] || {};
const verdict = d => d[0] && d[1] ? "draw" : d[0] ? "p2" : "p1"; // d[i] = player i lost
const burst = (a, x, y, n, c, sp = 300) => { for (let i = 0; i < n; i++) { const t = rnd(0, TAU), s = rnd(sp * .2, sp), l = rnd(.3, .9); a.push({ x, y, vx: Math.cos(t) * s, vy: Math.sin(t) * s, l, m: l, c }); } };
const stepParts = (a, dt) => { for (let i = a.length - 1; i >= 0; i--) { const p = a[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .98; p.vy *= .98; if ((p.l -= dt) <= 0) a.splice(i, 1); } };
const drawParts = (ctx, a) => { for (const p of a) { ctx.globalAlpha = Math.max(0, p.l / p.m); ctx.fillStyle = p.c; ctx.fillRect(p.x - 2, p.y - 2, 5, 5); } ctx.globalAlpha = 1; };

const sumo = {
  id: "bumper-sumo", title: "Bumper Sumo", accentColor: "#00f5ff",
  description: "Hold DASH to ram your rival off the shrinking ice ring.",
  controllerLayout: "single-button", controllerLabels: { btnA: "DASH" },
  init() {
    return { t: 0, R: 320, shake: 0, res: null, endT: 0, parts: [],
      pods: [0, 1].map(i => ({ x: W / 2 + (i ? 160 : -160), y: H / 2, vx: 0, vy: 0, a: i ? Math.PI : 0, r: 28, dash: false, dead: false })) };
  },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); s.shake = Math.max(0, s.shake - 40 * dt); stepParts(s.parts, dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.2 ? s.res : null }; }
    s.t += dt; s.R = 320 - 230 * Math.min(1, s.t / 45); // ring shrinks over 45s
    const [p, q] = s.pods;
    s.pods.forEach((o, i) => {
      const was = o.dash; o.dash = !!pad(inp, i).btnA;
      if (o.dash) { o.vx += Math.cos(o.a) * 520 * dt; o.vy += Math.sin(o.a) * 520 * dt; if (!was) audio.beep(300, .12, "sawtooth", .08, 700); }
      else o.a += 3.2 * dt; // idle: spin in place
      const f = Math.pow(.35, dt); o.vx *= f; o.vy *= f; o.x += o.vx * dt; o.y += o.vy * dt; // low-friction ice
    });
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, ov = p.r + q.r - d;
    if (ov > 0) {
      const nx = dx / d, ny = dy / d, j = Math.max((p.vx - q.vx) * nx + (p.vy - q.vy) * ny, 160), kp = p.dash ? 2.2 : 1, kq = q.dash ? 2.2 : 1;
      q.vx += nx * j * kp; q.vy += ny * j * kp; p.vx -= nx * j * kq; p.vy -= ny * j * kq; // dashing = 2.2x knockback
      p.x -= nx * ov / 2; p.y -= ny * ov / 2; q.x += nx * ov / 2; q.y += ny * ov / 2;
      s.shake = 14; burst(s.parts, (p.x + q.x) / 2, (p.y + q.y) / 2, 26, "#fff", 380);
      audio.beep(140, .14, "sawtooth", .2, 60); audio.noise(.08, .15);
    }
    const out = s.pods.map(o => Math.hypot(o.x - W / 2, o.y - H / 2) > s.R + o.r);
    if (out[0] || out[1]) {
      s.res = verdict(out);
      s.pods.forEach((o, i) => { if (out[i]) { o.dead = true; burst(s.parts, o.x, o.y, 50, C[i], 520); } });
      audio.noise(.6, .3); audio.beep(90, .5, "sawtooth", .25, 30);
    }
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.save();
    if (s.shake > 0) ctx.translate(rnd(-s.shake, s.shake), rnd(-s.shake, s.shake));
    ctx.fillStyle = "#0a0a12"; ctx.fillRect(-30, -30, W + 60, H + 60);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, s.R, 0, TAU); ctx.fillStyle = "#10243a"; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = "#8ff"; ctx.shadowColor = "#00f5ff"; ctx.shadowBlur = 28; ctx.stroke(); ctx.shadowBlur = 0;
    s.pods.forEach((o, i) => {
      if (o.dead) return;
      ctx.save(); ctx.translate(o.x, o.y); ctx.shadowColor = C[i]; ctx.shadowBlur = o.dash ? 40 : 18;
      ctx.fillStyle = "#0a0a12"; ctx.strokeStyle = C[i]; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.rotate(o.a); ctx.fillStyle = C[i]; ctx.beginPath(); ctx.moveTo(o.r + 24, 0); ctx.lineTo(o.r + 2, -14); ctx.lineTo(o.r + 2, 14); ctx.fill();
      ctx.restore();
    });
    drawParts(ctx, s.parts); ctx.restore();
  },
  cleanup() {}
};

const G = 20, GW = W / G, GH = H / G, STEP = .075; // 64x36 grid
const cycles = {
  id: "neon-light-cycles", title: "Neon Light-Cycles", accentColor: "#ff007f",
  description: "Tap TURN LEFT / TURN RIGHT to steer and trap your rival against walls and trails.",
  controllerLayout: "left-right",
  init() {
    const grid = new Uint8Array(GW * GH), b = [{ x: 8, y: GH / 2, dx: 1, dy: 0 }, { x: GW - 9, y: GH / 2, dx: -1, dy: 0 }];
    b.forEach((o, i) => { o.q = 0; o.seen = [0, 0]; o.dead = false; grid[o.y * GW + o.x] = i + 1; });
    return { grid, b, acc: 0, ready: false, res: null, endT: 0, parts: [] };
  },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .05); stepParts(s.parts, dt);
    s.b.forEach((b, i) => { // read tap counters every frame so no tap is missed between grid steps
      const k = pad(inp, i), t = [k.tapLeft | 0, k.tapRight | 0];
      if (!s.ready) b.seen = t; // ignore counters left over from earlier rounds
      if (!b.q && t[0] !== b.seen[0]) b.q = -1; else if (!b.q && t[1] !== b.seen[1]) b.q = 1; // max 1 queued turn per step
      b.seen = t;
    });
    s.ready = true;
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.3 ? s.res : null }; }
    s.acc += dt;
    if (s.acc < STEP) return { winner: null };
    s.acc -= STEP;
    const n = s.b.map(b => {
      if (b.q) { const [dx, dy] = b.q < 0 ? [b.dy, -b.dx] : [-b.dy, b.dx]; b.dx = dx; b.dy = dy; b.q = 0; audio.beep(660, .03, "square", .05); }
      return [b.x + b.dx, b.y + b.dy];
    });
    const dead = n.map(([x, y]) => x < 0 || y < 0 || x >= GW || y >= GH || s.grid[y * GW + x] !== 0);
    if (n[0][0] === n[1][0] && n[0][1] === n[1][1]) dead[0] = dead[1] = true; // head-on
    s.b.forEach((b, i) => {
      if (dead[i]) { b.dead = true; burst(s.parts, (b.x + .5) * G, (b.y + .5) * G, 60, C[i], 520); }
      else { b.x = n[i][0]; b.y = n[i][1]; s.grid[b.y * GW + b.x] = i + 1; }
    });
    if (dead[0] || dead[1]) { s.res = verdict(dead); audio.noise(.6, .3); audio.beep(90, .5, "sawtooth", .25, 30); }
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.fillStyle = "#0a0a12"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#141c33"; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= W; x += G) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += G) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke(); ctx.shadowBlur = 10;
    [1, 2].forEach(o => {
      ctx.fillStyle = ctx.shadowColor = C[o - 1];
      for (let i = 0; i < s.grid.length; i++) if (s.grid[i] === o) ctx.fillRect((i % GW) * G + 2, ((i / GW) | 0) * G + 2, G - 4, G - 4);
    });
    ctx.shadowBlur = 0; ctx.fillStyle = "#fff";
    s.b.forEach(b => { if (!b.dead) ctx.fillRect(b.x * G + 1, b.y * G + 1, G - 2, G - 2); });
    drawParts(ctx, s.parts);
    ctx.strokeStyle = "#8ff"; ctx.lineWidth = 4; ctx.strokeRect(2, 2, W - 4, H - 4);
  },
  cleanup() {}
};

export const GAME_REGISTRY = [sumo, cycles];

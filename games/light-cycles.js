import { W, H, INK, C, pad, verdict, burst, stepParts, drawParts } from "../kit.js";
const G = 20, GW = W / G, GH = H / G, STEP = .1; // 64 x 36 grid, one move every 0.1s
export default {
  id: "light-cycles", icon: "🏍️", title: "Light Cycles", accentColor: C[1],
  description: "Tap Turn left or Turn right to steer. Trap your rival against walls and trails.",
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
    ctx.fillStyle = "#fff4c2"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#f1e19a"; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= W; x += G) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += G) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    for (let i = 0; i < s.grid.length; i++) { const o = s.grid[i]; if (o) { ctx.fillStyle = C[o - 1]; ctx.fillRect((i % GW) * G + 1, ((i / GW) | 0) * G + 1, G - 2, G - 2); } }
    ctx.fillStyle = INK; s.b.forEach(b => { if (!b.dead) ctx.fillRect(b.x * G, b.y * G, G, G); });
    drawParts(ctx, s.parts);
    ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
  },
  cleanup() {}
};

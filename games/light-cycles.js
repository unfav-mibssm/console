import { W, H, INK, C, pad, newTaps, verdict, burst, stepParts, drawParts } from "../kit.js";
const G = 20, GW = W / G, GH = H / G, STEP = .1; // 64 x 36 grid, one move every 0.1s
const mark = (s, x, y, o) => { s.grid[y * GW + x] = o; s.lx.fillStyle = C[o - 1]; s.lx.fillRect(x * G + 1, y * G + 1, G - 2, G - 2); }; // trails are painted once onto a cached layer
export default {
  id: "light-cycles", icon: "🏍️", title: "Light Cycles", accentColor: C[1],
  description: "Tap Turn left or Turn right to steer. Trap your rival against walls and trails.",
  controllerLayout: "left-right",
  init() {
    const layer = document.createElement("canvas"); layer.width = W; layer.height = H;
    const lx = layer.getContext("2d");
    lx.fillStyle = "#fff4c2"; lx.fillRect(0, 0, W, H); lx.strokeStyle = "#f1e19a"; lx.lineWidth = 1; lx.beginPath();
    for (let x = 0; x <= W; x += G) { lx.moveTo(x, 0); lx.lineTo(x, H); }
    for (let y = 0; y <= H; y += G) { lx.moveTo(0, y); lx.lineTo(W, y); }
    lx.stroke();
    const s = { grid: new Uint8Array(GW * GH), layer, lx, acc: 0, ready: false, res: null, endT: 0, parts: [],
      b: [{ x: 8, y: GH / 2, dx: 1, dy: 0 }, { x: GW - 9, y: GH / 2, dx: -1, dy: 0 }] };
    s.b.forEach((o, i) => { o.q = []; o.seen = [0, 0]; o.dead = false; mark(s, o.x, o.y, i + 1); });
    return s;
  },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .05); stepParts(s.parts, dt);
    s.b.forEach((b, i) => { // tap counters are read every frame, so no tap is lost between grid steps
      const k = pad(inp, i), t = [k.tapLeft | 0, k.tapRight | 0];
      if (!s.ready) b.seen = t; // ignore counters left over from earlier rounds
      const l = newTaps(t[0], b.seen[0]), r = newTaps(t[1], b.seen[1]);
      for (let c = 0; c < l && b.q.length < 2; c++) b.q.push(-1); // up to 2 queued turns, but only ONE is applied per step
      for (let c = 0; c < r && b.q.length < 2; c++) b.q.push(1);
      b.seen = t;
    });
    s.ready = true;
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.3 ? s.res : null }; }
    s.acc += dt;
    if (s.acc < STEP) return { winner: null };
    s.acc -= STEP;
    const n = s.b.map(b => {
      const q = b.q.shift();
      if (q) { const [dx, dy] = q < 0 ? [b.dy, -b.dx] : [-b.dy, b.dx]; b.dx = dx; b.dy = dy; audio.beep(660, .03, "square", .05); }
      return [b.x + b.dx, b.y + b.dy];
    });
    const dead = n.map(([x, y]) => x < 0 || y < 0 || x >= GW || y >= GH || s.grid[y * GW + x] !== 0);
    if (n[0][0] === n[1][0] && n[0][1] === n[1][1]) dead[0] = dead[1] = true; // head-on
    s.b.forEach((b, i) => {
      if (dead[i]) { b.dead = true; burst(s.parts, (b.x + .5) * G, (b.y + .5) * G, 60, C[i], 520); }
      else { b.x = n[i][0]; b.y = n[i][1]; mark(s, b.x, b.y, i + 1); }
    });
    if (dead[0] || dead[1]) { s.res = verdict(dead); audio.noise(.6, .3); audio.beep(90, .5, "sawtooth", .25, 30); }
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.drawImage(s.layer, 0, 0);
    ctx.fillStyle = INK; s.b.forEach(b => { if (!b.dead) ctx.fillRect(b.x * G, b.y * G, G, G); });
    drawParts(ctx, s.parts);
    ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
  },
  cleanup(s) { if (s) s.layer = s.lx = null; }
};

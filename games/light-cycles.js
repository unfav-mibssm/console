import { W, H, INK, C, pad, verdict, burst, stepParts, drawParts } from "../kit.js";
// Steer with the D-pad: press a direction to head that way (no U-turns). Presses are queued in the order they happen.
const G = 20, GW = W / G, GH = H / G, STEP = .1; // 64 x 36 grid, one move every 0.1s
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const mark = (s, x, y, o) => { s.grid[y * GW + x] = o; s.lx.fillStyle = C[o - 1]; s.lx.fillRect(x * G + 1, y * G + 1, G - 2, G - 2); }; // trails are painted once onto a cached layer
export default {
  init() {
    const layer = document.createElement("canvas"); layer.width = W; layer.height = H;
    const lx = layer.getContext("2d");
    lx.fillStyle = "#fff4c2"; lx.fillRect(0, 0, W, H); lx.strokeStyle = "#f1e19a"; lx.lineWidth = 1; lx.beginPath();
    for (let x = 0; x <= W; x += G) { lx.moveTo(x, 0); lx.lineTo(x, H); }
    for (let y = 0; y <= H; y += G) { lx.moveTo(0, y); lx.lineTo(W, y); }
    lx.stroke();
    const s = { grid: new Uint8Array(GW * GH), layer, lx, acc: 0, res: null, endT: 0, parts: [],
      b: [{ x: 8, y: GH / 2, dx: 1, dy: 0 }, { x: GW - 9, y: GH / 2, dx: -1, dy: 0 }] };
    s.b.forEach((o, i) => { o.q = []; o.dead = false; mark(s, o.x, o.y, i + 1); });
    return s;
  },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .05); stepParts(s.parts, dt);
    s.b.forEach((b, i) => { // read every frame, so a quick tap between two grid steps is never lost
      for (const k of pad(inp, i).order) if (DIRS[k] && b.q.length < 3) b.q.push(k);
    });
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.3 ? s.res : null }; }
    s.acc += dt;
    if (s.acc < STEP) return { winner: null };
    s.acc -= STEP;
    const n = s.b.map(b => {
      while (b.q.length) { // apply ONE valid turn per step; skip presses that would reverse or repeat the heading
        const [dx, dy] = DIRS[b.q.shift()];
        if ((dx === -b.dx && dy === -b.dy) || (dx === b.dx && dy === b.dy)) continue;
        b.dx = dx; b.dy = dy; audio.beep(660, .03, "square", .05); break;
      }
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
    if (!s.layer) return;
    ctx.drawImage(s.layer, 0, 0);
    ctx.fillStyle = INK; s.b.forEach(b => { if (!b.dead) ctx.fillRect(b.x * G, b.y * G, G, G); });
    drawParts(ctx, s.parts);
    ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8);
  },
  cleanup(s) { if (s) { s.layer = s.lx = null; } }
};

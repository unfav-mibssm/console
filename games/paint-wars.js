import { W, H, TAU, INK, C, clamp, pad, dirOf, burst, stepParts, drawParts } from "../kit.js";
// Run around and paint the floor your colour. Painting over your rival's colour slows them down. Press A for a big splat (recharges).
// After 60 seconds the player who owns the most floor wins.
const CS = 40, GW = 32, GH = 18, R = 22, SPD = 250, TIME = 60, SPLAT_CD = 3.5, SPLAT_R = 110;
const BLOCKS = [[6, 3, 2, 2], [24, 3, 2, 2], [6, 13, 2, 2], [24, 13, 2, 2], [15, 8, 2, 2]]; // [col, row, w, h] in cells, mirror-symmetric
const WALLS = BLOCKS.map(([c, r, w, h]) => [c * CS, r * CS, w * CS, h * CS]);
function push(o, r, w) { // keep a circle out of a rectangle
  const cx = clamp(o.x, w[0], w[0] + w[2]), cy = clamp(o.y, w[1], w[1] + w[3]), dx = o.x - cx, dy = o.y - cy, d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;
  if (d2 < 1e-6) { const l = o.x - w[0], rt = w[0] + w[2] - o.x, t = o.y - w[1], b = w[1] + w[3] - o.y, m = Math.min(l, rt, t, b); if (m === l) o.x = w[0] - r; else if (m === rt) o.x = w[0] + w[2] + r; else if (m === t) o.y = w[1] - r; else o.y = w[1] + w[3] + r; return; }
  const d = Math.sqrt(d2); o.x = cx + dx / d * r; o.y = cy + dy / d * r;
}
export default {
  init() {
    const grid = new Int8Array(GW * GH); for (const [c, r, w, h] of BLOCKS) for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) grid[y * GW + x] = -1;
    const s = { grid, t: 0, n: [0, 0], free: grid.reduce((a, v) => a + (v === 0 ? 1 : 0), 0), parts: [], res: null, endT: 0,
      p: [{ x: 3.5 * CS, y: 9 * CS, cd: 0 }, { x: (GW - 3.5) * CS, y: 9 * CS, cd: 0 }] };
    return s;
  },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); stepParts(s.parts, dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.3 ? s.res : null }; }
    s.t += dt;
    const paint = (i, x, y, rad) => { // claim every floor cell whose centre is within rad of (x, y)
      const x0 = Math.max(0, Math.floor((x - rad) / CS)), x1 = Math.min(GW - 1, Math.floor((x + rad) / CS)), y0 = Math.max(0, Math.floor((y - rad) / CS)), y1 = Math.min(GH - 1, Math.floor((y + rad) / CS));
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        const g = s.grid[cy * GW + cx]; if (g < 0 || g === i + 1) continue;
        if (Math.hypot((cx + .5) * CS - x, (cy + .5) * CS - y) > rad) continue;
        if (g > 0) s.n[g - 1]--; s.grid[cy * GW + cx] = i + 1; s.n[i]++;
      }
    };
    s.p.forEach((o, i) => {
      const k = pad(inp, i), d = dirOf(k.held), len = Math.hypot(d.x, d.y) || 1; o.cd = Math.max(0, o.cd - dt);
      const on = s.grid[clamp(Math.floor(o.y / CS), 0, GH - 1) * GW + clamp(Math.floor(o.x / CS), 0, GW - 1)], sp = SPD * (on === 2 - i ? .72 : 1); // enemy paint is sticky
      o.x = clamp(o.x + d.x / len * sp * dt, R, W - R); o.y = clamp(o.y + d.y / len * sp * dt, R, H - R);
      for (const w of WALLS) push(o, R, w);
    });
    const [a, b] = s.p, dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy) || 1, ov = R * 2 - dd;
    if (ov > 0) { a.x -= dx / dd * ov / 2; a.y -= dy / dd * ov / 2; b.x += dx / dd * ov / 2; b.y += dy / dd * ov / 2; for (const o of s.p) { o.x = clamp(o.x, R, W - R); o.y = clamp(o.y, R, H - R); for (const w of WALLS) push(o, R, w); } }
    s.p.forEach((o, i) => {
      paint(i, o.x, o.y, 38);
      if (pad(inp, i).taps.a > 0 && o.cd <= 0) { o.cd = SPLAT_CD; paint(i, o.x, o.y, SPLAT_R); burst(s.parts, o.x, o.y, 36, C[i], 520); audio.noise(.15, .2); audio.beep(200, .18, "sawtooth", .12, 520); }
    });
    if (s.t >= TIME) { s.res = s.n[0] === s.n[1] ? "draw" : s.n[0] > s.n[1] ? "p1" : "p2"; audio.beep(660, .4, "triangle", .15, 330); }
    return { winner: null };
  },
  render(ctx, cv, s) {
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const g = s.grid[y * GW + x]; ctx.fillStyle = g === -1 ? INK : g === 1 ? "#8fb2ff" : g === 2 ? "#ff9db0" : (x + y) % 2 ? "#f6e9a9" : "#fff4c2"; ctx.fillRect(x * CS, y * CS, CS, CS);
      if (g === -1) { ctx.fillStyle = "#4b4670"; ctx.fillRect(x * CS + 4, y * CS + 4, CS - 8, CS - 8); }
    }
    s.p.forEach((o, i) => {
      ctx.fillStyle = C[i]; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(o.x, o.y, R, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(o.x - 7, o.y - 4, 5, 0, TAU); ctx.arc(o.x + 7, o.y - 4, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = o.cd > 0 ? "#00000044" : "#fde047"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(o.x, o.y, R + 8, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - o.cd / SPLAT_CD)); ctx.stroke(); // splat charge ring
    });
    const tot = Math.max(1, s.n[0] + s.n[1]), left = Math.max(0, Math.ceil(TIME - s.t));
    ctx.fillStyle = "#ffffffd0"; ctx.fillRect(W / 2 - 300, 6, 600, 34); ctx.fillStyle = C[0]; ctx.fillRect(W / 2 - 296, 10, 592 * s.n[0] / tot, 26); ctx.fillStyle = C[1]; ctx.fillRect(W / 2 - 296 + 592 * s.n[0] / tot, 10, 592 * s.n[1] / tot, 26);
    ctx.fillStyle = INK; ctx.font = "700 26px Fredoka, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.lineWidth = 6; ctx.strokeStyle = "#fff"; ctx.strokeText(left + "s", W / 2, 66); ctx.fillText(left + "s", W / 2, 66);
    ctx.textAlign = "left"; ctx.fillText(Math.round(100 * s.n[0] / s.free) + "%", 12, 32); ctx.textAlign = "right"; ctx.fillText(Math.round(100 * s.n[1] / s.free) + "%", W - 12, 32);
    drawParts(ctx, s.parts);
  },
  cleanup() {}
};

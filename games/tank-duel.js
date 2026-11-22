import { W, H, TAU, INK, C, clamp, pad, dirOf, burst, stepParts, drawParts } from "../kit.js";
// Drive with the D-pad (8 directions), fire with A. Each shot bounces off a wall once. 3 hit points per round; first to 3 round wins.
const TR = 26, BR = 7, SPD = 230, BSPD = 560, WIN = 3, HP = 3, FIRE_CD = .42, MAXB = 3;
const half = [[230, 120, 70, 160], [230, H - 280, 70, 160], [440, 250, 80, 80], [440, H - 330, 80, 80]];
const WALLS = [...half, ...half.map(([x, y, w, h]) => [W - x - w, y, w, h]), [W / 2 - 35, H / 2 - 70, 70, 140], [W / 2 - 150, 90, 300, 40], [W / 2 - 150, H - 130, 300, 40]]; // mirror-symmetric, fair for both players
const START = [{ x: 110, y: H / 2, a: 0 }, { x: W - 110, y: H / 2, a: Math.PI }];

// Push a circle (o, radius r) out of rectangle w. Returns the contact normal, or null when not touching.
function push(o, r, w) {
  const cx = clamp(o.x, w[0], w[0] + w[2]), cy = clamp(o.y, w[1], w[1] + w[3]), dx = o.x - cx, dy = o.y - cy, d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 < 1e-6) { // centre inside the rectangle: leave through the nearest side
    const l = o.x - w[0], rt = w[0] + w[2] - o.x, t = o.y - w[1], b = w[1] + w[3] - o.y, m = Math.min(l, rt, t, b);
    if (m === l) { o.x = w[0] - r; return [-1, 0]; } if (m === rt) { o.x = w[0] + w[2] + r; return [1, 0]; }
    if (m === t) { o.y = w[1] - r; return [0, -1]; } o.y = w[1] + w[3] + r; return [0, 1];
  }
  const d = Math.sqrt(d2); o.x = cx + dx / d * r; o.y = cy + dy / d * r; return [dx / d, dy / d];
}
const turn = (a, t, step) => a + clamp(((t - a + Math.PI) % TAU + TAU) % TAU - Math.PI, -step, step);
const newRound = s => { s.phase = "play"; s.pt = 0; s.bullets = []; s.t = START.map(p => ({ ...p, hp: HP, inv: 0, cd: 0 })); s.msg = ""; };

export default {
  init() { const s = { round: 1, wins: [0, 0], parts: [], res: null, endT: 0 }; newRound(s); return s; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); stepParts(s.parts, dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.3 ? s.res : null }; }
    if (s.phase === "end") { // short pause after a round, then the next one (or the match result)
      s.pt += dt;
      if (s.pt > 1.6) { if (s.wins[0] >= WIN || s.wins[1] >= WIN) s.res = s.wins[0] > s.wins[1] ? "p1" : "p2"; else { s.round++; newRound(s); } }
      return { winner: null };
    }
    s.t.forEach((o, i) => {
      const k = pad(inp, i), d = dirOf(k.held), len = Math.hypot(d.x, d.y);
      o.cd = Math.max(0, o.cd - dt); o.inv = Math.max(0, o.inv - dt);
      if (len) { o.a = turn(o.a, Math.atan2(d.y, d.x), 12 * dt); o.x += d.x / len * SPD * dt; o.y += d.y / len * SPD * dt; }
      o.x = clamp(o.x, TR, W - TR); o.y = clamp(o.y, TR, H - TR);
      for (const w of WALLS) push(o, TR, w);
      if ((k.taps.a > 0 || k.held.a) && o.cd <= 0 && s.bullets.filter(b => b.o === i).length < MAXB) {
        o.cd = FIRE_CD; const c = Math.cos(o.a), sn = Math.sin(o.a);
        s.bullets.push({ x: o.x + c * (TR + BR + 2), y: o.y + sn * (TR + BR + 2), vx: c * BSPD, vy: sn * BSPD, o: i, age: 0, bounces: 1 });
        audio.beep(200, .08, "sawtooth", .1, 120);
      }
    });
    const [a, b] = s.t, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ov = TR * 2 - d; // tanks cannot drive through each other
    if (ov > 0) { const nx = dx / d, ny = dy / d; a.x -= nx * ov / 2; a.y -= ny * ov / 2; b.x += nx * ov / 2; b.y += ny * ov / 2; for (const t of s.t) for (const w of WALLS) push(t, TR, w); }
    for (let i = s.bullets.length - 1; i >= 0; i--) {
      const bl = s.bullets[i]; bl.age += dt; let dead = bl.age > 3.5;
      for (let sub = 0; sub < 2 && !dead; sub++) {
        bl.x += bl.vx * dt / 2; bl.y += bl.vy * dt / 2;
        let nx = 0, ny = 0;
        if (bl.x < BR) { bl.x = BR; nx = 1; } else if (bl.x > W - BR) { bl.x = W - BR; nx = -1; }
        if (bl.y < BR) { bl.y = BR; ny = 1; } else if (bl.y > H - BR) { bl.y = H - BR; ny = -1; }
        for (const w of WALLS) { const n = push(bl, BR, w); if (n) { nx = n[0]; ny = n[1]; break; } }
        if (nx || ny) {
          if (bl.bounces-- <= 0) { dead = true; burst(s.parts, bl.x, bl.y, 6, INK, 120); }
          else { const dot = bl.vx * nx + bl.vy * ny; if (dot < 0) { bl.vx -= 2 * dot * nx; bl.vy -= 2 * dot * ny; } audio.beep(420, .03, "square", .06); }
        }
      }
      if (!dead) for (let j = 0; j < 2; j++) {
        const t = s.t[j]; if (t.hp <= 0 || t.inv > 0 || (bl.o === j && bl.age < .25)) continue; // a shot cannot hit its own tank in the first moments
        if (Math.hypot(bl.x - t.x, bl.y - t.y) < TR + BR) {
          t.hp--; t.inv = .5; dead = true; burst(s.parts, bl.x, bl.y, t.hp > 0 ? 18 : 60, C[j], t.hp > 0 ? 300 : 560); audio.noise(.15, .2); audio.beep(110, .2, "sawtooth", .2, 50); break;
        }
      }
      if (dead) s.bullets.splice(i, 1);
    }
    const out = [s.t[0].hp <= 0, s.t[1].hp <= 0];
    if (out[0] || out[1]) {
      s.phase = "end"; s.pt = 0;
      if (out[0] && out[1]) s.msg = "Double knock-out! Replay."; else { const w = out[0] ? 1 : 0; s.wins[w]++; s.msg = `Player ${w + 1} wins the round!`; }
      audio.beep(520, .25, "triangle", .15, 780);
    }
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.fillStyle = "#f4efe0"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#e6dfc8"; ctx.lineWidth = 2; ctx.beginPath(); for (let x = 0; x <= W; x += 64) { ctx.moveTo(x, 0); ctx.lineTo(x, H); } for (let y = 0; y <= H; y += 64) { ctx.moveTo(0, y); ctx.lineTo(W, y); } ctx.stroke();
    for (const w of WALLS) { ctx.fillStyle = INK; ctx.fillRect(w[0], w[1], w[2], w[3]); ctx.fillStyle = "#4b4670"; ctx.fillRect(w[0] + 6, w[1] + 6, w[2] - 12, w[3] - 12); }
    ctx.strokeStyle = INK; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
    for (const b of s.bullets) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, TAU); ctx.fill(); }
    s.t.forEach((o, i) => {
      if (o.hp <= 0 || (o.inv > 0 && Math.floor(o.inv * 14) % 2)) return;
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a); ctx.lineWidth = 5; ctx.strokeStyle = INK;
      ctx.fillStyle = INK; ctx.fillRect(-25, -27, 50, 10); ctx.fillRect(-25, 17, 50, 10); // treads
      ctx.fillStyle = C[i]; ctx.fillRect(-22, -20, 44, 40); ctx.strokeRect(-22, -20, 44, 40);
      ctx.fillStyle = INK; ctx.fillRect(0, -5, TR + 18, 10); // barrel
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      for (let h = 0; h < HP; h++) { ctx.beginPath(); ctx.arc(o.x - 18 + h * 18, o.y - TR - 18, 6, 0, TAU); ctx.fillStyle = h < o.hp ? C[i] : "#fff"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); }
    });
    for (let i = 0; i < 2; i++) for (let w = 0; w < WIN; w++) { ctx.beginPath(); ctx.arc(i ? W - 40 - w * 34 : 40 + w * 34, 34, 12, 0, TAU); ctx.fillStyle = w < s.wins[i] ? C[i] : "#fff"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); } // rounds won
    ctx.textAlign = "center"; ctx.fillStyle = INK; ctx.font = "700 26px Fredoka, system-ui, sans-serif"; ctx.fillText(`Round ${s.round}`, W / 2, 40);
    if (s.phase === "end") { ctx.font = "700 64px Fredoka, system-ui, sans-serif"; ctx.lineWidth = 10; ctx.strokeStyle = "#fff"; ctx.strokeText(s.msg, W / 2, H / 2 + 20); ctx.fillText(s.msg, W / 2, H / 2 + 20); }
    drawParts(ctx, s.parts);
  },
  cleanup() {}
};

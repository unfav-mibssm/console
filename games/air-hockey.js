import { W, H, TAU, INK, C, rnd, clamp, pad, dirOf, burst, stepParts, drawParts } from "../kit.js";
// Slide your mallet with the D-pad (any of 8 directions). Hold A to boost; it drains a meter. First to 5 goals wins.
const MR = 44, PR = 26, GOAL = 260, WIN = 5, MAXV = 1500, BASE = 520, BOOST = 1.7;
const G0 = (H - GOAL) / 2, G1 = G0 + GOAL; // the goal mouth sits between these two y values on the left and right walls
const F = "700 110px Fredoka, system-ui, sans-serif";

const spawnPuck = (s, toward) => { s.puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 }; s.serveDir = toward; s.wait = 1; s.still = 0; }; // toward: 0 = left, 1 = right
function goal(s, w, audio) { // w = scorer
  s.score[w]++; s.flash = .6; burst(s.parts, w ? 40 : W - 40, H / 2, 50, C[w], 500); audio.noise(.3, .25); audio.beep(660, .2, "square", .15, 990);
  if (s.score[w] >= WIN) { s.res = w ? "p2" : "p1"; s.puck.vx = s.puck.vy = 0; s.puck.x = -999; } else spawnPuck(s, w ? 0 : 1); // serve toward the player who conceded
}
function collide(s, p, m, audio) { // the mallet is "infinitely heavy": it pushes the puck out and bounces it off its own velocity
  const dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy), min = PR + MR;
  if (d >= min) return;
  const nx = d ? dx / d : 1, ny = d ? dy / d : 0;
  p.x = m.x + nx * min; p.y = m.y + ny * min;
  const rv = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
  if (rv < 0) { const j = -(1.9) * rv; p.vx += nx * j; p.vy += ny * j; audio.beep(240 + Math.min(500, -rv / 3), .05, "triangle", .14); burst(s.parts, p.x - nx * PR, p.y - ny * PR, 6, "#ffffff", 180); }
  const out = p.vx * nx + p.vy * ny; if (out < 200) { p.vx += nx * (200 - out); p.vy += ny * (200 - out); } // never stays glued to a mallet
}
export default {
  init() {
    const s = { m: [0, 1].map(i => ({ x: W * (i ? .85 : .15), y: H / 2, vx: 0, vy: 0, en: 1 })), score: [0, 0], parts: [], res: null, endT: 0, flash: 0 };
    spawnPuck(s, Math.random() < .5 ? 0 : 1); return s;
  },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); stepParts(s.parts, dt); s.flash = Math.max(0, s.flash - dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.2 ? s.res : null }; }
    s.m.forEach((o, i) => { // mallet velocity eases toward the D-pad direction
      const k = pad(inp, i).held, d = dirOf(k), len = Math.hypot(d.x, d.y) || 1, moving = !!(d.x || d.y), boost = k.a && o.en > .04 && moving;
      o.en = clamp(o.en + (boost ? -.9 : .3) * dt, 0, 1);
      const sp = BASE * (boost ? BOOST : 1), a = 1 - Math.exp(-16 * dt);
      o.vx += (d.x / len * sp - o.vx) * a; o.vy += (d.y / len * sp - o.vy) * a;
    });
    const p = s.puck;
    if (s.wait > 0 && (s.wait -= dt) <= 0) { p.vx = (s.serveDir ? 1 : -1) * 380; p.vy = rnd(-140, 140); }
    const n = clamp(Math.ceil(Math.max(Math.hypot(p.vx, p.vy), BASE * BOOST) * dt / 14), 1, 8), h = dt / n; // small sub-steps so nothing tunnels
    for (let st = 0; st < n; st++) {
      s.m.forEach((o, i) => {
        o.x += o.vx * h; o.y += o.vy * h;
        const lo = i ? W / 2 + MR + 6 : MR, hi = i ? W - MR : W / 2 - MR - 6; // each player stays on their own half
        if (o.x < lo) { o.x = lo; o.vx = Math.max(0, o.vx); } if (o.x > hi) { o.x = hi; o.vx = Math.min(0, o.vx); }
        if (o.y < MR) { o.y = MR; o.vy = Math.max(0, o.vy); } if (o.y > H - MR) { o.y = H - MR; o.vy = Math.min(0, o.vy); }
      });
      if (s.wait > 0) continue;
      p.x += p.vx * h; p.y += p.vy * h;
      for (const m of s.m) collide(s, p, m, audio);
      if (p.y < PR) { p.y = PR; p.vy = Math.abs(p.vy) * .96; audio.beep(300, .03, "square", .06); }
      if (p.y > H - PR) { p.y = H - PR; p.vy = -Math.abs(p.vy) * .96; audio.beep(300, .03, "square", .06); }
      if (!(p.y > G0 + 6 && p.y < G1 - 6)) { // outside the goal mouth the end walls are solid
        if (p.x < PR) { p.x = PR; p.vx = Math.abs(p.vx) * .96; audio.beep(260, .03, "square", .06); }
        if (p.x > W - PR) { p.x = W - PR; p.vx = -Math.abs(p.vx) * .96; audio.beep(260, .03, "square", .06); }
      }
      if (p.x < -PR || p.x > W + PR) { goal(s, p.x > W ? 0 : 1, audio); break; }
    }
    if (!s.res && s.wait <= 0) {
      const f = Math.pow(.72, dt); p.vx *= f; p.vy *= f;
      const sp = Math.hypot(p.vx, p.vy); if (sp > MAXV) { p.vx *= MAXV / sp; p.vy *= MAXV / sp; }
      s.still = sp < 25 ? s.still + dt : 0; if (s.still > 2.5) { p.vx = rnd(-200, 200); p.vy = rnd(-200, 200); s.still = 0; } // a stuck puck gets a nudge
    }
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.fillStyle = "#e6f6ff"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#9ccbe8"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 110, 0, TAU); ctx.stroke();
    ctx.font = F; ctx.textAlign = "center"; ctx.globalAlpha = .3;
    ctx.fillStyle = C[0]; ctx.fillText(s.score[0], W * .3, H / 2 + 38); ctx.fillStyle = C[1]; ctx.fillText(s.score[1], W * .7, H / 2 + 38); ctx.globalAlpha = 1;
    ctx.fillStyle = C[0] + "55"; ctx.fillRect(0, G0, 20, GOAL); ctx.fillStyle = C[1] + "55"; ctx.fillRect(W - 20, G0, 20, GOAL);
    ctx.strokeStyle = INK; ctx.lineWidth = 10; ctx.beginPath(); // walls with the two goal mouths cut out
    ctx.moveTo(0, G0); ctx.lineTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, G0); ctx.moveTo(0, G1); ctx.lineTo(0, H); ctx.lineTo(W, H); ctx.lineTo(W, G1); ctx.stroke();
    s.m.forEach((o, i) => {
      ctx.fillStyle = C[i]; ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(o.x, o.y, MR, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffffff55"; ctx.beginPath(); ctx.arc(o.x, o.y, MR * .55, 0, TAU); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.stroke();
      const bx = i ? W - 250 : 50; ctx.fillStyle = INK; ctx.fillRect(bx, H - 34, 200, 14); ctx.fillStyle = o.en > .3 ? C[i] : "#fff"; ctx.fillRect(bx + 3, H - 31, 194 * o.en, 8); // boost meter
    });
    if (s.puck.x > -900) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s.puck.x, s.puck.y, PR, 0, TAU); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s.puck.x, s.puck.y, PR - 7, 0, TAU); ctx.stroke(); }
    drawParts(ctx, s.parts);
    if (s.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.flash * .6})`; ctx.fillRect(0, 0, W, H); }
  },
  cleanup() {}
};

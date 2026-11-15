import { W, H, TAU, INK, C, rnd, pad, newTaps, burst, stepParts, drawParts } from "../kit.js";
const ROUNDS = 3, bx = i => W * (i ? .75 : .25);
const round = s => { s.phase = "play"; s.t = 0; s.pump = [0, 0]; s.lock = [false, false]; s.pop = [false, false]; s.lim = [0, 1].map(() => Math.round(rnd(6, 22))); };
export default {
  id: "balloon-bank", title: "Balloon Bank", icon: "🎈", accentColor: "#ec4899",
  description: "Pump to earn points, but bank them before your balloon pops. Best total after 3 rounds wins.",
  controllerLayout: "left-right", controllerLabels: { left: "Pump", right: "Bank" },
  init() { const s = { r: 1, total: [0, 0], seen: null, parts: [], res: null, endT: 0 }; round(s); return s; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .05); stepParts(s.parts, dt);
    const t = [pad(inp, 0), pad(inp, 1)].map(x => [x.tapLeft | 0, x.tapRight | 0]); // left = pump, right = bank
    if (!s.seen) s.seen = t;
    const n = t.map((x, i) => [newTaps(x[0], s.seen[i][0]), newTaps(x[1], s.seen[i][1])]); s.seen = t;
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.3 ? s.res : null }; }
    s.t += dt;
    if (s.phase === "play") {
      [0, 1].forEach(i => {
        if (s.lock[i]) return;
        if (n[i][0]) {
          s.pump[i] += Math.min(n[i][0], 4); audio.beep(300 + s.pump[i] * 18, .04, "triangle", .1);
          if (s.pump[i] > s.lim[i]) { s.pop[i] = s.lock[i] = true; burst(s.parts, bx(i), 330, 40, C[i], 450); audio.noise(.35, .3); return; }
        }
        if (n[i][1] && s.pump[i] > 0) { s.lock[i] = true; audio.beep(880, .12, "square", .12); }
      });
      if (s.t > 14) s.lock = [true, true]; // time's up: everyone banks
      if (s.lock[0] && s.lock[1]) { s.phase = "show"; s.t = 0; [0, 1].forEach(i => s.total[i] += s.pop[i] ? 0 : s.pump[i]); }
    } else if (s.t > 2.2) {
      if (s.r >= ROUNDS) { const d = s.total[0] - s.total[1]; s.res = d > 0 ? "p1" : d < 0 ? "p2" : "draw"; }
      else { s.r++; round(s); }
    }
    return { winner: null };
  },
  render(ctx, cv, s, pl) {
    ctx.fillStyle = "#fff4c2"; ctx.fillRect(0, 0, W, H); ctx.textAlign = "center"; ctx.fillStyle = INK; ctx.fillRect(0, 640, W, H - 640);
    ctx.font = "700 44px Fredoka, system-ui, sans-serif"; ctx.fillText(`Round ${s.r} of ${ROUNDS}`, W / 2, 56);
    [0, 1].forEach(i => {
      const x = bx(i), nm = pl["p" + (i + 1)]?.name || "Player " + (i + 1);
      ctx.fillStyle = "#fff"; ctx.font = "700 34px Fredoka, system-ui, sans-serif"; ctx.fillText(`${nm}: ${s.total[i]} pts`, x, 690);
      if (s.pop[i]) { ctx.fillStyle = C[i]; ctx.font = "700 90px Fredoka, system-ui, sans-serif"; ctx.fillText("POP!", x, 500); return; }
      const r = 40 + s.pump[i] * 8.5, cy = 600 - r * 1.15, wob = s.lock[i] ? 0 : Math.sin(s.t * 40) * Math.pow(s.pump[i] / s.lim[i], 3) * 9; // wobble = it's about to pop
      ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, 600); ctx.lineTo(x, 640); ctx.stroke();
      ctx.fillStyle = C[i]; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(x + wob, cy, r, r * 1.15, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "700 64px Fredoka, system-ui, sans-serif"; ctx.fillText(s.pump[i], x + wob, cy + 22);
      if (s.lock[i]) { ctx.font = "700 32px Fredoka, system-ui, sans-serif"; ctx.fillText("Banked", x, cy + 64); }
    });
    drawParts(ctx, s.parts);
  },
  cleanup() {}
};

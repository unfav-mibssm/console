import { W, H, TAU, INK, C, pad, newTaps, burst, stepParts, drawParts } from "../kit.js";
export default {
  id: "tug-of-war", icon: "💪", title: "Tug of War", accentColor: "#22c55e",
  description: "Tap as fast as you can to drag the flag to your side.",
  controllerLayout: "single-button", controllerLabels: { btnA: "Tap!" },
  init() { return { pos: .5, seen: null, res: null, endT: 0, parts: [] }; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .05); stepParts(s.parts, dt);
    const t = [pad(inp, 0).tapA | 0, pad(inp, 1).tapA | 0];
    if (!s.seen) s.seen = t; // ignore taps from before the round
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.2 ? s.res : null }; }
    const n = [Math.min(newTaps(t[0], s.seen[0]), 12), Math.min(newTaps(t[1], s.seen[1]), 12)];
    s.seen = t; s.pos += (n[1] - n[0]) * .012; // Player 1 pulls left, Player 2 pulls right
    if (n[0] + n[1]) audio.beep(n[0] >= n[1] ? 520 : 420, .03, "square", .05);
    if (s.pos <= 0 || s.pos >= 1) {
      const w = s.pos <= 0 ? 0 : 1; s.pos = w; s.res = w ? "p2" : "p1";
      burst(s.parts, Math.min(Math.max(s.pos * W, 60), W - 60), H / 2, 60, C[w], 500); audio.noise(.4, .25);
    }
    return { winner: null };
  },
  render(ctx, cv, s, pl) {
    ctx.fillStyle = "#fff4c2"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = C[0] + "33"; ctx.fillRect(0, 0, W / 2, H); ctx.fillStyle = C[1] + "33"; ctx.fillRect(W / 2, 0, W / 2, H);
    ctx.fillStyle = INK; ctx.fillRect(W / 2 - 3, 0, 6, H); ctx.fillRect(0, H / 2 - 6, W, 12);
    ctx.font = "700 44px Fredoka, system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillStyle = C[0]; ctx.fillText(pl.p1?.name || "Player 1", W * .25, 90); ctx.fillStyle = C[1]; ctx.fillText(pl.p2?.name || "Player 2", W * .75, 90);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(s.pos * W, H / 2, 48, 0, TAU); ctx.fill(); ctx.stroke();
    drawParts(ctx, s.parts);
  },
  cleanup() {}
};

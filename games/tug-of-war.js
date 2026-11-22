import { W, H, TAU, INK, C, pad, burst, stepParts, drawParts } from "../kit.js";
// Tap A as fast as you can. Every tap pulls the flag 1.2% of the way to your side.
export default {
  init() { return { pos: .5, res: null, endT: 0, parts: [], taps: [0, 0] }; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .05); stepParts(s.parts, dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.2 ? s.res : null }; }
    const n = [Math.min(pad(inp, 0).taps.a, 12), Math.min(pad(inp, 1).taps.a, 12)]; // taps since the last frame (a tap shorter than a frame still counts)
    s.taps[0] += n[0]; s.taps[1] += n[1]; s.pos += (n[1] - n[0]) * .012; // Player 1 pulls left, Player 2 pulls right
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
    ctx.font = "700 30px Fredoka, system-ui, sans-serif"; ctx.globalAlpha = .6; ctx.fillStyle = C[0]; ctx.fillText(s.taps[0] + " taps", W * .25, 135); ctx.fillStyle = C[1]; ctx.fillText(s.taps[1] + " taps", W * .75, 135); ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(s.pos * W, H / 2, 48, 0, TAU); ctx.fill(); ctx.stroke();
    drawParts(ctx, s.parts);
  },
  cleanup() {}
};

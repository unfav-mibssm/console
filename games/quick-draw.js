import { W, H, INK, C, rnd, pad, newTaps, burst, stepParts, drawParts } from "../kit.js";
const WIN = 2; // best of 3
const next = s => { s.phase = "wait"; s.t = 0; s.delay = rnd(1.6, 4.6); s.msg = ""; };
const point = (s, w, msg, audio) => { // w = 0 / 1 for the round winner, -1 for no winner
  s.phase = "show"; s.t = 0; s.msg = msg;
  if (w < 0) { audio.beep(200, .2, "sawtooth", .15); return; }
  s.score[w]++; burst(s.parts, W * (w ? .75 : .25), H * .5, 40, C[w], 420); audio.beep(660, .15, "square", .15);
  if (s.score[w] >= WIN) s.res = w ? "p2" : "p1";
};
export default {
  id: "quick-draw", title: "Quick Draw", icon: "🤠", accentColor: "#f59e0b",
  description: "Wait for the signal, then tap first. Tap too early and you lose the round. Best of 3.",
  controllerLayout: "single-button", controllerLabels: { btnA: "Tap!" },
  init(cv, pl) { const s = { score: [0, 0], seen: null, parts: [], res: null, endT: 0, names: [pl.p1?.name || "Player 1", pl.p2?.name || "Player 2"] }; next(s); return s; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .05); stepParts(s.parts, dt);
    const t = [pad(inp, 0).tapA | 0, pad(inp, 1).tapA | 0];
    if (!s.seen) s.seen = t; // ignore taps from before the round
    const n = [newTaps(t[0], s.seen[0]), newTaps(t[1], s.seen[1])]; s.seen = t;
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.4 ? s.res : null }; }
    s.t += dt;
    if (s.phase === "wait") {
      if (s.t < .35) n[0] = n[1] = 0; // grace: late taps from the last round do not count
      if (n[0] && n[1]) point(s, -1, "Both jumped the gun!", audio);
      else if (n[0] || n[1]) point(s, n[0] ? 1 : 0, s.names[n[0] ? 0 : 1] + " jumped the gun!", audio);
      else if (s.t >= s.delay) { s.phase = "go"; s.t = 0; audio.beep(880, .25, "square", .2); }
    } else if (s.phase === "go") {
      if (n[0] || n[1]) { const w = n[0] === n[1] ? -1 : n[0] > n[1] ? 0 : 1; point(s, w, w < 0 ? "Dead heat!" : s.names[w] + " was faster!", audio); }
      else if (s.t > 4) point(s, -1, "Too slow, both of you!", audio);
    } else if (s.t > 1.6) next(s);
    return { winner: null };
  },
  render(ctx, cv, s) {
    const go = s.phase === "go";
    ctx.fillStyle = go ? "#86efac" : "#fff4c2"; ctx.fillRect(0, 0, W, H); ctx.textAlign = "center"; ctx.fillStyle = INK;
    ctx.font = `700 ${s.phase === "show" ? 72 : 150}px Fredoka, system-ui, sans-serif`;
    ctx.fillText(go ? "TAP!" : s.phase === "wait" ? "Wait…" : s.msg, W / 2, H / 2 + 30);
    ctx.font = "700 38px Fredoka, system-ui, sans-serif"; ctx.globalAlpha = .7;
    ctx.fillText(s.phase === "wait" ? "Tap too early and you lose the round" : "", W / 2, H / 2 + 120); ctx.globalAlpha = 1;
    [0, 1].forEach(i => { ctx.fillStyle = C[i]; ctx.font = "700 52px Fredoka, system-ui, sans-serif"; ctx.fillText(`${s.names[i]}: ${s.score[i]}`, W * (i ? .75 : .25), 90); });
    drawParts(ctx, s.parts);
  },
  cleanup() {}
};

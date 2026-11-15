import { W, H, TAU, INK, C, pad, burst, stepParts, drawParts } from "../kit.js";
const PH = 130, PW = 18, PX = 44, BR = 14, WIN = 5;
const serve = (s, dir) => { const a = (Math.random() - .5) * .8; s.ball = { x: W / 2, y: H / 2, vx: Math.cos(a) * 440 * dir, vy: Math.sin(a) * 440 }; s.wait = .9; };
export default {
  id: "pong", title: "Pong", icon: "🏓", accentColor: C[0],
  description: "Hold Up and Down to move your paddle. First to 5 points wins.",
  controllerLayout: "up-down",
  init() { const s = { y: [H / 2, H / 2], score: [0, 0], parts: [], res: null, endT: 0 }; serve(s, Math.random() < .5 ? -1 : 1); return s; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); stepParts(s.parts, dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.2 ? s.res : null }; }
    [0, 1].forEach(i => { const k = pad(inp, i); s.y[i] = Math.max(PH / 2, Math.min(H - PH / 2, s.y[i] + ((k.down ? 1 : 0) - (k.up ? 1 : 0)) * 560 * dt)); });
    if (s.wait > 0) { s.wait -= dt; return { winner: null }; }
    const b = s.ball; b.x += b.vx * dt; b.y += b.vy * dt;
    if ((b.y < BR && b.vy < 0) || (b.y > H - BR && b.vy > 0)) { b.vy *= -1; audio.beep(300, .04, "square", .08); }
    [0, 1].forEach(i => {
      const px = i ? W - PX : PX;
      if (Math.abs(b.x - px) < PW / 2 + BR && Math.abs(b.y - s.y[i]) < PH / 2 + BR && (i ? b.vx > 0 : b.vx < 0)) {
        const sp = Math.min(Math.hypot(b.vx, b.vy) * 1.06, 950), a = (b.y - s.y[i]) / (PH / 2) * .9; // hit offset steers the ball
        b.vx = Math.cos(a) * sp * (i ? -1 : 1); b.vy = Math.sin(a) * sp;
        audio.beep(520 + sp / 4, .05, "square", .12); burst(s.parts, b.x, b.y, 8, C[i], 200);
      }
    });
    if (b.x < -BR || b.x > W + BR) {
      const w = b.x > W ? 0 : 1; s.score[w]++;
      burst(s.parts, w ? 30 : W - 30, b.y, 30, C[w], 400); audio.noise(.25, .2);
      if (s.score[w] >= WIN) s.res = w ? "p2" : "p1"; else serve(s, w ? -1 : 1);
    }
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.fillStyle = "#fff4c2"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = INK; for (let y = 10; y < H; y += 40) ctx.fillRect(W / 2 - 3, y, 6, 22);
    ctx.font = "700 120px Fredoka, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.globalAlpha = .35;
    ctx.fillStyle = C[0]; ctx.fillText(s.score[0], W * .27, 150); ctx.fillStyle = C[1]; ctx.fillText(s.score[1], W * .73, 150); ctx.globalAlpha = 1;
    [0, 1].forEach(i => { const x = (i ? W - PX : PX) - PW / 2; ctx.fillStyle = C[i]; ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.fillRect(x, s.y[i] - PH / 2, PW, PH); ctx.strokeRect(x, s.y[i] - PH / 2, PW, PH); });
    if (!s.res) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, BR, 0, TAU); ctx.fill(); }
    drawParts(ctx, s.parts);
  },
  cleanup() {}
};

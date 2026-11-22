import { W, H, TAU, INK, C, rnd, pad, verdict, burst, stepParts, drawParts } from "../kit.js";
// Steer with Left/Right, hold A to dash. The ring shrinks over 45 s; whoever leaves it first loses.
const KICK_CD = .35; // a dash "kick" can be used every 0.35 s, so mashing A is no longer stronger than holding it
export default {
  init() {
    return { t: 0, R: 320, shake: 0, res: null, endT: 0, parts: [],
      pods: [0, 1].map(i => ({ x: W / 2 + (i ? 160 : -160), y: H / 2, vx: 0, vy: 0, a: i ? Math.PI : 0, r: 30, dash: false, wasDash: false, dead: false, cd: 0 })) };
  },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); s.shake = Math.max(0, s.shake - 40 * dt); stepParts(s.parts, dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.2 ? s.res : null }; }
    s.t += dt; s.R = 320 - 230 * Math.min(1, s.t / 45); // ring shrinks over 45s
    const [p, q] = s.pods;
    s.pods.forEach((o, i) => {
      const k = pad(inp, i), held = k.held;
      o.dash = !!held.a; o.cd = Math.max(0, o.cd - dt);
      o.a += ((held.right ? 1 : 0) - (held.left ? 1 : 0)) * (o.dash ? 1.7 : 3.4) * dt; // steering is slower while dashing
      if ((k.taps.a > 0 || (o.dash && !o.wasDash)) && o.cd <= 0) { // instant kick on every new press, even a tap shorter than one frame
        o.vx += Math.cos(o.a) * 220; o.vy += Math.sin(o.a) * 220; o.cd = KICK_CD; audio.beep(300, .12, "sawtooth", .08, 700);
      }
      o.wasDash = o.dash;
      if (o.dash) { o.vx += Math.cos(o.a) * 1000 * dt; o.vy += Math.sin(o.a) * 1000 * dt; }
      const f = Math.pow(.14, dt); o.vx *= f; o.vy *= f; o.x += o.vx * dt; o.y += o.vy * dt;
    });
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, ov = p.r + q.r - d;
    if (ov > 0) {
      const nx = dx / d, ny = dy / d, j = Math.max((p.vx - q.vx) * nx + (p.vy - q.vy) * ny, 160), kp = p.dash ? 2.2 : 1, kq = q.dash ? 2.2 : 1;
      q.vx += nx * j * kp; q.vy += ny * j * kp; p.vx -= nx * j * kq; p.vy -= ny * j * kq; // dashing = 2.2x knockback
      p.x -= nx * ov / 2; p.y -= ny * ov / 2; q.x += nx * ov / 2; q.y += ny * ov / 2;
      s.shake = 14; burst(s.parts, (p.x + q.x) / 2, (p.y + q.y) / 2, 26, "#ffffff", 380);
      audio.beep(140, .14, "sawtooth", .2, 60); audio.noise(.08, .15);
    }
    const out = s.pods.map(o => Math.hypot(o.x - W / 2, o.y - H / 2) > s.R + o.r);
    if (out[0] || out[1]) {
      s.res = verdict(out);
      s.pods.forEach((o, i) => { if (out[i]) { o.dead = true; burst(s.parts, o.x, o.y, 50, C[i], 520); } });
      audio.noise(.6, .3); audio.beep(90, .5, "sawtooth", .25, 30);
    }
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.save();
    if (s.shake > 0) ctx.translate(rnd(-s.shake, s.shake), rnd(-s.shake, s.shake));
    ctx.fillStyle = "#bfe3ff"; ctx.fillRect(-30, -30, W + 60, H + 60);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, s.R, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke();
    s.pods.forEach((o, i) => {
      if (o.dead) return;
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a); if (o.dash) ctx.scale(1.12, 1.12);
      ctx.setLineDash([10, 10]); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.globalAlpha = .3;
      ctx.beginPath(); ctx.moveTo(o.r + 32, 0); ctx.lineTo(o.r + 140, 0); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = C[i]; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = o.cd > 0 ? .35 : 1; ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(o.r + 26, 0); ctx.lineTo(o.r + 4, -15); ctx.lineTo(o.r + 4, 15); ctx.fill(); ctx.globalAlpha = 1;
      ctx.restore();
    });
    ctx.fillStyle = INK; ctx.fillRect(W / 2 - 150, 22, 300, 14); ctx.fillStyle = "#fff"; ctx.fillRect(W / 2 - 147, 25, 294 * (1 - Math.min(1, s.t / 45)), 8); // time until the ring is smallest
    drawParts(ctx, s.parts); ctx.restore();
  },
  cleanup() {}
};

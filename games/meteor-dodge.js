import { W, H, TAU, INK, C, rnd, pad, verdict, burst, stepParts, drawParts } from "../kit.js";
const GY = 650, PR = 32; // ground line, player radius
export default {
  id: "meteor-dodge", title: "Meteor Dodge", icon: "☄️", accentColor: "#f97316",
  description: "Hold Left and Right to dodge the falling rocks. Three hits and you're out.",
  controllerLayout: "left-right", controllerLabels: { left: "◀ Left", right: "Right ▶" },
  init() { return { t: 0, spawn: 1, rocks: [], parts: [], res: null, endT: 0, p: [0, 1].map(i => ({ x: W * (i ? .7 : .3), hp: 3, inv: 0 })) }; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); stepParts(s.parts, dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.3 ? s.res : null }; }
    s.t += dt;
    s.p.forEach((o, i) => { const k = pad(inp, i); o.x = Math.max(PR, Math.min(W - PR, o.x + ((k.right ? 1 : 0) - (k.left ? 1 : 0)) * 540 * dt)); o.inv = Math.max(0, o.inv - dt); });
    if ((s.spawn -= dt) <= 0) { s.spawn = Math.max(.16, .75 - s.t * .012); s.rocks.push({ x: rnd(30, W - 30), y: -40, r: rnd(18, 34), vy: Math.min(260 + s.t * 9, 760) }); } // gets harder over time
    for (let i = s.rocks.length - 1; i >= 0; i--) {
      const r = s.rocks[i]; r.y += r.vy * dt;
      if (r.y > H + 60) { s.rocks.splice(i, 1); continue; }
      for (let j = 0; j < 2; j++) {
        const o = s.p[j];
        if (o.inv <= 0 && Math.hypot(r.x - o.x, r.y - (GY - PR)) < r.r + PR - 4) {
          o.hp--; o.inv = 1.3; burst(s.parts, o.x, GY - PR, 24, C[j], 380); audio.noise(.2, .2); audio.beep(110, .2, "sawtooth", .2, 50);
          s.rocks.splice(i, 1); break;
        }
      }
    }
    if (s.p[0].hp <= 0 || s.p[1].hp <= 0) s.res = verdict([s.p[0].hp <= 0, s.p[1].hp <= 0]);
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.fillStyle = "#fff4c2"; ctx.fillRect(0, 0, W, H); ctx.fillStyle = INK; ctx.fillRect(0, GY, W, H - GY);
    for (const r of s.rocks) { ctx.fillStyle = "#a78b5b"; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.fill(); ctx.stroke(); }
    s.p.forEach((o, i) => {
      if (o.hp <= 0 || (o.inv > 0 && Math.floor(o.inv * 10) % 2)) return; // blink while protected
      ctx.fillStyle = C[i]; ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(o.x, GY - PR, PR, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(o.x - 10, GY - PR - 6, 7, 0, TAU); ctx.arc(o.x + 10, GY - PR - 6, 7, 0, TAU); ctx.fill();
    });
    s.p.forEach((o, i) => { for (let h = 0; h < 3; h++) { ctx.beginPath(); ctx.arc(i ? W - 50 - h * 44 : 50 + h * 44, 50, 15, 0, TAU); ctx.fillStyle = h < o.hp ? C[i] : "#fff"; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke(); } });
    drawParts(ctx, s.parts);
  },
  cleanup() {}
};

import { W, H, TAU, INK, C, clamp, pad, rnd, burst, stepParts, drawParts } from "../kit.js";
// Gravity Duel: a space dogfight around a burning star. Its gravity bends your flight AND your bullets. The screen wraps around.
// Left/Right rotate, Up thrusts, A fires (hold for auto-fire), Down = emergency WARP (6 s recharge). One hit kills. First to 5 wins.
const CX = W / 2, CY = H / 2, GM = 4.5e6, STAR_R = 30, KILL_R = 36, THRUST = 430, TURN = 3.8, MAXV = 700, SR = 16, BV = 640, BLIFE = 1.6, CD = .26, WIN = 5, LIMIT = 150, WARPCD = 6;
const FONT = "Fredoka, system-ui, sans-serif";
const STARS = (() => { let sd = 777; const r = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296; return Array.from({ length: 150 }, () => ({ x: r() * W, y: r() * H, r: .5 + r() * 1.7, ph: r() * TAU })); })();
const wd = (a, b, m) => ((a - b + m / 2) % m + m) % m - m / 2; // shortest signed distance on a wrapping screen

const mk = () => ({ x: 0, y: 0, vx: 0, vy: 0, a: 0, dead: 0, cd: 0, warp: 0, inv: 0, score: 0, thrust: false });
function spawn(s, i, ang) {
  const o = s.p[i], q = s.p[1 - i];
  const th = ang !== undefined ? ang : q.dead > 0 && s.t > 0 ? rnd(0, TAU) : Math.atan2(q.y - CY, q.x - CX) + Math.PI, r = 280, v = Math.sqrt(GM / r);
  o.x = CX + Math.cos(th) * r; o.y = CY + Math.sin(th) * r; o.vx = -Math.sin(th) * v; o.vy = Math.cos(th) * v; o.a = Math.atan2(o.vy, o.vx); o.dead = 0; o.inv = 1.4; o.cd = .3;
}
function gravity(o, dt, k) { const dx = CX - o.x, dy = CY - o.y, r = Math.hypot(dx, dy) || 1, g = GM / (r * r + 400) * k; o.vx += dx / r * g * dt; o.vy += dy / r * g * dt; return r; }

export default {
  init() {
    const s = { t: 0, p: [mk(), mk()], bl: [], parts: [], res: null, endT: 0, shake: 0 };
    const th = rnd(0, TAU); spawn(s, 0, th); spawn(s, 1, th + Math.PI); return s;
  },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); stepParts(s.parts, dt); s.shake = Math.max(0, s.shake - 40 * dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.5 ? s.res : null }; }
    s.t += dt;
    const die = (i, killer) => {
      const o = s.p[i]; if (o.dead > 0) return;
      o.dead = 1.7; burst(s.parts, o.x, o.y, 46, C[i], 560); burst(s.parts, o.x, o.y, 18, "#fff", 380); s.shake = 14; audio.noise(.45, .3); audio.beep(110, .4, "sawtooth", .2, 35);
      if (killer >= 0 && killer !== i) s.p[killer].score++;
    };
    s.p.forEach((o, i) => {
      o.cd = Math.max(0, o.cd - dt); o.inv = Math.max(0, o.inv - dt); o.warp = Math.max(0, o.warp - dt);
      if (o.dead > 0) { o.dead -= dt; if (o.dead <= 0) spawn(s, i); return; }
      const k = pad(inp, i), turn = (k.held.right ? 1 : 0) - (k.held.left ? 1 : 0);
      o.a += turn * TURN * dt; o.thrust = !!k.held.up;
      if (o.thrust) { o.vx += Math.cos(o.a) * THRUST * dt; o.vy += Math.sin(o.a) * THRUST * dt; if (Math.random() < .6) { s.parts.push({ x: o.x - Math.cos(o.a) * 16, y: o.y - Math.sin(o.a) * 16, vx: o.vx * .3 - Math.cos(o.a) * 160 + rnd(-40, 40), vy: o.vy * .3 - Math.sin(o.a) * 160 + rnd(-40, 40), l: .35, m: .35, c: Math.random() < .5 ? "#ffd23f" : "#ff7a1a" }); } }
      if (k.taps.down > 0 && o.warp <= 0) {
        const q = s.p[1 - i];
        for (let n = 0; n < 25; n++) { const x = rnd(80, W - 80), y = rnd(80, H - 80); if (Math.hypot(x - CX, y - CY) > 200 && (q.dead > 0 || Math.hypot(wd(x, q.x, W), wd(y, q.y, H)) > 250) || n === 24) { burst(s.parts, o.x, o.y, 20, "#fff", 300); o.x = x; o.y = y; o.vx *= .3; o.vy *= .3; break; } }
        o.warp = WARPCD; o.inv = .7; burst(s.parts, o.x, o.y, 26, C[i], 380); audio.beep(900, .25, "sine", .12, 200);
      }
      const r = gravity(o, dt, 1), sp = Math.hypot(o.vx, o.vy); if (sp > MAXV) { o.vx *= MAXV / sp; o.vy *= MAXV / sp; }
      o.x = (o.x + o.vx * dt + W) % W; o.y = (o.y + o.vy * dt + H) % H;
      if (r < KILL_R) { die(i, 1 - i); return; }
      if ((k.taps.a > 0 || k.held.a) && o.cd <= 0) { o.cd = CD; s.bl.push({ x: o.x + Math.cos(o.a) * 20, y: o.y + Math.sin(o.a) * 20, vx: o.vx + Math.cos(o.a) * BV, vy: o.vy + Math.sin(o.a) * BV, life: BLIFE, o: i }); audio.beep(700, .07, "square", .07, 260); }
    });
    for (let n = s.bl.length - 1; n >= 0; n--) {
      const b = s.bl[n]; b.life -= dt; const r = gravity(b, dt, .6); b.x = (b.x + b.vx * dt + W) % W; b.y = (b.y + b.vy * dt + H) % H;
      let gone = b.life <= 0 || r < STAR_R;
      if (!gone) s.p.forEach((o, i) => { if (!gone && o.dead <= 0 && o.inv <= 0 && (i !== b.o || b.life < BLIFE - .4) && Math.hypot(wd(b.x, o.x, W), wd(b.y, o.y, H)) < SR + 3) { gone = true; die(i, b.o); } });
      if (gone) s.bl.splice(n, 1);
    }
    const [a, b] = s.p;
    if (a.dead <= 0 && b.dead <= 0 && a.inv <= 0 && b.inv <= 0 && Math.hypot(wd(a.x, b.x, W), wd(a.y, b.y, H)) < SR * 1.7) { die(0, -1); die(1, -1); } // ramming: both explode, nobody scores
    if (a.score >= WIN || b.score >= WIN) s.res = a.score === b.score ? "draw" : a.score > b.score ? "p1" : "p2";
    else if (s.t > LIMIT) s.res = a.score === b.score ? "draw" : a.score > b.score ? "p1" : "p2";
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.save(); if (s.shake > 0) ctx.translate(rnd(-s.shake, s.shake) * .5, rnd(-s.shake, s.shake) * .5);
    ctx.fillStyle = "#05030f"; ctx.fillRect(-20, -20, W + 40, H + 40);
    for (const [x, y, r, c] of [[260, 190, 380, "#3b1d8a"], [1040, 560, 420, "#7a1d6e"], [900, 140, 300, "#1d4f8a"]]) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, c + "55"); g.addColorStop(1, c + "00"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    for (const st of STARS) { ctx.globalAlpha = .45 + .55 * Math.sin(s.t * 2 + st.ph) ** 2; ctx.fillStyle = "#fff"; ctx.fillRect(st.x, st.y, st.r, st.r); } ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ffffff12"; ctx.lineWidth = 2; ctx.setLineDash([4, 12]); for (const r of [120, 200, 300, 420]) { ctx.beginPath(); ctx.arc(CX, CY, r, 0, TAU); ctx.stroke(); } ctx.setLineDash([]);
    const pulse = 1 + Math.sin(s.t * 3) * .06, cg = ctx.createRadialGradient(CX, CY, STAR_R * .6, CX, CY, 150 * pulse); cg.addColorStop(0, "#ffe9a0cc"); cg.addColorStop(.3, "#ff9a3c66"); cg.addColorStop(1, "#ff5a1f00");
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(CX, CY, 150 * pulse, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff6c8"; ctx.beginPath(); ctx.arc(CX, CY, STAR_R * pulse, 0, TAU); ctx.fill(); ctx.strokeStyle = "#ffb84d"; ctx.lineWidth = 5; ctx.stroke();
    drawParts(ctx, s.parts);
    for (const b of s.bl) { const col = C[b.o], sp = Math.hypot(b.vx, b.vy) || 1; ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(b.x - b.vx / sp * 20, b.y - b.vy / sp * 20); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, TAU); ctx.fill(); ctx.lineCap = "butt"; }
    s.p.forEach((o, i) => {
      if (o.dead > 0 || (o.inv > 0 && Math.floor(o.inv * 14) % 2)) return;
      for (const ox of [0, -W, W]) for (const oy of [0, -H, H]) {
        const x = o.x + ox, y = o.y + oy; if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
        ctx.save(); ctx.translate(x, y); ctx.rotate(o.a);
        if (o.thrust) { ctx.fillStyle = Math.random() < .5 ? "#ffd23f" : "#ff7a1a"; ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-30 - Math.random() * 14, 0); ctx.lineTo(-10, 6); ctx.fill(); }
        ctx.fillStyle = C[i]; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-14, -14); ctx.lineTo(-7, 0); ctx.lineTo(-14, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(2, 0, 4, 0, TAU); ctx.fill();
        if (o.inv > 0) { ctx.strokeStyle = "#ffffff88"; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.stroke(); }
        ctx.restore();
      }
    });
    ctx.restore();
    ctx.textAlign = "center"; s.p.forEach((o, i) => {
      for (let n = 0; n < WIN; n++) { const x = i ? W - 60 - n * 34 : 60 + n * 34; ctx.beginPath(); ctx.arc(x, 44, 12, 0, TAU); ctx.fillStyle = n < o.score ? C[i] : "#ffffff22"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke(); }
      const ready = o.warp <= 0; ctx.font = "700 24px " + FONT; ctx.fillStyle = ready ? C[i] : "#ffffff77"; ctx.textAlign = i ? "right" : "left"; ctx.fillText(ready ? "WARP ready  ▼" : "WARP " + Math.ceil(o.warp) + "s", i ? W - 40 : 40, 640);
    });
    ctx.textAlign = "center"; ctx.font = "700 26px " + FONT; ctx.fillStyle = "#fff9"; ctx.fillText(Math.max(0, Math.ceil(LIMIT - s.t)) + "s", W / 2, 50);
  },
  cleanup() {}
};

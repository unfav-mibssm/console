import { W, H, TAU, INK, C, rnd, clamp, pad, dirOf, verdict, burst, stepParts, drawParts } from "../kit.js";
// Each player owns one half of the court. Pick up a ball by walking over it, press A to throw it.
// With empty hands, A is a CATCH: if a hot ball hits you during the catch window you keep it and take no damage.
// Hold a ball too long and it flies out on its own. 5 lives each; when time runs out, most lives wins.
const MID = W / 2, R = 28, BR = 16, SPD = 340, LIVES = 5, THROW = 1100, HOT = 420, FRIC = 240, BOUNCE = .82, LIMIT = 90, HOLD = 5, CATCH_T = .28, CATCH_CD = .9, INV = 1.3;
const START = [[560, 150], [560, 570], [720, 150], [720, 570], [MID, 360]];
const mkPlayer = i => ({ x: i ? 1040 : 240, y: 360, face: i ? -1 : 1, ball: -1, holdT: 0, catchT: 0, catchCd: 0, inv: 0, lives: LIVES });
const heart = (ctx, x, y, s, fill) => {
  ctx.beginPath(); ctx.moveTo(x, y + s * .9); ctx.bezierCurveTo(x - s * 1.4, y - s * .1, x - s * .7, y - s * 1.1, x, y - s * .4); ctx.bezierCurveTo(x + s * .7, y - s * 1.1, x + s * 1.4, y - s * .1, x, y + s * .9);
  ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke();
};

export default {
  init() { return { t: 0, p: [mkPlayer(0), mkPlayer(1)], balls: START.map(([x, y]) => ({ x, y, vx: 0, vy: 0, owner: -1, hot: false, held: -1 })), parts: [], pops: [], res: null, endT: 0, shake: 0 }; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); stepParts(s.parts, dt); s.shake = Math.max(0, s.shake - 50 * dt);
    for (let n = s.pops.length - 1; n >= 0; n--) if ((s.pops[n].t -= dt) <= 0) s.pops.splice(n, 1);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.4 ? s.res : null }; }
    s.t += dt;
    const pop = (x, y, txt) => s.pops.push({ x, y: y - 50, t: .8, txt });
    const throwBall = (i, dy) => {
      const o = s.p[i], q = s.p[1 - i], b = s.balls[o.ball];
      let ax, ay;
      if (dy) { ax = o.face; ay = dy * .75; }                              // D-pad up/down while throwing = aim up or down (bank it off the wall!)
      else { ax = q.x - o.x; ay = q.y - o.y; if (o.face * ax < 40) ax = o.face * 40; ay = clamp(ay, -Math.abs(ax), Math.abs(ax)); } // otherwise: straight at your rival
      const l = Math.hypot(ax, ay) || 1;
      b.held = -1; b.owner = i; b.hot = true; b.x = o.x + o.face * (R + BR + 2); b.y = o.y; b.vx = ax / l * THROW; b.vy = ay / l * THROW;
      o.ball = -1; o.holdT = 0; audio.beep(330, .08, "sawtooth", .1, 160);
    };
    s.p.forEach((o, i) => {
      const k = pad(inp, i), d = dirOf(k.held), len = Math.hypot(d.x, d.y);
      if (len) { o.x += d.x / len * SPD * dt; o.y += d.y / len * SPD * dt; }
      o.x = i ? clamp(o.x, MID + R + 8, W - R - 12) : clamp(o.x, R + 12, MID - R - 8); o.y = clamp(o.y, R + 12, H - R - 12);
      o.catchT = Math.max(0, o.catchT - dt); o.catchCd = Math.max(0, o.catchCd - dt); o.inv = Math.max(0, o.inv - dt);
      if (k.taps.a > 0) {
        if (o.ball >= 0) throwBall(i, d.y);
        else if (o.catchCd <= 0) { o.catchT = CATCH_T; o.catchCd = CATCH_CD; audio.beep(520, .08, "triangle", .08, 880); }
      }
      if (o.ball >= 0 && (o.holdT += dt) > HOLD) throwBall(i, 0); // anti-stalling: a ball can't be hoarded
    });

    s.balls.forEach((b, bi) => {
      if (b.held >= 0) { const o = s.p[b.held]; b.x = o.x + o.face * (R + 4); b.y = o.y; return; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) { const ns = Math.max(0, sp - FRIC * dt), f = ns / sp; b.vx *= f; b.vy *= f; if (ns < HOT) b.hot = false; }
      if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx) * BOUNCE; } else if (b.x > W - BR) { b.x = W - BR; b.vx = -Math.abs(b.vx) * BOUNCE; }
      if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy) * BOUNCE; } else if (b.y > H - BR) { b.y = H - BR; b.vy = -Math.abs(b.vy) * BOUNCE; }
      s.p.forEach((o, i) => {
        if (b.held >= 0 || Math.hypot(b.x - o.x, b.y - o.y) > R + BR) return;
        if (b.hot) {
          if (b.owner === i || o.inv > 0) return;                              // your own ball never hurts you; while you flash you can't be hit
          if (o.catchT > 0 && o.ball < 0) {                                    // perfect catch
            b.held = i; b.owner = i; b.hot = false; b.vx = b.vy = 0; o.ball = bi; o.holdT = 0; o.catchT = 0;
            burst(s.parts, o.x, o.y, 22, "#fde047", 420); audio.beep(880, .15, "triangle", .14, 1320); pop(o.x, o.y, "CATCH!"); return;
          }
          o.lives--; o.inv = INV; o.catchT = 0; s.shake = 12;
          if (o.ball >= 0) { const hb = s.balls[o.ball]; hb.held = -1; hb.owner = -1; hb.hot = false; hb.vx = rnd(-120, 120); hb.vy = rnd(-120, 120); o.ball = -1; o.holdT = 0; } // a hit makes you drop what you hold
          b.vx *= -.35; b.vy *= -.35; b.hot = false; b.owner = -1;
          burst(s.parts, o.x, o.y, 30, C[i], 520); audio.noise(.15, .25); audio.beep(140, .2, "sawtooth", .2, 60); pop(o.x, o.y, "OUCH!");
        } else if (o.ball < 0) {                                               // pick up a resting ball
          b.held = i; b.owner = i; b.vx = b.vy = 0; o.ball = bi; o.holdT = 0; audio.beep(600, .05, "square", .07, 800);
        }
      });
    });

    const d = s.p.map(o => o.lives <= 0);
    if (d[0] || d[1]) s.res = verdict(d);
    else if (s.t > LIMIT) { const a = s.p[0].lives, b = s.p[1].lives; s.res = a === b ? "draw" : a > b ? "p1" : "p2"; }
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.save(); if (s.shake > 0) ctx.translate(rnd(-s.shake, s.shake), rnd(-s.shake, s.shake));
    ctx.fillStyle = "#ffe9b8"; ctx.fillRect(-30, -30, W + 60, H + 60);
    ctx.fillStyle = C[0] + "22"; ctx.fillRect(0, 0, MID, H); ctx.fillStyle = C[1] + "22"; ctx.fillRect(MID, 0, MID, H);
    ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.setLineDash([26, 18]); ctx.beginPath(); ctx.moveTo(MID, 0); ctx.lineTo(MID, H); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(MID, H / 2, 90, 0, TAU); ctx.stroke();
    ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
    for (const b of s.balls) {
      const sp = Math.hypot(b.vx, b.vy);
      if (b.hot && sp > 1) { ctx.strokeStyle = C[b.owner] + "88"; ctx.lineWidth = BR * 1.6; ctx.lineCap = "round"; const m = Math.min(70, sp * .06); ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx / sp * m, b.y - b.vy / sp * m); ctx.stroke(); ctx.lineCap = "butt"; }
      ctx.fillStyle = b.hot ? C[b.owner] : "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = b.hot ? "#ffffffaa" : INK + "55"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, BR - 5, .3, 2.4); ctx.stroke();
    }
    s.p.forEach((o, i) => {
      if (o.inv > 0 && Math.floor(o.inv * 14) % 2) return;
      if (o.catchT > 0) { ctx.strokeStyle = "#fde047"; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(o.x, o.y, R + 14 + o.catchT * 20, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = C[i]; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(o.x, o.y, R, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; for (const e of [-1, 1]) { ctx.beginPath(); ctx.arc(o.x + o.face * 9, o.y + e * 9, 6, 0, TAU); ctx.fill(); }
      ctx.fillStyle = INK; for (const e of [-1, 1]) { ctx.beginPath(); ctx.arc(o.x + o.face * 12, o.y + e * 9, 3, 0, TAU); ctx.fill(); }
      if (o.ball >= 0) { ctx.strokeStyle = o.holdT > HOLD - 1.5 ? "#dc2626" : "#f97316"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(o.x, o.y, R + 8, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - o.holdT / HOLD)); ctx.stroke(); } // time left to throw
    });
    drawParts(ctx, s.parts); ctx.restore();
    ctx.textAlign = "center";
    s.p.forEach((o, i) => { for (let n = 0; n < LIVES; n++) heart(ctx, i ? W - 50 - n * 46 : 50 + n * 46, 40, 14, n < o.lives ? C[i] : "#fff"); });
    ctx.font = "700 34px Fredoka, system-ui, sans-serif"; ctx.lineWidth = 7; ctx.strokeStyle = "#fff"; const left = Math.max(0, Math.ceil(LIMIT - s.t)); ctx.strokeText(left + "s", W / 2, 50); ctx.fillStyle = INK; ctx.fillText(left + "s", W / 2, 50);
    for (const p of s.pops) { ctx.globalAlpha = clamp(p.t / .3, 0, 1); ctx.font = "700 40px Fredoka, system-ui, sans-serif"; ctx.lineWidth = 8; ctx.strokeStyle = "#fff"; const y = p.y - (.8 - p.t) * 50; ctx.strokeText(p.txt, p.x, y); ctx.fillStyle = "#f97316"; ctx.fillText(p.txt, p.x, y); }
    ctx.globalAlpha = 1;
  },
  cleanup() {}
};

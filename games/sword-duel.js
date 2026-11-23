import { W, H, TAU, INK, C, clamp, pad, burst, stepParts, drawParts, rnd } from "../kit.js";
// Platform fighter. Left/Right run, Up jumps (twice), Down drops through thin platforms, A swings the sword.
// Every hit raises the victim's damage %, and the higher it is, the further they fly. Ring them out: 3 stocks each.
const PW = 36, PH = 70, GRAV = 1900, MAXFALL = 900, STOCKS = 3, LIMIT = 120, FLOOR = 590;
const PLAT = [[200, 1080, FLOOR], [250, 500, 440], [780, 1030, 440], [500, 780, 300]]; // [left, right, top]; you can jump up through them and land on top
const fresh = i => ({ x: i ? 880 : 400, y: FLOOR, vx: 0, vy: 0, face: i ? -1 : 1, ground: true, jumps: 2, atk: 0, cd: 0, hit: false, stun: 0, inv: 0, dmg: 0, stocks: STOCKS, dead: 0 });
const respawn = (o, i) => { o.x = W / 2 + (i ? 60 : -60); o.y = 120; o.vx = o.vy = 0; o.dmg = 0; o.inv = 2; o.stun = 0; o.atk = 0; o.jumps = 1; o.ground = false; };

export default {
  init() { return { t: 0, p: [fresh(0), fresh(1)], parts: [], res: null, endT: 0, shake: 0 }; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); stepParts(s.parts, dt); s.shake = Math.max(0, s.shake - 50 * dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.4 ? s.res : null }; }
    s.t += dt;
    s.p.forEach((o, i) => {
      if (o.dead > 0) { o.dead -= dt; if (o.dead <= 0) respawn(o, i); return; }
      const k = pad(inp, i), dir = (k.held.right ? 1 : 0) - (k.held.left ? 1 : 0);
      o.cd = Math.max(0, o.cd - dt); o.atk = Math.max(0, o.atk - dt); o.stun = Math.max(0, o.stun - dt); o.inv = Math.max(0, o.inv - dt);
      if (o.stun <= 0) {
        if (dir) { o.face = dir; if (!(Math.sign(o.vx) === dir && Math.abs(o.vx) > 340)) o.vx += (dir * 340 - o.vx) * Math.min(1, (o.ground ? 14 : 6) * dt); }
        else o.vx -= o.vx * Math.min(1, (o.ground ? 12 : 1.2) * dt); // friction on the ground, a little air drag in the air
        if (k.taps.up > 0 && o.jumps > 0) { o.vy = o.jumps === 2 ? -700 : -620; o.jumps--; o.ground = false; audio.beep(o.jumps ? 400 : 520, .08, "square", .08, 700); }
        if (k.taps.a > 0 && o.cd <= 0) { o.atk = .16; o.cd = .38; o.hit = false; audio.beep(260, .06, "sawtooth", .07, 120); }
      }
      const prev = o.y; o.vy = Math.min(o.vy + GRAV * dt, MAXFALL); o.x += o.vx * dt; o.y += o.vy * dt; o.ground = false;
      if (o.vy >= 0) for (const [x0, x1, top] of PLAT) {
        if (o.x >= x0 - 8 && o.x <= x1 + 8 && prev <= top + 2 && o.y >= top && !(k.held.down && top < FLOOR)) { o.y = top; o.vy = 0; o.ground = true; o.jumps = 2; break; }
      }
    });
    const landed = s.p.map((o, i) => { // work out BOTH swings first, so a simultaneous swing is a trade and not a win for player 1
      const q = s.p[1 - i]; if (o.dead > 0 || o.atk <= 0 || o.hit || q.dead > 0 || q.inv > 0) return false;
      const hx = o.x + o.face * (PW / 2 + 34), hy = o.y - PH / 2;
      return Math.abs(q.x - hx) < 46 + PW / 2 && Math.abs(q.y - PH / 2 - hy) < 40 + PH / 2;
    });
    landed.forEach((ok, i) => {
      if (!ok) return;
      const o = s.p[i], q = s.p[1 - i];
      o.hit = true; q.dmg += 14; const kb = 400 + q.dmg * 9;
      q.vx = o.face * kb * .9; q.vy = -kb * .55 - 120; q.stun = Math.min(.5, .2 + q.dmg / 400); q.atk = 0; q.ground = false;
      burst(s.parts, q.x, q.y - PH / 2, 22, C[i], 420); s.shake = 8; audio.noise(.12, .22); audio.beep(150, .12, "sawtooth", .16, 60);
    });
    const lost = s.p.map((o, i) => {
      if (o.dead > 0 || !(o.y > H + 160 || o.x < -220 || o.x > W + 220)) return false;
      o.stocks--; burst(s.parts, clamp(o.x, 20, W - 20), clamp(o.y, 20, H - 20), 40, C[i], 600); audio.noise(.4, .25); audio.beep(100, .35, "sawtooth", .2, 40);
      o.dead = 1; o.vx = o.vy = 0; o.y = -999; return o.stocks <= 0;
    });
    if (lost[0] || lost[1]) s.res = lost[0] && lost[1] ? "draw" : lost[0] ? "p2" : "p1";
    else if (s.t > LIMIT) { const [a, b] = s.p; s.res = a.stocks !== b.stocks ? (a.stocks > b.stocks ? "p1" : "p2") : a.dmg !== b.dmg ? (a.dmg < b.dmg ? "p1" : "p2") : "draw"; }
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.save(); if (s.shake > 0) ctx.translate(rnd(-s.shake, s.shake), rnd(-s.shake, s.shake));
    ctx.fillStyle = "#cfe9ff"; ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = "#ffffff99"; for (const [x, y, r] of [[420, 150, 50], [480, 160, 36], [820, 130, 56], [880, 150, 40]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    PLAT.forEach(([x0, x1, top], n) => {
      ctx.fillStyle = INK; ctx.fillRect(x0, top, x1 - x0, n ? 16 : 70); ctx.fillStyle = n ? "#8b7bd8" : "#6d5fc0"; ctx.fillRect(x0 + 4, top + 4, x1 - x0 - 8, n ? 8 : 20);
    });
    s.p.forEach((o, i) => {
      if (o.dead > 0 || (o.inv > 0 && Math.floor(o.inv * 12) % 2)) return;
      ctx.save(); ctx.translate(o.x, o.y); ctx.lineWidth = 5; ctx.strokeStyle = INK;
      ctx.fillStyle = C[i]; ctx.fillRect(-PW / 2, -PH + 18, PW, PH - 18); ctx.strokeRect(-PW / 2, -PH + 18, PW, PH - 18);
      ctx.beginPath(); ctx.arc(0, -PH + 14, 18, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(o.face * 8, -PH + 12, 4, 0, TAU); ctx.fill();
      const sw = o.atk > 0 ? 1 - o.atk / .16 : 0; ctx.rotate(o.face * (o.atk > 0 ? -1.2 + sw * 2.4 : .5)); ctx.translate(o.face * 14, -PH / 2 + 4);
      ctx.fillStyle = "#e5e7eb"; ctx.fillRect(o.face > 0 ? 0 : -52, -4, 52, 8); ctx.strokeRect(o.face > 0 ? 0 : -52, -4, 52, 8); ctx.restore();
    });
    drawParts(ctx, s.parts); ctx.restore();
    ctx.textAlign = "center";
    s.p.forEach((o, i) => {
      const x = i ? W - 120 : 120; ctx.font = "700 56px Fredoka, system-ui, sans-serif"; ctx.lineWidth = 8; ctx.strokeStyle = "#fff"; ctx.strokeText(Math.round(o.dmg) + "%", x, 76); ctx.fillStyle = o.dmg > 80 ? "#dc2626" : C[i]; ctx.fillText(Math.round(o.dmg) + "%", x, 76);
      for (let n = 0; n < STOCKS; n++) { ctx.beginPath(); ctx.arc(x - 28 + n * 28, 104, 10, 0, TAU); ctx.fillStyle = n < o.stocks ? C[i] : "#fff"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); }
    });
  },
  cleanup() {}
};

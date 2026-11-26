import { W, H, TAU, INK, C, clamp, pad, rnd, burst, stepParts, drawParts } from "../kit.js";
// Beach Volley: slime volleyball at sunset. Left/Right run, Up jumps, A = SMASH (a short window where a ball you touch is blasted at the other side;
// hold toward the net for a deep smash, away from it for a short drop). The ball touching the sand scores for the other side. First to 7 wins.
const GROUND = 600, NETX = 640, NETTOP = 410, NETW = 12, SR = 78, BR = 24, SPD = 430, JV = 900, SG = 2300, BG = 1250, WIN = 7, LIMIT = 260, SMASH_T = .26, SMASH_CD = .7, MAXB = 1500;
const FONT = "Fredoka, system-ui, sans-serif";
const SAND = (() => { let sd = 99; const r = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296; return Array.from({ length: 90 }, () => ({ x: r() * W, y: GROUND + 14 + r() * 100, r: 1 + r() * 2.5 })); })();
const PANEL = ["#ff4f6d", "#ffffff", "#2f6df6", "#ffd23f", "#ffffff", "#3ddc84"];
const touch = (s, i) => { if (s.last === i) s.cnt++; else { s.last = i; s.cnt = 1; } return s.cnt > 3; };
const START_X = i => i ? NETX + 260 : NETX - 260;

const mkSlime = i => ({ x: START_X(i), y: GROUND, vx: 0, vy: 0, smash: 0, smashCd: 0, squash: 0, face: i ? -1 : 1 });
function setServe(s, side) { s.phase = "serve"; s.pt = .9; s.server = side; s.p = [mkSlime(0), mkSlime(1)]; s.ball = { x: START_X(side), y: 300, vx: 0, vy: 0, rot: 0 }; s.last = -1; s.cnt = 0; }
function award(s, scorer, x, audio, why) {
  s.score[scorer]++; s.server = scorer; s.phase = "point"; s.pt = 1.5; s.bt = 1.5; s.banner = scorer; s.why = why; s.shake = 12;
  burst(s.parts, x, GROUND - 10, 40, C[scorer], 600); burst(s.parts, x, GROUND - 10, 20, "#ffd23f", 500); audio.noise(.2, .22); audio.beep(660, .3, "triangle", .15, 990);
  if (s.score[scorer] >= WIN || s.t > LIMIT) s.res = s.score[0] === s.score[1] ? "draw" : s.score[0] > s.score[1] ? "p1" : "p2";
}

export default {
  init() { const s = { t: 0, clock: 0, score: [0, 0], parts: [], res: null, endT: 0, shake: 0, banner: "", bt: 0 }; setServe(s, Math.random() < .5 ? 0 : 1); return s; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); s.clock += dt; stepParts(s.parts, dt); s.shake = Math.max(0, s.shake - 40 * dt); s.bt = Math.max(0, s.bt - dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.8 ? s.res : null }; }
    if (s.phase === "point") { s.pt -= dt; if (s.pt <= 0) setServe(s, s.server); return { winner: null }; }
    s.t += dt;
    const live = s.phase === "play"; if (s.phase === "serve" && (s.pt -= dt) <= 0) { s.phase = "play"; s.ball.vy = -250; audio.beep(520, .15, "triangle", .12, 780); }
    const B = s.ball, steps = Math.ceil(dt / (1 / 180)), h = dt / steps;
    s.p.forEach((o, i) => { o.smashCd = Math.max(0, o.smashCd - dt); o.smash = Math.max(0, o.smash - dt); o.squash *= Math.exp(-10 * dt); if (pad(inp, i).taps.a > 0 && o.smashCd <= 0) { o.smash = SMASH_T; o.smashCd = SMASH_CD; audio.beep(300, .12, "sawtooth", .08, 700); } });
    for (let q = 0; q < steps; q++) {
      s.p.forEach((o, i) => {
        const k = pad(inp, i), d = (k.held.right ? 1 : 0) - (k.held.left ? 1 : 0), lo = i ? NETX + NETW / 2 + SR : SR, hi = i ? W - SR : NETX - NETW / 2 - SR;
        o.vx = d * SPD; o.x = clamp(o.x + o.vx * h, lo, hi);
        if (o.y >= GROUND && (k.held.up || (q === 0 && k.taps.up > 0))) { o.vy = -JV; o.squash = -.12; }
        if (o.y < GROUND || o.vy < 0) { o.vy += SG * h; o.y += o.vy * h; if (o.y >= GROUND) { o.y = GROUND; if (o.vy > 300) o.squash = .16; o.vy = 0; } }
      });
      if (!live) { if (s.phase === "serve") { B.vx = B.vy = 0; } continue; }
      B.vy += BG * h; B.x += B.vx * h; B.y += B.vy * h; B.rot += B.vx * h / BR * .6;
      const sp = Math.hypot(B.vx, B.vy); if (sp > MAXB) { B.vx *= MAXB / sp; B.vy *= MAXB / sp; }
      let fault = -1;
      s.p.forEach((o, i) => {
        const dx = B.x - o.x, dy = B.y - o.y, d = Math.hypot(dx, dy), reach = o.smash > 0 ? 26 : 0;
        if (B.y > o.y + 12 || d >= SR + BR + reach) return;
        const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
        if (o.smash > 0) { // SMASH: blast it towards the other court
          const dir = i ? -1 : 1, k = pad(inp, i), want = (k.held.right ? 1 : 0) - (k.held.left ? 1 : 0), reachFar = want === dir ? 430 : want === -dir ? 130 : 270;
          const tx = NETX + dir * reachFar, ty = GROUND - 140, ux = tx - B.x, uy = ty - B.y, l = Math.hypot(ux, uy) || 1;
          B.vx = ux / l * 1150; B.vy = uy / l * 1150; B.x = o.x + nx * (SR + BR); B.y = o.y + ny * (SR + BR); o.smash = 0; s.shake = 10; if (touch(s, i)) fault = i;
          burst(s.parts, B.x, B.y, 24, "#ffd23f", 520); audio.noise(.12, .25); audio.beep(140, .15, "sawtooth", .2, 60); return;
        }
        B.x = o.x + nx * (SR + BR); B.y = o.y + ny * (SR + BR);
        const rvx = B.vx - o.vx, rvy = B.vy - o.vy, vn = rvx * nx + rvy * ny;
        if (vn < 0) { B.vx -= 1.95 * vn * nx; B.vy -= 1.95 * vn * ny; }
        B.vx += o.vx * .25; B.vy += Math.min(0, o.vy) * .25;
        const v = Math.hypot(B.vx, B.vy); if (v < 560) { B.vx = B.vx / (v || 1) * 560; B.vy = B.vy / (v || 1) * 560; if (!v) B.vy = -560; }
        audio.beep(420 + Math.random() * 60, .07, "sine", .12, 300); burst(s.parts, B.x, B.y, 6, "#fff", 200); if (touch(s, i)) fault = i;
      });
      if (fault >= 0) { award(s, 1 - fault, B.x, audio, "4 touches!"); break; } // a side may touch the ball 3 times in a row, then it must go over
      { // the net
        const cx = clamp(B.x, NETX - NETW / 2, NETX + NETW / 2), cy = clamp(B.y, NETTOP, GROUND), dx = B.x - cx, dy = B.y - cy, d = Math.hypot(dx, dy);
        if (d < BR) {
          let nx, ny; if (d > 1e-6) { nx = dx / d; ny = dy / d; } else { nx = B.x >= NETX ? 1 : -1; ny = 0; }
          B.x = cx + nx * BR; B.y = cy + ny * BR; const vn = B.vx * nx + B.vy * ny;
          if (vn < 0) { B.vx -= 1.6 * vn * nx; B.vy -= 1.6 * vn * ny; }
          if (Math.abs(nx) < .35) B.vx += (B.x >= NETX ? 1 : -1) * 140; // never balance on top of the net
        }
      }
      if (B.x < BR) { B.x = BR; B.vx = Math.abs(B.vx) * .8; } else if (B.x > W - BR) { B.x = W - BR; B.vx = -Math.abs(B.vx) * .8; }
      if (B.y + BR >= GROUND) { // the sand: point!
        B.y = GROUND - BR; award(s, B.x < NETX ? 1 : 0, B.x, audio, "");
        break;
      }
    }
    return { winner: null };
  },
  render(ctx, cv, s, pl) {
    ctx.save(); if (s.shake > 0) ctx.translate(rnd(-s.shake, s.shake) * .5, rnd(-s.shake, s.shake) * .5);
    const sk = ctx.createLinearGradient(0, 0, 0, 390); sk.addColorStop(0, "#3a2a8a"); sk.addColorStop(.6, "#ff7aa8"); sk.addColorStop(1, "#ffd08a"); ctx.fillStyle = sk; ctx.fillRect(-20, -20, W + 40, 410);
    const sg = ctx.createRadialGradient(900, 360, 20, 900, 360, 260); sg.addColorStop(0, "#fff6c8"); sg.addColorStop(.25, "#ffd23f99"); sg.addColorStop(1, "#ffd23f00"); ctx.fillStyle = sg; ctx.fillRect(500, 100, 800, 300);
    ctx.fillStyle = "#fff3b0"; ctx.beginPath(); ctx.arc(900, 360, 78, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#5b2f8f"; ctx.beginPath(); ctx.moveTo(60, 390); ctx.lineTo(180, 330); ctx.lineTo(300, 390); ctx.fill();
    const sea = ctx.createLinearGradient(0, 385, 0, GROUND); sea.addColorStop(0, "#2aa6c9"); sea.addColorStop(1, "#176f9c"); ctx.fillStyle = sea; ctx.fillRect(-20, 385, W + 40, GROUND - 385 + 4);
    ctx.strokeStyle = "#ffffff77"; ctx.lineWidth = 3; for (let r = 0; r < 7; r++) { const y = 405 + r * 28, ph = s.clock * (r % 2 ? 1.3 : -1.1) + r; ctx.beginPath(); for (let x = -20; x <= W + 20; x += 20) { const yy = y + Math.sin(x * .02 + ph) * (2 + r * .6); if (x < 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } ctx.stroke(); }
    const sand = ctx.createLinearGradient(0, GROUND - 6, 0, H); sand.addColorStop(0, "#f7d58a"); sand.addColorStop(1, "#e2b266"); ctx.fillStyle = sand; ctx.fillRect(-20, GROUND - 6, W + 40, H - GROUND + 30);
    ctx.fillStyle = "#c99a52"; for (const d of SAND) { ctx.globalAlpha = .5; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    for (const [px, flip] of [[70, 1], [W - 70, -1]]) { // palm trees
      ctx.strokeStyle = "#7a4b2a"; ctx.lineWidth = 16; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(px, GROUND + 30); ctx.quadraticCurveTo(px + flip * 40, 400, px + flip * 20, 250); ctx.stroke(); ctx.lineCap = "butt";
      for (let i = 0; i < 6; i++) { ctx.save(); ctx.translate(px + flip * 20, 250); ctx.rotate(-Math.PI + i * Math.PI / 5 + Math.sin(s.clock * 1.5 + i) * .04); ctx.fillStyle = i % 2 ? "#1f9d55" : "#2fbf6b"; ctx.beginPath(); ctx.ellipse(55, 0, 60, 14, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    }
    // net
    ctx.fillStyle = "#3a3556"; ctx.fillRect(NETX - 8, NETTOP - 8, 16, GROUND - NETTOP + 14);
    ctx.strokeStyle = "#ffffffaa"; ctx.lineWidth = 2; for (let y = NETTOP + 12; y < GROUND; y += 18) { ctx.beginPath(); ctx.moveTo(NETX - 6, y); ctx.lineTo(NETX + 6, y); ctx.stroke(); }
    ctx.fillStyle = "#fff"; ctx.fillRect(NETX - 10, NETTOP - 8, 20, 10);
    // shadows, slimes, ball
    ctx.fillStyle = "#00000033"; const B = s.ball;
    ctx.beginPath(); ctx.ellipse(B.x, GROUND + 10, BR * clamp(1.1 - (GROUND - B.y) / 900, .4, 1), 6, 0, 0, TAU); ctx.fill();
    s.p.forEach((o, i) => { ctx.beginPath(); ctx.ellipse(o.x, GROUND + 10, SR * clamp(1 - (GROUND - o.y) / 500, .5, 1), 9, 0, 0, TAU); ctx.fill(); });
    s.p.forEach((o, i) => {
      ctx.save(); ctx.translate(o.x, o.y); ctx.scale(1 + o.squash, 1 - o.squash);
      const gd = ctx.createLinearGradient(0, -SR, 0, 0); gd.addColorStop(0, i ? "#ff8aa0" : "#6d9bff"); gd.addColorStop(1, C[i]);
      ctx.fillStyle = gd; ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, SR, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#ffffff66"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, SR - 14, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke();
      const ex = o.face * 30, ey = -44, ax = B.x - (o.x + ex), ay = B.y - (o.y + ey), al = Math.hypot(ax, ay) || 1;
      ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ex, ey, 17, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + ax / al * 7, ey + ay / al * 7, 7, 0, TAU); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(o.face * 8, -20, 14, .2, Math.PI - .2); ctx.stroke();
      if (o.smash > 0) { ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(0, 0, SR + 16, Math.PI, 0); ctx.stroke(); }
      ctx.restore();
      if (o.smashCd > 0) { ctx.fillStyle = "#00000044"; ctx.fillRect(o.x - 26, o.y + 24, 52, 6); ctx.fillStyle = "#ffd23f"; ctx.fillRect(o.x - 26, o.y + 24, 52 * (1 - o.smashCd / SMASH_CD), 6); }
    });
    const bs = Math.hypot(B.vx, B.vy);
    if (bs > 950) { const g = ctx.createLinearGradient(B.x, B.y, B.x - B.vx / bs * 90, B.y - B.vy / bs * 90); g.addColorStop(0, "#ff9a3c"); g.addColorStop(1, "#ff9a3c00"); ctx.strokeStyle = g; ctx.lineWidth = BR * 1.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(B.x - B.vx / bs * 90, B.y - B.vy / bs * 90); ctx.stroke(); ctx.lineCap = "butt"; }
    ctx.save(); ctx.translate(B.x, B.y); for (let n = 0; n < 6; n++) { ctx.fillStyle = PANEL[n]; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, BR, B.rot + n * TAU / 6, B.rot + (n + 1) * TAU / 6); ctx.closePath(); ctx.fill(); } ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, BR, 0, TAU); ctx.stroke(); ctx.restore();
    if (B.y < -10) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(B.x, 8); ctx.lineTo(B.x - 10, 26); ctx.lineTo(B.x + 10, 26); ctx.fill(); }
    drawParts(ctx, s.parts); ctx.restore();
    // scoreboard
    ctx.textAlign = "center"; ctx.lineJoin = "round"; s.score.forEach((v, i) => { const x = W / 2 + (i ? 80 : -80); ctx.fillStyle = C[i]; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.rect(x - 52, 22, 104, 84); ctx.fill(); ctx.stroke(); ctx.font = "800 68px " + FONT; ctx.fillStyle = "#fff"; ctx.fillText(v, x, 90); });
    ctx.font = "800 30px " + FONT; ctx.fillStyle = "#fff"; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText("first to " + WIN, W / 2, 130); ctx.fillText("first to " + WIN, W / 2, 130);
    if (s.phase === "serve") { const x = START_X(s.server); ctx.font = "800 34px " + FONT; ctx.strokeText("SERVE", x, 220); ctx.fillStyle = C[s.server]; ctx.fillText("SERVE", x, 220); }
    if (s.phase === "point" && s.bt > 0) { const nm = pl?.["p" + (s.banner + 1)]?.name || "Player " + (s.banner + 1); ctx.font = "800 64px " + FONT; ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.strokeText(nm + " scores!", W / 2, 300); ctx.fillStyle = "#ffd23f"; ctx.fillText(nm + " scores!", W / 2, 300); if (s.why) { ctx.font = "800 36px " + FONT; ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.strokeText(s.why, W / 2, 350); ctx.fillStyle = "#fff"; ctx.fillText(s.why, W / 2, 350); } }
    if (s.phase === "play" && s.last >= 0) { for (let n = 0; n < 3; n++) { ctx.beginPath(); ctx.arc(W / 2 + (s.last ? 80 : -80) + (n - 1) * 24, 152, 8, 0, TAU); ctx.fillStyle = n < s.cnt ? C[s.last] : "#ffffff55"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke(); } }
  },
  cleanup() {}
};

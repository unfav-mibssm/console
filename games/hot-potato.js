import { W, H, TAU, INK, C, rnd, clamp, pad, dirOf, burst, stepParts, drawParts } from "../kit.js";
// One player holds the bomb. Touch your rival to pass it on. When the fuse runs out, whoever holds it blows up and the other player scores.
// D-pad runs, A dashes. The bomb holder runs a little faster. First to 3 points wins.
const R = 26, SPD = 270, HSPD = 306, DASH = 760, DASH_T = .16, DASH_CD = 1.4, WINS = 3, PASS_CD = .9, READY = 1.1, BOOM = 1.4;
const PILLARS = [[440, 240, 46], [840, 240, 46], [440, 480, 46], [840, 480, 46], [640, 360, 40]]; // [x, y, radius]
const LO = R + 14;
const spawn = i => ({ x: i ? 1060 : 220, y: 360, kx: 0, ky: 0, fx: i ? -1 : 1, fy: 0, dashT: 0, dashCd: 0, dx: 0, dy: 0, gone: false });

function keepIn(o) {
  o.x = clamp(o.x, LO, W - LO); o.y = clamp(o.y, LO, H - LO);
  for (const [px, py, pr] of PILLARS) {
    const dx = o.x - px, dy = o.y - py, d = Math.hypot(dx, dy), m = pr + R;
    if (d >= m) continue;
    if (d < 1e-6) o.x = px + m; else { o.x = px + dx / d * m; o.y = py + dy / d * m; }
  }
  o.x = clamp(o.x, LO, W - LO); o.y = clamp(o.y, LO, H - LO);
}
function newRound(s) {
  s.p = [spawn(0), spawn(1)]; s.holder = (s.round + s.first) % 2; s.fuseMax = rnd(9, 14); s.fuse = s.fuseMax; s.passCd = PASS_CD; s.phase = "ready"; s.pt = READY; s.lastTick = 99;
}

export default {
  init() { const s = { round: 0, first: Math.random() < .5 ? 0 : 1, wins: [0, 0], parts: [], pops: [], res: null, endT: 0, shake: 0 }; newRound(s); return s; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); stepParts(s.parts, dt); s.shake = Math.max(0, s.shake - 50 * dt);
    for (let n = s.pops.length - 1; n >= 0; n--) if ((s.pops[n].t -= dt) <= 0) s.pops.splice(n, 1);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.4 ? s.res : null }; }
    if (s.phase === "boom") { if ((s.pt -= dt) <= 0) { s.round++; newRound(s); } return { winner: null }; }
    if (s.phase === "ready" && (s.pt -= dt) <= 0) { s.phase = "play"; audio.beep(880, .15, "square", .12); }

    s.p.forEach((o, i) => {
      const k = pad(inp, i), d = dirOf(k.held), len = Math.hypot(d.x, d.y), nx = len ? d.x / len : 0, ny = len ? d.y / len : 0;
      o.dashCd = Math.max(0, o.dashCd - dt);
      if (len) { o.fx = nx; o.fy = ny; }
      if (k.taps.a > 0 && o.dashCd <= 0 && o.dashT <= 0) { o.dashT = DASH_T; o.dashCd = DASH_CD; o.dx = o.fx; o.dy = o.fy; audio.beep(300, .12, "sawtooth", .08, 700); burst(s.parts, o.x, o.y, 8, C[i], 220); }
      let vx, vy;
      if (o.dashT > 0) { o.dashT -= dt; vx = o.dx * DASH; vy = o.dy * DASH; }
      else { const sp = s.holder === i ? HSPD : SPD; vx = nx * sp; vy = ny * sp; }
      o.x += (vx + o.kx) * dt; o.y += (vy + o.ky) * dt;
      const f = Math.exp(-7 * dt); o.kx *= f; o.ky *= f;
      keepIn(o);
    });

    const [a, b] = s.p; let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d < R * 2) {
      if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
      const nx = dx / d, ny = dy / d, ov = R * 2 - d;
      a.x -= nx * ov / 2; a.y -= ny * ov / 2; b.x += nx * ov / 2; b.y += ny * ov / 2;
      if (s.phase === "play" && s.passCd <= 0) { // the bomb jumps to the other player
        s.holder = 1 - s.holder; s.passCd = PASS_CD; s.shake = 7;
        a.kx -= nx * 520; a.ky -= ny * 520; b.kx += nx * 520; b.ky += ny * 520;
        burst(s.parts, (a.x + b.x) / 2, (a.y + b.y) / 2, 18, "#fde047", 380); audio.beep(700, .1, "square", .13, 330); audio.noise(.06, .12);
        s.pops.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 50, t: .7, txt: "PASS!" });
      }
      keepIn(a); keepIn(b);
    }

    if (s.phase === "play") {
      s.passCd = Math.max(0, s.passCd - dt); s.fuse -= dt;
      const step = s.fuse < 3 ? Math.ceil(s.fuse * 3) : Math.ceil(s.fuse); // ticks get faster near the end
      if (step !== s.lastTick) { s.lastTick = step; audio.beep(s.fuse < 3 ? 1100 : 760, .05, "square", .07); }
      if (s.fuse <= 0) {
        const h = s.holder, o = s.p[h]; o.gone = true; s.wins[1 - h]++; s.phase = "boom"; s.pt = BOOM; s.shake = 22;
        burst(s.parts, o.x, o.y, 70, "#f97316", 700); burst(s.parts, o.x, o.y, 30, "#fde047", 500); burst(s.parts, o.x, o.y, 20, INK, 400);
        audio.noise(.6, .35); audio.beep(90, .5, "sawtooth", .25, 30);
        if (s.wins[1 - h] >= WINS) s.res = h ? "p1" : "p2";
      }
    }
    return { winner: null };
  },
  render(ctx, cv, s, pl) {
    ctx.save(); if (s.shake > 0) ctx.translate(rnd(-s.shake, s.shake), rnd(-s.shake, s.shake));
    ctx.fillStyle = "#dff7e8"; ctx.fillRect(-30, -30, W + 60, H + 60);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 16; x++) if ((x + y) % 2) { ctx.fillStyle = "#cdf0db"; ctx.fillRect(x * 80, y * 80, 80, 80); }
    ctx.strokeStyle = INK; ctx.lineWidth = 10; ctx.strokeRect(5, 5, W - 10, H - 10);
    for (const [px, py, pr] of PILLARS) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill(); ctx.fillStyle = "#4b4670"; ctx.beginPath(); ctx.arc(px, py, pr - 8, 0, TAU); ctx.fill(); }
    const hot = s.phase === "play" && s.fuse < 3, blink = Math.floor(s.fuse * (s.fuse < 3 ? 8 : 2)) % 2 === 0;
    s.p.forEach((o, i) => {
      if (o.gone) return;
      const holder = s.holder === i;
      if (holder) { ctx.strokeStyle = hot && blink ? "#dc2626" : "#f97316"; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(o.x, o.y, R + 10, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = C[i]; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(o.x, o.y, R, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; for (const e of [-1, 1]) { ctx.beginPath(); ctx.arc(o.x + o.fy * -e * 8 + o.fx * 7, o.y + o.fx * e * 8 + o.fy * 7, 6, 0, TAU); ctx.fill(); }
      ctx.fillStyle = INK; for (const e of [-1, 1]) { ctx.beginPath(); ctx.arc(o.x + o.fy * -e * 8 + o.fx * 10, o.y + o.fx * e * 8 + o.fy * 10, 3, 0, TAU); ctx.fill(); }
      if (o.dashCd > 0) { ctx.strokeStyle = "#00000033"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(o.x, o.y, R + 4, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - o.dashCd / DASH_CD)); ctx.stroke(); }
      if (holder) { // the bomb floats above its holder
        const bx = o.x, by = o.y - R - 26;
        ctx.fillStyle = hot && blink ? "#dc2626" : INK; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(bx, by, 19, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ffffff88"; ctx.beginPath(); ctx.arc(bx - 6, by - 6, 5, 0, TAU); ctx.fill();
        ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(bx + 6, by - 17); ctx.quadraticCurveTo(bx + 16, by - 30, bx + 22, by - 24); ctx.stroke();
        ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(bx + 22 + Math.sin(s.fuse * 30) * 2, by - 24, 5, 0, TAU); ctx.fill();
      }
    });
    drawParts(ctx, s.parts); ctx.restore();
    // HUD: score pips on each side and the fuse bar in the middle
    ctx.textAlign = "center";
    s.wins.forEach((w, i) => { for (let n = 0; n < WINS; n++) { const x = i ? W - 60 - n * 34 : 60 + n * 34; ctx.beginPath(); ctx.arc(x, 44, 12, 0, TAU); ctx.fillStyle = n < w ? C[i] : "#fff"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); } });
    const fw = 360, fr = clamp(s.fuse / s.fuseMax, 0, 1);
    ctx.fillStyle = "#ffffffcc"; ctx.fillRect(W / 2 - fw / 2 - 4, 28, fw + 8, 30); ctx.fillStyle = hot ? "#dc2626" : "#f97316"; ctx.fillRect(W / 2 - fw / 2, 32, fw * fr, 22);
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.strokeRect(W / 2 - fw / 2 - 4, 28, fw + 8, 30);
    ctx.font = "700 24px Fredoka, system-ui, sans-serif"; ctx.fillStyle = INK; ctx.fillText("FUSE", W / 2, 84);
    if (s.phase === "ready") {
      const nm = pl?.["p" + (s.holder + 1)]?.name || "Player " + (s.holder + 1);
      ctx.font = "700 64px Fredoka, system-ui, sans-serif"; ctx.lineWidth = 10; ctx.strokeStyle = "#fff"; ctx.strokeText("Round " + (s.round + 1), W / 2, 300); ctx.fillStyle = INK; ctx.fillText("Round " + (s.round + 1), W / 2, 300);
      ctx.font = "700 36px Fredoka, system-ui, sans-serif"; ctx.strokeText(nm + " has the bomb!", W / 2, 350); ctx.fillStyle = C[s.holder]; ctx.fillText(nm + " has the bomb!", W / 2, 350);
    }
    for (const p of s.pops) { ctx.globalAlpha = clamp(p.t / .3, 0, 1); ctx.font = "700 40px Fredoka, system-ui, sans-serif"; ctx.lineWidth = 8; ctx.strokeStyle = "#fff"; ctx.strokeText(p.txt, p.x, p.y - (.7 - p.t) * 50); ctx.fillStyle = "#f97316"; ctx.fillText(p.txt, p.x, p.y - (.7 - p.t) * 50); }
    ctx.globalAlpha = 1;
  },
  cleanup() {}
};

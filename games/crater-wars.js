import { W, H, TAU, INK, C, clamp, pad, rnd, burst, stepParts, drawParts } from "../kit.js";
// Crater Wars: real-time artillery on destructible ground. Wind pushes your shells and every blast digs a crater.
// Left/Right drive, Up/Down aim. HOLD A to charge power, RELEASE to fire (a quick tap = a weak lob). Best of 3 rounds.
const STEP = 4, NX = W / STEP + 1, GRAV = 620, V0 = 260, VR = 780, RELOAD = 2.2, CHARGE_T = 1.5, SPLASH = 100, MAXD = 46, HP = 100, ROUNDT = 60, NEED = 2, ROUNDS = 3, CRATER = 50, BEDROCK = 690;
const FONT = "Fredoka, system-ui, sans-serif";
const MTN = (() => { let sd = 4242; const r = () => (sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296; return [0, 1].map(l => Array.from({ length: 22 }, (_, i) => ({ x: i * 64 - 20, y: 300 + l * 40 - r() * (110 - l * 30) }))); })();

function genTerrain() {
  const ph = [rnd(0, TAU), rnd(0, TAU), rnd(0, TAU)], am = [rnd(40, 70), rnd(20, 38), rnd(8, 16)], h = new Float32Array(NX);
  for (let i = 0; i < NX; i++) {
    const x = i * STEP, u = Math.min(x, W - x); // mirrored left/right, so the ground is fair for both
    let y = 470 + am[0] * Math.sin(u * .0068 + ph[0]) + am[1] * Math.sin(u * .0165 + ph[1]) + am[2] * Math.sin(u * .04 + ph[2]);
    const d = Math.abs(u - 170), f = d < 60 ? 1 : d < 130 ? 1 - (d - 60) / 70 : 0; // a flat pad under each tank
    h[i] = clamp(y * (1 - f) + 480 * f, 330, 620);
  }
  return h;
}
const gy = (h, x) => { const f = clamp(x / STEP, 0, NX - 1.001), i = Math.floor(f), t = f - i; return h[i] * (1 - t) + h[i + 1] * t; };
function carve(h, cx, cy, r) {
  for (let i = Math.max(0, Math.floor((cx - r) / STEP)); i <= Math.min(NX - 1, Math.ceil((cx + r) / STEP)); i++) {
    const dx = i * STEP - cx; if (Math.abs(dx) >= r) continue;
    const hh = Math.sqrt(r * r - dx * dx); if (cy + hh > h[i] && cy - hh <= h[i] + 6) h[i] = Math.min(BEDROCK, cy + hh);
  }
}
const mkTank = (i, h) => ({ x: i ? W - 170 : 170, y: gy(h, i ? W - 170 : 170), vy: 0, fall0: 0, a: i ? Math.PI * .75 : Math.PI * .25, charge: 0, charging: false, prevDown: false, reload: 1, hp: HP, flash: 0, gone: false });
function newRound(s) { s.h = genTerrain(); s.t = [mkTank(0, s.h), mkTank(1, s.h)]; s.sh = []; s.wind = rnd(-70, 70); s.rt = ROUNDT; s.phase = "play"; }

export default {
  init() { const s = { round: 0, wins: [0, 0], parts: [], fx: [], pops: [], res: null, endT: 0, shake: 0, clock: 0, banner: "", bt: 0 }; newRound(s); return s; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); s.clock += dt; stepParts(s.parts, dt); s.shake = Math.max(0, s.shake - 45 * dt);
    for (let n = s.fx.length - 1; n >= 0; n--) if ((s.fx[n].t += dt) > s.fx[n].d) s.fx.splice(n, 1);
    for (let n = s.pops.length - 1; n >= 0; n--) if ((s.pops[n].t -= dt) <= 0) s.pops.splice(n, 1);
    if (s.res) { s.endT += dt; return { winner: s.endT > 2.2 ? s.res : null }; }
    if (s.phase === "between") { if ((s.bt -= dt) <= 0) { s.round++; newRound(s); } return { winner: null }; }
    s.rt -= dt;
    const boom = (x, y, owner) => {
      carve(s.h, x, y, CRATER); s.shake = 14;
      burst(s.parts, x, y, 34, "#ff9a3c", 520); burst(s.parts, x, y, 22, "#8b5a2b", 420); burst(s.parts, x, y, 10, "#ffe9a0", 600); s.fx.push({ x, y, t: 0, d: .5 }); audio.noise(.35, .3); audio.beep(90, .3, "sawtooth", .2, 40);
      s.t.forEach((o, i) => {
        const d = Math.hypot(o.x - x, o.y - 14 - y); if (o.gone || d >= SPLASH) return;
        const dmg = Math.max(3, Math.round(MAXD * (1 - d / SPLASH))); o.hp = Math.max(0, o.hp - dmg); o.flash = .3; s.pops.push({ x: o.x, y: o.y - 60, t: 1, txt: "-" + dmg, c: C[i] });
      });
    };
    s.t.forEach((o, i) => {
      o.flash = Math.max(0, o.flash - dt); o.reload = Math.max(0, o.reload - dt);
      const k = pad(inp, i), mv = (k.held.right ? 1 : 0) - (k.held.left ? 1 : 0), ud = (k.held.up ? 1 : 0) - (k.held.down ? 1 : 0);
      o.a = i ? clamp(o.a - ud * 1.1 * dt, Math.PI * .44, Math.PI * .97) : clamp(o.a + ud * 1.1 * dt, Math.PI * .03, Math.PI * .56);
      if (mv) { const nx = clamp(o.x + mv * 75 * dt, i ? 660 : 50, i ? W - 50 : 620); if (gy(s.h, o.x) - gy(s.h, o.x + mv * 6) <= 6.9 && Math.abs(nx - s.t[1 - i].x) > 70) o.x = nx; }
      const g = gy(s.h, o.x);
      if (o.y < g - 1) { if (o.vy === 0) o.fall0 = o.y; o.vy += 900 * dt; o.y = Math.min(g, o.y + o.vy * dt); if (o.y >= g) { const fell = o.y - o.fall0; o.vy = 0; if (fell > 50) { const d = Math.round((fell - 50) * .25); o.hp = Math.max(0, o.hp - d); o.flash = .3; s.pops.push({ x: o.x, y: o.y - 60, t: 1, txt: "-" + d, c: "#fff" }); } } } else { o.y = g; o.vy = 0; }
      const down = !!k.held.a, edge = k.taps.a > 0 || (down && !o.prevDown); o.prevDown = down;
      if (!o.charging && edge && o.reload <= 0) { o.charging = true; o.charge = 0; }
      if (o.charging) {
        if (down) o.charge = Math.min(1, o.charge + dt / CHARGE_T);
        if (!down || o.charge >= 1) {
          const p = Math.max(.12, o.charge), v = V0 + p * VR; o.charging = false; o.charge = 0; o.reload = RELOAD;
          s.sh.push({ x: o.x + Math.cos(o.a) * 34, y: o.y - 24 - Math.sin(o.a) * 34, vx: Math.cos(o.a) * v, vy: -Math.sin(o.a) * v, o: i, age: 0 });
          s.wind = rnd(-90, 90); audio.beep(200, .25, "sawtooth", .15, 60); audio.noise(.1, .2); burst(s.parts, o.x + Math.cos(o.a) * 34, o.y - 24 - Math.sin(o.a) * 34, 8, "#ffe9a0", 200);
        }
      }
    });
    for (let n = s.sh.length - 1; n >= 0; n--) {
      const b = s.sh[n]; let hit = false; b.age += dt;
      for (let q = 0; q < 3 && !hit; q++) {
        const d = dt / 3; b.vx += s.wind * d; b.vy += GRAV * d; b.x += b.vx * d; b.y += b.vy * d;
        if (b.x < -80 || b.x > W + 80) { hit = "out"; break; }
        if (b.y >= 0 && b.y >= gy(s.h, b.x)) { hit = "ground"; break; }
        for (let i = 0; i < 2; i++) { const t = s.t[i]; if (!t.gone && !(b.o === i && b.age < .35) && Math.hypot(t.x - b.x, t.y - 14 - b.y) < 28) { hit = "tank"; break; } }
      }
      if (hit) { s.sh.splice(n, 1); if (hit !== "out") boom(b.x, b.y, b.o); }
    }
    const dead = s.t.map(t => t.hp <= 0);
    if (dead[0] || dead[1] || s.rt <= 0) {
      let w = dead[0] && dead[1] ? -1 : dead[0] ? 1 : dead[1] ? 0 : s.t[0].hp === s.t[1].hp ? -1 : s.t[0].hp > s.t[1].hp ? 0 : 1;
      s.t.forEach((t, i) => { if (dead[i]) { t.gone = true; burst(s.parts, t.x, t.y - 14, 60, "#ff9a3c", 650); burst(s.parts, t.x, t.y - 14, 30, C[i], 500); s.fx.push({ x: t.x, y: t.y - 14, t: 0, d: .8 }); } });
      if (w >= 0) s.wins[w]++; s.phase = "between"; s.bt = 2.8; s.shake = 20; s.banner = w < 0 ? "Round " + (s.round + 1) + ": draw" : "Round " + (s.round + 1) + ": Player " + (w + 1) + " wins!"; audio.beep(660, .4, "triangle", .15, 990);
      if (s.wins[0] >= NEED || s.wins[1] >= NEED || s.round >= ROUNDS - 1) s.res = s.wins[0] === s.wins[1] ? "draw" : s.wins[0] > s.wins[1] ? "p1" : "p2";
    }
    return { winner: null };
  },
  render(ctx, cv, s, pl) {
    ctx.save(); if (s.shake > 0) ctx.translate(rnd(-s.shake, s.shake) * .6, rnd(-s.shake, s.shake) * .6);
    const sk = ctx.createLinearGradient(0, 0, 0, 560); sk.addColorStop(0, "#3a2a8a"); sk.addColorStop(.55, "#ff7aa8"); sk.addColorStop(1, "#ffd08a"); ctx.fillStyle = sk; ctx.fillRect(-20, -20, W + 40, 740);
    ctx.fillStyle = "#fff3b0"; ctx.beginPath(); ctx.arc(W / 2, 330, 70, 0, TAU); ctx.fill();
    for (let c = 0; c < 4; c++) { const x = ((c * 380 + s.clock * (10 + s.wind * .25)) % (W + 300) + W + 300) % (W + 300) - 150, y = 90 + (c % 3) * 55; ctx.fillStyle = "#ffffff55"; for (const [dx, dy, r] of [[0, 0, 38], [40, 8, 30], [-40, 10, 28], [10, -16, 28]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, TAU); ctx.fill(); } }
    MTN.forEach((layer, l) => { ctx.fillStyle = l ? "#5b2f8f" : "#8a4fb0"; ctx.beginPath(); ctx.moveTo(-40, 560); for (const p of layer) ctx.lineTo(p.x, p.y + 130); ctx.lineTo(W + 40, 560); ctx.fill(); });
    const h = s.h;
    ctx.beginPath(); ctx.moveTo(0, H + 10); for (let i = 0; i < NX; i++) ctx.lineTo(i * STEP, h[i]); ctx.lineTo(W, H + 10); ctx.closePath();
    const dg = ctx.createLinearGradient(0, 330, 0, H); dg.addColorStop(0, "#9a6a35"); dg.addColorStop(1, "#4a2c15"); ctx.fillStyle = dg; ctx.fill();
    ctx.beginPath(); for (let i = 0; i < NX; i++) { if (i) ctx.lineTo(i * STEP, h[i]); else ctx.moveTo(0, h[0]); } ctx.strokeStyle = "#4cc35a"; ctx.lineWidth = 12; ctx.lineJoin = "round"; ctx.stroke(); ctx.strokeStyle = "#7ee07a"; ctx.lineWidth = 4; ctx.stroke();
    s.t.forEach((t, i) => {
      if (t.gone) return;
      const sl = Math.atan2(gy(h, t.x + 12) - gy(h, t.x - 12), 24);
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(sl);
      ctx.fillStyle = "#2a2744"; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-28, -14, 56, 16, 8) : ctx.rect(-28, -14, 56, 16); ctx.fill(); ctx.stroke();
      ctx.fillStyle = t.flash > 0 ? "#fff" : C[i]; ctx.beginPath(); ctx.rect(-20, -28, 40, 16); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -28, 13, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(0, -30); ctx.rotate(-t.a - sl); ctx.fillStyle = "#3b3868"; ctx.fillRect(0, -4, 36, 8); ctx.strokeRect(0, -4, 36, 8); ctx.restore();
      ctx.restore();
      const tx = t.x + Math.cos(t.a) * 34, ty = t.y - 24 - Math.sin(t.a) * 34;
      ctx.strokeStyle = C[i] + "aa"; ctx.lineWidth = 3; ctx.setLineDash([3, 8]); ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(t.a) * (30 + (t.charging ? t.charge : 0) * 140), ty - Math.sin(t.a) * (30 + (t.charging ? t.charge : 0) * 140)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#000a"; ctx.fillRect(t.x - 30, t.y - 70, 60, 8); ctx.fillStyle = t.hp > 40 ? "#3ddc84" : "#ff4d4d"; ctx.fillRect(t.x - 29, t.y - 69, 58 * t.hp / HP, 6);
      if (t.charging) { ctx.fillStyle = "#000a"; ctx.fillRect(t.x - 30, t.y - 82, 60, 8); const pg = ctx.createLinearGradient(t.x - 30, 0, t.x + 30, 0); pg.addColorStop(0, "#ffd23f"); pg.addColorStop(1, "#ff3d3d"); ctx.fillStyle = pg; ctx.fillRect(t.x - 29, t.y - 81, 58 * t.charge, 6); }
      else if (t.reload > 0) { ctx.fillStyle = "#ffffff66"; ctx.fillRect(t.x - 30, t.y - 82, 60 * (1 - t.reload / RELOAD), 4); }
    });
    for (const b of s.sh) {
      ctx.fillStyle = "#1d1b2f"; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, TAU); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
      if (b.y < 0) { ctx.fillStyle = "#fff"; ctx.beginPath(); const mx = clamp(b.x, 12, W - 12); ctx.moveTo(mx, 6); ctx.lineTo(mx - 9, 22); ctx.lineTo(mx + 9, 22); ctx.fill(); }
    }
    for (const f of s.fx) { const p = f.t / f.d, r = 20 + p * 90; ctx.globalAlpha = 1 - p; ctx.fillStyle = p < .4 ? "#fff3b0" : "#ff7a1a"; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
    drawParts(ctx, s.parts); ctx.restore();
    // HUD
    ctx.lineJoin = "round"; s.t.forEach((t, i) => {
      const x = i ? W - 330 : 30; ctx.fillStyle = "#000a"; ctx.fillRect(x - 3, 17, 306, 26); ctx.fillStyle = t.hp > 40 ? "#3ddc84" : "#ff4d4d"; ctx.fillRect(i ? x + 300 - 300 * t.hp / HP : x, 20, 300 * t.hp / HP, 20);
      for (let n = 0; n < NEED; n++) { ctx.beginPath(); ctx.arc(i ? W - 44 - n * 30 : 44 + n * 30, 66, 10, 0, TAU); ctx.fillStyle = n < s.wins[i] ? C[i] : "#ffffff44"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke(); }
    });
    ctx.textAlign = "center"; ctx.font = "800 26px " + FONT; ctx.lineWidth = 7; ctx.strokeStyle = INK; const rt = "ROUND " + Math.min(ROUNDS, s.round + 1) + "  ·  " + Math.max(0, Math.ceil(s.rt)) + "s"; ctx.strokeText(rt, W / 2, 36); ctx.fillStyle = "#fff"; ctx.fillText(rt, W / 2, 36);
    const wl = clamp(Math.abs(s.wind) / 90, 0, 1) * 70, dir = Math.sign(s.wind) || 1; ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(W / 2 - dir * wl, 62); ctx.lineTo(W / 2 + dir * wl, 62); ctx.lineTo(W / 2 + dir * wl, 54); ctx.lineTo(W / 2 + dir * (wl + 16), 66); ctx.lineTo(W / 2 + dir * wl, 78); ctx.lineTo(W / 2 + dir * wl, 70); ctx.lineTo(W / 2 - dir * wl, 70); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = "700 18px " + FONT; ctx.fillStyle = "#fff"; ctx.fillText("WIND", W / 2, 98);
    for (const p of s.pops) { ctx.globalAlpha = Math.min(1, p.t * 2); ctx.font = "800 34px " + FONT; ctx.lineWidth = 7; ctx.strokeStyle = INK; const y = p.y - (1 - p.t) * 40; ctx.strokeText(p.txt, p.x, y); ctx.fillStyle = "#fff"; ctx.fillText(p.txt, p.x, y); } ctx.globalAlpha = 1;
    if (s.phase === "between" || s.res) { ctx.font = "800 60px " + FONT; ctx.lineWidth = 12; ctx.strokeStyle = INK; const nm = s.banner.replace(/Player (\d)/, (m, n) => pl?.["p" + n]?.name || m); ctx.strokeText(nm, W / 2, 300); ctx.fillStyle = "#ffd23f"; ctx.fillText(nm, W / 2, 300); }
  },
  cleanup() {}
};

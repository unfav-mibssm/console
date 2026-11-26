import { TAU, INK, C, clamp, pad } from "../kit.js";
// Maze Blasters: a first-person laser duel in a new, perfectly fair (mirror-symmetric) maze every match. Split screen.
// Up/Down walk, Left/Right turn, A fires (hold for auto-fire). 3 hits = out. First to 5 frags wins. Green packs heal you.
const GW = 16, GH = 16, VW = 636, VH = 720, COLW = 2, COLS = VW / COLW, HZ = VH * .5, PROJ = VH * .9, FOVT = Math.tan(33 * Math.PI / 180);
const SP = 3.4, BACK = 2.3, TURN = 2.5, BOLT = 10, CD = .45, DMG = 34, FRAGS = 5, LIMIT = 150, R = .24;
const SPAWNS = [[1.5, 1.5], [14.5, 14.5], [1.5, 14.5], [14.5, 1.5]];
const WALLC = [null, [110, 70, 210], [40, 190, 215], [225, 80, 160]], FOG = [34, 20, 74];
const zbuf = new Float32Array(COLS);
const FONT = "Fredoka, system-ui, sans-serif";

function connected(g) {
  let total = 0; for (const r of g) for (const v of r) if (!v) total++;
  const seen = new Set(["1,1"]), q = [[1, 1]];
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, key = nx + "," + ny; if (!g[ny][nx] && !seen.has(key)) { seen.add(key); q.push([nx, ny]); } } }
  return seen.size === total;
}
const keepClear = (x, y) => SPAWNS.some(([sx, sy]) => Math.abs(x + .5 - sx) <= 2.6 && Math.abs(y + .5 - sy) <= 2.6) || (x >= 7 && x <= 8 && y >= 7 && y <= 8);
function genMap() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const g = Array.from({ length: GH }, (_, y) => Array.from({ length: GW }, (_, x) => (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) ? 1 : 0));
    let walls = 0, tries = 0;
    while (tries++ < 600 && walls < 64) {
      const x = 1 + (Math.random() * 14 | 0), y = 1 + (Math.random() * 14 | 0), horiz = Math.random() < .5, len = 1 + (Math.random() * 4 | 0), cells = [];
      for (let n = 0; n < len; n++) { const cx = x + (horiz ? n : 0), cy = y + (horiz ? 0 : n); if (cx < 1 || cy < 1 || cx > GW - 2 || cy > GH - 2 || keepClear(cx, cy) || keepClear(GW - 1 - cx, GH - 1 - cy)) break; cells.push([cx, cy], [GW - 1 - cx, GH - 1 - cy]); }
      const changed = []; for (const [cx, cy] of cells) if (!g[cy][cx]) { g[cy][cx] = 2 + (((cx >> 1) + (cy >> 1)) % 2); changed.push([cx, cy]); }
      if (!changed.length) continue;
      if (connected(g)) walls += changed.length; else for (const [cx, cy] of changed) g[cy][cx] = 0;
    }
    if (walls >= 30) return g;
  }
  const g = Array.from({ length: GH }, (_, y) => Array.from({ length: GW }, (_, x) => (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) ? 1 : 0));
  for (const [x, y] of [[5, 5], [10, 10], [5, 10], [10, 5]]) g[y][x] = 2; return g;
}
const free = (g, x, y) => !g[Math.floor(y - R)][Math.floor(x - R)] && !g[Math.floor(y - R)][Math.floor(x + R)] && !g[Math.floor(y + R)][Math.floor(x - R)] && !g[Math.floor(y + R)][Math.floor(x + R)];
const mkP = i => ({ x: SPAWNS[i][0], y: SPAWNS[i][1], a: Math.atan2(8 - SPAWNS[i][1], 8 - SPAWNS[i][0]), hp: 100, cd: 0, inv: 1, dead: 0, frags: 0, kick: 0, hurt: 0, pop: 0, walk: 0 });
function respawn(s, i) {
  const p = s.p[i], o = s.p[1 - i]; let best = 0, bd = -1;
  SPAWNS.forEach(([x, y], n) => { const d = Math.hypot(x - o.x, y - o.y); if (d > bd) { bd = d; best = n; } });
  p.x = SPAWNS[best][0]; p.y = SPAWNS[best][1]; p.a = Math.atan2(8 - p.y, 8 - p.x); p.hp = 100; p.inv = 1.6; p.cd = 0;
}

export default {
  init() {
    const g = genMap(), pu = [];
    for (let n = 0; n < 40 && pu.length < 4; n++) {
      const x = 1 + (Math.random() * 14 | 0), y = 1 + (Math.random() * 14 | 0), mx = GW - 1 - x, my = GH - 1 - y;
      if (g[y][x] || g[my][mx] || SPAWNS.some(([sx, sy]) => Math.hypot(x + .5 - sx, y + .5 - sy) < 4 || Math.hypot(mx + .5 - sx, my + .5 - sy) < 4) || pu.some(q => Math.hypot(q.x - x - .5, q.y - y - .5) < 3)) continue;
      pu.push({ x: x + .5, y: y + .5, t: 0 }, { x: mx + .5, y: my + .5, t: 0 });
    }
    return { t: 0, g, pu, p: [mkP(0), mkP(1)], bolts: [], res: null, endT: 0 };
  },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .05);
    s.p.forEach(p => { p.cd = Math.max(0, p.cd - dt); p.inv = Math.max(0, p.inv - dt); p.kick = Math.max(0, p.kick - dt); p.hurt = Math.max(0, p.hurt - dt); p.pop = Math.max(0, p.pop - dt); });
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.8 ? s.res : null }; }
    s.t += dt;
    s.p.forEach((p, i) => {
      if (p.dead > 0) { p.dead -= dt; if (p.dead <= 0) respawn(s, i); return; }
      const k = pad(inp, i), turn = (k.held.right ? 1 : 0) - (k.held.left ? 1 : 0), mv = (k.held.up ? 1 : 0) - (k.held.down ? 1 : 0);
      p.a += turn * TURN * dt;
      if (mv) { const sp = (mv > 0 ? SP : BACK) * mv * dt, nx = p.x + Math.cos(p.a) * sp, ny = p.y + Math.sin(p.a) * sp; if (free(s.g, nx, p.y)) p.x = nx; if (free(s.g, p.x, ny)) p.y = ny; p.walk += dt * 9; }
      if ((k.taps.a > 0 || k.held.a) && p.cd <= 0) {
        p.cd = CD; p.kick = .16; s.bolts.push({ x: p.x + Math.cos(p.a) * .35, y: p.y + Math.sin(p.a) * .35, vx: Math.cos(p.a) * BOLT, vy: Math.sin(p.a) * BOLT, o: i, life: 2.2 });
        audio.beep(560, .1, "sawtooth", .1, 150);
      }
    });
    for (let n = s.bolts.length - 1; n >= 0; n--) {
      const b = s.bolts[n], steps = Math.ceil(BOLT * dt / .1); let gone = (b.life -= dt) <= 0;
      for (let q = 0; q < steps && !gone; q++) {
        b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
        if (s.g[Math.floor(b.y)]?.[Math.floor(b.x)] !== 0) { gone = true; break; }
        const t = s.p[1 - b.o];
        if (t.dead <= 0 && t.inv <= 0 && Math.hypot(t.x - b.x, t.y - b.y) < .42) {
          gone = true; t.hp -= DMG; t.hurt = .45; audio.noise(.12, .22); audio.beep(180, .15, "square", .15, 70);
          if (t.hp <= 0) { t.dead = 1.9; t.hp = 0; s.p[b.o].frags++; s.p[b.o].pop = 1.4; audio.beep(880, .25, "triangle", .15, 1500); }
        }
      }
      if (gone) s.bolts.splice(n, 1);
    }
    for (const u of s.pu) {
      if (u.t > 0) { u.t -= dt; continue; }
      for (const p of s.p) if (p.dead <= 0 && p.hp < 100 && Math.hypot(p.x - u.x, p.y - u.y) < .55) { p.hp = Math.min(100, p.hp + 40); u.t = 14; audio.beep(700, .15, "triangle", .12, 1100); break; }
    }
    const [a, b] = s.p;
    if (a.frags >= FRAGS || b.frags >= FRAGS) s.res = a.frags === b.frags ? "draw" : a.frags > b.frags ? "p1" : "p2";
    else if (s.t > LIMIT) s.res = a.frags !== b.frags ? (a.frags > b.frags ? "p1" : "p2") : a.hp !== b.hp ? (a.hp > b.hp ? "p1" : "p2") : "draw";
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.fillStyle = INK; ctx.fillRect(0, 0, 1280, 720);
    view(ctx, s, 0, 0); view(ctx, s, 1, VW + 8);
  },
  cleanup() {}
};

function view(ctx, s, k, x0) {
  const me = s.p[k], op = s.p[1 - k], g = s.g;
  ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, VW, VH); ctx.clip(); ctx.translate(x0, 0);
  let gr = ctx.createLinearGradient(0, 0, 0, HZ); gr.addColorStop(0, "#0d0825"); gr.addColorStop(1, "#2a1a55"); ctx.fillStyle = gr; ctx.fillRect(0, 0, VW, HZ);
  gr = ctx.createLinearGradient(0, HZ, 0, VH); gr.addColorStop(0, "#2a1a55"); gr.addColorStop(1, "#090814"); ctx.fillStyle = gr; ctx.fillRect(0, HZ, VW, VH - HZ);
  ctx.strokeStyle = "#7b5cff22"; ctx.lineWidth = 2; for (let i = 1; i < 9; i++) { const y = HZ + (VH - HZ) * Math.pow(i / 9, 2); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VW, y); ctx.stroke(); }
  const dirX = Math.cos(me.a), dirY = Math.sin(me.a), plX = -dirY * FOVT, plY = dirX * FOVT;
  for (let c = 0; c < COLS; c++) {
    const cx = 2 * c / COLS - 1, rdx = dirX + plX * cx, rdy = dirY + plY * cx;
    let mx = Math.floor(me.x), my = Math.floor(me.y);
    const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9));
    let sdx, sdy, stx, sty, side = 0, hit = 0, guard = 0;
    if (rdx < 0) { stx = -1; sdx = (me.x - mx) * ddx; } else { stx = 1; sdx = (mx + 1 - me.x) * ddx; }
    if (rdy < 0) { sty = -1; sdy = (me.y - my) * ddy; } else { sty = 1; sdy = (my + 1 - me.y) * ddy; }
    while (!hit && guard++ < 40) { if (sdx < sdy) { sdx += ddx; mx += stx; side = 0; } else { sdy += ddy; my += sty; side = 1; } const t = g[my]?.[mx]; if (t === undefined) hit = 1; else if (t) hit = t; }
    const dist = Math.max(.05, side === 0 ? sdx - ddx : sdy - ddy); zbuf[c] = dist;
    const lh = PROJ / dist, top = HZ - lh / 2, f = clamp(dist / 14, 0, 1), sd = side ? .7 : 1, bc = WALLC[hit] || WALLC[2];
    ctx.fillStyle = `rgb(${bc[0] * sd * (1 - f) + FOG[0] * f | 0},${bc[1] * sd * (1 - f) + FOG[1] * f | 0},${bc[2] * sd * (1 - f) + FOG[2] * f | 0})`; ctx.fillRect(c * COLW, top, COLW, lh);
    let wx = side === 0 ? me.y + dist * rdy : me.x + dist * rdx; wx -= Math.floor(wx);
    if (wx < .04 || wx > .96) { ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fillRect(c * COLW, top, COLW, lh); }
    ctx.fillStyle = `rgba(${Math.min(255, bc[0] + 110)},${Math.min(255, bc[1] + 110)},${Math.min(255, bc[2] + 110)},${(1 - f).toFixed(2)})`;
    ctx.fillRect(c * COLW, top + lh * .06, COLW, Math.max(1, lh * .03)); ctx.fillRect(c * COLW, top + lh * .91, COLW, Math.max(1, lh * .03));
  }
  // sprites (drone, bolts, health packs), far to near, hidden behind walls where the depth buffer says so
  const det = plX * dirY - plY * dirX, list = [];
  const add = (x, y, kind, o) => { const dx = x - me.x, dy = y - me.y, tx = (dirY * dx - dirX * dy) / det, ty = (-plY * dx + plX * dy) / det; if (ty > .2) list.push({ tx, ty, kind, o }); };
  if (op.dead <= 0) add(op.x, op.y, 0, op);
  for (const b of s.bolts) add(b.x, b.y, 1, b);
  for (const u of s.pu) if (u.t <= 0) add(u.x, u.y, 2, u);
  list.sort((a, b) => b.ty - a.ty);
  for (const sp of list) {
    const sz = PROJ / sp.ty, sx = VW / 2 * (1 + sp.tx / sp.ty), half = sz * (sp.kind === 0 ? .4 : .25);
    const c0 = clamp(Math.floor((sx - half) / COLW), 0, COLS - 1), c1 = clamp(Math.floor((sx + half) / COLW), 0, COLS - 1);
    if (sx + half < 0 || sx - half > VW) continue;
    ctx.save(); ctx.beginPath(); let run = -1, any = false;
    for (let c = c0; c <= c1 + 1; c++) { const vis = c <= c1 && sp.ty < zbuf[c] + .02; if (vis && run < 0) run = c; if (!vis && run >= 0) { ctx.rect(run * COLW, 0, (c - run) * COLW, VH); run = -1; any = true; } }
    if (!any) { ctx.restore(); continue; }
    ctx.clip();
    if (sp.kind === 0) { // the other player: a glowing hover-drone
      const col = C[1 - k], cy = HZ + sz * .12, r = sz * .3;
      ctx.fillStyle = "#00000055"; ctx.beginPath(); ctx.ellipse(sx, HZ + sz * .5, r * 1.1, r * .22, 0, 0, TAU); ctx.fill();
      const gg = ctx.createRadialGradient(sx, cy, 0, sx, cy, r * 1.7); gg.addColorStop(0, col + "aa"); gg.addColorStop(1, col + "00"); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(sx, cy, r * 1.7, 0, TAU); ctx.fill();
      ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, sz * .02); ctx.beginPath(); ctx.arc(sx, cy, r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#14121f"; ctx.beginPath(); ctx.ellipse(sx, cy - r * .05, r * .75, r * .38, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx + Math.cos(op.a - me.a) * r * .3, cy - r * .05, r * .13, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, sz * .025); ctx.beginPath(); ctx.ellipse(sx, cy + r * .75, r * 1.05, r * .2, 0, 0, TAU); ctx.stroke();
      const hw = r * 1.6; ctx.fillStyle = "#000a"; ctx.fillRect(sx - hw / 2, cy - r * 1.5, hw, Math.max(3, sz * .03)); ctx.fillStyle = op.hp > 40 ? "#3ddc84" : "#ff4d4d"; ctx.fillRect(sx - hw / 2, cy - r * 1.5, hw * op.hp / 100, Math.max(3, sz * .03));
      if (op.inv > 0) { ctx.strokeStyle = "#fff9"; ctx.lineWidth = Math.max(1, sz * .02); ctx.beginPath(); ctx.arc(sx, cy, r * 1.25, 0, TAU); ctx.stroke(); }
    } else if (sp.kind === 1) {
      const col = C[sp.o.o], cy = HZ + sz * .1, r = Math.max(2, sz * .06), gg = ctx.createRadialGradient(sx, cy, 0, sx, cy, r * 3.2); gg.addColorStop(0, "#fff"); gg.addColorStop(.3, col); gg.addColorStop(1, col + "00");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(sx, cy, r * 3.2, 0, TAU); ctx.fill();
    } else {
      const cy = HZ + sz * (.32 + .03 * Math.sin(s.t * 4)), r = sz * .13, gg = ctx.createRadialGradient(sx, cy, 0, sx, cy, r * 2); gg.addColorStop(0, "#9dffb8"); gg.addColorStop(1, "#3ddc8400");
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(sx, cy, r * 2, 0, TAU); ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillRect(sx - r * .25, cy - r * .8, r * .5, r * 1.6); ctx.fillRect(sx - r * .8, cy - r * .25, r * 1.6, r * .5);
    }
    ctx.restore();
  }
  // weapon + HUD
  const ky = me.kick * 90, bx = Math.sin(me.walk) * 6;
  ctx.fillStyle = "#3b3868"; ctx.strokeStyle = INK; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(VW / 2 - 20 + bx, VH - 120 + ky); ctx.lineTo(VW / 2 + 120 + bx, VH - 120 + ky); ctx.lineTo(VW / 2 + 190 + bx, VH + 10); ctx.lineTo(VW / 2 - 50 + bx, VH + 10); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(VW / 2 + 24 + bx, VH - 250 + ky, 36, 140); ctx.strokeRect(VW / 2 + 24 + bx, VH - 250 + ky, 36, 140); ctx.fillStyle = C[k]; ctx.fillRect(VW / 2 + 24 + bx, VH - 200 + ky, 36, 14); ctx.fillRect(VW / 2 + 20 + bx, VH - 110 + ky, 80, 12);
  if (me.kick > .08) { const gg = ctx.createRadialGradient(VW / 2 + 42 + bx, VH - 256, 0, VW / 2 + 42 + bx, VH - 256, 50); gg.addColorStop(0, "#fff"); gg.addColorStop(.4, "#ffd23f"); gg.addColorStop(1, "#ffd23f00"); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(VW / 2 + 42 + bx, VH - 256, 50, 0, TAU); ctx.fill(); }
  ctx.strokeStyle = "#ffffffcc"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(VW / 2 - 14, HZ); ctx.lineTo(VW / 2 - 5, HZ); ctx.moveTo(VW / 2 + 5, HZ); ctx.lineTo(VW / 2 + 14, HZ); ctx.moveTo(VW / 2, HZ - 14); ctx.lineTo(VW / 2, HZ - 5); ctx.moveTo(VW / 2, HZ + 5); ctx.lineTo(VW / 2, HZ + 14); ctx.stroke();
  if (me.hurt > 0) { const gg = ctx.createRadialGradient(VW / 2, VH / 2, 160, VW / 2, VH / 2, 460); gg.addColorStop(0, "#ff000000"); gg.addColorStop(1, "rgba(255,0,0," + (.7 * me.hurt / .45).toFixed(2) + ")"); ctx.fillStyle = gg; ctx.fillRect(0, 0, VW, VH); }
  ctx.textAlign = "left"; ctx.fillStyle = "#00000099"; ctx.fillRect(16, 16, 204, 22); ctx.fillStyle = me.hp > 40 ? "#3ddc84" : "#ff4d4d"; ctx.fillRect(18, 18, 200 * me.hp / 100, 18);
  ctx.textAlign = "center"; ctx.font = "800 40px " + FONT; ctx.lineWidth = 8; ctx.lineJoin = "round"; ctx.strokeStyle = INK; const ft = "FRAGS " + me.frags + " / " + FRAGS; ctx.strokeText(ft, VW / 2 + 60, 62); ctx.fillStyle = "#fff"; ctx.fillText(ft, VW / 2 + 60, 62);
  if (me.pop > 0) { ctx.globalAlpha = Math.min(1, me.pop); ctx.font = "800 64px " + FONT; ctx.lineWidth = 12; ctx.strokeText("FRAG!", VW / 2, 220); ctx.fillStyle = "#ffd23f"; ctx.fillText("FRAG!", VW / 2, 220); ctx.globalAlpha = 1; }
  // radar: walls, you, and the other player when they are close
  const ms = 8, mx0 = 14, my0 = VH - 70 - GH * ms; ctx.fillStyle = "#000a"; ctx.fillRect(mx0 - 3, my0 - 3, GW * ms + 6, GH * ms + 6);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (g[y][x]) { const bc = WALLC[g[y][x]]; ctx.fillStyle = `rgb(${bc[0]},${bc[1]},${bc[2]})`; ctx.fillRect(mx0 + x * ms, my0 + y * ms, ms, ms); }
  for (const u of s.pu) if (u.t <= 0) { ctx.fillStyle = "#3ddc84"; ctx.fillRect(mx0 + u.x * ms - 2, my0 + u.y * ms - 2, 4, 4); }
  if (op.dead <= 0 && Math.hypot(op.x - me.x, op.y - me.y) < 6) { ctx.fillStyle = C[1 - k]; ctx.beginPath(); ctx.arc(mx0 + op.x * ms, my0 + op.y * ms, 3.5, 0, TAU); ctx.fill(); }
  ctx.fillStyle = C[k]; ctx.save(); ctx.translate(mx0 + me.x * ms, my0 + me.y * ms); ctx.rotate(me.a); ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, 4); ctx.lineTo(-4, -4); ctx.closePath(); ctx.fill(); ctx.restore();
  if (me.dead > 0) { ctx.fillStyle = "#000000b0"; ctx.fillRect(0, 0, VW, VH); ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.font = "800 56px " + FONT; ctx.fillText("ELIMINATED", VW / 2, VH / 2 - 10); ctx.font = "700 30px " + FONT; ctx.fillText("back in " + Math.ceil(me.dead) + "…", VW / 2, VH / 2 + 38); }
  ctx.strokeStyle = C[k]; ctx.lineWidth = 8; ctx.strokeRect(4, 4, VW - 8, VH - 8);
  ctx.restore();
}

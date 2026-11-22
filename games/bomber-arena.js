import { W, H, TAU, INK, C, pad, burst, stepParts, drawParts } from "../kit.js";
// Walk with the D-pad, drop a bomb with A. Blasts destroy soft blocks (some drop power-ups) and chain into other bombs. Best of 3 rounds.
const CELL = 64, COLS = 15, ROWS = 11, OX = (W - COLS * CELL) / 2, OY = (H - ROWS * CELL) / 2;
const EMPTY = 0, WALL = 1, SOFT = 2, FUSE = 2.2, FLAME = .45, WIN = 2;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }, D4 = Object.values(DIRS), SPAWN = [[1, 1], [COLS - 2, ROWS - 2]];
const idx = (x, y) => y * COLS + x, FONT = "700 28px Fredoka, system-ui, sans-serif";

function newRound(s) {
  s.grid = new Uint8Array(COLS * ROWS); s.fire = new Float32Array(COLS * ROWS); s.bombs = []; s.items = []; s.phase = "play"; s.pt = 0; s.msg = "";
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const wall = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 || (x % 2 === 0 && y % 2 === 0); // border + a pillar on every even/even cell
    s.grid[idx(x, y)] = wall ? WALL : Math.random() < .7 ? SOFT : EMPTY;
  }
  SPAWN.forEach(([sx, sy], i) => { const d = i ? -1 : 1; for (const [x, y] of [[sx, sy], [sx + d, sy], [sx, sy + d]]) s.grid[idx(x, y)] = EMPTY; }); // a safe L-shaped corner for each player
  s.p = SPAWN.map(([x, y]) => ({ cx: x, cy: y, mv: null, spd: 4.6, bombs: 1, range: 2, alive: true, face: [0, 1], last: null }));
}
const posOf = o => o.mv ? [o.cx + o.mv.dx * o.mv.t, o.cy + o.mv.dy * o.mv.t] : [o.cx, o.cy];
const cellOf = o => o.mv && o.mv.t >= .5 ? [o.cx + o.mv.dx, o.cy + o.mv.dy] : [o.cx, o.cy]; // the cell a player is "in" (nearest one)
const bombAt = (s, x, y) => s.bombs.find(b => b.x === x && b.y === y);
const blocked = (s, i, x, y) => { if (x < 0 || y < 0 || x >= COLS || y >= ROWS || s.grid[idx(x, y)]) return true; const b = bombAt(s, x, y); return !!b && !b.pass[i]; };
function pick(o, held) { if (o.last && held[o.last]) return DIRS[o.last]; for (const k in DIRS) if (held[k]) return DIRS[k]; return null; } // newest pressed direction wins

function grab(s, o, audio) {
  const n = s.items.findIndex(it => it.x === o.cx && it.y === o.cy); if (n < 0) return;
  const it = s.items.splice(n, 1)[0];
  if (it.k === "b") o.bombs = Math.min(o.bombs + 1, 5); else if (it.k === "f") o.range = Math.min(o.range + 1, 6); else o.spd = Math.min(o.spd + .7, 7.5);
  audio.beep(880, .08, "triangle", .12, 1320);
}
function move(s, o, i, held, dt, audio) {
  const d = pick(o, held);
  if (o.mv && d && d[0] === -o.mv.dx && d[1] === -o.mv.dy) { o.cx += o.mv.dx; o.cy += o.mv.dy; o.mv = { dx: -o.mv.dx, dy: -o.mv.dy, t: 1 - o.mv.t }; } // turn around mid-step
  if (!o.mv && d) { o.face = d; if (!blocked(s, i, o.cx + d[0], o.cy + d[1])) o.mv = { dx: d[0], dy: d[1], t: 0 }; }
  if (!o.mv) return;
  o.face = [o.mv.dx, o.mv.dy]; o.mv.t += o.spd * dt;
  while (o.mv && o.mv.t >= 1) { // arrive; leftover time carries into the next step so speed stays exact
    const over = o.mv.t - 1; o.cx += o.mv.dx; o.cy += o.mv.dy; o.mv = null; grab(s, o, audio);
    const n = pick(o, held);
    if (n && !blocked(s, i, o.cx + n[0], o.cy + n[1])) { o.face = n; o.mv = { dx: n[0], dy: n[1], t: over }; } else break;
  }
}
function drop(s, o, i, audio) {
  const [x, y] = cellOf(o);
  if (s.bombs.filter(b => b.owner === i).length >= o.bombs || bombAt(s, x, y)) return;
  const b = { x, y, t: FUSE, owner: i, range: o.range, pass: [false, false] };
  s.p.forEach((q, j) => { const [qx, qy] = cellOf(q); if (qx === x && qy === y) b.pass[j] = true; }); // whoever stands on a new bomb may walk off it
  s.bombs.push(b); audio.beep(180, .06, "square", .1);
}
function detonate(s, first, audio) {
  const queue = [first], soft = [];
  while (queue.length) {
    const b = queue.pop(), at = s.bombs.indexOf(b); if (at < 0) continue; s.bombs.splice(at, 1);
    const cells = [[b.x, b.y]];
    for (const [dx, dy] of D4) for (let r = 1; r <= b.range; r++) {
      const x = b.x + dx * r, y = b.y + dy * r, t = s.grid[idx(x, y)];
      if (t === WALL) break;
      cells.push([x, y]);
      if (t === SOFT) { soft.push([x, y]); break; }
      const ob = bombAt(s, x, y); if (ob) { queue.push(ob); break; } // chain reaction
    }
    for (const [x, y] of cells) { s.fire[idx(x, y)] = FLAME; burst(s.parts, OX + (x + .5) * CELL, OY + (y + .5) * CELL, 4, "#f97316", 220); }
  }
  s.items = s.items.filter(it => s.fire[idx(it.x, it.y)] <= 0); // flames destroy power-ups lying around
  for (const [x, y] of soft) { s.grid[idx(x, y)] = EMPTY; if (Math.random() < .3) s.items.push({ x, y, k: "bfs"[Math.random() * 3 | 0] }); }
  audio.noise(.35, .28); audio.beep(90, .3, "sawtooth", .22, 40);
}

export default {
  init() { const s = { round: 1, wins: [0, 0], parts: [], res: null, endT: 0 }; newRound(s); return s; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .033); stepParts(s.parts, dt);
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.3 ? s.res : null }; }
    for (let n = 0; n < s.fire.length; n++) if (s.fire[n] > 0) s.fire[n] = Math.max(0, s.fire[n] - dt);
    if (s.phase === "end") {
      s.pt += dt;
      if (s.pt > 1.9) { if (s.wins[0] >= WIN || s.wins[1] >= WIN) s.res = s.wins[0] > s.wins[1] ? "p1" : "p2"; else { s.round++; newRound(s); } }
      return { winner: null };
    }
    s.p.forEach((o, i) => {
      if (!o.alive) return;
      const k = pad(inp, i);
      for (const key of k.order) if (DIRS[key]) o.last = key;
      move(s, o, i, k.held, dt, audio);
      if (k.taps.a > 0) drop(s, o, i, audio); // one bomb per press; holding A does not spam
    });
    for (const b of s.bombs) { b.t -= dt; s.p.forEach((q, j) => { if (b.pass[j]) { const [qx, qy] = cellOf(q); if (qx !== b.x || qy !== b.y) b.pass[j] = false; } }); }
    for (const b of s.bombs.filter(x => x.t <= 0)) if (s.bombs.includes(b)) detonate(s, b, audio);
    s.p.forEach((o, i) => { // anyone standing in flames is out
      if (!o.alive) return; const [x, y] = cellOf(o);
      if (s.fire[idx(x, y)] > 0) { o.alive = false; const [px, py] = posOf(o); burst(s.parts, OX + (px + .5) * CELL, OY + (py + .5) * CELL, 50, C[i], 500); audio.beep(110, .3, "sawtooth", .2, 40); }
    });
    const dead = s.p.map(o => !o.alive);
    if (dead[0] || dead[1]) {
      s.phase = "end"; s.pt = 0;
      if (dead[0] && dead[1]) s.msg = "Both blown up! Replay."; else { const w = dead[0] ? 1 : 0; s.wins[w]++; s.msg = `Player ${w + 1} wins the round!`; }
    }
    return { winner: null };
  },
  render(ctx, cv, s, pl) {
    ctx.fillStyle = "#fff4c2"; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const px = OX + x * CELL, py = OY + y * CELL, t = s.grid[idx(x, y)];
      ctx.fillStyle = (x + y) % 2 ? "#f6e9a9" : "#fbf0b8"; ctx.fillRect(px, py, CELL, CELL);
      if (t === WALL) { ctx.fillStyle = INK; ctx.fillRect(px, py, CELL, CELL); ctx.fillStyle = "#4b4670"; ctx.fillRect(px + 6, py + 6, CELL - 12, CELL - 12); }
      else if (t === SOFT) { ctx.fillStyle = "#c9a468"; ctx.fillRect(px + 3, py + 3, CELL - 6, CELL - 6); ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.strokeRect(px + 3, py + 3, CELL - 6, CELL - 6); ctx.beginPath(); ctx.moveTo(px + 12, py + 12); ctx.lineTo(px + CELL - 12, py + CELL - 12); ctx.moveTo(px + CELL - 12, py + 12); ctx.lineTo(px + 12, py + CELL - 12); ctx.stroke(); }
    }
    ctx.textAlign = "center"; ctx.font = FONT;
    for (const it of s.items) {
      const cx = OX + (it.x + .5) * CELL, cy = OY + (it.y + .5) * CELL;
      ctx.fillStyle = it.k === "b" ? "#1d1b2f" : it.k === "f" ? "#f97316" : "#2f6df6"; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.fillText(it.k.toUpperCase(), cx, cy + 10);
    }
    for (const b of s.bombs) {
      const cx = OX + (b.x + .5) * CELL, cy = OY + (b.y + .5) * CELL, pulse = 1 + .1 * Math.sin((FUSE - b.t) * (8 + (FUSE - b.t) * 6));
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(cx, cy + 2, CELL * .34 * pulse, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ffffff55"; ctx.beginPath(); ctx.arc(cx - 8, cy - 7, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = b.t < .7 && Math.floor(b.t * 12) % 2 ? "#ef4444" : "#fde047"; ctx.beginPath(); ctx.arc(cx + 14, cy - 22, 6, 0, TAU); ctx.fill();
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (s.fire[idx(x, y)] > 0) {
      const px = OX + x * CELL, py = OY + y * CELL; ctx.fillStyle = "#fb923c"; ctx.fillRect(px + 4, py + 4, CELL - 8, CELL - 8); ctx.fillStyle = "#fde047"; ctx.fillRect(px + 16, py + 16, CELL - 32, CELL - 32);
    }
    s.p.forEach((o, i) => {
      if (!o.alive) return; const [px, py] = posOf(o), cx = OX + (px + .5) * CELL, cy = OY + (py + .5) * CELL, f = o.face;
      ctx.fillStyle = C[i]; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, CELL * .36, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + f[0] * 9 - f[1] * 8, cy + f[1] * 9 + f[0] * 8, 6, 0, TAU); ctx.arc(cx + f[0] * 9 + f[1] * 8, cy + f[1] * 9 - f[0] * 8, 6, 0, TAU); ctx.fill();
    });
    for (let i = 0; i < 2; i++) { // side panels: name, rounds won, power-ups
      const x = i ? W - 80 : 80, o = s.p[i]; ctx.fillStyle = C[i]; ctx.font = FONT; ctx.fillText(pl?.["p" + (i + 1)]?.name || `Player ${i + 1}`, x, 70);
      for (let w = 0; w < WIN; w++) { ctx.beginPath(); ctx.arc(x - 20 + w * 40, 110, 13, 0, TAU); ctx.fillStyle = w < s.wins[i] ? C[i] : "#fff"; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.stroke(); }
      ctx.fillStyle = INK; ctx.font = "700 22px Fredoka, system-ui, sans-serif"; ctx.fillText(`Bombs ${o.bombs}`, x, 170); ctx.fillText(`Blast ${o.range}`, x, 200); ctx.fillText(`Speed ${Math.round((o.spd - 4.6) / .7) + 1}`, x, 230);
    }
    ctx.fillStyle = INK; ctx.font = "700 24px Fredoka, system-ui, sans-serif"; ctx.fillText(`Round ${s.round}`, W / 2, 30);
    if (s.phase === "end") { ctx.font = "700 60px Fredoka, system-ui, sans-serif"; ctx.lineWidth = 10; ctx.strokeStyle = "#fff"; ctx.strokeText(s.msg, W / 2, H / 2 + 20); ctx.fillStyle = INK; ctx.fillText(s.msg, W / 2, H / 2 + 20); }
    drawParts(ctx, s.parts);
  },
  cleanup() {}
};

import { W, H, TAU, INK, C, rnd, pad, burst, stepParts, drawParts } from "../kit.js";
// Two snakes, one board. Eat apples to grow. Crash into a wall or any snake and you lose. Hold A to boost (it eats your tail).
const CS = 32, GW = 40, GH = 22, OY = 8, TICK = .0575, LIMIT = 120, DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const key = (x, y) => y * GW + x;
const mkSnake = i => { const d = i ? -1 : 1, x0 = i ? GW - 7 : 6; return { body: [0, 1, 2, 3].map(n => ({ x: x0 - d * n, y: 11 })), dx: d, dy: 0, q: [], wait: 1, grow: 0, boostN: 0, dead: false, boosting: false }; };
function spawnApple(s) {
  const used = new Set(); for (const o of s.sn) for (const b of o.body) used.add(key(b.x, b.y)); for (const a of s.apples) used.add(key(a.x, a.y));
  for (let n = 0; n < 200; n++) { const x = (Math.random() * GW) | 0, y = (Math.random() * GH) | 0; if (!used.has(key(x, y))) { s.apples.push({ x, y }); return; } }
}
export default {
  init() { const s = { sn: [mkSnake(0), mkSnake(1)], apples: [], acc: 0, t: 0, res: null, endT: 0, parts: [] }; for (let n = 0; n < 3; n++) spawnApple(s); return s; },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .05); stepParts(s.parts, dt);
    s.sn.forEach((o, i) => { const k = pad(inp, i); for (const d of k.order) if (DIRS[d] && o.q.length < 3) o.q.push(d); o.boosting = !!k.held.a && o.body.length > 3; }); // presses are queued in order, so quick taps never get lost
    if (s.res) { s.endT += dt; return { winner: s.endT > 1.3 ? s.res : null }; }
    s.t += dt; s.acc += dt;
    while (s.acc >= TICK && !s.res) {
      s.acc -= TICK;
      const mv = s.sn.map((o, i) => { if (--o.wait > 0) return null; o.wait = o.boosting ? 1 : 2;
        while (o.q.length) { const [dx, dy] = DIRS[o.q.shift()]; if ((dx === -o.dx && dy === -o.dy) || (dx === o.dx && dy === o.dy)) continue; o.dx = dx; o.dy = dy; break; }
        return { x: o.body[0].x + o.dx, y: o.body[0].y + o.dy }; });
      const occ = new Set();
      s.sn.forEach((o, i) => o.body.forEach((b, n) => { const leaving = mv[i] && n === o.body.length - 1 && o.grow <= 0; if (!leaving) occ.add(key(b.x, b.y)); })); // a moving tail frees its cell
      const dead = [false, false];
      mv.forEach((h, i) => { if (!h) return; if (h.x < 0 || h.y < 0 || h.x >= GW || h.y >= GH || occ.has(key(h.x, h.y))) dead[i] = true; });
      if (mv[0] && mv[1] && mv[0].x === mv[1].x && mv[0].y === mv[1].y) dead[0] = dead[1] = true; // head-on
      s.sn.forEach((o, i) => {
        if (dead[i]) { o.dead = true; for (const b of o.body) burst(s.parts, b.x * CS + CS / 2, OY + b.y * CS + CS / 2, 1, C[i], 300); return; }
        const h = mv[i]; if (!h) return;
        o.body.unshift(h);
        const ai = s.apples.findIndex(a => a.x === h.x && a.y === h.y);
        if (ai >= 0) { s.apples.splice(ai, 1); o.grow += 1; spawnApple(s); audio.beep(660, .06, "triangle", .1, 990); burst(s.parts, h.x * CS + CS / 2, OY + h.y * CS + CS / 2, 8, "#ef4444", 200); }
        if (o.grow > 0) o.grow--; else o.body.pop();
        if (o.boosting && ++o.boostN % 8 === 0 && o.body.length > 3) o.body.pop(); // boost costs a tail segment every 8 steps
      });
      if (dead[0] || dead[1]) { s.res = dead[0] && dead[1] ? "draw" : dead[0] ? "p2" : "p1"; audio.noise(.5, .3); audio.beep(90, .5, "sawtooth", .25, 30); }
    }
    if (!s.res && s.t > LIMIT) { const a = s.sn[0].body.length, b = s.sn[1].body.length; s.res = a === b ? "draw" : a > b ? "p1" : "p2"; }
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.fillStyle = "#fff4c2"; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if ((x + y) % 2) { ctx.fillStyle = "#f6e9a9"; ctx.fillRect(x * CS, OY + y * CS, CS, CS); }
    for (const a of s.apples) { ctx.fillStyle = "#ef4444"; ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(a.x * CS + CS / 2, OY + a.y * CS + CS / 2, CS * .36, 0, TAU); ctx.fill(); ctx.stroke(); }
    s.sn.forEach((o, i) => {
      ctx.globalAlpha = o.dead ? .35 : 1;
      o.body.forEach((b, n) => { ctx.fillStyle = n === 0 ? INK : C[i]; ctx.fillRect(b.x * CS + 2, OY + b.y * CS + 2, CS - 4, CS - 4); });
      if (!o.dead) { const h = o.body[0]; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(h.x * CS + CS / 2 + o.dx * 6 - o.dy * 6, OY + h.y * CS + CS / 2 + o.dy * 6 + o.dx * 6, 4, 0, TAU); ctx.arc(h.x * CS + CS / 2 + o.dx * 6 + o.dy * 6, OY + h.y * CS + CS / 2 + o.dy * 6 - o.dx * 6, 4, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    });
    ctx.strokeStyle = INK; ctx.lineWidth = 8; ctx.strokeRect(4, OY + 4, W - 8, GH * CS - 8);
    ctx.font = "700 28px Fredoka, system-ui, sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = C[0]; ctx.fillText("Length " + s.sn[0].body.length, 20, 40); ctx.textAlign = "right"; ctx.fillStyle = C[1]; ctx.fillText("Length " + s.sn[1].body.length, W - 20, 40);
    drawParts(ctx, s.parts);
  },
  cleanup() {}
};

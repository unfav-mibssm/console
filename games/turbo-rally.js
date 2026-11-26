import { TAU, INK, C, clamp, pad } from "../kit.js";
// Turbo Rally: split-screen 3D-style racing. Both cars are always on the gas.
// Left/Right steer, Down brakes, hold A for NITRO (grab the blue orbs to refill it). Dodge cones and barrels. First to finish 3 laps wins.
const VW = 636, VH = 720, GAPX = 8, HZ = VH * .36;
const SEG = 200, ROADW = 2000, CAMH = 1000, CAMD = 1 / Math.tan(50 * Math.PI / 180), PZ = CAMH * CAMD, DRAW = 130, RUMBLE = 3, LANES = 3;
const MAXV = 11000, LAPS = 3, LIMIT = 170;
const mod = (a, m) => ((a % m) + m) % m;
const ease = { in: (a, b, p) => a + (b - a) * p * p, io: (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + .5) };

// ---- the track (same every race): curves and hills built from simple pieces ----
const SEGS = (() => {
  const a = [], last = () => a.length ? a[a.length - 1].y2 : 0;
  const add = (curve, y2) => { const i = a.length; a.push({ i, y1: last(), y2, curve, light: Math.floor(i / RUMBLE) % 2, z1: i * SEG, z2: (i + 1) * SEG, s1: {}, s2: {}, deco: [], vis: -1, clip: 0 }); };
  const road = (e, h, l, curve, hill) => {
    const y0 = last(), y1 = y0 + hill * SEG, tot = e + h + l;
    for (let n = 0; n < e; n++) add(ease.in(0, curve, n / e), ease.io(y0, y1, n / tot));
    for (let n = 0; n < h; n++) add(curve, ease.io(y0, y1, (e + n) / tot));
    for (let n = 0; n < l; n++) add(ease.io(curve, 0, n / l), ease.io(y0, y1, (e + h + n) / tot));
  };
  road(30, 30, 30, 0, 0); road(25, 40, 25, 2, 20); road(25, 30, 25, 0, -20); road(30, 50, 30, -4, 0); road(20, 20, 20, 0, 40);
  road(20, 40, 20, 5, -40); road(15, 15, 15, 0, 0); road(25, 25, 25, -3, 0); road(25, 25, 25, 3, 0); road(25, 25, 25, -5, 0);
  road(30, 40, 30, 0, 30); road(20, 20, 20, 5, -30); road(30, 50, 30, -2, 0); road(20, 60, 20, 4, 20); road(25, 30, 25, -5, -20); road(25, 30, 25, 0, 0);
  a[a.length - 1].y2 = 0; // close the loop at ground level
  let seed = 12345; const rr = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  a.forEach((g, n) => {
    if (n % 4 === 0) g.deco.push({ k: "palm", x: -(2.1 + rr() * 2.4), v: rr() - .5 });
    if (n % 4 === 2) g.deco.push({ k: "palm", x: 2.1 + rr() * 2.4, v: rr() - .5 });
    if (n % 23 === 7) g.deco.push({ k: "rock", x: (rr() < .5 ? -1 : 1) * (1.8 + rr() * 2) });
    if (n % 90 === 45) { g.deco.push({ k: "sign", x: -1.75 }); g.deco.push({ k: "sign", x: 1.75 }); }
  });
  a[2].deco.push({ k: "arch" });
  return a;
})();
const N = SEGS.length, TL = N * SEG;
const segAt = d => SEGS[Math.floor(mod(d, TL) / SEG) % N];

const mkCar = i => ({ x: i ? .45 : -.45, dist: 0, speed: 0, nitro: 50, boost: false, hit: 0, bg: 0, lap: 0, lapPop: 0, bump: 0, fin: -1, off: false, bob: 0, st: 0 });

export default {
  init() {
    const items = Array.from({ length: N }, () => []);
    const rnd = (a, b) => a + Math.random() * (b - a);
    for (let n = 45; n < N - 12; n += 30 + ((Math.random() * 18) | 0)) items[n].push({ k: Math.random() < .5 ? "cone" : "barrel", x: rnd(-.85, .85), gone: [-1, -1] });
    for (let n = 130, f = 1; n < N - 40; n += 150, f = -f) for (let j = 0; j < 3; j++) items[n + j * 7].push({ k: "orb", x: [-.5, .5, 0][j] * f, gone: [-1, -1] });
    return { t: 0, p: [mkCar(0), mkCar(1)], items, res: null, endT: 0, stamp: 0 };
  },
  update(s, dt, inp, audio) {
    dt = Math.min(dt, .05); s.p.forEach(p => { p.hit = Math.max(0, p.hit - dt); p.lapPop = Math.max(0, p.lapPop - dt); p.bump = Math.max(0, p.bump - dt); });
    if (s.res) { s.endT += dt; return { winner: s.endT > 2 ? s.res : null }; }
    s.t += dt;
    s.p.forEach((p, i) => {
      const k = pad(inp, i), o = s.p[1 - i], steer = (k.held.right ? 1 : 0) - (k.held.left ? 1 : 0), brake = !!k.held.down;
      const gap = o.dist - p.dist, rb = gap > 6000 ? 1 + Math.min(.06, (gap - 6000) / TL * .5) : 1; // the car that is far behind gets a small speed bonus, so races stay close
      const boosting = !!k.held.a && p.nitro > 0; if (boosting && !p.boost) audio.beep(300, .25, "sawtooth", .1, 900); p.boost = boosting;
      const top = MAXV * rb * (boosting ? 1.32 : 1), pct = p.speed / MAXV;
      p.st = steer; p.x += steer * dt * 2.6 * clamp(pct, .22, 1.2);
      p.x -= dt * 2 * pct * segAt(p.dist).curve * .22; // curves push you outwards
      p.speed += (brake ? -MAXV * 1.1 : MAXV / 4 * (boosting ? 2.6 : 1)) * dt;
      p.off = Math.abs(p.x) > 1.02; if (p.off && p.speed > MAXV / 4) p.speed -= MAXV / 2 * dt;
      if (p.speed > top) p.speed = Math.max(top, p.speed - MAXV / 3 * dt);
      p.speed = clamp(p.speed, 0, MAXV * 1.4); p.x = clamp(p.x, -1.6, 1.6);
      p.nitro = boosting ? Math.max(0, p.nitro - 30 * dt) : Math.min(100, p.nitro + 5 * dt);
      p.bob += dt * pct * 30;
      const prev = p.dist; p.dist += p.speed * dt;
      p.bg = mod(p.bg + segAt(p.dist).curve * pct * dt * 260, 1272);
      const lap = Math.floor(p.dist / TL); if (lap > p.lap) { p.lap = lap; if (lap < LAPS) { p.lapPop = 1.6; audio.beep(660, .12, "triangle", .12, 990); } }
      for (let n = Math.floor(mod(prev, TL) / SEG); ; n = (n + 1) % N) { // everything we drove through since last frame
        for (const it of s.items[n]) {
          if (it.gone[i] === lap) continue;
          if (Math.abs(p.x - it.x) < (it.k === "orb" ? .3 : .27)) {
            it.gone[i] = lap;
            if (it.k === "orb") { p.nitro = Math.min(100, p.nitro + 30); audio.beep(900, .1, "triangle", .12, 1400); }
            else { p.speed *= .45; p.hit = .6; audio.noise(.15, .22); audio.beep(120, .15, "square", .12, 60); }
          }
        }
        if (n === Math.floor(mod(p.dist, TL) / SEG) % N) break;
      }
    });
    const [a, b] = s.p, dz = mod(b.dist - a.dist + TL / 2, TL) - TL / 2; // positive: b is ahead of a
    if (Math.abs(dz) < 550 && Math.abs(a.x - b.x) < .34) {
      const rear = dz > 0 ? a : b, front = dz > 0 ? b : a; rear.speed = Math.min(rear.speed, front.speed * .93);
      const sg = a.x <= b.x ? -1 : 1; a.x = clamp(a.x + sg * .05, -1.6, 1.6); b.x = clamp(b.x - sg * .05, -1.6, 1.6);
      if (a.bump <= 0) { a.bump = b.bump = .3; audio.noise(.08, .18); }
    }
    const fin = s.p.map(p => p.dist >= LAPS * TL);
    if (fin[0] || fin[1]) { s.res = fin[0] && fin[1] ? (a.dist >= b.dist ? "p1" : "p2") : fin[0] ? "p1" : "p2"; audio.beep(880, .5, "triangle", .15, 1320); }
    else if (s.t > LIMIT) s.res = a.dist === b.dist ? "draw" : a.dist > b.dist ? "p1" : "p2";
    return { winner: null };
  },
  render(ctx, cv, s) {
    ctx.fillStyle = INK; ctx.fillRect(0, 0, 1280, 720);
    drawView(ctx, s, 0, 0); drawView(ctx, s, 1, VW + GAPX);
  },
  cleanup() {}
};

// ---------- drawing ----------
const LIGHT = { grass: "#2bb673", road: "#5a5f78", rumble: "#ffffff", lane: "#ffffff" }, DARK = { grass: "#22a063", road: "#51566e", rumble: "#ff4f6d", lane: null };
const poly = (ctx, c, x1, y1, x2, y2, x3, y3, x4, y4) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill(); };
function proj(o, wy, cx, cy, cz, wz) { const pz = wz - cz; o.cz = pz; o.sc = CAMD / pz; o.x = Math.round(VW / 2 + o.sc * (0 - cx) * VW / 2); o.y = Math.round(HZ - o.sc * (wy - cy) * VH / 2); o.w = Math.round(o.sc * ROADW * VW / 2); }
const FONT = "Fredoka, system-ui, sans-serif";

function sky(ctx, me) {
  const g = ctx.createLinearGradient(0, 0, 0, HZ); g.addColorStop(0, "#2b1b6b"); g.addColorStop(.55, "#ff6b9d"); g.addColorStop(1, "#ffc27a");
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, HZ + 2);
  ctx.fillStyle = "#fff3b0"; ctx.beginPath(); ctx.arc(mod(VW * .62 - me.bg * .15, VW + 200) - 100, HZ - 80, 46, 0, TAU); ctx.fill();
  for (const [col, amp, fr, ph, par] of [["#8a4fb0", 70, .008, 0, .5], ["#5b2f8f", 42, .014, 2, 1]]) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, HZ + 1);
    for (let x = 0; x <= VW + 16; x += 16) ctx.lineTo(x, HZ - amp * (.55 + .45 * Math.sin((x + me.bg * par) * fr + ph)) * (.7 + .3 * Math.sin((x + me.bg * par) * fr * 2.7 + ph * 3)));
    ctx.lineTo(VW + 16, HZ + 1); ctx.closePath(); ctx.fill();
  }
}
function palm(ctx, x, y, h, v) {
  const tx = x + v * h * .12, ty = y - h * .7;
  ctx.fillStyle = "#7a4b2a"; ctx.beginPath(); ctx.moveTo(x - h * .03, y); ctx.lineTo(x + h * .03, y); ctx.lineTo(tx + h * .02, ty); ctx.lineTo(tx - h * .02, ty); ctx.fill();
  for (let i = 0; i < 6; i++) { ctx.save(); ctx.translate(tx, ty); ctx.rotate(-Math.PI + i * Math.PI / 5); ctx.fillStyle = i % 2 ? "#1f9d55" : "#2fbf6b"; ctx.beginPath(); ctx.ellipse(h * .16, h * .02 * (i % 2 ? 1 : -1), h * .17, h * .045, 0, 0, TAU); ctx.fill(); ctx.restore(); }
}
function rock(ctx, x, y, w) { ctx.fillStyle = "#8d8aa3"; ctx.beginPath(); ctx.ellipse(x, y - w * .25, w * .5, w * .3, 0, 0, TAU); ctx.fill(); ctx.fillStyle = "#6f6c88"; ctx.beginPath(); ctx.ellipse(x + w * .12, y - w * .18, w * .32, w * .18, 0, 0, TAU); ctx.fill(); }
function sign(ctx, x, y, h) {
  ctx.fillStyle = "#3a3556"; ctx.fillRect(x - h * .02, y - h, h * .04, h);
  ctx.fillStyle = "#ffd23f"; ctx.fillRect(x - h * .28, y - h, h * .56, h * .3); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, h * .02); ctx.strokeRect(x - h * .28, y - h, h * .56, h * .3);
  if (h > 60) { ctx.fillStyle = INK; ctx.font = "800 " + Math.round(h * .17) + "px " + FONT; ctx.textAlign = "center"; ctx.fillText("MIBS", x, y - h * .78); }
}
function cone(ctx, x, y, w) {
  ctx.fillStyle = "#ff7a1a"; ctx.beginPath(); ctx.moveTo(x - w * .5, y); ctx.lineTo(x + w * .5, y); ctx.lineTo(x + w * .08, y - w * 1.1); ctx.lineTo(x - w * .08, y - w * 1.1); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.fillRect(x - w * .3, y - w * .55, w * .6, w * .2); ctx.fillStyle = INK; ctx.fillRect(x - w * .6, y - w * .06, w * 1.2, w * .08);
}
function barrel(ctx, x, y, w) {
  ctx.fillStyle = "#e23d4d"; ctx.fillRect(x - w * .4, y - w * .9, w * .8, w * .9); ctx.fillStyle = "#fff"; ctx.fillRect(x - w * .4, y - w * .6, w * .8, w * .12); ctx.fillRect(x - w * .4, y - w * .3, w * .8, w * .12);
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, w * .04); ctx.strokeRect(x - w * .4, y - w * .9, w * .8, w * .9);
}
function orb(ctx, x, y, w, t) {
  const r = w * .5 * (1 + Math.sin(t * 6) * .06), g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6); g.addColorStop(0, "#ffffff"); g.addColorStop(.35, "#46e6ff"); g.addColorStop(1, "#46e6ff00");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(1, w * .06); ctx.beginPath(); ctx.arc(x, y, r * .7, 0, TAU); ctx.stroke();
}
function car(ctx, x, y, w, col, o = {}) { // rear view; x centre, y = bottom of the wheels
  const h = w * .52; ctx.save(); ctx.translate(x, y); ctx.rotate(o.tilt || 0);
  ctx.fillStyle = "#00000044"; ctx.beginPath(); ctx.ellipse(0, 0, w * .55, h * .14, 0, 0, TAU); ctx.fill();
  if (o.boost) { for (const sx of [-.3, .3]) { ctx.fillStyle = Math.random() < .5 ? "#ffd23f" : "#ff7a1a"; ctx.beginPath(); ctx.moveTo(sx * w - w * .07, -h * .3); ctx.lineTo(sx * w + w * .07, -h * .3); ctx.lineTo(sx * w, h * .35 + Math.random() * h * .25); ctx.fill(); } }
  ctx.fillStyle = "#14121f"; ctx.fillRect(-w * .5, -h * .42, w * .17, h * .42); ctx.fillRect(w * .33, -h * .42, w * .17, h * .42);
  ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, w * .02);
  ctx.beginPath(); ctx.rect(-w * .46, -h * .78, w * .92, h * .46); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ffffff55"; ctx.fillRect(-w * .44, -h * .76, w * .88, h * .08);
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-w * .34, -h * .78); ctx.lineTo(-w * .24, -h * 1.12); ctx.lineTo(w * .24, -h * 1.12); ctx.lineTo(w * .34, -h * .78); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#1c2a4a"; ctx.beginPath(); ctx.moveTo(-w * .27, -h * .8); ctx.lineTo(-w * .2, -h * 1.06); ctx.lineTo(w * .2, -h * 1.06); ctx.lineTo(w * .27, -h * .8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = o.brake ? "#ff2a2a" : "#b4182a"; ctx.fillRect(-w * .42, -h * .66, w * .2, h * .1); ctx.fillRect(w * .22, -h * .66, w * .2, h * .1);
  ctx.fillStyle = col; ctx.fillRect(-w * .44, -h * 1.0, w * .1, h * .22); ctx.fillRect(w * .34, -h * 1.0, w * .1, h * .22); ctx.fillRect(-w * .46, -h * 1.06, w * .92, h * .08); ctx.strokeRect(-w * .46, -h * 1.06, w * .92, h * .08);
  ctx.restore();
}

function drawView(ctx, s, k, x0) {
  const me = s.p[k], op = s.p[1 - k], stamp = ++s.stamp;
  ctx.save(); ctx.beginPath(); ctx.rect(x0, 0, VW, VH); ctx.clip(); ctx.translate(x0, 0);
  sky(ctx, me); ctx.fillStyle = "#22a063"; ctx.fillRect(0, HZ, VW, VH - HZ);
  const camZ = mod(me.dist - PZ, TL), base = SEGS[Math.floor(camZ / SEG) % N], bp = (camZ % SEG) / SEG;
  const pm = mod(me.dist, TL), pseg = SEGS[Math.floor(pm / SEG) % N], pp = (pm % SEG) / SEG;
  const playerY = pseg.y1 + (pseg.y2 - pseg.y1) * pp, camY = playerY + CAMH, camX = me.x * ROADW;
  let maxy = VH, x = 0, dx = -base.curve * bp;
  for (let n = 0; n < DRAW; n++) {
    const sg = SEGS[(base.i + n) % N], cz = camZ - (sg.i < base.i ? TL : 0);
    proj(sg.s1, sg.y1, camX - x, camY, cz, sg.z1); proj(sg.s2, sg.y2, camX - x - dx, camY, cz, sg.z2);
    x += dx; dx += sg.curve; sg.clip = maxy;
    const a = sg.s1, b = sg.s2;
    if (a.cz <= CAMD || b.y >= a.y || b.y >= maxy) continue;
    const c = sg.i < 2 ? { grass: "#22a063", road: sg.i ? INK : "#ffffff", rumble: "#ffffff", lane: null } : sg.light ? LIGHT : DARK;
    ctx.fillStyle = c.grass; ctx.fillRect(0, b.y, VW, a.y - b.y);
    const r1 = a.w / Math.max(6, 2 * LANES), r2 = b.w / Math.max(6, 2 * LANES);
    poly(ctx, c.rumble, a.x - a.w - r1, a.y, a.x - a.w, a.y, b.x - b.w, b.y, b.x - b.w - r2, b.y);
    poly(ctx, c.rumble, a.x + a.w + r1, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x + b.w + r2, b.y);
    poly(ctx, c.road, a.x - a.w, a.y, a.x + a.w, a.y, b.x + b.w, b.y, b.x - b.w, b.y);
    if (c.lane) {
      const l1 = a.w / Math.max(32, 8 * LANES), l2 = b.w / Math.max(32, 8 * LANES), w1 = a.w * 2 / LANES, w2 = b.w * 2 / LANES;
      let x1 = a.x - a.w + w1, x2 = b.x - b.w + w2;
      for (let ln = 1; ln < LANES; ln++, x1 += w1, x2 += w2) poly(ctx, c.lane, x1 - l1 / 2, a.y, x1 + l1 / 2, a.y, x2 + l2 / 2, b.y, x2 - l2 / 2, b.y);
    }
    const fog = 1 - 1 / Math.exp((n / DRAW) * (n / DRAW) * 4.5);
    if (fog > .01) { ctx.globalAlpha = fog; ctx.fillStyle = "#ffb27a"; ctx.fillRect(0, b.y, VW, a.y - b.y); ctx.globalAlpha = 1; }
    sg.vis = stamp; maxy = a.y;
  }
  // everything standing on the road, drawn far to near
  const ahead = mod(op.dist - camZ, TL), oppAbs = mod(camZ + ahead, TL), oppSeg = Math.floor(oppAbs / SEG) % N, oppPct = (oppAbs % SEG) / SEG, showOpp = ahead < DRAW * SEG && ahead > 400;
  for (let n = DRAW - 1; n >= 0; n--) {
    const sg = SEGS[(base.i + n) % N]; if (sg.vis !== stamp) continue;
    const a = sg.s1, b = sg.s2, u = a.sc * VW / 2, clipped = a.y > sg.clip;
    if (clipped) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, VW, sg.clip); ctx.clip(); }
    for (const d of sg.deco) {
      const px = a.x + u * d.x * ROADW;
      if (d.k === "palm") palm(ctx, px, a.y, u * 2600, d.v); else if (d.k === "rock") rock(ctx, px, a.y, u * 900); else if (d.k === "sign") sign(ctx, px, a.y, u * 1800);
      else if (d.k === "arch") { const l = a.x - a.w * 1.15, r = a.x + a.w * 1.15, h = u * 2400; ctx.fillStyle = "#3a3556"; ctx.fillRect(l - h * .03, a.y - h, h * .06, h); ctx.fillRect(r - h * .03, a.y - h, h * .06, h); ctx.fillStyle = "#fff"; ctx.fillRect(l, a.y - h, r - l, h * .14); ctx.fillStyle = INK; for (let q = 0; q < 12; q++) if (q % 2 === 0) ctx.fillRect(l + (r - l) * q / 12, a.y - h, (r - l) / 12, h * .07); else ctx.fillRect(l + (r - l) * q / 12, a.y - h * .93, (r - l) / 12, h * .07); }
    }
    for (const it of s.items[sg.i]) {
      if (it.gone[k] === me.lap) continue;
      const px = a.x + u * it.x * ROADW;
      if (it.k === "cone") cone(ctx, px, a.y, u * 420); else if (it.k === "barrel") barrel(ctx, px, a.y, u * 520); else orb(ctx, px, a.y - u * 380, u * 520, s.t);
    }
    if (showOpp && sg.i === oppSeg) {
      const sc = a.sc + (b.sc - a.sc) * oppPct, px = a.x + (b.x - a.x) * oppPct + sc * op.x * ROADW * VW / 2, py = a.y + (b.y - a.y) * oppPct;
      car(ctx, px, py, sc * 700 * VW / 2, C[1 - k], { boost: op.boost, tilt: op.st * .05 });
    }
    if (clipped) ctx.restore();
  }
  // your car
  const shake = me.off ? Math.sin(me.bob * 3) * 3 : Math.sin(me.bob) * 1.5;
  car(ctx, VW / 2 + (me.hit > 0 ? Math.sin(s.t * 60) * 4 : 0), HZ + VH / 2 + shake, 222, C[k], { boost: me.boost, tilt: me.st * .06, brake: false });
  // speed lines while boosting
  if (me.boost) { ctx.strokeStyle = "#ffffff66"; ctx.lineWidth = 3; for (let i = 0; i < 18; i++) { const an = i * TAU / 18 + .2, f = (s.t * 3 + i * .37) % 1, r0 = 190 + f * 150, r1 = r0 + 40 + f * 60; ctx.beginPath(); ctx.moveTo(VW / 2 + Math.cos(an) * r0, HZ + 140 + Math.sin(an) * r0 * .9); ctx.lineTo(VW / 2 + Math.cos(an) * r1, HZ + 140 + Math.sin(an) * r1 * .9); ctx.stroke(); } }
  if (me.hit > 0) { ctx.fillStyle = "rgba(255,40,40," + (.3 * me.hit / .6).toFixed(2) + ")"; ctx.fillRect(0, 0, VW, VH); }
  // HUD
  const rank = me.dist >= op.dist ? 1 : 2; ctx.textAlign = "center"; ctx.lineJoin = "round";
  ctx.font = "800 72px " + FONT; ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.strokeText(rank === 1 ? "1ST" : "2ND", VW / 2, 96); ctx.fillStyle = rank === 1 ? "#ffd23f" : "#fff"; ctx.fillText(rank === 1 ? "1ST" : "2ND", VW / 2, 96);
  ctx.font = "700 28px " + FONT; ctx.lineWidth = 8; const lt = "LAP " + Math.min(LAPS, me.lap + 1) + "/" + LAPS; ctx.strokeText(lt, VW / 2, 134); ctx.fillStyle = "#fff"; ctx.fillText(lt, VW / 2, 134);
  ctx.textAlign = "left"; ctx.font = "800 36px " + FONT; ctx.lineWidth = 8; const sp = Math.round(me.speed / MAXV * 240) + " km/h"; ctx.strokeText(sp, 18, 636); ctx.fillStyle = "#fff"; ctx.fillText(sp, 18, 636);
  ctx.fillStyle = "#00000088"; ctx.fillRect(18, 648, 230, 18); const ng = ctx.createLinearGradient(18, 0, 248, 0); ng.addColorStop(0, "#46e6ff"); ng.addColorStop(1, "#ff4fd8"); ctx.fillStyle = ng; ctx.fillRect(20, 650, 226 * me.nitro / 100, 14);
  ctx.font = "700 16px " + FONT; ctx.fillStyle = "#fff"; ctx.fillText("NITRO", 256, 663);
  if (me.lapPop > 0) { ctx.globalAlpha = Math.min(1, me.lapPop); ctx.textAlign = "center"; ctx.font = "800 64px " + FONT; ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.strokeText("LAP " + (me.lap + 1) + "!", VW / 2, 240); ctx.fillStyle = "#46e6ff"; ctx.fillText("LAP " + (me.lap + 1) + "!", VW / 2, 240); ctx.globalAlpha = 1; }
  if (s.res) { const won = me.dist >= LAPS * TL; ctx.textAlign = "center"; ctx.font = "800 60px " + FONT; ctx.lineWidth = 12; ctx.strokeStyle = INK; const tx = won ? "FINISH!" : "SO CLOSE!"; ctx.strokeText(tx, VW / 2, 300); ctx.fillStyle = won ? "#ffd23f" : "#fff"; ctx.fillText(tx, VW / 2, 300); }
  ctx.strokeStyle = C[k]; ctx.lineWidth = 8; ctx.strokeRect(4, 4, VW - 8, VH - 8);
  ctx.restore();
}

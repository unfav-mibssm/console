// Shared helpers for games (sizes, colors, particles). Games import from "../kit.js".
export const W = 1280, H = 720, TAU = Math.PI * 2, INK = "#1d1b2f", C = ["#2f6df6", "#ff4f6d"]; // C[0] = Player 1, C[1] = Player 2
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pad = (inp, i) => inp[i ? "p2" : "p1"] || {};
export const verdict = d => d[0] && d[1] ? "draw" : d[0] ? "p2" : "p1"; // d[i] = player i lost
export const newTaps = (now, last) => ((now | 0) - last + 10000) % 10000; // taps since last frame (counters wrap at 10000)
export const burst = (a, x, y, n, c, sp = 300) => { for (let i = 0; i < n; i++) { const t = rnd(0, TAU), s = rnd(sp * .2, sp), l = rnd(.3, .9); a.push({ x, y, vx: Math.cos(t) * s, vy: Math.sin(t) * s, l, m: l, c }); } };
export const stepParts = (a, dt) => { for (let i = a.length - 1; i >= 0; i--) { const p = a[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .98; p.vy *= .98; if ((p.l -= dt) <= 0) a.splice(i, 1); } };
export const drawParts = (ctx, a) => { for (const p of a) { ctx.globalAlpha = Math.max(0, p.l / p.m); ctx.fillStyle = p.c; ctx.fillRect(p.x - 4, p.y - 4, 8, 8); } ctx.globalAlpha = 1; };

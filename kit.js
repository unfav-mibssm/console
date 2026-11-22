// Shared helpers for games (sizes, colors, particles, input). Each game imports this file.
// Input: games receive inp = [p1, p2]; each is { held:{up,down,left,right,a}, taps:{...counts since last frame}, order:[keys pressed since last frame, oldest first] }.
export const W = 1280, H = 720, TAU = Math.PI * 2, INK = "#1d1b2f", C = ["#2f6df6", "#ff4f6d"]; // C[0] = Player 1, C[1] = Player 2
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const pad = (inp, i) => inp[i];                       // pad(inp, 0).held.left
export const dirOf = h => ({ x: (h.right ? 1 : 0) - (h.left ? 1 : 0), y: (h.down ? 1 : 0) - (h.up ? 1 : 0) }); // -1..1 per axis
export const verdict = d => d[0] && d[1] ? "draw" : d[0] ? "p2" : "p1"; // d[i] = player i lost
export const burst = (a, x, y, n, c, sp = 300) => { if (a.length > 400) return; for (let i = 0; i < n; i++) { const t = rnd(0, TAU), s = rnd(sp * .2, sp), l = rnd(.3, .9); a.push({ x, y, vx: Math.cos(t) * s, vy: Math.sin(t) * s, l, m: l, c }); } };
export const stepParts = (a, dt) => { for (let i = a.length - 1; i >= 0; i--) { const p = a[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .98; p.vy *= .98; if ((p.l -= dt) <= 0) a.splice(i, 1); } };
export const drawParts = (ctx, a) => { for (const p of a) { ctx.globalAlpha = Math.max(0, p.l / p.m); ctx.fillStyle = p.c; ctx.fillRect(p.x - 4, p.y - 4, 8, 8); } ctx.globalAlpha = 1; };
export const FONT = "Fredoka, system-ui, sans-serif";

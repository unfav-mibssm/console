// Shared protocol for tv.html and controller.html.
// Pure JavaScript: no Firebase imports, so every rule here can be unit-tested in Node.
//
// Database layout (rooms/{CODE}):
//   createdAt  server timestamp
//   tv         { id, connected, seenAt }                         host presence + heartbeat
//   state      { status, activeGame, selectedLobbyIndex, winner?, scores:{p1,p2} }
//   players    { p1?: {sid, name, connected, seenAt}, p2?: {...} }
//   inputs     { p1: {h, pu, pd, pl, pr, pa}, p2: {...} }        h = held-button bitmask, p* = press counters

export const SLOTS = ["p1", "p2"];
export const CODE_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ"; // generated codes skip I, O and Q (same as before); any 4 letters are accepted when typing
export const CODE_RE = /^[A-Z]{4}$/;
export const NAME_MAX = 12;
export const STATUS = ["lobby", "countdown", "playing", "gameover"];

// All timings in one place (milliseconds).
export const T = {
  heartbeat: 60000,      // TV refreshes tv.seenAt this often while open
  roomTtl: 30 * 60000,   // a room whose TV has been silent this long may be reused or deleted (rules enforce the same number)
  seatHold: 120000,      // a dropped player's seat is reserved for them this long (rules enforce the same number)
  seatSlack: 5000,       // client waits this much longer than the rules, so clock skew never causes a denied write
  pauseGrace: 30000,     // the TV pauses a running game this long for a dropped player, then returns to the lobby
  tvResumeWait: 6000     // after a TV refresh, wait this long for the old page's disconnect to register
};

// ---- Buttons: one fixed controller (D-pad + A) for every game ----
export const KEYS = ["up", "down", "left", "right", "a"];
export const BIT = { up: 1, down: 2, left: 4, right: 8, a: 16 };
export const PRESS = { up: "pu", down: "pd", left: "pl", right: "pr", a: "pa" };
export const CTR_MOD = 100; // press counters wrap at 100

export const emptyInput = () => ({ h: 0, pu: 0, pd: 0, pl: 0, pr: 0, pa: 0 });

// ---- Small validators / sanitizers ----
export const cleanCode = s => String(s ?? "").replace(/[^a-z]/gi, "").toUpperCase().slice(0, 4);
export const validCode = s => CODE_RE.test(String(s ?? ""));
export const cleanName = (s, fallback = "Player") =>
  Array.from(String(s ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim()).slice(0, NAME_MAX).join("") || fallback;
export const randomCode = () => Array.from({ length: 4 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
export function randomInt(n) {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch { return Math.floor(Math.random() * n); }
}
export const randomId = (len = 16) => Array.from({ length: len }, () => "abcdefghijklmnopqrstuvwxyz0123456789"[randomInt(36)]).join("");

// ---- Room / seat decisions (the database rules enforce the same conditions) ----
// serverNow = Date.now() + the offset reported by .info/serverTimeOffset
export const roomExpired = (room, serverNow) => {
  const seen = room?.tv?.seenAt;
  return typeof seen !== "number" || seen < serverNow - T.roomTtl - T.seatSlack;
};
// What can this phone do with seat `cur` (the value stored at players/{slot})?
//   free | mine (same seat id: reconnect) | abandoned (offline longer than seatHold) | taken
export function seatState(cur, sid, serverNow) {
  if (!cur) return "free";
  if (cur.sid === sid) return "mine";
  if (cur.connected === false && typeof cur.seenAt === "number" && cur.seenAt < serverNow - T.seatHold - T.seatSlack) return "abandoned";
  return "taken";
}

// ---- TV side: turn the database input node into "held" + "new presses since last frame" ----
export const newRemote = () => ({
  held: { up: false, down: false, left: false, right: false, a: false },
  taps: { up: 0, down: 0, left: 0, right: 0, a: 0 },
  order: [], ctr: null
});
// Call from the database listener, once per incoming value, so press ORDER is preserved.
export function applyRemote(r, n) {
  n = n && typeof n === "object" ? n : {};
  const h = Number.isInteger(n.h) ? n.h & 31 : 0, first = !r.ctr; // the very first value only sets the baseline: old presses never leak in
  if (first) r.ctr = {};
  for (const k of KEYS) {
    r.held[k] = !!(h & BIT[k]);
    const c = Number.isInteger(n[PRESS[k]]) ? ((n[PRESS[k]] % CTR_MOD) + CTR_MOD) % CTR_MOD : 0;
    if (!first) {
      const d = (c - r.ctr[k] + CTR_MOD) % CTR_MOD;
      if (d) { r.taps[k] = Math.min(r.taps[k] + d, 50); for (let i = 0; i < Math.min(d, 3); i++) r.order.push(k); }
    }
    r.ctr[k] = c;
  }
  if (r.order.length > 12) r.order.splice(0, r.order.length - 12);
}
export const clearTaps = r => { for (const k of KEYS) r.taps[k] = 0; r.order.length = 0; };
export const releaseAll = r => { for (const k of KEYS) r.held[k] = false; };

// ---- Phone side: encode what is held / pressed into one tiny write ----
export const maskOf = keys => keys.reduce((m, k) => m | BIT[k], 0);

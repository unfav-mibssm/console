// Every Firebase operation that creates, joins or watches a room lives here (no UI code).
import { db, ref, get, update, remove, onValue, onDisconnect, serverTimestamp, runTransaction } from "./firebase-config.js";
import { SLOTS, T, emptyInput, randomCode, roomExpired, seatState, validCode } from "./protocol.js";

export class RoomError extends Error { constructor(code, message) { super(message); this.code = code; } }
export const rp = (code, p = "") => ref(db, `rooms/${code}${p ? "/" + p : ""}`);
export const isPermission = e => /permission/i.test(String(e?.code || "") + String(e?.message || ""));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

// Server clock: stored timestamps are server time, so compare them against server time.
let offset = 0;
onValue(ref(db, ".info/serverTimeOffset"), s => { offset = Number(s.val()) || 0; }, () => {});
export const serverNow = () => Date.now() + offset;

// Friendly text for players; the real error always goes to the console.
export function friendly(e, who = "phone") {
  console.error("[mibs]", e);
  if (e instanceof RoomError) return e.message;
  if (isPermission(e)) return who === "tv"
    ? "The database refused the request. Publish the latest database.rules.json in the Firebase Console (see README)."
    : "The game server refused that. The TV owner may need to update the database rules.";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "No internet connection. Check your Wi-Fi or mobile data.";
  return "Can't reach the game server right now. Check your internet and try again.";
}

function waitFor(r, pred, ms) {
  return new Promise(resolve => {
    let done = false, off = null;
    const finish = v => { if (done) return; done = true; clearTimeout(timer); off?.(); resolve(v); };
    const timer = setTimeout(() => finish(false), ms);
    off = onValue(r, s => { if (pred(s.val())) finish(true); }, () => finish(false));
    if (done) off();
  });
}

// ---------- TV ----------
const freshRoom = (tvId, firstGame) => ({
  createdAt: serverTimestamp(),
  tv: { id: tvId, connected: true, seenAt: serverTimestamp() },
  state: { status: "lobby", activeGame: firstGame, selectedLobbyIndex: 0, scores: { p1: 0, p2: 0 } },
  inputs: { p1: emptyInput(), p2: emptyInput() }
});

// Atomic: a transaction only writes when the code is free (or the old room expired), so two TVs can never share a code.
export async function createRoom(tvId, firstGame) {
  let last;
  for (let i = 0; i < 12; i++) {
    const code = randomCode();
    try {
      const r = await runTransaction(rp(code), cur => (cur && !roomExpired(cur, serverNow())) ? undefined : freshRoom(tvId, firstGame), { applyLocally: false });
      if (r.committed) return code; // otherwise the code was taken: loop and draw another one
    } catch (e) { if (isPermission(e)) throw e; last = e; await sleep(250 * (i + 1)); }
  }
  if (last) throw last;
  throw new RoomError("NO_CODE", "Could not find a free room code. Please try again.");
}

// After a TV refresh: take the old room back if it is ours, still alive, and no other TV tab holds it.
export async function tryResumeRoom(code, tvId) {
  if (!validCode(code)) return false;
  const room = (await get(rp(code))).val();
  if (!room || room.tv?.id !== tvId || roomExpired(room, serverNow())) return false;
  if (room.tv.connected && !(await waitFor(rp(code, "tv/connected"), v => v === false, T.tvResumeWait))) return false;
  const r = await runTransaction(rp(code, "tv"), cur => (!cur || cur.id !== tvId || cur.connected) ? undefined : { id: tvId, connected: true, seenAt: serverTimestamp() }, { applyLocally: false });
  return r.committed;
}

// Best effort: delete a room of ours that has expired (the rules only allow deleting expired rooms).
export async function deleteIfExpired(code) {
  try { const room = (await get(rp(code))).val(); if (room && roomExpired(room, serverNow())) await remove(rp(code)); } catch (e) { console.warn("[mibs] cleanup skipped", e); }
}

// Marks the TV online now and offline (never "deleted") when the connection drops; refreshes tv.seenAt while open.
export function armTvPresence(code, onLink) {
  const tv = rp(code, "tv");
  const off = onValue(ref(db, ".info/connected"), async s => {
    const on = !!s.val(); onLink?.(on);
    if (!on) return;
    try { await onDisconnect(tv).update({ connected: false, seenAt: serverTimestamp() }); await update(tv, { connected: true, seenAt: serverTimestamp() }); }
    catch (e) { console.error("[mibs] TV presence failed", e); }
  });
  const hb = setInterval(() => update(tv, { seenAt: serverTimestamp() }).catch(() => {}), T.heartbeat);
  return () => { off(); clearInterval(hb); };
}

// ---------- Phone ----------
// Find a seat for this phone. Order: my own seat -> my seat from a closed tab -> a free seat -> an abandoned seat.
export async function claimSeat(code, sid, name, resumeSids = []) {
  const room = (await get(rp(code))).val(), now = serverNow();
  if (!room) throw new RoomError("NOT_FOUND", "Room not found. Check the code on the TV.");
  if (roomExpired(room, now)) throw new RoomError("CLOSED", "This room has closed. Ask the TV for a new code.");
  const pl = room.players || {}, tries = [];
  for (const s of SLOTS) if (pl[s]?.sid === sid) tries.push([s, sid]);
  // a seat I held in a tab I closed, but only while that seat is offline (never steal a seat another tab of this browser is using)
  for (const rs of resumeSids) if (rs !== sid) for (const s of SLOTS) if (pl[s]?.sid === rs && pl[s].connected === false) tries.push([s, rs]);
  for (const s of SLOTS) if (!pl[s]) tries.push([s, sid]);
  for (const s of SLOTS) if (seatState(pl[s], sid, now) === "abandoned") tries.push([s, sid]);
  for (const [slot, id] of tries) {
    const r = await runTransaction(rp(code, `players/${slot}`),
      cur => seatState(cur, id, serverNow()) === "taken" ? undefined : { sid: id, name, connected: true, seenAt: serverTimestamp() }, { applyLocally: false });
    if (r.committed) return { slot, sid: id };
  }
  const held = SLOTS.some(s => pl[s] && pl[s].connected === false);
  throw new RoomError(held ? "SEAT_HELD" : "FULL", held
    ? "A player just dropped out and their seat is held for a couple of minutes. Try again shortly."
    : "This room is full (2 players).");
}

// Re-arms itself every time the phone regains its connection, so a Wi-Fi blip never loses the seat.
export function armSeatPresence(code, slot, sid, name, cb = {}) {
  const me = rp(code, `players/${slot}`), inp = rp(code, `inputs/${slot}`);
  let alive = true;
  const off = onValue(ref(db, ".info/connected"), async s => {
    if (!alive) return;
    if (!s.val()) return cb.offline?.();
    try {
      const cur = (await get(me)).val();
      if (!alive) return;
      if (!cur || cur.sid !== sid) return cb.lost?.();
      await onDisconnect(me).update({ connected: false, seenAt: serverTimestamp() });
      await onDisconnect(inp).update({ h: 0 }); // a dropped phone never leaves a button "stuck"
      await update(me, { connected: true, seenAt: serverTimestamp(), name });
      cb.online?.((await get(inp)).val() || {});
    } catch (e) { console.error("[mibs] seat presence failed", e); cb.error?.(e); }
  });
  return () => { alive = false; off(); };
}

// Explicit "Leave": frees the seat right away (seenAt 0 counts as long abandoned).
export async function leaveSeat(code, slot, sid) {
  try {
    const me = rp(code, `players/${slot}`);
    await onDisconnect(me).cancel();
    if ((await get(me)).val()?.sid === sid) await update(me, { connected: false, seenAt: 0 });
  } catch (e) { console.warn("[mibs] leave failed", e); }
}

export const patchState = (code, patch) => update(rp(code, "state"), patch);

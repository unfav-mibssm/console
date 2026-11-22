import { GAMES, gameById } from "./games.js";
import { BIT, PRESS, CTR_MOD, cleanCode, cleanName, validCode, randomId, maskOf } from "./protocol.js";
import { update, onValue } from "./firebase-config.js";
import { rp, claimSeat, armSeatPresence, leaveSeat, patchState, friendly } from "./room.js";
import { createPad } from "./pad.js";

const $ = s => document.querySelector(s);
const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }; // text always via textContent: names can never inject HTML
const storage = kind => ({
  get: k => { try { return window[kind].getItem("mibs." + k); } catch { return null; } },
  set: (k, v) => { try { window[kind].setItem("mibs." + k, v); } catch {} },
  del: k => { try { window[kind].removeItem("mibs." + k); } catch {} }
});
const ss = storage("sessionStorage"), ls = storage("localStorage"); // ss = this tab (seat id), ls = this browser (name, "my last seat")
const COL = { p1: "#2f6df6", p2: "#ff4f6d" };

let code, slot, sid, myName, st = null, pl = {}, tv = null, online = true, seatSeen = false, hadState = false;
let offs = [], stopPresence = null, pad = null, key = "", usesMask = 0, sent = 0, inRef = null, avg = 0, bannerT = 0, noteT = 0;
const ctr = { pu: 0, pd: 0, pl: 0, pr: 0, pa: 0 };

const err = m => { $("#err").textContent = m || ""; };
const setBusy = b => { $("#go").disabled = b; $("#go").textContent = b ? "Joining…" : "Join game"; };

// ---------------- join ----------------
$("#room").oninput = e => { e.target.value = cleanCode(e.target.value); if (e.target.value.length === 4) $("#name").focus(); };
for (const id of ["#room", "#name"]) $(id).addEventListener("keydown", e => { if (e.key === "Enter") join(); });
$("#go").onclick = () => join();

async function join() {
  const c = cleanCode($("#room").value), name = cleanName($("#name").value);
  err("");
  if (!validCode(c)) return err("Enter the 4-letter room code shown on the TV.");
  setBusy(true);
  try {
    const list = resumeList(), resumeSids = list.filter(x => x.room === c && Date.now() - x.ts < 6 * 3600e3).map(x => x.sid); // seats from tabs I closed
    const r = await claimSeat(c, ss.get("sid") || randomId(), name, resumeSids);
    ss.set("sid", r.sid); ss.set("room", c); ss.set("name", name); ls.set("name", name);
    ls.set("resume", JSON.stringify([{ room: c, sid: r.sid, ts: Date.now() }, ...list.filter(x => x.sid !== r.sid)].slice(0, 6)));
    enter(c, r.slot, r.sid, name);
  } catch (e) { err(friendly(e)); setBusy(false); }
}

function enter(c, s, id, name) {
  code = c; slot = s; sid = id; myName = name; inRef = rp(code, `inputs/${slot}`); online = true;
  $("#join").hidden = true; $("#app").hidden = false; setBusy(false);
  $("#me").textContent = `P${slot[1]} · ${name}`;
  document.documentElement.style.setProperty("--c", COL[slot]);
  try { history.replaceState(null, "", location.pathname + "?room=" + code); } catch {}
  const fail = e => note(friendly(e), 6000);
  offs.push(onValue(rp(code, "state"), snap => {
    st = snap.val();
    if (!st) return leave(hadState ? "The TV closed this room." : "Room not found. Check the code on the TV.");
    hadState = true; render();
  }, fail));
  offs.push(onValue(rp(code, "players"), snap => {
    pl = snap.val() || {};
    if (pl[slot]?.sid === sid) seatSeen = true; else if (seatSeen) return leave("Your seat was taken, or the room was restarted. Join again.");
    render(); status();
  }, fail));
  offs.push(onValue(rp(code, "tv"), snap => { tv = snap.val(); status(); }, fail));
  stopPresence = armSeatPresence(code, slot, sid, myName, {
    online: c => { online = true; for (const k in ctr) ctr[k] = c[k] | 0; sent = (pad?.bits() || 0) & usesMask; update(inRef, { h: sent }).catch(() => {}); status(); }, // press counters continue from the database value
    offline: () => { online = false; status(); },
    lost: () => leave("Your seat was taken, or the room was restarted. Join again."),
    error: e => note(friendly(e), 6000)
  });
  wake();
}

function teardown() {
  pad?.releaseAll(); pad?.destroy(); pad = null;
  offs.forEach(f => { try { f(); } catch {} }); offs = [];
  stopPresence?.(); stopPresence = null;
  st = tv = null; pl = {}; seatSeen = hadState = false; key = ""; sent = 0; usesMask = 0;
  document.body.classList.remove("ingame");
}
const resumeList = () => { try { const l = JSON.parse(ls.get("resume") || "[]"); return Array.isArray(l) ? l.filter(x => x && typeof x.sid === "string" && typeof x.room === "string" && typeof x.ts === "number") : []; } catch { return []; } };
function leave(msg) {
  const old = sid; teardown(); ss.del("sid"); ss.del("room"); ls.set("resume", JSON.stringify(resumeList().filter(x => x.sid !== old)));
  $("#app").hidden = true; $("#join").hidden = false; $("#view").replaceChildren(); $("#banner").hidden = true;
  try { history.replaceState(null, "", location.pathname); } catch {}
  $("#room").value = ""; setBusy(false); err(msg || "");
}

// ---------------- status line / banners ----------------
function banner(text) { const b = $("#banner"); b.textContent = text || ""; b.hidden = !text; }
function note(text, ms = 3500) { banner(text); clearTimeout(noteT); noteT = setTimeout(status, ms); }
function status() {
  if (!code) return;
  const other = slot === "p1" ? "p2" : "p1", inGame = st && (st.status === "countdown" || st.status === "playing");
  const dot = $("#dot");
  if (!online) { dot.className = "dot bad"; return banner("📶 Reconnecting… your seat is kept."); }
  if (tv && tv.connected === false) { dot.className = "dot"; return banner("📺 The TV disconnected. Waiting for it to come back…"); }
  dot.className = "dot ok";
  if (inGame && pl[other] && pl[other].connected === false) return banner(`⏳ Waiting for ${pl[other].name || "the other player"} to reconnect…`);
  banner("");
}
function ping(ms) {
  avg = avg ? avg * .7 + ms * .3 : ms;
  const e = $("#ping"); e.textContent = Math.round(avg) + " ms"; e.style.color = avg < 100 ? "#bbf7d0" : avg < 200 ? "#fde68a" : "#fecaca";
}

// ---------------- screens ----------------
function render() {
  if (!st) return;
  const n = GAMES.length, i = Math.min(Math.max(st.selectedLobbyIndex | 0, 0), n - 1), g = gameById(st.activeGame);
  const inGame = st.status === "countdown" || st.status === "playing", both = !!(pl.p1?.connected && pl.p2?.connected);
  const boss = slot === "p1" || !pl.p1?.connected; // Player 2 gets the lobby buttons if Player 1 is offline
  const k = inGame ? "game|" + st.activeGame : st.status === "lobby" ? ["lobby", i, both, boss].join("|") : ["over", st.winner, st.scores?.p1, st.scores?.p2].join("|");
  if (inGame && g) { const s = $("#view .gs"); if (s) s.textContent = st.status === "countdown" ? "Get ready…" : "Go!"; }
  if (k === key) return; // the other player's presses or presence must not rebuild my screen
  key = k;
  pad?.releaseAll(); pad?.destroy(); pad = null;
  const ex = $("#ex"); ex.hidden = !inGame; ex.dataset.arm = ""; ex.textContent = "Exit game";
  document.body.classList.toggle("ingame", inGame && !!g);
  if (inGame) return g ? padView(g) : unknownGame();
  if (st.status === "lobby") lobbyView(i, both, boss); else overView();
}

function unknownGame() {
  const v = $("#view"); v.replaceChildren();
  const c = h("div", "card"); c.append(h("h1", "", "Refresh this page"), h("p", "", "The TV has a newer game list than this phone."));
  const b = h("button", "b go", "Refresh"); b.onclick = () => location.reload(); v.append(c, b);
}

function padView(g) {
  const v = $("#view"); v.replaceChildren();
  const root = h("div", "pad"), dp = h("div", "dpad"), mid = h("div", "mid"), a = h("button", "abtn", "A");
  dp.id = "dpad"; a.id = "abtn"; a.setAttribute("aria-label", "A button");
  for (const [c, t] of [["up", "▲"], ["left", "◀"], ["right", "▶"], ["down", "▼"]]) dp.append(h("i", "ar " + c, t));
  dp.append(h("span", "hub"));
  mid.append(h("div", "gi", g.icon), h("div", "gn", g.title), h("div", "gh", [g.move, g.a && `A = ${g.a}`].filter(Boolean).join(" · ")), h("div", "gs", st.status === "countdown" ? "Get ready…" : "Go!"));
  a.append(h("small", "", g.a || ""));
  root.append(dp, mid, a); v.append(root);
  usesMask = maskOf(g.uses); sent = 0;
  pad = createPad({ dpad: dp, abtn: a, dir: g.dir, onChange: sendInput });
}

function lobbyView(i, both, boss) {
  const g = GAMES[i], v = $("#view"); v.replaceChildren();
  const root = h("div", "lobby"), card = h("div", "card"), side = h("div", "side");
  card.append(h("small", "", `Game ${i + 1} of ${GAMES.length}`), h("h1", "", `${g.icon} ${g.title}`), h("p", "", g.description), h("div", "keys", [g.move, g.a && `A = ${g.a}`].filter(Boolean).join(" · ")));
  if (boss) {
    const row = h("div", "row"), pv = h("button", "b", "◀ Previous"), nx = h("button", "b", "Next ▶");
    const go = h("button", "b go", both ? "Start game" : slot === "p1" ? "Waiting for Player 2…" : "Waiting for Player 1…"); go.disabled = !both;
    const n = GAMES.length;
    pv.onclick = () => patchState(code, { selectedLobbyIndex: (i + n - 1) % n }).catch(oops);
    nx.onclick = () => patchState(code, { selectedLobbyIndex: (i + 1) % n }).catch(oops);
    go.onclick = () => { go.disabled = true; patchState(code, { status: "countdown", activeGame: g.id, winner: null }).catch(e => { go.disabled = !both; oops(e); }); };
    row.append(pv, nx); side.append(row, go);
  } else {
    const w = h("div", "card"); w.append(h("h1", "", pl[slot]?.name || ""), h("p", "", `You are Player ${slot[1]}. Waiting for Player 1 to choose a game…`)); side.append(w);
  }
  root.append(card, side); v.append(root);
}

function overView() {
  const v = $("#view"); v.replaceChildren();
  const w = st.winner, res = w === "draw" ? "Draw" : w === slot ? "You win! 🎉" : "You lose";
  const root = h("div", "lobby"), card = h("div", "card"), side = h("div", "side");
  card.append(h("h1", "", res), h("p", "", `Session wins: P1 ${st.scores?.p1 | 0} · P2 ${st.scores?.p2 | 0}`));
  const pa = h("button", "b go", "Play again"), bl = h("button", "b", "Back to lobby"); // both players get the buttons, so nobody is ever stuck
  pa.onclick = () => { pa.disabled = true; patchState(code, { status: "countdown", winner: null }).catch(e => { pa.disabled = false; oops(e); }); };
  bl.onclick = () => patchState(code, { status: "lobby", winner: null }).catch(oops);
  side.append(pa, bl); root.append(card, side); v.append(root);
}
const oops = e => note(friendly(e), 4000);

// ---------------- sending input ----------------
// One tiny write per change: h = every held button as a bitmask; pX = a counter for each NEW press (so a tap shorter than one TV frame is never lost).
function sendInput(bits, pressed) {
  if (pressed.length) navigator.vibrate?.(10);
  const hb = bits & usesMask, p = pressed.filter(k => usesMask & BIT[k]); // buttons this game ignores are not sent
  if (hb === sent && !p.length) return;
  sent = hb;
  const o = { h: hb };
  for (const k of p) { const f = PRESS[k]; o[f] = ctr[f] = (ctr[f] + 1) % CTR_MOD; }
  if (!online || !inRef) return; // offline: Firebase would queue and replay old presses later, so we drop them; the held state is re-sent on reconnect
  const t0 = performance.now();
  update(inRef, o).then(() => ping(performance.now() - t0)).catch(e => console.error("[mibs] input write failed", e));
}

// ---------------- buttons, fullscreen, safety ----------------
let exT, lvT;
$("#ex").onclick = e => {
  const b = e.currentTarget; clearTimeout(exT);
  if (b.dataset.arm) { b.dataset.arm = ""; b.textContent = "Exit game"; patchState(code, { status: "lobby", winner: null }).catch(oops); }
  else { b.dataset.arm = "1"; b.textContent = "Tap again to exit"; exT = setTimeout(() => { b.dataset.arm = ""; b.textContent = "Exit game"; }, 3000); }
};
$("#lv").onclick = async e => {
  const b = e.currentTarget; clearTimeout(lvT);
  if (!b.dataset.arm) { b.dataset.arm = "1"; b.textContent = "Tap again"; lvT = setTimeout(() => { b.dataset.arm = ""; b.textContent = "Leave"; }, 3000); return; }
  b.dataset.arm = ""; b.textContent = "Leave";
  const c = code, s = slot, i = sid; pad?.releaseAll();
  await leaveSeat(c, s, i); leave("");
};
$("#fs").onclick = async () => {
  const d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen;
  if (!f) return alert("On iPhone: tap Share → Add to Home Screen, then open Mibs Console from your home screen to play fullscreen.");
  try { await f.call(d); } catch {}
  try { await screen.orientation?.lock?.("landscape"); } catch {} // works on Android Chrome in fullscreen; iPhone ignores it
};

async function wake() { try { await navigator.wakeLock?.request("screen"); } catch {} }
const releaseAll = () => pad?.releaseAll();
addEventListener("blur", releaseAll); addEventListener("pagehide", releaseAll); addEventListener("resize", releaseAll); addEventListener("orientationchange", releaseAll);
document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); else releaseAll(); });
addEventListener("online", status); addEventListener("offline", () => { online = false; status(); });
addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("gesturestart", e => e.preventDefault());

// ---------------- start (last, so every helper above is defined before join() can run) ----------------
{
  const q = cleanCode(new URLSearchParams(location.search).get("room") || ss.get("room") || "");
  $("#room").value = q; $("#name").value = ss.get("name") || ls.get("name") || "";
  if (validCode(q) && $("#name").value) join(); // QR code or refresh with a known nickname: straight in
  else if (validCode(q)) $("#name").focus();
}

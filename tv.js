import { GAMES, gameById, loadGame, preloadGames, W, H } from "./games.js";
import { SLOTS, T, newRemote, applyRemote, clearTaps, releaseAll, randomId } from "./protocol.js";
import { onValue } from "./firebase-config.js";
import { rp, createRoom, tryResumeRoom, deleteIfExpired, armTvPresence, patchState, friendly } from "./room.js";

const $ = s => document.querySelector(s), rnd = (a, b) => a + Math.random() * (b - a);
const store = {
  get: k => { try { return localStorage.getItem("mibs." + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem("mibs." + k, v); } catch {} },
  del: k => { try { localStorage.removeItem("mibs." + k); } catch {} }
};

// ---- Web Audio: unlocked by the first click/key, resumed after tab switches, never throws into a game ----
const audio = (() => {
  let ac = null, muted = false;
  const running = () => !!ac && ac.state === "running", sync = () => { $("#snd").hidden = running(); }, on = () => running() && !muted;
  const unlock = () => {
    try { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); ac.onstatechange = sync; } ac.resume().then(sync, sync); }
    catch (e) { console.warn("[mibs] audio unavailable", e); }
  };
  for (const t of ["pointerdown", "keydown", "touchend"]) addEventListener(t, unlock, { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ac) ac.resume().then(sync, () => {}); });
  sync();
  return {
    get muted() { return muted; }, set muted(v) { muted = v; },
    beep(f, d = .1, type = "square", v = .12, to = f) {
      if (!on()) return;
      try {
        const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + d);
        g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d);
      } catch {}
    },
    noise(d = .2, v = .2) {
      if (!on()) return;
      try {
        const n = ac.sampleRate * d | 0, b = ac.createBuffer(1, n, ac.sampleRate), a = b.getChannelData(0);
        for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; g.gain.value = v; s.connect(g).connect(ac.destination); s.start();
      } catch {}
    },
    fanfare() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, .28, "triangle", .15), i * 140)); }
  };
})();

// ---- State ----
const grid = $("#grid"), cv = $("#cv"), ctx = cv.getContext("2d");
const remotes = { p1: newRemote(), p2: newRemote() }, inp = [remotes.p1, remotes.p2]; // what games read each frame
let code, R = null, pl = {}, mode = "boot", G = null, S = null, cd = 0, shown = -1, conf = [], token = 0;
let paused = null, linkUp = true, firstState = true, toastT = 0, offs = [], stopPresence = null;

const toast = m => { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 4500); };
const to = patch => patchState(code, patch).catch(e => toast(friendly(e, "tv")));
const both = () => !!(pl.p1?.connected && pl.p2?.connected);
const launch = () => { if (R?.status === "lobby" && both()) to({ status: "countdown", activeGame: (GAMES[R.selectedLobbyIndex | 0] || GAMES[0]).id, winner: null }); };
const again = () => { if (R?.status === "gameover") to({ status: "countdown", winner: null }); };
const toLobbyDb = () => to({ status: "lobby", winner: null });
const safeCleanup = () => { try { G?.cleanup?.(S); } catch (e) { console.error("[mibs] cleanup failed", e); } };

GAMES.forEach((g, i) => {
  const d = document.createElement("div"); d.className = "card g"; d.style.setProperty("--a", g.accentColor);
  d.innerHTML = "<b></b><h2></h2><p></p>"; d.children[0].textContent = g.icon; d.children[1].textContent = g.title; d.children[2].textContent = g.description;
  d.onclick = () => { if (R?.status === "lobby") to({ selectedLobbyIndex: i }); }; grid.append(d);
});
$("#start").onclick = launch; $("#again").onclick = again; $("#chg").onclick = toLobbyDb; $("#exit").onclick = toLobbyDb;
$("#mute").onclick = e => { audio.muted = !audio.muted; e.currentTarget.textContent = audio.muted ? "🔇" : "🔊"; };
$("#full").onclick = () => {
  const d = document.documentElement;
  try { if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); else (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d); } catch {}
};
addEventListener("keydown", e => {
  if (e.repeat || !R) return;
  const n = GAMES.length, i = R.selectedLobbyIndex | 0;
  if (R.status === "lobby") {
    if (e.key === "ArrowRight") to({ selectedLobbyIndex: (i + 1) % n });
    if (e.key === "ArrowLeft") to({ selectedLobbyIndex: (i + n - 1) % n });
    if (e.key === "Enter") launch();
  } else if (R.status === "countdown" || R.status === "playing") { if (e.key === "Escape") toLobbyDb(); }
  else if (R.status === "gameover") { if (e.key === "Enter") again(); if (e.key === "Escape") toLobbyDb(); }
});

// ---- Database -> screen ----
function paintHud() {
  $("#h1").textContent = `${pl.p1?.name || "P1"} · ${R?.scores?.p1 | 0}`; $("#h2").textContent = `${R?.scores?.p2 | 0} · ${pl.p2?.name || "P2"}`;
  $("#ht").textContent = (gameById(R?.activeGame) || GAMES[0]).title;
}
function onState() {
  if (firstState) { // the TV page was refreshed or reopened: restart an interrupted match instead of showing a dead screen
    firstState = false;
    if (R.status === "countdown" || R.status === "playing") return to({ status: "countdown" });
    if (R.status === "gameover") return toLobbyDb();
  }
  [...grid.children].forEach((c, n) => c.classList.toggle("sel", n === (R.selectedLobbyIndex | 0)));
  paintHud(); onPlayers();
  if (R.status === "countdown" && mode !== "countdown" && mode !== "loading") begin();
  else if (R.status === "lobby" && mode !== "lobby") toLobby();
}
function onPlayers() {
  SLOTS.forEach((s, n) => {
    const b = $("#b" + (n + 1)), on = !!pl[s]?.connected, name = pl[s]?.name;
    b.lastElementChild.textContent = pl[s] ? name + (on ? "" : " (offline)") : "Waiting for player…";
    b.firstElementChild.textContent = Array.from(String(name || n + 1))[0].toUpperCase(); b.classList.toggle("on", on);
    if (!on) releaseAll(remotes[s]); // a dropped phone can never leave a direction stuck
  });
  $("#start").disabled = !both() || R?.status !== "lobby";
  $("#sh").textContent = both() ? "Ready! Press Start, or Player 1 can start from their phone." : "Waiting for both players to join…";
  paintHud(); updatePause();
}

// ---- Pause when a player (or the TV's own connection) drops during a match ----
function updatePause() {
  const active = mode === "countdown" || mode === "play", missing = SLOTS.filter(s => !pl[s]?.connected);
  const need = !active ? null : !linkUp ? { why: "link" } : missing.length ? { why: "players", names: missing.map(s => pl[s]?.name || s.toUpperCase()) } : null;
  if (need && !paused) { paused = { t: performance.now(), ...need }; for (const s of SLOTS) releaseAll(remotes[s]); $("#pause").hidden = false; }
  else if (!need && paused) { paused = null; $("#pause").hidden = true; for (const s of SLOTS) clearTaps(remotes[s]); }
  else if (need && paused) { if (paused.why !== need.why) paused.t = performance.now(); Object.assign(paused, need); }
  if (paused) paintPause();
}
function paintPause() {
  const left = Math.max(0, Math.ceil((T.pauseGrace - (performance.now() - paused.t)) / 1000));
  $("#pt").textContent = paused.why === "link" ? "Lost connection to the game server. Reconnecting…" : `Waiting for ${paused.names.join(" and ")} to reconnect…`;
  $("#ps").textContent = paused.why === "link" ? "The game continues by itself when the connection is back." : `Back to the lobby in ${left}s if they do not return.`;
}
function abandon() {
  toast(`${paused.names.join(" and ")} did not come back, so we are back in the lobby.`);
  paused = null; $("#pause").hidden = true; toLobbyDb(); toLobby();
}

// ---- Game lifecycle ----
async function begin() {
  const my = ++token, meta = gameById(R.activeGame) || GAMES[0];
  safeCleanup(); G = S = null; mode = "loading"; conf = [];
  $("#lobby").hidden = true; $("#stage").hidden = false; $("#over").hidden = true; $("#exit").hidden = false; fit();
  let mod;
  try { mod = await loadGame(meta.id); }
  catch (e) { console.error("[mibs] game failed to load:", meta.id, e); if (my === token) { toast(`Could not load ${meta.title}. Check the internet connection and try again.`); toLobbyDb(); toLobby(); } return; }
  if (my !== token) return; // the players already moved on (exit / another game)
  G = mod;
  try { S = G.init(cv, pl); } catch (e) { return crash(e); }
  for (const s of SLOTS) clearTaps(remotes[s]);
  mode = "countdown"; cd = 3.6; shown = -1;
  $("#how").textContent = meta.description; $("#how").hidden = false; paintHud(); updatePause();
}
function toLobby() {
  token++; safeCleanup(); G = S = null; mode = "lobby"; conf = [];
  $("#lobby").hidden = false; $("#stage").hidden = true; $("#over").hidden = true; $("#cdn").hidden = true; $("#exit").hidden = true; $("#how").hidden = true;
  updatePause(); onPlayers();
}
function crash(e) { console.error("[mibs] game crashed", e); toast("That game hit an error, so we went back to the lobby."); toLobbyDb(); toLobby(); }
function finish(w) {
  mode = "over";
  const sc = { p1: (R.scores?.p1 | 0) + (w === "p1" ? 1 : 0), p2: (R.scores?.p2 | 0) + (w === "p2" ? 1 : 0) };
  to({ status: "gameover", winner: w, scores: sc });
  $("#wt").textContent = w === "draw" ? "Draw!" : (pl[w]?.name || w.toUpperCase()) + " wins!";
  $("#wt").style.color = w === "p1" ? "#2f6df6" : w === "p2" ? "#ff4f6d" : "#1d1b2f";
  $("#sc").textContent = `${sc.p1} — ${sc.p2}`; $("#over").hidden = false; audio.fanfare();
  if (w !== "draw") for (let i = 0; i < 220; i++) conf.push({ x: rnd(0, W), y: rnd(-H, 0), vx: rnd(-60, 60), vy: rnd(120, 360), c: ["#2f6df6", "#ff4f6d", "#22c55e", "#ffffff"][i % 4] });
}
function tick(dt) {
  cd -= dt; const n = Math.max(0, Math.ceil(cd - .6));
  if (n !== shown) {
    shown = n; const c = $("#cdn"); c.hidden = false; c.textContent = n || "GO!"; c.style.color = n ? "#1d1b2f" : "#22c55e";
    audio.beep(n ? 440 : 880, n ? .15 : .4, "square", .15);
  }
  if (cd <= 0) { mode = "play"; $("#cdn").hidden = true; $("#how").hidden = true; for (const s of SLOTS) clearTaps(remotes[s]); to({ status: "playing" }); }
}

// ---- Canvas: 16:9 logical space scaled with devicePixelRatio ----
function fit() {
  const s = Math.max(.1, Math.min((innerWidth - 24) / W, (innerHeight - 76) / H)), k = Math.min((devicePixelRatio || 1) * s, 1.5); // draw at most ~1080p, the browser scales it up
  cv.style.width = W * s + "px"; cv.style.height = H * s + "px"; cv.width = Math.max(2, Math.round(W * k)); cv.height = Math.max(2, Math.round(H * k));
  ctx.setTransform(k, 0, 0, k, 0, 0);
}
addEventListener("resize", fit); document.addEventListener("fullscreenchange", fit); document.addEventListener("webkitfullscreenchange", fit); fit();

let last = performance.now();
function frame(dt) {
  if (!G || !S || mode === "lobby" || mode === "loading") return;
  if (paused) { paintPause(); if (paused.why === "players" && performance.now() - paused.t > T.pauseGrace) abandon(); }
  else if (mode === "countdown") tick(dt);
  else if (mode === "play") { const r = G.update(S, dt, inp, audio); for (const s of SLOTS) clearTaps(remotes[s]); if (r?.winner) finish(r.winner); }
  if (!G || !S) return; // abandon() or a crash may have just left the game
  G.render(ctx, cv, S, pl);
  if (mode === "over") {
    conf.forEach(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 8, 12); });
    conf = conf.filter(p => p.y < H + 20);
  }
}
(function loop(t) { requestAnimationFrame(loop); const dt = Math.min(Math.max((t - last) / 1000, 0), .05); last = t; try { frame(dt); } catch (e) { crash(e); } })(performance.now());

// ---- Boot: atomic room creation (or take back our own room), then listen ----
function bootError(msg) {
  $("#bt").textContent = "Could not start a room"; $("#bp").textContent = msg; $("#retry").hidden = false; $("#retry").onclick = () => location.reload();
}
async function boot() {
  const slow = setTimeout(() => { $("#bp").textContent = "Still trying… check that this device is online."; }, 10000);
  try {
    let tvId = store.get("tvId"); if (!tvId) { tvId = randomId(16); store.set("tvId", tvId); }
    const old = store.get("tvRoom"); let resumed = false;
    if (old) { try { resumed = await tryResumeRoom(old, tvId); } catch (e) { console.warn("[mibs] could not resume", e); } if (!resumed) deleteIfExpired(old); }
    code = resumed ? old : await createRoom(tvId, GAMES[0].id);
    store.set("tvRoom", code);
  } catch (e) { clearTimeout(slow); return bootError(friendly(e, "tv")); }
  clearTimeout(slow); attach();
}
function attach() {
  $("#code").textContent = code;
  const url = new URL("controller.html?room=" + code, location.href).href;
  $("#url").textContent = (location.host + location.pathname.replace(/[^/]*$/, "")).replace(/\/$/, "");
  try { new QRCode($("#qr"), { text: url, width: 220, height: 220, colorDark: "#000000", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M }); }
  catch (e) { console.warn("[mibs] QR code unavailable; the room code still works", e); }
  const fail = e => toast(friendly(e, "tv"));
  offs.push(onValue(rp(code, "state"), s => {
    R = s.val();
    if (!R) { store.del("tvRoom"); toast("This room was closed. Starting a new one…"); return void setTimeout(() => location.reload(), 1500); }
    onState();
  }, fail));
  offs.push(onValue(rp(code, "players"), s => { pl = s.val() || {}; onPlayers(); }, fail));
  for (const s of SLOTS) offs.push(onValue(rp(code, "inputs/" + s), snap => applyRemote(remotes[s], snap.val()), fail)); // one value per press, so press order is kept
  stopPresence = armTvPresence(code, on => { const was = linkUp; linkUp = on; if (!on && was) toast("Lost connection to the game server. Reconnecting…"); updatePause(); });
  $("#boot").hidden = true;
  preloadGames(); // load every game in the background so starting one never waits
  wake();
}
async function wake() { try { await navigator.wakeLock?.request("screen"); } catch {} }
document.addEventListener("visibilitychange", () => { if (!document.hidden) { last = performance.now(); wake(); } });
boot();
// Read-only debugging window for developers: open tv.html?debug=1 and inspect window.__mibs in the console.
if (new URLSearchParams(location.search).has("debug")) Object.defineProperty(window, "__mibs", { value: { get S() { return S; }, get G() { return G; }, get mode() { return mode; }, get paused() { return paused; }, get R() { return R; }, get code() { return code; }, remotes } });

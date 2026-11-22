// The one controller shared by every game: a D-pad (slide your thumb across it) and a big A button.
// Pure DOM + pointer events, no Firebase. Calls onChange(bits, pressedKeys) whenever the held buttons change.
import { BIT, KEYS } from "./protocol.js";

const DIRS = BIT.up | BIT.down | BIT.left | BIT.right;
const KEYMAP = { ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right", Space: "a", Enter: "a", KeyJ: "a", KeyZ: "a" };

export function createPad({ dpad, abtn, dir = 4, onChange }) {
  let ptrDir = 0, ptrA = false, kb = 0, bits = 0, dpId = null;
  const aIds = new Set(), arrows = { up: dpad.querySelector(".up"), down: dpad.querySelector(".down"), left: dpad.querySelector(".left"), right: dpad.querySelector(".right") };

  function paint() {
    for (const k in arrows) arrows[k].classList.toggle("on", !!(bits & BIT[k]));
    abtn.classList.toggle("on", !!(bits & BIT.a));
    const x = ((bits & BIT.right ? 1 : 0) - (bits & BIT.left ? 1 : 0)), y = ((bits & BIT.down ? 1 : 0) - (bits & BIT.up ? 1 : 0)), n = Math.hypot(x, y) || 1;
    dpad.style.setProperty("--hx", (x / n * 45) + "%"); dpad.style.setProperty("--hy", (y / n * 45) + "%");
  }
  function emit() {
    const next = ptrDir | (ptrA ? BIT.a : 0) | kb;
    if (next === bits) return;
    const pressed = KEYS.filter(k => (next & BIT[k]) && !(bits & BIT[k])); // newly down; order inside one change is up,down,left,right,a
    bits = next; paint(); onChange(bits, pressed);
  }

  // Which directions does a touch at (x, y) mean? `cur` is what is held now, used for hysteresis so the diagonal never flickers.
  function dirBits(e, cur) {
    const r = dpad.getBoundingClientRect(), R = r.width / 2, dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R), d = Math.hypot(dx, dy);
    if (d < R * 0.14) return 0;                                  // dead zone in the middle
    const nx = dx / d, ny = dy / d;
    if (dir === 8) {
      const t = k => (cur & BIT[k]) ? 0.30 : 0.42;
      return (ny < -t("up") ? BIT.up : 0) | (ny > t("down") ? BIT.down : 0) | (nx < -t("left") ? BIT.left : 0) | (nx > t("right") ? BIT.right : 0);
    }
    const wasH = cur & (BIT.left | BIT.right), wasV = cur & (BIT.up | BIT.down);
    const horiz = wasH ? Math.abs(ny) <= Math.abs(nx) + 0.18 : wasV ? Math.abs(nx) > Math.abs(ny) + 0.18 : Math.abs(nx) >= Math.abs(ny);
    return horiz ? (nx < 0 ? BIT.left : BIT.right) : (ny < 0 ? BIT.up : BIT.down);
  }
  const moveDpad = e => { ptrDir = dirBits(e, ptrDir); emit(); };

  dpad.addEventListener("pointerdown", e => {
    if (dpId !== null) return;
    e.preventDefault(); dpId = e.pointerId; try { dpad.setPointerCapture(dpId); } catch {}
    moveDpad(e);
  });
  dpad.addEventListener("pointermove", e => { if (e.pointerId === dpId) moveDpad(e); });
  const endDpad = e => { if (e.pointerId === dpId) { dpId = null; ptrDir = 0; emit(); } };

  abtn.addEventListener("pointerdown", e => {
    e.preventDefault(); try { abtn.setPointerCapture(e.pointerId); } catch {}
    aIds.add(e.pointerId); ptrA = true; emit();
  });
  const endA = e => { if (aIds.delete(e.pointerId) && !aIds.size) { ptrA = false; emit(); } };

  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) { dpad.addEventListener(t, endDpad); abtn.addEventListener(t, endA); }
  // Safety net: if the element that owned a finger disappears or loses it, the finger's release still arrives here.
  const winEnd = e => { endDpad(e); endA(e); };
  addEventListener("pointerup", winEnd, true); addEventListener("pointercancel", winEnd, true);

  const kd = e => { const k = KEYMAP[e.code]; if (!k || e.target.tagName === "INPUT") return; e.preventDefault(); kb |= BIT[k]; emit(); };
  const ku = e => { const k = KEYMAP[e.code]; if (!k) return; kb &= ~BIT[k]; emit(); };
  addEventListener("keydown", kd); addEventListener("keyup", ku);

  paint();
  return {
    releaseAll() { dpId = null; aIds.clear(); ptrDir = 0; ptrA = false; kb = 0; emit(); },
    bits: () => bits,
    destroy() { removeEventListener("pointerup", winEnd, true); removeEventListener("pointercancel", winEnd, true); removeEventListener("keydown", kd); removeEventListener("keyup", ku); }
  };
}

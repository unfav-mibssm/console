// Game registry. The phone only needs this list (no game code); the TV loads a game's file when it is about to be played.
//
// To add a game:
//   1. Create games/<id>.js exporting default { init(cv, players), update(state, dt, inp, audio), render(ctx, cv, state, players), cleanup(state) }
//      (copy games/tug-of-war.js as a starting point). update() returns { winner: "p1" | "p2" | "draw" } when the match is over.
//   2. Add one entry below.
//   3. Add the same id to the activeGame list in database.rules.json and publish the rules again.
//
// Per game:  a = what the A button does (shown on the phone)   move = what the D-pad does (shown on the phone)
//            dir = 4 (D-pad gives one direction at a time) or 8 (diagonals allowed)
//            uses = buttons the game reads. The phone only sends those, which saves database writes.
export const GAMES = [
  { id: "bumper-sumo", icon: "🥋", title: "Bumper Sumo", accentColor: "#2f6df6", dir: 4, uses: ["left", "right", "a"],
    description: "Steer with ◀ ▶ and hold A to dash. Ram your rival off the shrinking ice.", a: "Dash", move: "◀ ▶ steer" },
  { id: "light-cycles", icon: "🏍️", title: "Light Cycles", accentColor: "#ff4f6d", dir: 4, uses: ["up", "down", "left", "right"],
    description: "Steer with the D-pad. Trap your rival against the walls and trails.", a: "", move: "D-pad steers" },
  { id: "tug-of-war", icon: "💪", title: "Tug of War", accentColor: "#22c55e", dir: 4, uses: ["a"],
    description: "Tap A as fast as you can to drag the flag to your side.", a: "Pull!", move: "" },
  { id: "pong", icon: "🏓", title: "Pong", accentColor: "#2f6df6", dir: 4, uses: ["up", "down"],
    description: "Move your paddle with ▲ ▼. First to 5 points wins.", a: "", move: "▲ ▼ paddle" },
  { id: "meteor-dodge", icon: "☄️", title: "Meteor Dodge", accentColor: "#f97316", dir: 4, uses: ["left", "right"],
    description: "Move ◀ ▶ to dodge the falling rocks. Three hits and you're out.", a: "", move: "◀ ▶ move" },
  { id: "air-hockey", icon: "🏒", title: "Air Hockey", accentColor: "#06b6d4", dir: 8, uses: ["up", "down", "left", "right", "a"],
    description: "Slide your mallet with the D-pad, hold A to boost. First to 5 goals wins.", a: "Boost", move: "D-pad moves" },
  { id: "tank-duel", icon: "🎯", title: "Tank Duel", accentColor: "#a855f7", dir: 8, uses: ["up", "down", "left", "right", "a"],
    description: "Drive with the D-pad, fire with A. Shots bounce once. First to 3 rounds wins.", a: "Fire", move: "D-pad drives" },
  { id: "bomber-arena", icon: "💣", title: "Bomber Arena", accentColor: "#eab308", dir: 4, uses: ["up", "down", "left", "right", "a"],
    description: "Walk with the D-pad, drop bombs with A. Blast blocks and your rival. Best of 3.", a: "Bomb", move: "D-pad walks" }
];
export const GAME_IDS = GAMES.map(g => g.id);
export const gameById = id => GAMES.find(g => g.id === id);

const cache = new Map();
export function loadGame(id) {
  const g = gameById(id);
  if (!g) return Promise.reject(new Error("Unknown game: " + id));
  if (!cache.has(id)) cache.set(id, import(`./games/${g.id}.js`).then(m => {
    const d = m.default;
    if (!d || ["init", "update", "render"].some(f => typeof d[f] !== "function")) throw new Error("Game module is incomplete: " + id);
    return d;
  }).catch(e => { cache.delete(id); throw e; })); // a failed load can be retried
  return cache.get(id);
}
// Warm the cache in the background so starting a game never waits on the network.
export const preloadGames = () => Promise.allSettled(GAME_IDS.map(loadGame));
export { W, H } from "./kit.js";

// To add a game: put its file in games/ (copy games/tug-of-war.js as a starting point) and add its name to this list.
// Optional per game: icon (emoji), controllerLabels, controllerButtons (for controllerLayout "custom").
export const GAME_FILES = ["bumper-sumo", "light-cycles", "tug-of-war"];
export const loadGames = async () => (await Promise.all(GAME_FILES.map(f =>
  import(`./games/${f}.js`).then(m => m.default).catch(e => (console.error("Game failed to load:", f, e), null))))).filter(Boolean);
export { W, H } from "./kit.js";

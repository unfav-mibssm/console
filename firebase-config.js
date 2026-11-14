import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js";
// One place for the SDK version: pages import the database helpers from here.
export { ref, get, set, update, onValue, onDisconnect, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD4D9g5OlzkxAbctjU8qJwgvmoV_MEMxM8",
  authDomain: "mibsconsole.firebaseapp.com",
  databaseURL: "https://mibsconsole-default-rtdb.firebaseio.com",
  projectId: "mibsconsole",
  storageBucket: "mibsconsole.firebasestorage.app",
  messagingSenderId: "812252420467",
  appId: "1:812252420467:web:9de53d5434d62494c6cd06",
  measurementId: "G-7459WXSPJZ"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

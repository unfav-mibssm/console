import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js";
// One place for the SDK version: pages import the database helpers from here.
export { ref, get, set, update, remove, onValue, onDisconnect, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js";

// Same Firebase project as before. These keys identify the project and are meant to be public;
// what protects your data is database.rules.json, not hiding this file.
const firebaseConfig = {
  apiKey: "AIzaSyCsdIWrUu0ds75HsgEFFAxqLQIoxJCG8X8",
  authDomain: "mibconsole2.firebaseapp.com",
  databaseURL: "https://mibconsole2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mibconsole2",
  storageBucket: "mibconsole2.firebasestorage.app",
  messagingSenderId: "550069699117",
  appId: "1:550069699117:web:e137813328bdb1535f6ea4",
  measurementId: "G-FC86CCCV9F"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

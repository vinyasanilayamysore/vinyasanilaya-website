import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Add your Firebase Web App configuration object here
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "vinyasanilaya-website.firebaseapp.com",
  projectId: "vinyasanilaya-website",
  storageBucket: "vinyasanilaya-website.appspot.com",
  messagingSenderId: "547333535578",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
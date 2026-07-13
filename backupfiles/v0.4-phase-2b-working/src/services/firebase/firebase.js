import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyC6OEKNGSwAdnqeIRs33bbNzfmRAAPwWRw",
  authDomain: "hale-ohana-layout.firebaseapp.com",
  databaseURL: "https://hale-ohana-layout-default-rtdb.firebaseio.com",
  projectId: "hale-ohana-layout",
  storageBucket: "hale-ohana-layout.firebasestorage.app",
  messagingSenderId: "219910199610",
  appId: "1:219910199610:web:8b76a9736730ae81429803",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

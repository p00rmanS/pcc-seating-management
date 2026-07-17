import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCoQMFs68MzeJcpni-r_rv2G5eqzuc9kzo",
  authDomain: "pcc-seating-management-dev.firebaseapp.com",
  databaseURL:
    "https://pcc-seating-management-dev-default-rtdb.firebaseio.com",
  projectId: "pcc-seating-management-dev",
  storageBucket: "pcc-seating-management-dev.firebasestorage.app",
  messagingSenderId: "309181962509",
  appId: "1:309181962509:web:161c169a2e65b0604a3844",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export default app;
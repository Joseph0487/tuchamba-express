import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyB1k1lnQjQXiGYJRT9E9-KYzGSBBmrQGFI",
  authDomain: "vacancy-page-v2.firebaseapp.com",
  databaseURL: "https://vacancy-page-v2-default-rtdb.firebaseio.com",
  projectId: "vacancy-page-v2",
  storageBucket: "vacancy-page-v2.firebasestorage.app",
  messagingSenderId: "242419485392",
  appId: "1:242419485392:web:c486a767a1810ada876cd5"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
export const auth = getAuth(app);
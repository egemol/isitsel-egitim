// Firebase yapılandırması ve başlatma
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCKbSeEsInwLPhc-B0w1sjqsQI2QEuavM8",
  authDomain: "isitsel-egitim-project.firebaseapp.com",
  projectId: "isitsel-egitim-project",
  storageBucket: "isitsel-egitim-project.firebasestorage.app",
  messagingSenderId: "577755583834",
  appId: "1:577755583834:web:6f7d412462528ec7a6cf63",
  measurementId: "G-VQFW2C6Z0E"
};

// Firebase'i başlat
const app = initializeApp(firebaseConfig);

// Auth ve Firestore servisleri
export const auth = getAuth(app);
export const db = getFirestore(app);

console.log('🔥 Firebase başlatıldı!'); 
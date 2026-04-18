import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-analytics.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCu5qygEHGf9zU5EZQPtoXiYwOeFnOUDrU",
  authDomain: "tippawan-admin.firebaseapp.com",
  projectId: "tippawan-admin",
  storageBucket: "tippawan-admin.firebasestorage.app",
  messagingSenderId: "605672521830",
  appId: "1:605672521830:web:3da57444ebb04b93fbada7",
  measurementId: "G-T7S7Q8K96Y"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

console.log("Firebase initialized successfully for Project:", firebaseConfig.projectId);

export { app, analytics };

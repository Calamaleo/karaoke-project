import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging";


const firebaseConfig = {
  apiKey: "AIzaSyA0wn84ZAlAaGXJFMQBc0IL9RE76nEWUCU",
  authDomain: "kararoom-9dea3.firebaseapp.com",
  projectId: "kararoom-9dea3",
  storageBucket: "kararoom-9dea3.firebasestorage.app",
  messagingSenderId: "903295245788",
  appId: "1:903295245788:web:7bdde35ba5fa7d542b8319",
  measurementId: "G-BHVPYEJM1G"
};


const app = initializeApp(firebaseConfig);

export const messaging = getMessaging(app);
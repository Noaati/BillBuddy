import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyC_6Kx496YmS2eHyoI-VkiLJ6YARiHj5Ac",
  authDomain: "billbuddy-882f2.firebaseapp.com",
  projectId: "billbuddy-882f2",
  storageBucket: "billbuddy-882f2.firebasestorage.app",
  messagingSenderId: "916650114867",
  appId: "1:916650114867:web:7d727157d6b9de6983c846"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
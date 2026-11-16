
import { initializeApp, getApps } from "firebase/app";

import {
  getAuth,
  setPersistence,
  inMemoryPersistence,
  createUserWithEmailAndPassword,
  signOut
} from "firebase/auth";

import {
  doc,
  setDoc
} from "firebase/firestore";

import { db } from "./firebase.js";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Separate Firebase app so the Admin stays logged in.
const secondaryApp =
  getApps().find(app => app.name === "accountCreator") ||
  initializeApp(firebaseConfig, "accountCreator");

const secondaryAuth = getAuth(secondaryApp);

export async function createClinicAccount({
  name,
  username,
  password,
  role
}) {
  const cleanUsername = username.trim().toLowerCase();
  const cleanName = name.trim();

  if (!cleanName) {
    throw new Error("Enter the full name.");
  }

  if (!/^[a-z0-9._-]+$/.test(cleanUsername)) {
    throw new Error(
      "Username can only contain letters, numbers, dots, underscores and hyphens."
    );
  }

  if (cleanUsername === "admin.demo") {
    throw new Error("This username is reserved.");
  }

  if (password.length < 8) {
    throw new Error("Password must contain at least 8 characters.");
  }

  if (role !== "Clinic Staff") {
    throw new Error("Only Clinic Staff accounts can be created.");
  }

  const email = `${cleanUsername}@seaflow.example.com`;

  // Do not persist the secondary session.
  await setPersistence(secondaryAuth, inMemoryPersistence);

  let credential;

  try {
    credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password
    );

    // Uses the primary Firestore instance,
    // authenticated as the current Clinic Admin.
    await setDoc(doc(db, "users", credential.user.uid), {
      name: cleanName,
      username: cleanUsername,
      role: "staff",
      status: "Active",
      duty: null,
      createdAt: new Date().toISOString()
    });

    return {
      uid: credential.user.uid,
      username: cleanUsername
    };

  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      throw new Error("That username is already taken.");
    }

    throw error;

  } finally {
    if (secondaryAuth.currentUser) {
      await signOut(secondaryAuth);
    }
  }
}

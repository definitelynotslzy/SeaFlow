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
import { clinicAccountErrors, clean, normalizeUsername, friendlyError } from "./validators.js";

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
  const cleanUsername = normalizeUsername(username);
  const cleanName = clean(name);

  // Checked again here, so nothing is saved unless it passes the same rules as the form.
  const problems = Object.values(
    clinicAccountErrors({ name, username, password })
  );

  if (problems.length) {
    throw new Error(problems[0]);
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
      throw new Error("That username is already taken. Choose another one.");
    }

    throw new Error(
      friendlyError(error, "Unable to create the account. Please try again.")
    );

  } finally {
    if (secondaryAuth.currentUser) {
      await signOut(secondaryAuth);
    }
  }
}

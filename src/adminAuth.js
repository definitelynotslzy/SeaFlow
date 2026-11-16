
import {
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";

import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase.js";

export async function loginClinicUser(username, password) {
  const enteredUsername = username.trim().toLowerCase();

  if (!enteredUsername) {
    throw new Error("Enter your username.");
  }

  let email;

  if (enteredUsername === "admin.demo") {
    email = "admin@seaflow.example.com";
  } else {
    if (!/^[a-z0-9._-]+$/.test(enteredUsername)) {
      throw new Error("Invalid username or password.");
    }

    email = `${enteredUsername}@seaflow.example.com`;
  }

  const credential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  try {
    const snapshot = await getDoc(
      doc(db, "users", credential.user.uid)
    );

    if (!snapshot.exists()) {
      throw new Error("Account profile not found.");
    }

    const profile = snapshot.data();

    if (
      profile.username !== enteredUsername ||
      !["admin", "staff"].includes(profile.role) ||
      profile.status !== "Active"
    ) {
      throw new Error("Account is not authorized.");
    }

    return {
      role: profile.role,
      name: profile.name,
      userId: credential.user.uid,
      duty: profile.role === "staff" ? "Both" : null
    };
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

// Keep the existing import working during migration.
export const loginClinicAdmin = loginClinicUser;

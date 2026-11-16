
import {
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";

import {
  doc,
  getDoc
} from "firebase/firestore";

import { auth, db } from "./firebase.js";

export async function loginAgency(username, password) {
  const cleanUsername = username.trim().toLowerCase();

  const email = `${cleanUsername}@seaflow.example.com`;

  const credential = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  try {
    const snapshot = await getDoc(
      doc(db, "agencyRequests", credential.user.uid)
    );

    if (!snapshot.exists()) {
      throw new Error("Agency registration not found.");
    }

    const agency = snapshot.data();

    if (agency.username !== cleanUsername) {
      throw new Error("Agency username does not match.");
    }

    if (agency.status === "Pending") {
      throw new Error(
        "Your registration is still waiting for admin approval."
      );
    }

    if (agency.status === "Rejected") {
      throw new Error(
        agency.statusReason
          ? `Your registration was rejected: ${agency.statusReason}`
          : "Your registration was rejected. Contact the clinic."
      );
    }

    if (agency.status !== "Approved") {
      throw new Error(
        "Your agency account is not authorized."
      );
    }

    return {
      role: "agency",
      name: agency.agencyName,
      agencyId: credential.user.uid
    };

  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

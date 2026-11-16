
import {
  doc,
  collection,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "./firebase.js";

export async function createEndorsement(form) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in first.");
  }

  const endorsementRef = doc(collection(db, "endorsements"));
  const now = Date.now();

  const patientCode = `PT-${endorsementRef.id}`;

  const endorsement = {
    ...form,
    ref: endorsementRef.id,
    patientCode,
    agencyId: user.uid,
    status: "Pending",
    receivedMs: now,
    timeline: [{ label: "Received", ms: now }],
    turnaroundMin: null,
    cashBasis: false,
    updateRequested: false,
    createdAt: serverTimestamp(),
  };

  await setDoc(endorsementRef, endorsement);

  return {
    ...endorsement,
    createdAt: now,
  };
}

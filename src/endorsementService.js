import {
  doc,
  collection,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { auth, db } from "./firebase.js";
import { endorsementErrors, cleanEndorsement } from "./validators.js";

export async function createEndorsement(form) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in first.");
  }

  // Checked again here, so nothing is saved unless it passes the same rules as the form.
  const problems = Object.values(endorsementErrors(form));

  if (problems.length) {
    throw new Error(`Some details are not valid. ${problems[0]}`);
  }

  form = cleanEndorsement(form);

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

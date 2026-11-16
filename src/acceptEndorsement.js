
import {
  doc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase.js";

export async function acceptFirebaseEndorsement(id, cash = false) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Please sign in first.");
  }

  const endorsementRef = doc(db, "endorsements", id);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(endorsementRef);

    if (!snapshot.exists()) {
      throw new Error("Endorsement not found.");
    }

    const endorsement = snapshot.data();

    if (endorsement.status !== "Pending") {
      throw new Error("This endorsement has already been accepted.");
    }

    const now = Date.now();

    const turnaroundMin = Math.max(
      1,
      Math.round((now - endorsement.receivedMs) / 60000)
    );

    transaction.update(endorsementRef, {
      status: "Accepted",
      cashBasis: Boolean(cash),
      turnaroundMin,
      acceptedAt: serverTimestamp(),
      acceptedBy: user.uid,
      timeline: [
        ...(endorsement.timeline || []),
        {
          label: "Accepted",
          ms: now,
        },
      ],
    });
  });
}

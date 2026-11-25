import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "./firebase.js";

// The audit log is saved in the Firestore collection "auditLogs".
// Entries can be added, but the Firestore rules stop anyone, including the
// clinic admin, from changing or deleting them.

const AUDIT = "auditLogs";
const SHOW_LATEST = 500; // how many recent entries the audit log screen loads

/**
 * Saves one audit entry made by the signed-in user.
 * `entry` comes from the store: { who, role, actorType, action, ref, note, outcome, network }.
 */
export async function writeAudit(entry) {
  if (!auth.currentUser) return; // nobody signed in: only sign-in failures are written, below

  try {
    await addDoc(collection(db, AUDIT), {
      actorId: auth.currentUser.uid,
      actorName: entry.who || "",
      actorType: entry.actorType, // "clinic" or "agency"
      role: entry.role || "",
      action: entry.action,
      record: entry.ref && entry.ref !== "—" ? entry.ref : "",
      details: entry.note || "",
      outcome: entry.outcome || "allowed", // "allowed" or "denied"
      network: entry.network || "",
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Audit entry was not saved:", error);
  }
}

/**
 * Records a sign-in that did not succeed. Nobody is signed in at this point,
 * so the entry carries the username that was typed instead of an account.
 * action: "Failed sign-in" (wrong username or password) or
 *         "Sign-in blocked" (account suspended, deactivated or not yet approved).
 */
export async function writeSignInFailure(username, action, reason) {
  try {
    await addDoc(collection(db, AUDIT), {
      actorId: "",
      actorName: username || "",
      actorType: "unknown",
      role: "",
      action,
      record: "",
      details: reason || "",
      outcome: "denied",
      network: "",
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Sign-in failure was not recorded:", error);
  }
}

/** Listens to the most recent audit entries (clinic admin only). */
export function watchAuditLog(onEntries, onError) {
  const latest = query(
    collection(db, AUDIT),
    orderBy("createdAt", "desc"),
    limit(SHOW_LATEST)
  );

  return onSnapshot(
    latest,
    (snapshot) => {
      onEntries(
        snapshot.docs.map((d) => {
          const x = d.data();
          return {
            id: d.id,
            who: x.actorName || "Unknown user",
            role: x.role,
            actorType: x.actorType,
            action: x.action,
            ref: x.record || "—",
            note: x.details,
            outcome: x.outcome,
            network: x.network,
            // createdAt is filled in by the server a moment after the entry is added
            ms: x.createdAt?.toMillis?.() ?? Date.now(),
          };
        })
      );
    },
    onError
  );
}

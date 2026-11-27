// Access policy and break-glass grants saved in Firebase.
// The server reads the policy to decide what counts as the clinic network, and the
// Firestore rules read both before releasing full patient details.
import { doc, getDoc, getDocs, setDoc, collection, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { auth, db } from './firebase.js';

export const DEFAULT_POLICY = { network: '', breakGlassMinutes: 30, autoLogoutMinutes: 5 };

/** The saved access policy, or null when the admin has not saved one yet. */
export async function loadAccessPolicy() {
  const snap = await getDoc(doc(db, 'settings', 'accessPolicy'));
  if (!snap.exists()) return null;
  const { network, breakGlassMinutes, autoLogoutMinutes } = snap.data();
  return { ...DEFAULT_POLICY, network, breakGlassMinutes, autoLogoutMinutes };
}

export async function saveAccessPolicy(policy) {
  await setDoc(doc(db, 'settings', 'accessPolicy'), {
    network: policy.network,
    breakGlassMinutes: Number(policy.breakGlassMinutes),
    autoLogoutMinutes: Number(policy.autoLogoutMinutes),
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp(),
  });
}

/** This staff member's break-glass grants that are still running. */
export async function loadMyBreakGlass() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(query(collection(db, 'breakGlass'), where('uid', '==', uid)));
  const now = Date.now();
  return snap.docs
    .map((d) => d.data())
    .filter((g) => g.expiresAt?.toMillis?.() > now)
    .map((g) => ({ ref: g.endorsementId, reason: g.reason, note: g.note, expires: g.expiresAt.toMillis() }));
}

/** Opens full access to one record for this staff member, for the policy's number of minutes. */
export async function saveBreakGlass({ endorsementId, name, reason, note, minutes }) {
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, 'breakGlass', `${uid}_${endorsementId}`), {
    endorsementId,
    uid,
    name,
    reason,
    note,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + Number(minutes) * 60e3),
  });
}

// Access policy and break-glass grants saved in Firebase.
// The server reads the policy to decide what counts as the clinic network, and the
// Firestore rules read both before releasing full patient details.
import {
  doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, onSnapshot, serverTimestamp, Timestamp,
} from 'firebase/firestore';
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

/* ---------- break-glass ---------- */
// One record per staff member and endorsement: breakGlass/{staff uid}_{endorsement id}.
// It ends by itself at expiresAt. Ending it early sets expiresAt to the moment it ended.

/** Why a grant ended before its time limit. */
export const END_REASON = {
  signedOut: 'Signed out',
  timedOut: 'Timed out',
  newSession: 'Session ended',
  withdrawn: 'Privilege withdrawn',
};

const millis = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : null);

/** A grant as the screens use it. */
function fromDoc(d) {
  const g = d.data();
  const expires = millis(g.expiresAt) ?? 0;
  const minutes = g.minutes ?? 30;
  return {
    id: d.id,
    uid: g.uid,
    ref: g.endorsementId,
    by: g.name,
    reason: g.reason,
    note: g.note,
    minutes,
    // createdAt is empty for a moment while the server fills it in.
    ms: millis(g.createdAt) ?? expires - minutes * 60e3,
    expires,
    status: g.status || 'New',
    reviewNote: g.reviewNote || '',
    endedAt: millis(g.endedAt),
    endReason: g.endReason || '',
  };
}

const newestFirst = (list) => list.sort((a, b) => b.ms - a.ms);

/** Opens full access to one record for this staff member, for the policy's number of minutes. */
export async function saveBreakGlass({ endorsementId, name, reason, note, minutes }) {
  const uid = auth.currentUser.uid;
  await setDoc(doc(db, 'breakGlass', `${uid}_${endorsementId}`), {
    endorsementId,
    uid,
    name,
    reason,
    note,
    minutes: Number(minutes),
    status: 'New',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + Number(minutes) * 60e3),
  });
}

/** Staff: live list of my own grants (so an early end by the admin applies at once). */
export function watchMyBreakGlass(onGrants, onError) {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  return onSnapshot(
    query(collection(db, 'breakGlass'), where('uid', '==', uid)),
    (snap) => onGrants(newestFirst(snap.docs.map(fromDoc))),
    onError,
  );
}

/** Admin: live list of every grant. New ones arrive the moment a staff member confirms. */
export function watchAllBreakGlass(onGrants, onError) {
  return onSnapshot(
    collection(db, 'breakGlass'),
    (snap) => onGrants(newestFirst(snap.docs.map(fromDoc))),
    onError,
  );
}

/** Ends the running grants of one staff member. Returns the endorsement ids that were ended. */
async function endRunning(uid, endReason) {
  const snap = await getDocs(query(collection(db, 'breakGlass'), where('uid', '==', uid)));
  const running = snap.docs.filter((d) => (millis(d.data().expiresAt) ?? 0) > Date.now());
  const results = await Promise.allSettled(running.map((d) => updateDoc(d.ref, {
    expiresAt: serverTimestamp(),
    endedAt: serverTimestamp(),
    endReason,
  })));
  return running.filter((_, i) => results[i].status === 'fulfilled').map((d) => d.data().endorsementId);
}

/** Staff: ends my own running grants (on sign-out, time-out or a new sign-in). */
export async function endMyBreakGlass(endReason) {
  const uid = auth.currentUser?.uid;
  return uid ? endRunning(uid, endReason) : [];
}

/** Admin: marks a grant as reviewed or flagged. */
export async function reviewBreakGlass(id, status, reviewNote) {
  await updateDoc(doc(db, 'breakGlass', id), {
    status,
    reviewNote,
    reviewedBy: auth.currentUser.uid,
    reviewedAt: serverTimestamp(),
  });
}

/**
 * Admin: withdraws or restores a staff member's break-glass privilege.
 * Withdrawing also ends any access they have open right now.
 * Returns the endorsement ids whose access was ended.
 */
export async function setBreakGlassPrivilege(userId, allowed, note) {
  await updateDoc(doc(db, 'users', userId), {
    breakGlassAllowed: allowed,
    breakGlassNote: allowed ? '' : note,
  });
  return allowed ? [] : endRunning(userId, END_REASON.withdrawn);
}

/** Staff: whether my break-glass privilege is on, live. */
export function watchMyBreakGlassPrivilege(onAllowed, onError) {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => onAllowed(snap.exists() ? snap.data().breakGlassAllowed !== false : true),
    onError,
  );
}

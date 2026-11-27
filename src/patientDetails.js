// Patient details that only the owning agency, the clinic admin and clinic staff on the
// clinic network (or with break-glass access) may receive. They are saved separately in
// patientDetails/{endorsement id}, so the Firestore rules can refuse them outside the clinic.
export const PRIVATE_FIELDS = ['contact', 'email', 'birthday', 'age', 'address', 'position', 'vessel', 'repatriation', 'referral'];

/** Splits a new endorsement into the part every clinic user may read and the private part. */
export function splitEndorsement(data) {
  const open = { ...data };
  const details = {};
  for (const k of PRIVATE_FIELDS) {
    if (k in open) details[k] = open[k];
    delete open[k];
  }
  return { open, details };
}

/** Removes any private field from a record (used before merging in what the rules allowed). */
export function withoutDetails(e) {
  const out = { ...e };
  for (const k of PRIVATE_FIELDS) delete out[k];
  return out;
}

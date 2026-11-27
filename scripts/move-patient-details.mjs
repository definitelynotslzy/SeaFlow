// One-time move: takes the private patient details out of each endorsement and puts them in
// patientDetails/{same id}, so clinic staff outside the clinic network never receive them.
//
// Run from the project folder:
//   node scripts/move-patient-details.mjs "C:\path\to\service-account.json"
// Safe to run more than once: records that were already moved are skipped.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Keep this list the same as PRIVATE_FIELDS in src/patientDetails.js.
const PRIVATE_FIELDS = ['contact', 'email', 'birthday', 'age', 'address', 'position', 'vessel', 'repatriation', 'referral'];

const keyFile = process.argv[2];
if (!keyFile) {
  console.error('Give the path to the service account JSON file, e.g. node scripts/move-patient-details.mjs C:\\Users\\me\\Downloads\\key.json');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(readFileSync(keyFile, 'utf8'))) });
const db = getFirestore();

const snapshot = await db.collection('endorsements').get();
let moved = 0;
for (const docSnap of snapshot.docs) {
  const data = docSnap.data();
  const present = PRIVATE_FIELDS.filter((k) => k in data);
  if (!present.length) continue;

  const details = Object.fromEntries(present.map((k) => [k, data[k]]));
  const removals = Object.fromEntries(present.map((k) => [k, FieldValue.delete()]));
  const batch = db.batch();
  batch.set(db.collection('patientDetails').doc(docSnap.id), { ...details, agencyId: data.agencyId }, { merge: true });
  batch.update(docSnap.ref, removals);
  await batch.commit();
  moved += 1;
}
console.log(`Checked ${snapshot.size} endorsements. Moved details out of ${moved}.`);

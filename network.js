// POST /api/network
// Checks whether the signed-in clinic user is on the clinic network, using the public IP
// address the request came from. When they are, it saves a short-lived "network pass"
// that the Firestore rules require before full patient details can be read.
import { adminAuth, adminDb, Timestamp } from './_firebaseAdmin.js';
import { networkCheck } from './_networkCheck.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const db = adminDb();
    const result = await networkCheck(req, {
      verifyToken: async (token) => (await adminAuth().verifyIdToken(token, true)).uid,
      getDoc: async (path) => {
        const snap = await db.doc(path).get();
        return snap.exists ? snap.data() : null;
      },
      setDoc: (path, data) => db.doc(path).set(data),
      deleteDoc: (path) => db.doc(path).delete(),
      timestamp: (ms) => Timestamp.fromMillis(ms),
      envNetwork: process.env.CLINIC_NETWORK || '',
    });
    if (result.status === 405) res.setHeader('Allow', 'POST');
    res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Network check failed:', error);
    // Fail closed: when the check cannot run, nobody gets the full view.
    res.status(500).json({ inside: false, error: 'The clinic network check is not set up correctly.' });
  }
}

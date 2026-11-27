// The clinic network check itself. api/network.js connects it to Firebase.
import { callerIp, inNetwork, parseNetwork } from './_ipMatch.js';

// How long one successful check lets a staff member read full patient details.
// The browser checks again every 2 minutes, so leaving the clinic ends full access within minutes.
export const PASS_MINUTES = 5;

/**
 * deps: verifyToken(token) -> uid, getDoc(path) -> data or null,
 *       setDoc(path, data), deleteDoc(path), timestamp(ms), envNetwork
 */
export async function networkCheck(req, deps) {
  if (req.method !== 'POST') return { status: 405, body: { error: 'Use POST.' } };

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { status: 401, body: { error: 'Sign in first.' } };

  let uid;
  try {
    uid = await deps.verifyToken(token);
  } catch {
    return { status: 401, body: { error: 'Your session has expired. Sign in again.' } };
  }

  const pass = `networkPasses/${uid}`;
  const user = await deps.getDoc(`users/${uid}`);
  const clinicUser = !!user && ['admin', 'staff'].includes(user.role) && user.status === 'Active';
  if (!clinicUser) {
    // Manning agencies are always outside the clinic.
    await deps.deleteDoc(pass);
    return { status: 200, body: { inside: false, clinicUser: false } };
  }

  const ip = callerIp(req.headers);
  const policy = await deps.getDoc('settings/accessPolicy');
  const ranges = parseNetwork(policy?.network ?? deps.envNetwork);
  // Anything that is not the clinic's own address is outside: mobile data, home Wi-Fi, VPNs, proxies.
  const inside = inNetwork(ip, ranges);
  const now = Date.now();

  if (inside) {
    await deps.setDoc(pass, {
      ip,
      checkedAt: deps.timestamp(now),
      expiresAt: deps.timestamp(now + PASS_MINUTES * 60e3),
    });
  } else {
    await deps.deleteDoc(pass);
  }

  return {
    status: 200,
    body: { inside, clinicUser: true, ip, configured: ranges.length > 0, checkedAt: now, passMinutes: PASS_MINUTES },
  };
}

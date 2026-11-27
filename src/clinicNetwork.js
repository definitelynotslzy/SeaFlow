// Asks the server (api/network.js) whether this device is on the clinic network.
// The server decides from the public IP address the request came from; the browser
// cannot change the answer.
import { auth } from './firebase.js';

export async function checkClinicNetwork() {
  const user = auth.currentUser;
  if (!user) return { inside: false };
  const token = await user.getIdToken();
  const response = await fetch('/api/network', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `The network check failed (${response.status}).`);
  return body;
}

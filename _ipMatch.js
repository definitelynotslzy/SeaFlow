// Matching a visitor's public IP address against the clinic network.
// Files in /api whose names start with "_" are helpers, not web addresses.

/** "203.0.113.24" -> 3405803800n, or null. */
function v4(text) {
  const parts = String(text).split('.');
  if (parts.length !== 4) return null;
  let n = 0n;
  for (const p of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(p) || Number(p) > 255) return null;
    n = (n << 8n) + BigInt(p);
  }
  return n;
}

/** "2001:db8::1" -> BigInt, or null. */
function v6(text) {
  text = String(text).toLowerCase();
  if (!/^[0-9a-f:]+$/.test(text) || text.includes(':::')) return null;
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const groups = halves.length === 2 ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.reduce((n, g) => (n << 16n) + BigInt(parseInt(g, 16)), 0n);
}

/** Turns an address into { bits, value }. "::ffff:1.2.3.4" counts as the IPv4 address 1.2.3.4. */
export function parseIp(text) {
  const t = String(text || '').trim().replace(/^\[|\]$/g, '');
  const mapped = t.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const four = v4(mapped ? mapped[1] : t);
  if (four !== null) return { bits: 32, value: four };
  const six = v6(t);
  return six !== null ? { bits: 128, value: six } : null;
}

// Ranges that are never a clinic's public address (home routers, phone hotspots, carrier NAT, and so on).
const PRIVATE = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.168.0.0/16',
  '::/128', '::1/128', 'fc00::/7', 'fe80::/10',
];

// The narrowest a range may be: anything wider could take in other customers of the same internet provider.
export const WIDEST = { 32: 24, 128: 48 };

function parseRange(entry) {
  const [address, prefix, extra] = String(entry).trim().split('/');
  if (extra !== undefined) return null;
  const ip = parseIp(address);
  if (!ip) return null;
  const size = prefix === undefined ? ip.bits : /^\d{1,3}$/.test(prefix) ? Number(prefix) : NaN;
  if (!(size >= 0 && size <= ip.bits)) return null;
  const shift = BigInt(ip.bits - size);
  return { bits: ip.bits, size, start: (ip.value >> shift) << shift, shift };
}

const inRange = (ip, r) => ip.bits === r.bits && (ip.value >> r.shift) << r.shift === r.start;
const PRIVATE_RANGES = PRIVATE.map(parseRange);
const isPrivate = (r) => PRIVATE_RANGES.some((p) => p.bits === r.bits && p.size <= r.size && inRange({ bits: r.bits, value: r.start }, p));

/** "203.0.113.24, 203.0.113.0/24" -> usable ranges. Private, too-wide and invalid entries are dropped. */
export function parseNetwork(value) {
  return String(value ?? '')
    .split(/[,\s]+/)
    .filter(Boolean)
    .map(parseRange)
    .filter((r) => r && r.size >= WIDEST[r.bits] && !isPrivate(r));
}

/** True only when the address is inside one of the clinic's ranges. */
export function inNetwork(address, ranges) {
  const ip = parseIp(address);
  return !!ip && ranges.some((r) => inRange(ip, r));
}

/**
 * The caller's public IP address as Vercel saw it. Vercel replaces these headers itself,
 * so a browser cannot fake them. (If the site ever moves off Vercel, check this again.)
 */
export function callerIp(headers) {
  const first = (v) => String(Array.isArray(v) ? v[0] : v || '').split(',')[0].trim();
  return first(headers['x-real-ip']) || first(headers['x-vercel-forwarded-for']) || first(headers['x-forwarded-for']) || '';
}

// Shared data validation for every SeaFlow form.
//
// Each "...Error" function returns a message, or '' when the value is fine.
// Each "clean..." / "normalize..." function returns the value as it should be saved.
// The "...Errors(form)" functions check a whole form and return { field: message }.
// Forms use them in the browser, and the Firebase service files run them again
// just before saving, so a form cannot skip them.

/* ------------------------------------------------------------------ */
/* Limits. Change a number here and every form follows.                */
/* ------------------------------------------------------------------ */

export const LIMITS = {
  name: { min: 2, max: 100 },
  address: { min: 10, max: 200 },
  email: { max: 254 },
  position: { min: 2, max: 50 },
  vessel: { min: 2, max: 60 },
  reason: { min: 5, max: 200 },          // reason for endorsement
  agencyName: { min: 3, max: 100 },
  username: { min: 3, max: 50 },
  password: { min: 8, max: 64 },
  statusReason: { min: 10, max: 300 },   // suspend, reject, deactivate
  note: { min: 10, max: 500 },           // break-glass note and review note
  otherNote: { min: 20 },                // break-glass note when the reason is "Other"
  network: { max: 200 },

  // To be confirmed by the group / the clinic:
  ageMin: 18,                            // youngest seafarer accepted
  ageMax: 70,                            // oldest seafarer accepted
  earliestRepatriation: '2000-01-01',
  repatriationFutureDays: 90,            // how far ahead a repatriation date may be
  visitWindowDays: 90,                   // how far ahead a clinic visit may be planned
  referralMaxMb: 5,
  reportMaxMb: 10,
  billingMaxMb: 10,
  codeMinutes: 10,                       // verification code lifetime
  codeAttempts: 5,                       // wrong codes allowed before a new code is needed
  resendSeconds: 60,                     // wait before another code can be sent
  signInAttempts: 5,                     // wrong passwords before the short pause
  signInPauseSeconds: 30,
};

export const RESERVED_USERNAMES = ['admin', 'staff', 'clinic', 'support', 'demo'];

/* ------------------------------------------------------------------ */
/* Normalizing                                                         */
/* ------------------------------------------------------------------ */

/** Trim and collapse repeated spaces. */
export const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

export const normalizeEmail = (value) => clean(value).toLowerCase();
export const normalizeUsername = (value) => clean(value).toLowerCase();

/**
 * Philippine mobile number as 09XXXXXXXXX. Spaces, dashes, dots and brackets
 * are dropped, and +63 9xx / 63 9xx are converted. Returns '' when it is not
 * a complete mobile number.
 */
export function normalizeMobile(value) {
  const typed = String(value ?? '').trim();
  if (/[^0-9+\s().-]/.test(typed)) return '';
  let digits = typed.replace(/[\s().-]/g, '');
  if (/^\+639\d{9}$/.test(digits)) digits = `0${digits.slice(3)}`;
  else if (/^639\d{9}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return /^09\d{9}$/.test(digits) ? digits : '';
}

/** Compare names without caring about case, spacing or punctuation. */
export const sameText = (a, b) => keyOf(a) === keyOf(b);
const keyOf = (value) => clean(value).toLowerCase().replace(/[.,'’-]/g, '');

/** "Pacific Crew Manning, Inc." and "pacific crew manning" give the same key. */
export function agencyKey(name) {
  return clean(name)
    .toLowerCase()
    .replace(/[.,'’&()-]/g, ' ')
    .replace(/\b(incorporated|inc|corporation|corp|company|co|ltd|limited|phils?|philippines)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Today in the user's own time zone, as YYYY-MM-DD. */
export const todayISO = () => iso(new Date());

export function addDays(dateISO, days) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return iso(new Date(y, m - 1, d + days));
}

/** True for a real calendar date written as YYYY-MM-DD (so 2025-02-30 fails). */
export function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Age in whole years on today's date, or '' when the birthday is not usable. */
export function ageFrom(birthday) {
  if (!isDate(birthday) || birthday > todayISO()) return '';
  const [y, m, d] = birthday.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return String(age);
}

/* ------------------------------------------------------------------ */
/* Single-field rules                                                  */
/* ------------------------------------------------------------------ */

const REQUIRED = 'This field is required.';
const LETTER = /\p{L}/u;
const letters = (value) => (String(value).match(/\p{L}/gu) || []).length;

/** People's names: letters (including Ñ), spaces, hyphens, apostrophes and periods. */
export function nameError(value) {
  const v = clean(value);
  if (!v) return REQUIRED;
  if (/\d/.test(v)) return 'A name cannot contain numbers.';
  if (!/^[\p{L}\s.'’-]+$/u.test(v)) return 'Use letters only. Spaces, hyphens, apostrophes and periods are allowed.';
  if (letters(v) < LIMITS.name.min) return `Enter the full name (at least ${LIMITS.name.min} letters).`;
  if (v.length > LIMITS.name.max) return `Keep the name within ${LIMITS.name.max} characters.`;
  return '';
}

export function birthdayError(value) {
  if (!value) return REQUIRED;
  if (!isDate(value)) return 'Enter a real date.';
  if (value > todayISO()) return 'The birthday cannot be in the future.';
  const age = Number(ageFrom(value));
  if (age < LIMITS.ageMin) return `The seafarer must be at least ${LIMITS.ageMin} years old.`;
  if (age > LIMITS.ageMax) return `Check the birth year. The age must be ${LIMITS.ageMax} or below.`;
  return '';
}

export function addressError(value) {
  const v = clean(value);
  if (!v) return REQUIRED;
  if (v.length < LIMITS.address.min) return `Enter the complete address (at least ${LIMITS.address.min} characters).`;
  if (v.length > LIMITS.address.max) return `Keep the address within ${LIMITS.address.max} characters.`;
  if (letters(v) < 3) return 'Enter a real address with the street, barangay or city name.';
  return '';
}

// name@domain.tld: no dot at either end of the name, no double dots, and the
// part after the last dot must be at least two letters.
const EMAIL = /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

// Well-known providers and the only endings they use, to catch cut-off or
// mistyped endings that still look valid, such as "gmail.co" and "gmail.con".
const PROVIDERS = {
  gmail: ['gmail.com'],
  yahoo: ['yahoo.com', 'yahoo.com.ph'],
  ymail: ['ymail.com'],
  outlook: ['outlook.com', 'outlook.ph'],
  hotmail: ['hotmail.com'],
  icloud: ['icloud.com'],
};

// Common misspellings of those providers.
const MISSPELLED = {
  gmial: 'gmail.com', gmai: 'gmail.com', gamil: 'gmail.com', gnail: 'gmail.com', gmal: 'gmail.com',
  gmaill: 'gmail.com', gmil: 'gmail.com', yaho: 'yahoo.com', yahooo: 'yahoo.com', yhoo: 'yahoo.com',
  hotmial: 'hotmail.com', hotmal: 'hotmail.com', hotmai: 'hotmail.com',
  outlok: 'outlook.com', outloook: 'outlook.com', outlock: 'outlook.com', iclod: 'icloud.com', icoud: 'icloud.com',
};

export function emailError(value) {
  const email = clean(value);
  if (!email) return REQUIRED;
  if (email.length > LIMITS.email.max) return `Keep the email address within ${LIMITS.email.max} characters.`;
  if (!EMAIL.test(email) || email.includes('..')) {
    return 'Enter a complete email address, for example name@gmail.com.';
  }
  const [name, host] = email.split('@');
  const domain = host.toLowerCase();
  const first = domain.split('.')[0];
  if (MISSPELLED[first]) return `Check the spelling. Did you mean ${name}@${MISSPELLED[first]}?`;
  const endings = PROVIDERS[first];
  if (endings && !endings.includes(domain)) {
    return `This email address looks incomplete. Did you mean ${name}@${endings[0]}?`;
  }
  return '';
}

export function mobileError(value) {
  const typed = String(value ?? '').trim();
  if (!typed) return REQUIRED;
  if (/[^0-9+\s().-]/.test(typed)) return 'Use numbers only in the contact number.';
  if (!normalizeMobile(typed)) return 'Enter a complete mobile number: 11 digits starting with 09.';
  return '';
}

/** Seafarer position: letters and digits, so "3rd Officer" works. */
export function positionError(value) {
  const v = clean(value);
  if (!v) return REQUIRED;
  if (!/^[\p{L}\d\s./&-]+$/u.test(v)) return 'Use letters and numbers only.';
  if (!LETTER.test(v) || v.length < LIMITS.position.min) return `Enter the position (at least ${LIMITS.position.min} characters).`;
  if (v.length > LIMITS.position.max) return `Keep the position within ${LIMITS.position.max} characters.`;
  return '';
}

/** Job title of an agency contact: letters only. */
export function titleError(value) {
  const v = clean(value);
  if (!v) return REQUIRED;
  if (/\d/.test(v)) return 'A position cannot contain numbers.';
  if (!/^[\p{L}\s.'’/&-]+$/u.test(v)) return 'Use letters only.';
  if (letters(v) < LIMITS.position.min) return `Enter the position (at least ${LIMITS.position.min} letters).`;
  if (v.length > LIMITS.position.max) return `Keep the position within ${LIMITS.position.max} characters.`;
  return '';
}

export function vesselError(value) {
  const v = clean(value);
  if (!v) return REQUIRED;
  if (!/^[\p{L}\d\s.'’-]+$/u.test(v)) return 'Use letters, numbers, spaces, hyphens, periods and apostrophes only.';
  if (!LETTER.test(v)) return 'Enter the name of the ship, not only numbers or symbols.';
  if (v.length < LIMITS.vessel.min) return `Enter the vessel name (at least ${LIMITS.vessel.min} characters).`;
  if (v.length > LIMITS.vessel.max) return `Keep the vessel name within ${LIMITS.vessel.max} characters.`;
  return '';
}

export function repatriationError(value) {
  if (!value) return REQUIRED;
  if (!isDate(value)) return 'Enter a real date.';
  if (value < LIMITS.earliestRepatriation) return 'Check the year of the repatriation date.';
  if (value > addDays(todayISO(), LIMITS.repatriationFutureDays)) {
    return `The repatriation date cannot be more than ${LIMITS.repatriationFutureDays} days from today.`;
  }
  return '';
}

export function visitDateError(value, repatriation) {
  if (!value) return REQUIRED;
  if (!isDate(value)) return 'Enter a real date.';
  if (value < todayISO()) return 'Choose today or a later date.';
  if (value > addDays(todayISO(), LIMITS.visitWindowDays)) {
    return `Choose a date within the next ${LIMITS.visitWindowDays} days.`;
  }
  if (isDate(repatriation) && value < repatriation) return 'The clinic visit cannot be before the repatriation date.';
  return '';
}

/** A short free-text field that must say something: used for the reason for endorsement. */
export function reasonError(value) {
  const v = clean(value);
  if (!v) return REQUIRED;
  if (v.length < LIMITS.reason.min || letters(v) < 3) return `Describe the reason in at least ${LIMITS.reason.min} characters.`;
  if (v.length > LIMITS.reason.max) return `Keep the reason within ${LIMITS.reason.max} characters.`;
  return '';
}

/**
 * Reasons and notes typed by clinic users (suspend, reject, deactivate,
 * break-glass). `what` names the thing in the message, e.g. "reason".
 */
export function noteError(value, { min = LIMITS.note.min, max = LIMITS.note.max, what = 'note' } = {}) {
  const v = clean(value);
  if (!v) return `A ${what} is required.`;
  if (v.length < min || letters(v) < 3) return `Explain a little more: the ${what} needs at least ${min} characters.`;
  if (v.length > max) return `Keep the ${what} within ${max} characters.`;
  return '';
}

export const statusReasonError = (value) =>
  noteError(value, { ...LIMITS.statusReason, what: 'reason' });

export function agencyNameError(value) {
  const v = clean(value);
  if (!v) return REQUIRED;
  if (letters(v) < LIMITS.agencyName.min) return `Enter the agency's full name (at least ${LIMITS.agencyName.min} letters).`;
  if (v.length > LIMITS.agencyName.max) return `Keep the agency name within ${LIMITS.agencyName.max} characters.`;
  return '';
}

export function usernameError(value) {
  const v = normalizeUsername(value);
  if (!v) return 'Enter a username.';
  if (v.length < LIMITS.username.min || v.length > LIMITS.username.max) {
    return `Use ${LIMITS.username.min} to ${LIMITS.username.max} characters.`;
  }
  if (!/^[a-z0-9._-]+$/.test(v)) return 'Use letters, numbers, dots, underscores or hyphens only.';
  if (!/^[a-z]/.test(v)) return 'Start the username with a letter.';
  if (RESERVED_USERNAMES.some((word) => v === word || v.split(/[._-]/).includes(word))) {
    return 'That username is reserved. Choose another one.';
  }
  return '';
}

/** `previous` is the current password when it is known, so the new one must differ. */
export function passwordError(value, { username = '', previous } = {}) {
  const v = String(value ?? '');
  if (!v) return 'Enter a password.';
  if (v.length < LIMITS.password.min) return `Use at least ${LIMITS.password.min} characters.`;
  if (v.length > LIMITS.password.max) return `Use at most ${LIMITS.password.max} characters.`;
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Include at least one letter and one number.';
  const user = normalizeUsername(username);
  if (user.length >= 3 && v.toLowerCase().includes(user)) return 'The password cannot contain the username.';
  if (previous !== undefined && v === previous) return 'Choose a password different from the current one.';
  return '';
}

export function confirmError(password, again) {
  if (!again) return 'Type the password again.';
  return password === again ? '' : 'The two passwords do not match.';
}

/** Keeps only digits: used so the verification code box cannot hold letters. */
export const digitsOnly = (value, max) => String(value ?? '').replace(/\D/g, '').slice(0, max);

export function codeError(value) {
  return /^\d{6}$/.test(String(value)) ? '' : 'Enter the 6-digit code.';
}

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

const TYPES = {
  pdf: { label: 'PDF', mime: ['application/pdf'], ext: ['pdf'] },
  jpg: { label: 'JPG', mime: ['image/jpeg'], ext: ['jpg', 'jpeg'] },
  png: { label: 'PNG', mime: ['image/png'], ext: ['png'] },
};

export const FILE_RULES = {
  referral: { types: ['pdf', 'jpg', 'png'], maxMb: LIMITS.referralMaxMb },
  report: { types: ['pdf', 'jpg', 'png'], maxMb: LIMITS.reportMaxMb },
  billing: { types: ['pdf'], maxMb: LIMITS.billingMaxMb },
};

/** The value for a file input's accept attribute. The browser treats it only as a hint. */
export const acceptOf = (rule) =>
  rule.types.flatMap((t) => [...TYPES[t].mime, ...TYPES[t].ext.map((e) => `.${e}`)]).join(',');

/** Checks a picked file ({ name, size, type }) against a rule from FILE_RULES. */
export function fileError(file, rule) {
  if (!file) return 'Attach a file.';
  const labels = rule.types.map((t) => TYPES[t].label);
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)}` : labels[0];
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  const allowed = rule.types.some(
    // The file ending must match, and so must the file type when the browser reports one.
    (t) => TYPES[t].ext.includes(ext) && (!file.type || TYPES[t].mime.includes(file.type)),
  );
  if (!allowed) return `Only ${list} files are accepted.`;
  if (!file.size) return 'That file is empty. Choose another file.';
  if (file.size > rule.maxMb * 1024 * 1024) return `That file is too large. The limit is ${rule.maxMb} MB.`;
  return '';
}

/* ------------------------------------------------------------------ */
/* Clinic network                                                      */
/* ------------------------------------------------------------------ */

function isIPv4(text) {
  const parts = text.split('.');
  return parts.length === 4 && parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

function isIPv6(text) {
  if (!/^[0-9a-fA-F:]+$/.test(text) || text.includes(':::')) return false;
  const halves = text.split('::');
  if (halves.length > 2) return false;
  const groups = halves.flatMap((h) => (h ? h.split(':') : []));
  if (!groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return false;
  return halves.length === 2 ? groups.length <= 7 : groups.length === 8;
}

function isNetworkEntry(entry) {
  const [address, prefix, extra] = entry.split('/');
  if (extra !== undefined) return false;
  const v4 = isIPv4(address);
  if (!v4 && !isIPv6(address)) return false;
  if (prefix === undefined) return true;
  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (v4 ? 32 : 128);
}

/** "203.0.113.24, 203.0.113.0/24" becomes ['203.0.113.24', '203.0.113.0/24']. */
export const networkEntries = (value) =>
  String(value ?? '').split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

export const normalizeNetwork = (value) => networkEntries(value).join(', ');

export function networkError(value) {
  const entries = networkEntries(value);
  if (!entries.length) return 'Enter at least one IP address or range for the clinic network.';
  if (String(value).length > LIMITS.network.max) return `Keep this within ${LIMITS.network.max} characters.`;
  const bad = entries.find((entry) => !isNetworkEntry(entry));
  if (bad) return `"${bad}" is not a valid IP address or range. Example: 203.0.113.24 or 203.0.113.0/24.`;
  return '';
}

/* ------------------------------------------------------------------ */
/* Whole forms                                                         */
/* ------------------------------------------------------------------ */

/** Drops the empty entries so "no errors" is an empty object. */
const only = (errors) => Object.fromEntries(Object.entries(errors).filter(([, message]) => message));

/** New endorsement: one check per field, so a form can run a single one on blur. */
export const ENDORSEMENT_RULES = {
  name: (f) => nameError(f.name),
  birthday: (f) => birthdayError(f.birthday),
  address: (f) => addressError(f.address),
  email: (f) => emailError(f.email),
  contact: (f) => mobileError(f.contact),
  position: (f) => positionError(f.position),
  vessel: (f) => vesselError(f.vessel),
  repatriation: (f) => repatriationError(f.repatriation),
  case: (f) => reasonError(f.case),
  visitDate: (f) => visitDateError(f.visitDate, f.repatriation),
  referral: (f) => (f.referral ? '' : 'Attach the referral letter.'),
};

export const endorsementErrors = (f) =>
  only(Object.fromEntries(Object.entries(ENDORSEMENT_RULES).map(([k, rule]) => [k, rule(f)])));

/** The endorsement as it should be saved. */
export function cleanEndorsement(f) {
  return {
    ...f,
    name: clean(f.name),
    age: Number(ageFrom(f.birthday)),
    address: clean(f.address),
    email: normalizeEmail(f.email),
    contact: normalizeMobile(f.contact),
    position: clean(f.position),
    vessel: clean(f.vessel),
    case: clean(f.case),
  };
}

/** Agency registration. */
export const AGENCY_RULES = {
  agencyName: (f) => agencyNameError(f.agencyName),
  address: (f) => addressError(f.address),
  authName: (f) => nameError(f.authName),
  authPosition: (f) => titleError(f.authPosition),
  authContact: (f) => mobileError(f.authContact),
  authEmail: (f) => emailError(f.authEmail),
  billName: (f) => nameError(f.billName),
  billPosition: (f) => titleError(f.billPosition),
  billContact: (f) => mobileError(f.billContact),
  billEmail: (f) => emailError(f.billEmail),
  username: (f) => usernameError(f.username),
  password: (f) => passwordError(f.password, { username: f.username }),
};

export const agencyRequestErrors = (f) =>
  only(Object.fromEntries(Object.entries(AGENCY_RULES).map(([k, rule]) => [k, rule(f)])));

/** Agency profile, Edit details. */
export const PROFILE_RULES = {
  address: (f) => addressError(f.address),
  authContact: (f) => mobileError(f.authContact),
  authEmail: (f) => emailError(f.authEmail),
  billContact: (f) => mobileError(f.billContact),
  billEmail: (f) => emailError(f.billEmail),
};

export const profileErrors = (f) =>
  only(Object.fromEntries(Object.entries(PROFILE_RULES).map(([k, rule]) => [k, rule(f)])));

export const cleanProfile = (f) => ({
  address: clean(f.address),
  authContact: normalizeMobile(f.authContact),
  authEmail: normalizeEmail(f.authEmail),
  billContact: normalizeMobile(f.billContact),
  billEmail: normalizeEmail(f.billEmail),
});

/** New clinic account. */
export const clinicAccountErrors = (f) => only({
  name: nameError(f.name),
  username: usernameError(f.username),
  password: passwordError(f.password, { username: f.username }),
});

/* ------------------------------------------------------------------ */
/* Friendly messages for Firebase errors                               */
/* ------------------------------------------------------------------ */

const FIREBASE_MESSAGES = {
  'auth/invalid-credential': 'Invalid username or password.',
  'auth/wrong-password': 'Invalid username or password.',
  'auth/user-not-found': 'Invalid username or password.',
  'auth/invalid-email': 'Invalid username or password.',
  'auth/user-disabled': 'This account has been disabled. Contact the clinic admin.',
  'auth/too-many-requests': 'Too many failed attempts. Please wait a few minutes before trying again.',
  'auth/network-request-failed': 'No internet connection. Check your connection and try again.',
  'auth/email-already-in-use': 'That username is already taken. Choose another one.',
  'auth/weak-password': 'That password is too weak. Use at least 8 characters with a letter and a number.',
  'auth/operation-not-allowed': 'Sign-in is not available right now. Contact the clinic admin.',
  'auth/requires-recent-login': 'Please sign in again to continue.',
  'permission-denied': 'You do not have permission to do that. Contact the clinic admin.',
  'unavailable': 'The service cannot be reached right now. Check your connection and try again.',
  'deadline-exceeded': 'That took too long. Please try again.',
  'not-found': 'That record no longer exists.',
};

/**
 * Plain-language message for an error. Our own errors (thrown with a normal
 * message and no Firebase code) pass through unchanged.
 */
export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  const code = error?.code;
  if (code && FIREBASE_MESSAGES[code]) return FIREBASE_MESSAGES[code];
  if (code || /firebase/i.test(error?.message || '')) return fallback;
  return error?.message || fallback;
}

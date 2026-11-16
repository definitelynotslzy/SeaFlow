// Shared checks for email addresses and Philippine mobile numbers.
// Each function returns an error message, or '' when the value is acceptable.

// name@domain.tld — the part after the last dot must be at least two letters,
// so "juan@gmail" and "juan@gmail.c" are rejected.
const EMAIL = /^[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

// Well-known providers and the only endings they use, to catch cut-off
// addresses that still look valid, such as "juan@gmail.co".
const PROVIDERS = {
  gmail: ['gmail.com'],
  yahoo: ['yahoo.com', 'yahoo.com.ph'],
  ymail: ['ymail.com'],
  outlook: ['outlook.com', 'outlook.ph'],
  hotmail: ['hotmail.com'],
  icloud: ['icloud.com'],
};

export function emailError(value) {
  const email = String(value).trim();
  if (!EMAIL.test(email) || email.includes('..')) {
    return 'Enter a complete email address, for example name@gmail.com.';
  }
  const [name, host] = email.split('@');
  const domain = host.toLowerCase();
  const endings = PROVIDERS[domain.split('.')[0]];
  if (endings && !endings.includes(domain)) {
    return `This email address looks incomplete. Did you mean ${name}@${endings[0]}?`;
  }
  return '';
}

// Accepts 09XXXXXXXXX (11 digits) or +639XXXXXXXXX. Spaces, dashes and
// brackets are allowed while typing and are ignored when counting digits.
export function mobileError(value) {
  const typed = String(value).trim();
  if (/[^0-9+\s()-]/.test(typed)) return 'Use numbers only in the contact number.';
  const digits = typed.replace(/[\s()-]/g, '');
  if (/^09\d{9}$/.test(digits) || /^\+639\d{9}$/.test(digits)) return '';
  return 'Enter a complete mobile number: 11 digits starting with 09, or +63 followed by 10 digits.';
}

// Central state for the SeaFlow prototype.
// Everything lives in memory (useReducer + context). Replace the reducer
// actions with API calls when a real backend is added.
import { createContext, useContext, useReducer, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { auth, db } from "./firebase.js";

/* ---------- constants ---------- */

export const CLOSED = [
  'Fit to Work',
  'Fit to Work with Disability',
  'Reach Maximum Medical Improvement',
  'Stop Treatment',
  'Expired',
];
export const IN_PROGRESS = ['Accepted', 'Treatment in Progress', 'Non-reporting Status'];
export const STATUSES = ['Pending', ...IN_PROGRESS, ...CLOSED];
// Statuses clinic staff can set when sending an update.
export const UPDATE_STATUSES = ['Treatment in Progress', 'Non-reporting Status', ...CLOSED];

export const ROLE_LABEL = { agency: 'Manning Agency', staff: 'Clinic Staff', admin: 'Clinic Admin' };
export const DEMO_PASSWORD = 'demo1234';

// What a Clinic Staff account is allowed to handle.
export const DUTIES = ['Endorsements and updates', 'Billing', 'Both'];

const HOUR = 3600e3;
const DAY = 24 * HOUR;
export const BILLING_WINDOW = 30 * DAY; // billing must reach the agency within 30 days

/* ---------- helpers ---------- */

export const dayOf = (ms) =>
  new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const stamp = (ms = Date.now()) =>
  `${dayOf(ms)} · ${new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;

/** "2026-11-16" -> "Nov 16, 2026" */
export const fmtDate = (iso) =>
  (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export const refOf = (n) => `SF-2026-${String(n).padStart(4, '0')}`;

export const agencyName = (state, id) =>
  state.firebaseAgencies?.[id]?.agencyName ??
  state.agencies.find((a) => a.id === id)?.name ??
  '—';

export const isClosed = (e) => CLOSED.includes(e.status);

/** Whole days until a deadline (negative when it has passed). */
export const daysLeft = (ms) => Math.ceil((ms - Date.now()) / DAY);

/**
 * The clinic visits of a case, oldest first.
 * A visit is a timeline entry holding the status set at that visit and its
 * medical report. Its billing statement is sent later, as a separate timeline
 * entry; the visit keeps a copy of the billing details so lists can show them.
 */
export const visitsOf = (e) => e.timeline.filter((t) => t.kind === 'visit');

/** Every clinic visit across all cases, as { e, v } pairs (for the billing lists). */
export const billingItems = (state) =>
  state.endorsements.flatMap((e) => visitsOf(e).map((v) => ({ e, v })));

/** Deadline for the billing statement of a visit that does not have one yet. */
export const billingDue = (v) => v.ms + BILLING_WINDOW;

/** Role-based access for clinic staff: what = 'updates' or 'billing'. */

export function can(session, what) {
  if (session?.role !== 'staff') return false;

  return ['updates', 'billing'].includes(what);
}


/** Alerts addressed to the signed-in user. */
export function myAlerts(state) {
  const s = state.session;
  if (!s) return [];
  const to = s.role === 'agency' ? `agency:${s.agencyId}` : s.role;
  return state.alerts.filter((a) => a.to === to);
}

/** True when the signed-in staff member has an unexpired break-glass grant. */
export function hasBreakGlass(state, id) {
  return state.breakGlass.some(
    (b) => b.ref === id && b.by === state.session?.name && b.expires > Date.now(),
  );
}

/* ---------- seed data (all fictional) ---------- */

function seed() {
  const NOW = Date.now();

  const agency = (id, name, address, status, authorized, billing, username, daysAgo) => ({
    id, name, address, status, authorized, billing, username,
    password: DEMO_PASSWORD,
    requestedMs: NOW - daysAgo * DAY,
  });
  const person = (name, position, contact, email) => ({ name, position, contact, email });

  const agencies = [
    agency('a1', 'Pacific Crew Manning Agency', 'Pacific Tower, Roxas Blvd., Manila', 'Active',
      person('Antonio Villar', 'President', '0917 555 0101', 'a.villar@pacificcrew.demo'),
      person('Marites Cruz', 'Medical Report & Billing Officer', '0917 555 0102', 'billing@pacificcrew.demo'),
      'agency.demo', 90),
    agency('a2', 'Harbor Crew Manning Agency', '2/F Port Area Bldg., Manila', 'Active',
      person('Lorna Diaz', 'General Manager', '0917 555 0111', 'l.diaz@harborcrew.demo'),
      person('Paolo Reyes', 'Billing Officer', '0917 555 0112', 'billing@harborcrew.demo'),
      'harbor.demo', 60),
    agency('a3', 'Blue Anchor Maritime Services', 'Anchor Plaza, Makati', 'Active',
      person('Grace Tan', 'Operations Head', '0917 555 0121', 'g.tan@blueanchor.demo'),
      person('Nico Ong', 'Billing Officer', '0917 555 0122', 'billing@blueanchor.demo'),
      'blueanchor.demo', 45),
    agency('a4', 'Northstar Crewing Inc.', 'Northstar Center, Pasay', 'Active',
      person('Victor Sy', 'President', '0917 555 0131', 'v.sy@northstar.demo'),
      person('Ana Lim', 'Billing Officer', '0917 555 0132', 'billing@northstar.demo'),
      'northstar.demo', 40),
    agency('a5', 'Island Spirit Crewing Corp.', '4/F Harbor Center, Roxas Blvd., Ermita, Manila', 'Pending',
      person('Carla Mendoza', 'General Manager', '0917 555 0188', 'carla.mendoza@islandspirit.demo'),
      person('Joy Lim', 'Billing Officer', '0917 555 0190', 'billing@islandspirit.demo'),
      'islandspirit', 0.5),
    agency('a6', 'Seabridge Crewing Corp.', 'Seabridge Bldg., Intramuros, Manila', 'Pending',
      person('Rey Dizon', 'Operations Director', '0917 555 0201', 'rey.dizon@seabridge.demo'),
      person('Mia Santos', 'Billing Officer', '0917 555 0202', 'billing@seabridge.demo'),
      'seabridge', 1.5),
  ];

  const user = (id, name, role, duty, username) => ({
    id, name, role, duty, username, status: 'Active', password: DEMO_PASSWORD,
  });
const users = [
  user('u1', 'R. Santos', 'Clinic Staff', 'Both', 'staff.demo'),
  user('u2', 'L. Garcia', 'Clinic Staff', 'Both', 'billing.demo'),
  user('u3', 'M. Reyes', 'Clinic Staff', 'Both', 'updates.demo'),
  user('u4', 'A. Gomez', 'Clinic Admin', null, 'admin.demo'),
];

  // Build one endorsement with a timeline that matches its status.
  const mk = (n, name, position, vessel, agencyId, status, hoursAgo, kase, extra = {}) => {
    const id = refOf(n);
    const receivedMs = NOW - hoursAgo * HOUR;
    const timeline = [{ label: 'Received', ms: receivedMs }];
    let turnaroundMin = null;
    // A clinic visit sets a status and sends its medical report. The billing
    // statement for the visit follows later as its own timeline entry.
    const visit = (no, label, ms, billedMs) => {
      const billing = billedMs ? `Billing_${id}_V${no}.pdf` : null;
      timeline.push({
        kind: 'visit', n: no, label, ms,
        report: `Medical_Report_${id}_V${no}.pdf`, reportBy: 'M. Reyes',
        billing, billingMs: billedMs || null, billingBy: billedMs ? 'L. Garcia' : null,
      });
      if (billedMs) {
        timeline.push({
          kind: 'billing', n: no, label: `Billing statement for clinic visit ${no}`,
          ms: billedMs, file: billing, by: 'L. Garcia',
        });
      }
    };
    if (status !== 'Pending') {
      turnaroundMin = 8 + (n % 5) * 4;
      timeline.push({ label: 'Accepted', ms: receivedMs + turnaroundMin * 60e3 });
      if (status !== 'Accepted') {
        if (CLOSED.includes(status)) {
          // Two visits: the first check-up, then the visit that closed the case.
          visit(1, 'Treatment in Progress', receivedMs + 2 * HOUR, receivedMs + 26 * HOUR);
          visit(2, status, receivedMs + 72 * HOUR, Math.min(receivedMs + 96 * HOUR, NOW - HOUR / 2));
        } else {
          // One visit so far; every second one still waits for its billing statement.
          const ms = Math.max(receivedMs + 2 * HOUR, NOW - ((n % 9) + 1) * DAY);
          visit(1, status, ms, n % 2 === 1 ? Math.min(ms + DAY, NOW - HOUR / 2) : null);
        }
      }
    }
    return {
      ref: id, name, position, vessel, agencyId, status, receivedMs, timeline, turnaroundMin,
      case: kase,
      birthday: `19${70 + (n % 28)}-0${1 + (n % 9)}-1${n % 9}`,
      age: 2026 - (1970 + (n % 28)),
      address: '123 Taft Ave., Malate, Manila',
      email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@mail.demo`,
      contact: `0917 000 ${String(n).padStart(4, '0')}`,
      repatriation: new Date(receivedMs - 4 * DAY).toISOString().slice(0, 10),
      visitDate: new Date(receivedMs + DAY).toISOString().slice(0, 10), // when the patient can come to the clinic
      referral: `Referral_Letter_${id}.pdf`,
      cashBasis: false,
      updateRequested: false,
      ...extra,
    };
  };

  // Make the latest visit of a case wait for its billing statement (for demo variety).
  const unsendBilling = (e) => {
    const last = visitsOf(e).at(-1);
    e.timeline = e.timeline.filter((t) => !(t.kind === 'billing' && t.n === last.n));
    Object.assign(last, { billing: null, billingMs: null, billingBy: null });
  };

  const named = [
    mk(142, 'Juan Dela Cruz', '3rd Officer', 'MV Pacific Star', 'a1', 'Accepted', 3, 'Chest pain'),
    mk(141, 'Maria Lopez', 'Bosun', 'MV Ocean Grace', 'a1', 'Pending', 30, 'Lower back pain'),
    mk(139, 'Ramon Garcia', 'Able Seaman', 'MV Harbor Line', 'a2', 'Pending', 4, 'Hand laceration'),
    mk(138, 'Joel Aquino', 'Oiler', 'MV Harbor Line', 'a2', 'Treatment in Progress', 52, 'Knee injury', { cashBasis: true }),
    mk(137, 'Dennis Cruz', 'Messman', 'MV Northstar Pioneer', 'a4', 'Non-reporting Status', 44, 'Hypertension'),
    mk(135, 'Carlo Mendoza', 'Chief Cook', 'MV Blue Anchor 3', 'a3', 'Treatment in Progress', 22, 'Burn, left forearm'),
    mk(134, 'Ella Mercado', '2nd Engineer', 'MV Northstar Pioneer', 'a4', 'Pending', 2, 'Eye irritation'),
    mk(133, 'Rico Bautista', 'Fitter', 'MV Harbor Line', 'a2', 'Pending', 6, 'Shoulder strain'),
    mk(132, 'Mark Villanueva', '2nd Mate', 'MV Ocean Grace', 'a3', 'Treatment in Progress', 9, 'Fractured wrist'),
    mk(130, 'Pedro Ramos', 'Oiler', 'MV Pacific Star', 'a1', 'Fit to Work', 150, 'Dermatitis'),
  ];
  unsendBilling(named[named.length - 1]); // Pedro Ramos: last visit still waits for billing

  // Older records for Pacific Crew so lists, paging and reports have volume.
  const first = ['Jose', 'Ana', 'Liza', 'Noel', 'Rosa', 'Arnel', 'Tina', 'Ben', 'Cora', 'Dino', 'Elmer', 'Faye'];
  const last = ['Navarro', 'Garcia', 'Santos', 'Reyes', 'Flores', 'Castro', 'Rivera', 'Torres', 'Ramos', 'Aquino'];
  const posts = ['Able Seaman', 'Bosun', 'Oiler', '3rd Engineer', 'Chief Cook', 'Messman', '2nd Mate', 'Fitter'];
  const ships = ['MV Pacific Star', 'MV Ocean Grace', 'MV Pacific Dawn', 'MV Coral Trader', 'MV Island Pearl', 'MV Pacific Voyager'];
  const cases = ['Back strain', 'Gastritis', 'Ankle sprain', 'Flu-like symptoms', 'Dental pain', 'Finger injury'];
  const cycle = ['Fit to Work', 'Fit to Work', 'Fit to Work', 'Treatment in Progress', 'Fit to Work',
    'Fit to Work with Disability', 'Fit to Work', 'Reach Maximum Medical Improvement', 'Fit to Work',
    'Stop Treatment', 'Expired', 'Non-reporting Status'];
  const filler = Array.from({ length: 119 }, (_, i) =>
    mk(1000 + i, `${first[i % first.length]} ${last[(i * 7) % last.length]}`, posts[i % posts.length],
      ships[i % ships.length], 'a1', cycle[i % cycle.length], 90 + i * 10, cases[i % cases.length]));
  unsendBilling(filler[100]); // one old visit whose billing is past the 30-day window

const endorsements = [];

  const juan = named[0];
  return {
    session: null,
    insideNetwork: false, // demo toggle: outside vs inside the clinic network
    policy: { network: '203.0.113.24', breakGlassMinutes: 30, autoLogoutMinutes: 5 },
    agencies,
    users,
    endorsements,
    nextRef: 143,
    alerts: [
      { id: 3, to: 'agency:a1', text: `${juan.ref} was accepted by the clinic.`, ms: juan.timeline[1].ms },
      { id: 2, to: 'staff', text: 'New endorsement from Harbor Crew Manning Agency.', ms: NOW - 4 * HOUR },
      { id: 1, to: 'admin', text: 'New agency access request from Island Spirit Crewing Corp.', ms: NOW - 12 * HOUR },
    ],
    breakGlass: [],
    // The audit log records clinic users only (staff and admin).
    audit: [
      { id: 2, who: 'R. Santos', role: 'Clinic Staff', action: 'Accepted endorsement', ref: juan.ref, ms: juan.timeline[1].ms, note: 'Patient: Juan Dela Cruz · Pacific Crew Manning Agency' },
      { id: 1, who: 'R. Santos', role: 'Clinic Staff', action: 'Viewed record', ref: juan.ref, ms: juan.timeline[1].ms - 60e3, note: 'Patient: Juan Dela Cruz' },
    ],
  };
}

/* ---------- reducer ---------- */

function reducer(s, a) {
  const me = a.type === 'login' ? a.session : s.session;
  const now = Date.now();

  // Agency activity is not written to the audit log.
  // `base` lets one action add several entries (a visit logs its report and its billing).
  const audit = (action, id = '—', note, base = s.audit) => {
    if (!me || me.role === 'agency') return base;
    return [
      { id: base.length + 1, who: me.name, role: ROLE_LABEL[me.role], action, ref: id, ms: now, note },
      ...base,
    ];
  };
  const alert = (list, to, text) => [{ id: list.length + 1, to, text, ms: now }, ...list];
  const patch = (id, fn) => s.endorsements.map((e) => (e.ref === id ? fn(e) : e));
  const find = (id) => s.endorsements.find((e) => e.ref === id);
  const userName = (id) => s.users.find((u) => u.id === id)?.name;

  switch (a.type) {

    case "setFirebaseAgencies":
  return {
    ...s,
    firebaseAgencies: a.agencies,
  };


case "setFirebaseEndorsements": {
  if (!s.session || s.session.role !== a.role) {
    return s;
  }

  if (
    a.role === "agency" &&
    s.session.agencyId !== a.agencyId
  ) {
    return s;
  }

  if (
    a.role !== "agency" &&
    !["admin", "staff"].includes(a.role)
  ) {
    return s;
  }

  return {
    ...s,
    endorsements: [
      ...s.endorsements.filter(
        (e) => e.source !== "firebase"
      ),
      ...a.endorsements.map((e) => ({
        ...e,
        source: "firebase",
      })),
    ].sort((a, b) => b.receivedMs - a.receivedMs),
  };
}


case 'login':
  return {
    ...s,
    session: a.session,
    endorsements: s.endorsements.filter(
      (e) => e.source !== "firebase"
    ),
    audit: audit('Signed in'),
  };

case 'logout':
  return {
    ...s,
    session: null,
    firebaseAgencies: {},
    insideNetwork: false,
    endorsements: s.endorsements.filter(
      (e) => e.source !== "firebase"
    ),
  };

    case 'toggleNetwork':
      return { ...s, insideNetwork: !s.insideNetwork };

    /* ----- manning agency ----- */
    case 'registerAgency': {
      const f = a.form;
      const item = {
        id: `a${s.agencies.length + 1}`,
        name: f.agencyName, address: f.address, status: 'Pending',
        authorized: { name: f.authName, position: f.authPosition, contact: f.authContact, email: f.authEmail },
        billing: { name: f.billName, position: f.billPosition, contact: f.billContact, email: f.billEmail },
        username: f.username, password: f.password,
        requestedMs: now,
      };
      return {
        ...s,
        agencies: [...s.agencies, item],
        alerts: alert(s.alerts, 'admin', `New agency access request from ${item.name}.`),
      };
    }

    // Agency "forgot password": runs after the verification code was confirmed.
    case 'resetAgencyPassword':
      return {
        ...s,
        agencies: s.agencies.map((g) => (g.username === a.username ? { ...g, password: a.password } : g)),
      };

    case 'updateAgencyContacts':
      return {
        ...s,
        agencies: s.agencies.map((g) =>
          g.id === a.id
            ? { ...g, address: a.address, authorized: { ...g.authorized, ...a.authorized }, billing: { ...g.billing, ...a.billing } }
            : g),
      };

    case 'submitEndorsement': {
      const id = refOf(s.nextRef);
      const item = {
        ...a.form, ref: id, agencyId: me.agencyId, status: 'Pending', receivedMs: now,
        timeline: [{ label: 'Received', ms: now }],
        turnaroundMin: null, cashBasis: false, updateRequested: false,
      };
      return {
        ...s,
        nextRef: s.nextRef + 1,
        endorsements: [item, ...s.endorsements],
        alerts: alert(s.alerts, 'staff', `New endorsement from ${agencyName(s, me.agencyId)}.`),
      };
    }

    case 'requestUpdate':
      return {
        ...s,
        endorsements: patch(a.id, (e) => ({ ...e, updateRequested: true })),
        alerts: alert(s.alerts, 'staff', `Medical update requested for ${a.id}.`),
      };

    /* ----- clinic staff ----- */
    case 'accept': {
      const e = find(a.id);
      return {
        ...s,
        endorsements: patch(a.id, (x) => ({
          ...x, status: 'Accepted', cashBasis: !!a.cash,
          turnaroundMin: Math.max(1, Math.round((now - x.receivedMs) / 60e3)),
          timeline: [...x.timeline, { label: 'Accepted', ms: now }],
        })),
        alerts: alert(s.alerts, `agency:${e.agencyId}`, `${a.id} was accepted by the clinic${a.cash ? ' on a cash basis' : ''}.`),
        audit: audit('Accepted endorsement', a.id,
          `Patient: ${e.name} · ${agencyName(s, e.agencyId)}${a.cash ? ' · Cash basis (self-pay)' : ''}`),
      };
    }

    // A clinic visit: the new status and its medical report.
    // The billing statement is not sent with it; billing staff send it later.
    case 'recordVisit': {
      const e = find(a.id);
      const n = visitsOf(e).length + 1;
      const entry = {
        kind: 'visit', n, label: a.status, ms: now,
        report: a.report, reportBy: me.name,
        billing: null, billingMs: null, billingBy: null,
      };
      return {
        ...s,
        endorsements: patch(a.id, (x) => ({
          ...x, status: a.status, updateRequested: false, timeline: [...x.timeline, entry],
        })),
        alerts: alert(s.alerts, `agency:${e.agencyId}`,
          `Clinic visit ${n} for ${a.id} (${a.status}): medical report received. The billing statement will follow.`),
        audit: audit('Submitted medical report', a.id,
          `File: ${a.report} · Clinic visit ${n} · Status: ${a.status} · Patient: ${e.name} · Sent to ${agencyName(s, e.agencyId)}`),
      };
    }

    // The billing statement of a visit, sent after the medical report.
    // It appears in the timeline as its own entry, at the time it was sent.
    case 'sendBilling': {
      const e = find(a.id);
      const contact = s.agencies.find((g) => g.id === e.agencyId).billing;
      return {
        ...s,
        endorsements: patch(a.id, (x) => ({
          ...x,
          timeline: [
            ...x.timeline.map((t) =>
              (t.kind === 'visit' && t.n === a.n ? { ...t, billing: a.file, billingMs: now, billingBy: me.name } : t)),
            { kind: 'billing', n: a.n, label: `Billing statement for clinic visit ${a.n}`, ms: now, file: a.file, by: me.name },
          ],
        })),
        alerts: alert(s.alerts, `agency:${e.agencyId}`, `Billing statement for clinic visit ${a.n} received (${a.id}).`),
        audit: audit('Submitted billing statement', a.id,
          `File: ${a.file} · Clinic visit ${a.n} · Patient: ${e.name} · Sent to ${contact.name}, ${agencyName(s, e.agencyId)}`),
      };
    }

    case 'logView':
      return { ...s, audit: audit('Viewed record', a.id, `Patient: ${find(a.id)?.name}`) };

    case 'breakGlass': {
      const minutes = s.policy.breakGlassMinutes;
      return {
        ...s,
        breakGlass: [
          { id: s.breakGlass.length + 1, ref: a.id, by: me.name, reason: a.reason, note: a.note, ms: now, minutes, expires: now + minutes * 60e3, status: 'New' },
          ...s.breakGlass,
        ],
        alerts: alert(s.alerts, 'admin', `Break-glass request by ${me.name} on ${a.id}.`),
        audit: audit('Break-glass', a.id, `Patient: ${find(a.id)?.name} · Reason: ${a.reason} · ${a.note}`),
      };
    }

    /* ----- clinic admin ----- */
    case 'reviewBreakGlass':
      return {
        ...s,
        breakGlass: s.breakGlass.map((b) => (b.id === a.id ? { ...b, status: a.status, reviewNote: a.note } : b)),
        audit: audit(a.status === 'Flagged' ? 'Flagged break-glass' : 'Reviewed break-glass', s.breakGlass.find((b) => b.id === a.id)?.ref, a.note || undefined),
      };

    // Approve, reject, suspend or reactivate an agency. Reject and suspend carry a reason.
    case 'agencyStatus':
      return {
        ...s,
        agencies: s.agencies.map((g) => (g.id === a.id ? { ...g, status: a.status, statusReason: a.reason || null } : g)),
        audit: audit(`Agency ${a.verb}`, '—', `${agencyName(s, a.id)}${a.reason ? ` · Reason: ${a.reason}` : ''}`),
      };

    // The admin creates clinic accounts directly; there is no self-registration for staff.
    case 'addUser':
      return {
        ...s,
        users: [
          ...s.users,
          {
            id: `u${s.users.length + 1}`, name: a.name, username: a.username, password: a.password,
            role: a.role,
duty: a.role === 'Clinic Staff' ? 'Both' : null,
status: 'Active',
          },
        ],
        audit: audit('Created account', '—', `${a.name} · ${a.role}${a.role === 'Clinic Staff' ? ` · ${a.duty}` : ''}`),
      };

    case 'setUser':
      return {
        ...s,
        users: s.users.map((u) => (u.id === a.id ? { ...u, ...a.patch } : u)),
        audit: audit(a.verb, '—', `${userName(a.id)}${a.note ? ` · ${a.note}` : ''}`),
      };

    case 'resetUser':
      return {
        ...s,
        users: s.users.map((u) => (u.id === a.id ? { ...u, password: a.password } : u)),
        audit: audit('Reset password', '—', userName(a.id)),
      };

    case 'savePolicy':
      return { ...s, policy: a.policy, audit: audit('Updated access policy') };

    default:
      return s;
  }
}

/* ---------- context ---------- */

const StoreCtx = createContext(null);



export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, seed);
  const [authReady, setAuthReady] = useState(false);




useEffect(() => {
  if (!authReady || !state.session) return;

  const session = state.session;
  const isAgency = session.role === "agency";
  const currentUid = auth.currentUser?.uid;

  if (isAgency && !session.agencyId) return;

  let cancelled = false;
  let requestVersion = 0;

  const q = isAgency
    ? query(
        collection(db, "endorsements"),
        where("agencyId", "==", session.agencyId)
      )
    : query(collection(db, "endorsements"));

  const unsubscribe = onSnapshot(
    q,
    async (snapshot) => {
      const version = ++requestVersion;

      const endorsements = snapshot.docs.map((document) => ({
        ...document.data(),
        ref: document.id,
      }));

      if (cancelled || auth.currentUser?.uid !== currentUid) {
        return;
      }

      dispatch({
        type: "setFirebaseEndorsements",
        agencyId: isAgency ? session.agencyId : null,
        role: session.role,
        endorsements,
      });

      const agencyIds = [
        ...new Set(
          endorsements.map((e) => e.agencyId).filter(Boolean)
        ),
      ];

      const profiles = await Promise.all(
        agencyIds.map(async (id) => {
          try {
            const agencySnapshot = await getDoc(
              doc(db, "agencyRequests", id)
            );

            return agencySnapshot.exists()
              ? [id, agencySnapshot.data()]
              : null;
          } catch (error) {
            console.error("Agency profile load failed:", id, error);
            return null;
          }
        })
      );

      if (
        cancelled ||
        version !== requestVersion ||
        auth.currentUser?.uid !== currentUid
      ) {
        return;
      }

      dispatch({
        type: "setFirebaseAgencies",
        agencies: Object.fromEntries(
          profiles.filter(Boolean)
        ),
      });
    },
    (error) => {
      console.error("Unable to load endorsements:", error);
    }
  );

  return () => {
    cancelled = true;
    unsubscribe();
  };
}, [
  authReady,
  state.session?.role,
  state.session?.agencyId,
  state.session?.userId,
]);







useEffect(() => {
  let cancelled = false;

  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    if (!user) {
      if (!cancelled) {
        dispatch({ type: "logout" });
        setAuthReady(true);
      }
      return;
    }

    try {
      // Check Clinic Admin / Staff first.
      const clinicSnapshot = await getDoc(
        doc(db, "users", user.uid)
      );

      if (clinicSnapshot.exists()) {
        const profile = clinicSnapshot.data();

        if (
          !["admin", "staff"].includes(profile.role) ||
          profile.status !== "Active"
        ) {
          throw new Error("Unauthorized clinic account.");
        }

        if (!cancelled && auth.currentUser?.uid === user.uid) {
          dispatch({
            type: "login",
            session: {
              role: profile.role,
              name: profile.name,
              userId: user.uid,
              duty: profile.role === "staff" ? "Both" : null
            }
          });
        }
      } else {
        // No clinic profile: check Manning Agency.
        const agencySnapshot = await getDoc(
          doc(db, "agencyRequests", user.uid)
        );

        if (!agencySnapshot.exists()) {
          throw new Error("Account profile not found.");
        }

        const agency = agencySnapshot.data();

        if (agency.status !== "Approved") {
          throw new Error("Agency account is not approved.");
        }

        if (!cancelled && auth.currentUser?.uid === user.uid) {
          dispatch({
            type: "login",
            session: {
              role: "agency",
              name: agency.agencyName,
              agencyId: user.uid
            }
          });
        }
      }
    } catch (error) {
      console.error("Session restore failed:", error);

      if (auth.currentUser?.uid === user.uid) {
        await signOut(auth);
      }

      if (!cancelled && !auth.currentUser) {
        dispatch({ type: "logout" });
      }
    } finally {
      if (!cancelled) {
        setAuthReady(true);
      }
    }
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
}, []);


  if (!authReady) {
    return <div>Checking session...</div>;
  }

  return (
    <StoreCtx.Provider value={{ state, dispatch }}>
      {children}
    </StoreCtx.Provider>
  );
}


export const useStore = () => useContext(StoreCtx);

// Clinic admin side.
import { useState, useEffect } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase.js';
import { useStore, STATUSES, IN_PROGRESS, CLOSED, DUTIES, agencyName, dayOf, stamp } from '../store.jsx';
import {
  Shell, Intro, Card, Chip, Field, Select, Table, Stat, Details, Note, Empty, Icon, Modal, useNav,
} from '../ui.jsx';
import { Person } from './Shared.jsx';
import { createClinicAccount } from '../createClinicAccount.js';
import { useAgencyRequests } from "../useAgencyRequests.js";
import { watchAuditLog } from "../auditLog.js";
import { saveAccessPolicy } from "../accessSettings.js";
import {
  LIMITS, nameError, usernameError, passwordError, confirmError, statusReasonError, noteError,
  networkError, normalizeNetwork, networkEntries, agencyKey, friendlyError,
} from '../validators.js';


const DAY = 24 * 3600e3;

/** A pending agency registration, as a row inside a card. */
function RequestRow({ a }) {
  const { nav } = useNav();
  return (
    <div className="row">
      <div>
        <div className="strong">{a.name}</div>
        <div className="meta">Requested {dayOf(a.requestedMs)} by {a.authorized.name}, {a.authorized.position}</div>
      </div>
      <button className="btn sm" onClick={() => nav('a.request', { id: a.id })}>Review details</button>
    </div>
  );
}

/** Admin overview: key numbers, break-glass alerts, agency approvals. */
export function Overview() {
  const { state } = useStore();
  const { nav, reset } = useNav();
  const pending = state.endorsements.filter((e) => e.status === 'Pending').length;
  const timed = state.endorsements.filter((e) => e.turnaroundMin != null);
  const average = timed.length ? Math.round(timed.reduce((sum, e) => sum + e.turnaroundMin, 0) / timed.length) : 0;
  const today = dayOf(Date.now());
  const bgToday = state.breakGlass.filter((b) => dayOf(b.ms) === today).length;
  const bgNew = state.breakGlass.filter((b) => b.status === 'New');
const { requests: firebaseRequests } = useAgencyRequests();

const requests = firebaseRequests.filter(
  (a) => a.status === "Pending"
);

  return (
    <Shell title="Admin dashboard" tab="a.overview">
      <Intro title="Clinic at a glance" sub="Endorsement volume, access alerts and agency requests.">
        <button className="btn" onClick={() => nav('a.all')}>All endorsements</button>
        <button className="btn" onClick={() => nav('a.reports')}>Reports</button>
      </Intro>

      <div className="stats">
        <Stat solid tone="amber" icon="inbox" value={pending} label="Pending endorsements" onClick={() => nav('a.all')} />
        <Stat solid tone="teal" icon="clock" value={`${average} min`} label="Average time to accept" />
        <Stat solid tone="red" icon="lock" value={bgToday} label="Break-glass requests today" />
        <Stat solid tone="blue" icon="user" value={requests.length} label="Agency requests waiting" />
      </div>

      <div className="split even section">
        <Card
          title="Access alerts"
          sub="Break-glass requests waiting for your review."
          action={<button className="link" onClick={() => reset('a.audit')}>Open audit log</button>}
        >
          {bgNew.length === 0 ? (
            <Empty text="No break-glass requests are waiting for review." icon="lock" />
          ) : (
            <div className="rowlist">
              {bgNew.map((b) => (
                <div className="row" key={b.id}>
                  <div>
                    <div className="strong">{b.by} opened {b.ref}</div>
                    <div className="meta">{stamp(b.ms)}, {b.minutes}-minute window. {b.reason}</div>
                  </div>
                  <button className="btn sm" onClick={() => nav('a.bg', { id: b.id })}>Review</button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Agency account approvals" sub="New manning agencies asking for access.">
          {requests.length === 0 ? (
            <Empty text="No agency requests are waiting." />
          ) : (
            <div className="rowlist">{requests.map((a) => <RequestRow key={a.id} a={a} />)}</div>
          )}
        </Card>
      </div>
    </Shell>
  );
}

/** Manage: users, agencies, policy. */
export function Manage() {
  const [tab, setTab] = useState('Users');
  return (
    <Shell title="Manage" tab="a.manage">
      <div className="seg">
        {['Users', 'Agencies', 'Policy'].map((t) => (
          <button key={t} aria-pressed={t === tab} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {tab === 'Users' && <Users />}
      {tab === 'Agencies' && <Agencies />}
      {tab === 'Policy' && <Policy />}
    </Shell>
  );
}

const NEW_USER = {
  name: '',
  username: '',
  password: '',
  again: '',
  role: 'Clinic Staff',
  duty: 'Both'
};

function Users() {
  const { state, dispatch } = useStore();
  const { toast } = useNav();

const [firebaseUsers, setFirebaseUsers] = useState([]);
const [loadingUsers, setLoadingUsers] = useState(true);
const [usersError, setUsersError] = useState("");

useEffect(() => {
  const unsubscribe = onSnapshot(
    collection(db, "users"),
    (snapshot) => {
      const accounts = snapshot.docs.map((item) => {
        const data = item.data();

        return {
          id: item.id,
          name: data.name || "",
          username: data.username || "",
          role: data.role === "admin"
            ? "Clinic Admin"
            : "Clinic Staff",
          status: data.status || "Active",
          statusReason: data.statusReason || null
        };
      });

      setFirebaseUsers(accounts);
      setLoadingUsers(false);
      setUsersError("");
    },
    (error) => {
      console.error("Unable to load clinic accounts:", error);
      setUsersError("Unable to load Firebase accounts.");
      setLoadingUsers(false);
    }
  );

  return () => unsubscribe();
}, []);

  const [dialog, setDialog] = useState(null); // { type: 'create' | 'reset' | 'deactivate', user? }
  const [f, setF] = useState(NEW_USER);
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (ev) => {
    setF({ ...f, [k]: ev.target.value });
    if (errors[k] || errors.form) setErrors({ ...errors, [k]: undefined, form: undefined }); // editing clears the error
  };
  const open = (type, user) => { setDialog({ type, user }); setValue(''); setErrors({}); setF(NEW_USER); };
  const close = () => setDialog(null);

  // Clinic staff do not register themselves: the admin creates each account.
  // One rule per field of the new-account form, so each can also run when the user leaves the field.
  const ACCOUNT_RULES = {
    name: () => nameError(f.name),
    username: () => usernameError(f.username),
    password: () => passwordError(f.password, { username: f.username }),
    again: () => confirmError(f.password, f.again),
  };
  const blur = (k) => () => {
    if (!String(f[k]).trim()) return;
    const next = { ...errors, [k]: ACCOUNT_RULES[k]() || undefined };
    if (k === 'password' && f.again) next.again = ACCOUNT_RULES.again() || undefined;
    setErrors(next);
  };

const create = async () => {
  if (saving) return;

  const e = {};
  Object.keys(ACCOUNT_RULES).forEach((k) => {
    const problem = ACCOUNT_RULES[k]();
    if (problem) e[k] = problem;
  });

  setErrors(e);
  if (Object.keys(e).length) return;

  setSaving(true);

  try {
    // Only Clinic Staff accounts are created here, so the role is fixed.
    await createClinicAccount({
      name: f.name,
      username: f.username,
      password: f.password,
      role: "Clinic Staff"
    });

    dispatch({ type: 'logAction', action: 'Created account', note: `${f.name.trim()} · Clinic Staff` });
    toast(`Account created for ${f.name.trim()}`);
    close();

  } catch (error) {
    if (error.code === 'permission-denied') dispatch({ type: 'logDenied', detail: 'Firebase refused to create a clinic account' });
    console.error("Create account failed:", error);
    const message = friendlyError(error, "Unable to create the account. Please try again.");
    setErrors(/username/i.test(message) ? { username: message } : { form: message });
  } finally {
    setSaving(false);
  }
};


  const resetPassword = () => {
    const e = {};
    const problem = passwordError(value, { username: dialog.user.username, previous: dialog.user.password });
    if (problem) e.value = problem;
    const match = confirmError(value, f.again);
    if (match) e.again = match;
    if (Object.keys(e).length) return setErrors(e);
    dispatch({ type: 'resetUser', id: dialog.user.id, password: value });
    toast(`New password set for ${dialog.user.name}. Give it to them directly.`);
    return close();
  };

const deactivate = async () => {
  const target = dialog.user;
  const activeAdmins = firebaseUsers.filter(
    (u) => u.role === "Clinic Admin" && u.status === "Active"
  );

  // An admin cannot lock themselves out, and the clinic must keep one active admin.
  if (target.id === state.session.userId) {
    return setErrors({ value: "You cannot deactivate your own account." });
  }

  if (target.role === "Clinic Admin" && activeAdmins.length <= 1) {
    return setErrors({
      value: "This is the only active Clinic Admin. Add another admin before deactivating this account."
    });
  }

  if (statusReasonError(value)) {
    return setErrors({ value: statusReasonError(value) });
  }

  try {
    await updateDoc(doc(db, "users", dialog.user.id), {
      status: "Deactivated",
      statusReason: value.trim().replace(/\s+/g, " ")
    });

    dispatch({ type: 'logAction', action: 'Deactivated account', note: `${dialog.user.name} · Reason: ${value.trim()}` });
    toast(`${dialog.user.name} deactivated`);
    close();
  } catch (error) {
    if (error.code === 'permission-denied') dispatch({ type: 'logDenied', detail: 'Firebase refused to deactivate a clinic account' });
    console.error("Deactivate failed:", error);
    setErrors({
      value: friendlyError(error, "Unable to deactivate the account. Please try again.")
    });
  }
};

const activate = async (u) => {
  try {
    await updateDoc(doc(db, "users", u.id), {
      status: "Active",
      statusReason: ""
    });

    dispatch({ type: 'logAction', action: 'Activated account', note: u.name });
    toast(`${u.name} activated`);
  } catch (error) {
    if (error.code === 'permission-denied') dispatch({ type: 'logDenied', detail: 'Firebase refused to reactivate a clinic account' });
    console.error("Activate failed:", error);
    toast("Unable to activate account.");
  }
};


  const columns = [
    {
      head: 'Name',
      cell: (u) => (
        <>
          <span className="strong">{u.name}{u.id === state.session.userId ? ' (you)' : ''}</span>
          <span className="meta">Username: {u.username}</span>
        </>
      ),
    },
    {
      head: 'Role', stop: true,
      cell: (u) => (
        <Select
          size="sm"
          ariaLabel={`Role of ${u.name}`}
          value={u.role}
          disabled={u.id === state.session.userId}
          options={['Clinic Staff', 'Clinic Admin']}
          onChange={(role) => dispatch({
            type: 'setUser', id: u.id, verb: 'Changed role', note: role,
            patch: { role, duty: role === 'Clinic Staff' ? (u.duty || 'Both') : null },
          })}
        />
      ),
    },
    {
      head: 'Status',
      cell: (u) => (
        <>
          <Chip>{u.status}</Chip>
          {u.statusReason && <span className="meta">Reason for deactivation: {u.statusReason}</span>}
        </>
      ),
    },
    {
      head: '', stop: true, className: 'right',
      cell: (u) => (
        <div className="actions">
          <button className="btn sm" disabled title="Not yet available">Reset password</button>
          {u.status === 'Active'
            ? <button className="btn sm danger" disabled={u.id === state.session.userId} onClick={() => open('deactivate', u)}>Deactivate</button>
            : <button className="btn sm" onClick={() => activate(u)}>Activate</button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <Intro title="Clinic accounts" sub="The admin creates and manages every clinic account. Staff only see the pages for their assignment.">
        <button className="btn primary" onClick={() => open('create')}><Icon name="plus" size={16} /> New clinic account</button>
      </Intro>
      <Card flush>
        {loadingUsers ? (
  <p className="meta">Loading clinic accounts...</p>
) : usersError ? (
  <Note tone="red" icon="alert">{usersError}</Note>
) : (
  <Table
    columns={columns}
    rows={firebaseUsers}
    rowKey={(u) => u.id}
  />
)}
      </Card>

      {dialog?.type === 'create' && (
        <Modal
          wide
          title="New clinic account"
          sub="Give the username and temporary password to the staff member directly."
          onClose={close}
          footer={(
            <>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" disabled={saving} onClick={create}>{saving ? 'Creating...' : 'Create account'}</button>
            </>
          )}
        >
          {errors.form && <Note tone="red" icon="alert">{errors.form}</Note>}
          <Field label="Full name *" error={errors.name}>
            <input type="text" value={f.name} maxLength={LIMITS.name.max} autoComplete="off" placeholder="e.g. Maria Santos"
              onChange={set('name')} onBlur={blur('name')} />
          </Field>
          <div className="form-grid">
            <Field label="Username *" error={errors.username} hint="3 to 50 characters, starting with a letter.">
              <input type="text" value={f.username} maxLength={LIMITS.username.max} autoCapitalize="none" spellCheck={false}
                autoComplete="off" placeholder="e.g. msantos" onChange={set('username')} onBlur={blur('username')} />
            </Field>
            <Field label="Role" hint="Only Clinic Staff accounts are created here.">
              <input type="text" value="Clinic Staff" readOnly tabIndex={-1} />
            </Field>
            <Field label="Temporary password *" error={errors.password} hint="At least 8 characters, with a letter and a number.">
              <input type="password" value={f.password} maxLength={LIMITS.password.max} autoComplete="new-password"
                onChange={set('password')} onBlur={blur('password')} />
            </Field>
            <Field label="Confirm password *" error={errors.again}>
              <input type="password" value={f.again} maxLength={LIMITS.password.max} autoComplete="new-password"
                onChange={set('again')} onBlur={blur('again')} />
            </Field>
          </div>
        </Modal>
      )}

      {dialog?.type === 'reset' && (
        <Modal
          title={`Reset password for ${dialog.user.name}`}
          sub={`Username: ${dialog.user.username}`}
          onClose={close}
          footer={(
            <>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn primary" onClick={resetPassword}>Save new password</button>
            </>
          )}
        >
          <Field label="New temporary password *" error={errors.value} hint="At least 8 characters, with a letter and a number.">
            <input type="password" value={value} maxLength={LIMITS.password.max} autoComplete="new-password"
              onChange={(ev) => { setValue(ev.target.value); setErrors({}); }} />
          </Field>
          <Field label="Confirm password *" error={errors.again}>
            <input type="password" value={f.again} maxLength={LIMITS.password.max} autoComplete="new-password" onChange={set('again')} />
          </Field>
        </Modal>
      )}

      {dialog?.type === 'deactivate' && (
        <Modal
          title={`Deactivate ${dialog.user.name}?`}
          sub="They will not be able to sign in until the account is activated again."
          onClose={close}
          footer={(
            <>
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn danger" onClick={deactivate}>Confirm deactivation</button>
            </>
          )}
        >
          <Field label="Reason for deactivating *" error={errors.value}>
            <textarea value={value} maxLength={LIMITS.statusReason.max} placeholder="e.g. Resigned from the clinic last week"
              onChange={(ev) => { setValue(ev.target.value); setErrors({}); }} />
          </Field>
        </Modal>
      )}
    </>
  );
}

function Agencies() {
  const { state, dispatch } = useStore();
  const { nav } = useNav();
  const [q, setQ] = useState('');
  const [suspending, setSuspending] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
const { requests: firebaseRequests } = useAgencyRequests();

const requests = firebaseRequests.filter(
  (a) => a.status === "Pending"
);
 
const needle = q.trim().toLowerCase();

// Approved agencies and suspended ones, so a suspended agency stays listed and can be reactivated.
const list = firebaseRequests.filter(
  (a) =>
    (a.status === "Approved" || a.status === "Suspended") &&
    (!needle || a.name.toLowerCase().includes(needle))
);

const total = (id) =>
  state.endorsements.filter(
    (e) => e.agencyId === id
  ).length;

  const [saving, setSaving] = useState(false);
  const { toast } = useNav();

  // Agencies live in Firestore, so the status is saved there. The list above
  // listens to Firestore and updates by itself once the change is saved.
  const saveStatus = async (agency, status, verb, why = '') => {
    if (saving) return false;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'agencyRequests', agency.id), { status, statusReason: why });
      dispatch({ type: 'agencyStatus', id: agency.id, name: agency.name, status, verb, reason: why }); // audit log entry
      toast(`${agency.name} ${verb}`);
      return true;
    } catch (err) {
      if (err.code === 'permission-denied') dispatch({ type: 'logDenied', detail: 'Firebase refused to change an agency status' });
      console.error(`Agency could not be ${verb}:`, err);
      const message = err.code === 'permission-denied'
        ? 'Permission denied. Check that your admin account may update agencies in the Firestore rules.'
        : friendlyError(err, 'Unable to save the change. Please try again.');
      setError(message);
      toast(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const suspend = async () => {
    if (statusReasonError(reason)) return setError(statusReasonError(reason));
    if (await saveStatus(suspending, 'Suspended', 'suspended', reason.trim().replace(/\s+/g, ' '))) setSuspending(null);
    return undefined;
  };

  const reactivate = (agency) => saveStatus(agency, 'Approved', 'reactivated');

  return (
    <>
      <Intro title="Accredited agencies" sub="Approve new requests, and suspend or reactivate agency access." />
      {requests.length > 0 && (
        <Card title={`Requests waiting (${requests.length})`} className="flag" >
          <div className="rowlist">{requests.map((a) => <RequestRow key={a.id} a={a} />)}</div>
        </Card>
      )}
      <div className="toolbar" style={{ marginTop: requests.length ? 24 : 0 }}>
        <Field label="Search" className="grow">
          <input type="search" value={q} maxLength={100} placeholder="Search agencies" onChange={(ev) => setQ(ev.target.value)} />
        </Field>
      </div>
      <Card flush>
        <Table
          key={needle}
          columns={[
            { head: 'Agency', cell: (a) => <><span className="strong">{a.name}</span><span className="meta">{a.address}</span></> },
            { head: 'Endorsements', cell: (a) => total(a.id) },
            {
              head: 'Status',
              cell: (a) => (
                <>
                  <Chip>{a.status}</Chip>
                  {a.statusReason && <span className="meta">Reason: {a.statusReason}</span>}
                </>
              ),
            },
            {
              head: '', stop: true, className: 'right',
              cell: (a) => (
                <div className="actions">
                  <button className="btn sm" onClick={() => nav('a.agency', { id: a.id })}>View details</button>
                  {a.status === 'Approved' ? (
                    <button className="btn sm danger" onClick={() => { setSuspending(a); setReason(''); setError(''); }}>Suspend</button>
                  ) : (
                    <button className="btn sm" disabled={saving} onClick={() => reactivate(a)}>
                      Reactivate
                    </button>
                  )}
                </div>
              ),
            },
          ]}
          rows={list}
          rowKey={(a) => a.id}
          onRow={(a) => nav('a.agency', { id: a.id })}
          empty="No agencies match."
        />
      </Card>

      {suspending && (
        <Modal
          title={`Suspend ${suspending.name}?`}
          sub="The agency will not be able to sign in until it is reactivated."
          onClose={() => setSuspending(null)}
          footer={(
            <>
              <button className="btn" onClick={() => setSuspending(null)}>Cancel</button>
              <button className="btn danger" onClick={suspend}>Confirm suspension</button>
            </>
          )}
        >
          <Field label="Reason for suspending *" error={error}>
            <textarea value={reason} maxLength={LIMITS.statusReason.max} placeholder="e.g. Accreditation expired in March"
              onChange={(ev) => { setReason(ev.target.value); setError(''); }} />
          </Field>
        </Modal>
      )}
    </>
  );
}

function Policy() {
  const { state, dispatch } = useStore();
  const { toast } = useNav();
  const [p, setP] = useState(state.policy);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  // The saved policy loads a moment after sign-in; show it once it arrives, unless the admin is already editing.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setP(state.policy);
  }, [state.policy, touched]);
  const edit = (next) => { setTouched(true); setP(next); };

  const networkChanged = normalizeNetwork(p.network) !== normalizeNetwork(state.policy.network);
  const { ip, status } = state.network;
  const ipListed = ip && networkEntries(p.network).includes(ip);

  const save = async () => {
    if (saving) return undefined;
    const problem = networkError(p.network);
    if (problem) return setError(problem);
    // A wrong network locks every staff member out of the full view, so a change is confirmed first.
    if (networkChanged && !confirming) return setConfirming(true);
    const policy = { ...p, network: normalizeNetwork(p.network) };
    setSaving(true);
    setSaveError('');
    try {
      // Saved in Firebase: the server reads it to decide who is on the clinic network.
      await saveAccessPolicy(policy);
    } catch (err) {
      console.error('Unable to save the access policy:', err);
      setSaving(false);
      if (err.code === 'permission-denied') dispatch({ type: 'logDenied', detail: 'Firebase refused an access policy change' });
      return setSaveError(friendlyError(err, 'The policy could not be saved. Try again.'));
    }
    dispatch({ type: 'savePolicy', policy });
    setP(policy);
    setTouched(false);
    setSaving(false);
    setConfirming(false);
    // Check again straight away so the new network takes effect for this admin too.
    dispatch({ type: 'recheckNetwork' });
    return toast('Access policy saved');
  };

  return (
    <>
      <Intro title="Access policy" sub="Rules for viewing patient information and for idle sessions." />
      <Card className="narrow">
        <div className="form">
          <Field label="Clinic network (public IP or range) *" error={error}
            hint="Staff on this network see full patient details. Separate several entries with commas, e.g. 203.0.113.24, 203.0.113.0/24.">
            <input type="text" value={p.network} maxLength={LIMITS.network.max} autoComplete="off" spellCheck={false}
              onChange={(ev) => { edit({ ...p, network: ev.target.value }); setError(''); setConfirming(false); }}
              onBlur={() => setError(networkError(p.network))} />
          </Field>
          <Note tone={status === 'inside' ? 'teal' : 'amber'} icon={status === 'inside' ? 'wifi' : 'alert'}>
            {ip
              ? <>This device's public IP address is <span style={{ fontWeight: 600 }}>{ip}</span>{status === 'inside' ? ', which is on the clinic network.' : ', which is not on the clinic network.'}</>
              : status === 'error'
                ? 'This device\'s public IP address could not be checked.'
                : 'Checking this device\'s public IP address…'}
            {' '}Set this while connected to the clinic Wi‑Fi. Mobile data, home Wi‑Fi, VPNs and proxies always count as outside.
            {ip && !ipListed && (
              <div style={{ marginTop: 8 }}>
                <button className="btn sm" onMouseDown={(ev) => ev.preventDefault()} onClick={() => { edit({ ...p, network: normalizeNetwork([p.network, ip].filter(Boolean).join(', ')) }); setError(''); setConfirming(false); }}>
                  Add this address
                </button>
              </div>
            )}
          </Note>
          {confirming && (
            <Note tone="amber" icon="alert" title="Check before saving">
              You are changing the clinic network. If the new value does not include the clinic's current public IP
              address, every staff member loses the full view. Click Save policy again to confirm.
            </Note>
          )}
          <div className="form-grid">
            <Field label="Break-glass access duration">
              <Select
                value={p.breakGlassMinutes}
                onChange={(breakGlassMinutes) => edit({ ...p, breakGlassMinutes })}
                options={[15, 30, 60].map((m) => ({ value: m, label: `${m} minutes` }))}
              />
            </Field>
            <Field label="Auto-logout after inactivity">
              <Select
                value={p.autoLogoutMinutes}
                onChange={(autoLogoutMinutes) => edit({ ...p, autoLogoutMinutes })}
                options={[5, 10, 15, 30].map((m) => ({ value: m, label: `${m} minutes` }))}
              />
            </Field>
          </div>
        </div>
        {saveError && <Note tone="red" icon="alert">{saveError}</Note>}
        <div className="card-foot">
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save policy'}</button>
        </div>
      </Card>
    </>
  );
}

function AgencyPanels({ a }) {
  return (
    <div className="stack">
      <Card title="Agency">
        <Details cols items={[['Address', a.address], ['Username', a.username]]} />
      </Card>
      <Card title="Authorized person">
        <Details
          cols
          items={[['Name', a.authorized.name], ['Position', a.authorized.position],
            ['Contact no.', a.authorized.contact], ['Email address', a.authorized.email]]}
        />
      </Card>
      <Card title="In charge of medical report and billing">
        <Details
          cols
          items={[['Name', a.billing.name], ['Position', a.billing.position],
            ['Contact no.', a.billing.contact], ['Email address', a.billing.email]]}
        />
      </Card>
    </div>
  );
}

/** Agency registration review: approve, or reject with a reason. */
export function AgencyRequest({ id }) {
  const { back, toast } = useNav();
  const { dispatch } = useStore();
  const { requests, loading, error: loadError } = useAgencyRequests();

  const a = requests.find((item) => item.id === id);

  // Another agency with the same name, ignoring case and endings such as "Inc." or "Corp."
  const twin = a && requests.find(
    (item) => item.id !== a.id && item.status !== "Rejected" && agencyKey(item.name) && agencyKey(item.name) === agencyKey(a.name)
  );

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const approve = async () => {
    if (!a || saving) return;

    setSaving(true);
    setError("");

    try {
      await updateDoc(doc(db, "agencyRequests", id), {
        status: "Approved",
        statusReason: ""
      });

      dispatch({ type: 'logAction', action: 'Agency approved', note: a.name });
      toast(`${a.name} approved`);
      back();
    } catch (err) {
      if (err.code === 'permission-denied') dispatch({ type: 'logDenied', detail: 'Firebase refused to approve an agency request' });
      console.error("Agency approval failed:", err);
      setError(friendlyError(err, "Unable to approve the agency. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    if (!a || saving) return;

    if (statusReasonError(reason)) {
      return setError(statusReasonError(reason));
    }

    setSaving(true);
    setError("");

    try {
      await updateDoc(doc(db, "agencyRequests", id), {
        status: "Rejected",
        statusReason: reason.trim().replace(/\s+/g, " ")
      });

      dispatch({ type: 'logAction', action: 'Agency rejected', note: `${a.name} · Reason: ${reason.trim()}` });
      toast(`${a.name} rejected`);
      back();
    } catch (err) {
      if (err.code === 'permission-denied') dispatch({ type: 'logDenied', detail: 'Firebase refused to reject an agency request' });
      console.error("Agency rejection failed:", err);
      setError(friendlyError(err, "Unable to reject the agency. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Shell title="Agency request" back tab="a.manage">
        <p className="meta">Loading agency request...</p>
      </Shell>
    );
  }

  if (loadError || !a) {
    return (
      <Shell title="Agency request" back tab="a.manage">
        <Note tone="red" icon="alert">
          {loadError || "Agency request not found."}
        </Note>
      </Shell>
    );
  }

  return (
    <Shell title="Agency request" back tab="a.manage">
      <Intro
        title={a.name}
        sub={`Account request received ${dayOf(a.requestedMs)}.`}
      >
        {a.status === "Pending" && (
          <>
            <button
              className="btn primary"
              onClick={approve}
              disabled={saving}
            >
              <Icon name="check" size={16} />
              {saving ? "Saving..." : "Approve"}
            </button>

            <button
              className="btn danger"
              onClick={() => setRejecting(true)}
              disabled={saving}
            >
              Reject
            </button>
          </>
        )}
      </Intro>

      <div className="narrow">
        {twin && (
          <Note tone="amber" icon="alert" title="Possible duplicate agency">
            {twin.name} is already on record ({twin.status}). Check that this is not the same agency registering twice.
          </Note>
        )}

        <AgencyPanels a={a} />

        {error && (
          <Note tone="red" icon="alert">
            {error}
          </Note>
        )}
      </div>

      {rejecting && (
        <Modal
          title={`Reject ${a.name}?`}
          sub="The reason is kept with the request."
          onClose={() => setRejecting(false)}
          footer={
            <>
              <button
                className="btn"
                onClick={() => setRejecting(false)}
                disabled={saving}
              >
                Cancel
              </button>

              <button
                className="btn danger"
                onClick={reject}
                disabled={saving}
              >
                {saving ? "Saving..." : "Confirm rejection"}
              </button>
            </>
          }
        >
          <Field label="Reason for rejecting *" error={error}>
            <textarea
              value={reason}
              maxLength={LIMITS.statusReason.max}
              placeholder="e.g. The agency is not on the accredited list"
              onChange={(ev) => {
                setReason(ev.target.value);
                setError("");
              }}
            />
          </Field>
        </Modal>
      )}
    </Shell>
  );
}

/** Agency details. */
export function AgencyDetails({ id }) {
  const { state } = useStore();
  const a = state.agencies.find((x) => x.id === id);
  const total = state.endorsements.filter((e) => e.agencyId === id).length;
  return (
    <Shell title="Agency details" back tab="a.manage">
      <Intro title={a.name} sub={`${total} endorsements`}>
        <Chip>{a.status}</Chip>
      </Intro>
      <div className="narrow stack">
        {a.statusReason && <Note tone="amber" icon="alert" title={`Reason for ${a.status.toLowerCase()} status`}>{a.statusReason}</Note>}
        <AgencyPanels a={a} />
      </div>
    </Shell>
  );
}

/** All endorsements across agencies. */
export function AllEndorsements() {
  const { state } = useStore();
  const { nav } = useNav();
  const [q, setQ] = useState('');
  const [agency, setAgency] = useState('');
  const [status, setStatus] = useState('');
  const [stuckOnly, setStuckOnly] = useState(false);
  const now = Date.now();
  const stuckDays = (e) => (e.status === 'Pending' ? Math.floor((now - e.receivedMs) / DAY) : 0);
  const needle = q.trim().toLowerCase();
  const list = state.endorsements.filter(
    (e) =>
      (!agency || e.agencyId === agency) &&
      (!status || e.status === status) &&
      (!stuckOnly || stuckDays(e) >= 1) &&
      (!needle || `${e.name} ${e.ref} ${e.vessel} ${agencyName(state, e.agencyId)}`.toLowerCase().includes(needle)),
  );

  return (
    <Shell title="All endorsements" back tab="a.overview">
      <Intro title="All endorsements" sub="Every endorsement from every agency. Open one to see its timeline." />
      <div className="toolbar">
        <Field label="Search" className="grow">
          <input type="search" value={q} placeholder="Search name, reference, ship or agency" onChange={(ev) => setQ(ev.target.value)} />
        </Field>
        <Field label="Agency">
          <Select
            searchable
            clearable
            value={agency}
            onChange={setAgency}
            options={[
              { value: '', label: 'All agencies' },
              ...state.agencies.filter((a) => a.status !== 'Pending').map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </Field>
        <Field label="Status">
          <Select clearable value={status} onChange={setStatus} options={[{ value: '', label: 'All statuses' }, ...STATUSES]} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={stuckOnly} onChange={(ev) => setStuckOnly(ev.target.checked)} />
          Stuck only (pending 1+ day)
        </label>
      </div>
      <Card flush>
        <Table
          key={`${needle}:${agency}:${status}:${stuckOnly}`}
          columns={[
            { head: 'Seafarer', cell: (e) => <Person e={e} /> },
            { head: 'Manning agency', cell: (e) => agencyName(state, e.agencyId) },
            { head: 'Reference', cell: (e) => e.ref, className: 'nowrap' },
            { head: 'Received', cell: (e) => stamp(e.receivedMs), className: 'nowrap' },
            {
              head: 'Status',
              cell: (e) => (
                <div className="chips">
                  <Chip>{e.status}</Chip>
                  {stuckDays(e) >= 1 && <Chip tone="red">Stuck {stuckDays(e)}d</Chip>}
                </div>
              ),
            },
          ]}
          rows={list}
          rowKey={(e) => e.ref}
          onRow={(e) => nav('timeline', { id: e.ref })}
          empty="No endorsements match."
        />
      </Card>
    </Shell>
  );
}

/** Reports. */
export function Reports() {
  const { state } = useStore();
  const [days, setDays] = useState(30);
  const now = Date.now();
  const all = state.endorsements;
  const recent = all.filter((e) => e.receivedMs >= now - days * DAY);
  const cash = recent.length ? Math.round((recent.filter((e) => e.cashBasis).length / recent.length) * 100) : 0;
  const inTreatment = all.filter((e) => IN_PROGRESS.includes(e.status)).length;
  const pending = all.filter((e) => e.status === 'Pending').length;

  // Endorsements received on each of the last 14 calendar days.
  const bars = Array.from({ length: 14 }, (_, i) => {
    const label = dayOf(now - (13 - i) * DAY);
    return all.filter((e) => dayOf(e.receivedMs) === label && e.receivedMs > now - 15 * DAY).length;
  });
  const peak = Math.max(1, ...bars);

  const byAgency = state.agencies
    .filter((a) => a.status !== 'Pending')
    .map((a) => {
      const own = all.filter((e) => e.agencyId === a.id);
      return {
        a,
        total: own.length,
        treat: own.filter((e) => IN_PROGRESS.includes(e.status)).length,
        pend: own.filter((e) => e.status === 'Pending').length,
        done: own.filter((e) => CLOSED.includes(e.status)).length,
      };
    })
    .sort((x, y) => y.total - x.total);

  return (
    <Shell title="Reports" back tab="a.overview">
      <Intro title="Reports" sub="Endorsement volume and case status across agencies.">
        <Field label="Period">
          <Select value={days} onChange={setDays} options={[7, 30, 90].map((d) => ({ value: d, label: `Last ${d} days` }))} />
        </Field>
      </Intro>
      <div className="stats six">
        <Stat value={recent.length} label={`Received, last ${days} days`} />
        <Stat value={(recent.length / days).toFixed(1)} label="Average per day" />
        <Stat value={`${cash}%`} label="On a cash basis" />
        <Stat value={inTreatment} label="In treatment now" tone="teal" />
        <Stat value={pending} label="Pending now" tone="amber" />
        <Stat value={state.breakGlass.length} label="Break-glass requests" tone="red" />
      </div>

      <div className="split even section">
        <Card title="Endorsements per day" sub="Last 14 days">
          <div className="bars" role="img" aria-label={`Endorsements per day for the last 14 days: ${bars.join(', ')}`}>
            {bars.map((n, i) => (
              <div key={i} style={{ height: `${(n / peak) * 100}%` }}><span>{n}</span></div>
            ))}
          </div>
          <div className="axis"><span>14 days ago</span><span>Today</span></div>
        </Card>
        <Card flush title="By agency">
          <Table
            pager={false}
            columns={[
              { head: 'Agency', cell: (r) => <span className="strong">{r.a.name}</span> },
              { head: 'Total', cell: (r) => r.total, className: 'right' },
              { head: 'In treatment', cell: (r) => r.treat, className: 'right' },
              { head: 'Pending', cell: (r) => r.pend, className: 'right' },
              { head: 'Concluded', cell: (r) => r.done, className: 'right' },
            ]}
            rows={byAgency}
            rowKey={(r) => r.a.id}
          />
        </Card>
      </div>
    </Shell>
  );
}

/** Break-glass review. */
export function BreakGlassReview({ id }) {
  const { state, dispatch } = useStore();
  const { back, toast } = useNav();
  const b = state.breakGlass.find((x) => x.id === id);
  const [note, setNote] = useState(b.reviewNote || '');
  const [error, setError] = useState('');

  const finish = (status) => {
    if (status === 'Flagged' && noteError(note, { what: 'review note' })) return setError(noteError(note, { what: 'review note' }));
    if (note.trim().length > LIMITS.note.max) return setError(`Keep the note within ${LIMITS.note.max} characters.`);
    dispatch({ type: 'reviewBreakGlass', id, status, note: note.trim() });
    toast(status === 'Flagged' ? 'Flagged as inappropriate' : 'Marked as reviewed');
    return back();
  };

  return (
    <Shell title="Break-glass review" back tab="a.overview">
      <Intro title={`Break-glass access to ${b.ref}`} sub="Check that the reason justifies full access outside the clinic network." />
      <div className="split even">
        <Card title="Request" action={<Chip>{b.status}</Chip>}>
          <Details
            cols
            items={[
              ['Requested by', `${b.by}, Clinic Staff`],
              ['When', `${stamp(b.ms)}, ${b.minutes}-minute window`],
              ['Reason', b.reason],
              ['Records viewed in window', b.ref],
              ['Staff note', b.note],
            ]}
          />
        </Card>
        <Card title="Your review">
          <Field label="Review note (required to flag)" error={error}>
            <textarea value={note} maxLength={LIMITS.note.max} placeholder="Say why this access was or was not justified" onChange={(ev) => { setNote(ev.target.value); setError(''); }} />
          </Field>
          <div className="card-foot">
            <button className="btn primary" onClick={() => finish('Reviewed')}>Mark as reviewed</button>
            <button className="btn danger" onClick={() => finish('Flagged')}>Flag as inappropriate</button>
          </div>
        </Card>
      </div>
    </Shell>
  );
}

const ACTION_TONE = {
  'Accepted endorsement': 'green', 'Created account': 'green', 'Activated account': 'green',
  'Break-glass': 'red', 'Flagged break-glass': 'red', 'Deactivated account': 'red',
  'Agency suspended': 'red', 'Agency rejected': 'red',
  'Submitted medical report': 'teal', 'Submitted billing statement': 'teal',
  'Signed in': 'slate', 'Viewed record': 'slate', 'Viewed timeline': 'slate', 'Viewed endorsement': 'slate',
  'Downloaded file': 'slate', 'Requested medical update': 'teal',
};

/** Who the entries in the audit log come from. */
const AUDIT_GROUPS = [
  { value: '', label: 'All users' },
  { value: 'clinic', label: 'Clinic staff and admin' },
  { value: 'agency', label: 'Manning agencies' },
  { value: 'denied', label: 'Failed and denied attempts' },
];

/** Audit log (read-only), loaded from Firebase. Records clinic users and manning agencies. */
export function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [who, setWho] = useState('');
  const [action, setAction] = useState('');

  useEffect(() => watchAuditLog(
    (rows) => { setEntries(rows); setLoading(false); setLoadError(''); },
    (err) => {
      console.error('Audit log could not be loaded:', err);
      setLoading(false);
      setLoadError(err.code === 'permission-denied'
        ? 'Firebase refused to show the audit log. Check that the auditLogs rules allow the clinic admin to read it.'
        : 'The audit log could not be loaded. Check your connection and try again.');
    },
  ), []);

  const inGroup = (x) => (
    !group
    || (group === 'denied' ? x.outcome === 'denied' : x.actorType === group)
  );
  const grouped = entries.filter(inGroup);
  const people = [...new Set(grouped.map((x) => x.who))].sort();
  const actions = [...new Set(grouped.map((x) => x.action))].sort();
  const needle = q.trim().toLowerCase();
  const list = grouped.filter(
    (x) =>
      (!who || x.who === who) &&
      (!action || x.action === action) &&
      (!needle || `${x.who} ${x.ref} ${x.note || ''}`.toLowerCase().includes(needle)),
  );

  return (
    <Shell title="Audit log" tab="a.audit">
      <Intro
        title="Activity of all users"
        sub="Sign-ins, record views, downloads, changes, medical reports, billing statements, update requests and break-glass use by clinic staff, the clinic admin and manning agencies. Entries cannot be changed or deleted."
      />
      <div className="toolbar">
        <Field label="Search" className="grow">
          <input type="search" value={q} maxLength={100} placeholder="Search user, patient code or details" onChange={(ev) => setQ(ev.target.value)} />
        </Field>
        <Field label="Users">
          <Select value={group} onChange={(v) => { setGroup(v); setWho(''); setAction(''); }} options={AUDIT_GROUPS} />
        </Field>
        <Field label="User">
          <Select searchable clearable value={who} onChange={setWho} options={[{ value: '', label: 'Everyone' }, ...people]} />
        </Field>
        <Field label="Action">
          <Select searchable clearable value={action} onChange={setAction} options={[{ value: '', label: 'All actions' }, ...actions]} />
        </Field>
      </div>
      {loadError && <Note tone="red" icon="alert">{loadError}</Note>}
      <Card flush>
        <Table
          key={`${group}:${who}:${action}:${needle}`}
          size={15}
          columns={[
            { head: 'When', cell: (x) => stamp(x.ms), className: 'nowrap' },
            { head: 'User', cell: (x) => <><span className="strong">{x.who}</span><span className="meta">{x.role || 'Not signed in'}</span></> },
            { head: 'Action', cell: (x) => <Chip tone={x.outcome === 'denied' ? 'red' : ACTION_TONE[x.action] || 'amber'}>{x.action}</Chip> },
            { head: 'Patient Code', cell: (x) => (x.ref === '—' ? <span className="meta">None</span> : x.ref), className: 'nowrap' },
            { head: 'Network', cell: (x) => <span className="meta">{x.network || '—'}</span> },
            {
              head: 'Details',
              cell: (x) => (x.note
                ? x.note.split(' · ').map((part) => <span className="meta" key={part}>{part}</span>)
                : <span className="meta">No further details</span>),
            },
          ]}
          rows={list}
          rowKey={(x) => x.id}
          empty={loading ? 'Loading the audit log...' : 'No audit entries match.'}
        />
      </Card>
    </Shell>
  );
}

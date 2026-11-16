// Signed-out screens: sign in, agency registration, agency password reset.
import { useState } from 'react';
import { useStore, ROLE_LABEL, DEMO_PASSWORD } from '../store.jsx';
import { Shell, Field, Select, Note, Icon, useNav } from '../ui.jsx';
import { loginClinicUser } from "../adminAuth.js";
import { createAgencyRequest } from "../createAgencyRequest.js";
import { loginAgency } from "../agencyAuth.js";

const DEMO_USER = { agency: 'agency.demo', staff: 'staff.demo', admin: 'admin.demo' };

export function SignIn() {
  const { state, dispatch } = useStore();
  const { nav } = useNav();
  const [role, setRole] = useState('agency');
const [username, setUsername] = useState('');
const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [roleWarning, setRoleWarning] = useState('');

  // Changing the role keeps a typed username. Only the untouched demo
  // username is swapped for the matching demo account, for convenience.
  const changeRole = (r) => {
    setRole(r);
    if (Object.values(DEMO_USER).includes(username.trim())) {
      setUsername(DEMO_USER[r]);
      setPassword('');
    }
    setError('');
    setRoleWarning('');
  };



const submit = async (ev) => {
  ev.preventDefault();
  setError("");
  setRoleWarning("");

  const u = username.trim();
  if (!u) return setError("Enter your username.");

  if (role === "admin" || role === "staff") {
    try {
      const session = await loginClinicUser(u, password);

      if (session.role !== role) {
        throw new Error(
          "This account does not belong to the selected account type."
        );
      }

      dispatch({ type: "login", session });
    } catch (error) {
      console.error("Clinic login error:", error);
      setError(
        error.code === "auth/invalid-credential"
          ? "Invalid username or password."
          : error.message || "Login failed."
      );
    }
    return;
  }

  // Manning Agency Firebase login
  try {
    const session = await loginAgency(u, password);

    dispatch({
      type: "login",
      session
    });

  } catch (error) {
    console.error("Agency login failed:", error);

    setError(
      error.code === "auth/invalid-credential"
        ? "Invalid username or password."
        : error.message || "Unable to sign in."
    );
  }

};


  const usernameBad = roleWarning || (error && !error.startsWith('Incorrect password'));

  return (
    <Shell title="Sign in">
      <h2>Welcome back to SeaFlow</h2>
      <p className="lead">Select your account type and enter your credentials to continue.</p>
      <form className="form" onSubmit={submit} noValidate>
        <Field label="Account type" error={roleWarning && ' '}>
          <Select
            value={role}
            onChange={changeRole}
            options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </Field>
        {roleWarning && (
          <Note tone="amber" icon="alert" title="No account of this type">{roleWarning}</Note>
        )}
        <Field label="Username" error={usernameBad && ' '}>
          <input type="text" value={username} autoCapitalize="none" autoComplete="username" onChange={(ev) => setUsername(ev.target.value)} />
        </Field>
        <Field label="Password" error={error && ' '}>
          <input type={show ? 'text' : 'password'} value={password} autoComplete="current-password" onChange={(ev) => setPassword(ev.target.value)} />
        </Field>
        <div className="link-row">
          <button type="button" className="link" onClick={() => setShow(!show)}>
            {show ? 'Hide' : 'Show'} password
          </button>
          <button type="button" className="link" onClick={() => nav('g.forgot', { role, username: username.trim() })}>
            Forgot password?
          </button>
        </div>
        {error && <Note tone="red" icon="alert">{error}</Note>}
        <button className="btn primary block lg">Sign in to SeaFlow</button>
      </form>

      <div className="auth-alt">
        <span>New manning agency?</span>
        <button type="button" className="btn block" onClick={() => nav('g.request')}>Request an agency account</button>
      </div>

      <div className="auth-demo">
        <b>Demo accounts</b>
        agency.demo, staff.demo, billing.demo, updates.demo, admin.demo. Password: {DEMO_PASSWORD}
      </div>
      <p className="hint">
        You are signed out automatically after {state.policy.autoLogoutMinutes} minutes of inactivity.
      </p>
    </Shell>
  );
}

const EMPTY = {
  agencyName: '', address: '',
  authName: '', authPosition: '', authContact: '', authEmail: '',
  billName: '', billPosition: '', billContact: '', billEmail: '',
  username: '', password: '',
  confirm: false,
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Agency registration. No supporting documents are needed. */
export function RequestAccess() {
  const { state, dispatch } = useStore();
  const { nav, back } = useNav();
const [f, setF] = useState(EMPTY);
const [errors, setErrors] = useState({});
const [submitting, setSubmitting] = useState(false);
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value });


const submit = async (ev) => {
  ev.preventDefault();

  if (submitting) return;

  const e = {};

  Object.keys(EMPTY).forEach((k) => {
    if (k !== "confirm" && !String(f[k]).trim()) {
      e[k] = "This field is required.";
    }
  });

  ["authEmail", "billEmail"].forEach((k) => {
    if (f[k] && !EMAIL.test(f[k])) {
      e[k] = "Enter a valid email address.";
    }
  });

  if (f.password && f.password.length < 8) {
    e.password = "Use at least 8 characters.";
  }

  const cleanUsername = f.username.trim().toLowerCase();

  if (
    cleanUsername &&
    !/^[a-z0-9._-]{3,50}$/.test(cleanUsername)
  ) {
    e.username = "Use 3–50 letters, numbers, dots, underscores or hyphens.";
  }

  if (!f.confirm) {
    e.confirm = "Please confirm you are authorized.";
  }

  setErrors(e);
  if (Object.keys(e).length) return;

  setSubmitting(true);

  try {
    await createAgencyRequest({
      ...f,
      username: cleanUsername
    });

    nav("g.submitted", {
      name: f.agencyName.trim()
    });
  } catch (error) {
    console.error("Agency registration failed:", error);

    setErrors({
      submit:
        error.message ||
        "Unable to submit your registration. Please try again."
    });
  } finally {
    setSubmitting(false);
  }
};


  const text = (k, label, placeholder, type = 'text', className = '') => (
    <Field label={`${label} *`} error={errors[k]} className={className}>
      <input type={type} value={f[k]} placeholder={placeholder} onChange={set(k)} />
    </Field>
  );

  return (
    <Shell title="Request access" back wide>
      <h2>Request agency access</h2>
      <p className="lead">For accredited manning agencies. The clinic admin reviews every request. Fields marked * are required.</p>
      <form className="form" onSubmit={submit} noValidate>
        <div className="form-grid">
          <h3 className="full">Agency</h3>
          {text('agencyName', 'Name of manning agency', 'Pacific Crew Manning Agency')}
          {text('address', 'Address', 'Street, city')}

          <div className="full">
            <h3>Authorized person</h3>
            <p className="meta">The agency head or signatory, not the staff who will use the system.</p>
          </div>
          {text('authName', 'Name', 'Full name')}
          {text('authPosition', 'Position', 'e.g. General Manager')}
          {text('authContact', 'Contact no.', '09xx xxx xxxx', 'tel')}
          {text('authEmail', 'Email address', 'name@agency.com', 'email')}

          <h3 className="full">Person in charge of medical report and billing</h3>
          {text('billName', 'Name', 'Full name')}
          {text('billPosition', 'Position', 'e.g. Billing Officer')}
          {text('billContact', 'Contact no.', '09xx xxx xxxx', 'tel')}
          {text('billEmail', 'Email address', 'billing@agency.com', 'email')}

          <h3 className="full">Login</h3>
          {text('username', 'Username', 'Choose a username')}
          {text('password', 'Password (min. 8 characters)', '', 'password')}
        </div>

        <div>
          <label className="check">
            <input type="checkbox" checked={f.confirm} onChange={set('confirm')} />
            I confirm I am authorized to register this agency and the details are accurate.
          </label>
          {errors.confirm && <p className="err">{errors.confirm}</p>}
        </div>
        {errors.submit && (
  <Note tone="red" icon="alert">
    {errors.submit}
  </Note>
)}
        <div className="actions">
          <button className="btn primary" disabled={submitting}>
  {submitting ? "Submitting..." : "Submit request"}
</button>
          <button type="button" className="btn" onClick={back}>Cancel</button>
        </div>
      </form>
    </Shell>
  );
}

export function RequestSubmitted({ name }) {
  const { reset } = useNav();
  return (
    <Shell title="Request sent">
      <div className="center">
        <div className="success-mark"><Icon name="check" size={28} /></div>
        <h2>Request submitted</h2>
        <p className="lead">
          {name} is now waiting for clinic admin approval. You can sign in with your chosen username once the
          request is approved.
        </p>
        <button className="btn primary block" onClick={() => reset('signin')}>Back to sign in</button>
      </div>
    </Shell>
  );
}

const maskEmail = (email) => email.replace(/^(.).*(@.*)$/, '$1•••••$2');
const maskPhone = (phone) => `•••• ••• ${phone.replace(/\D/g, '').slice(-4)}`;

/**
 * Password reset.
 * Manning agencies verify with a 6-digit code sent to the authorized person's
 * email or mobile number. Clinic staff ask the clinic admin instead.
 */
export function ForgotPassword({ role = 'agency', username: initial = '' }) {
  const { state, dispatch } = useStore();
  const { back, reset, toast } = useNav();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState(initial);
  const [channel, setChannel] = useState('email');
  const [sent, setSent] = useState(null); // { code, to }
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');

  if (role !== 'agency') {
    return (
      <Shell title="Forgot password" back>
        <h2>Ask the clinic admin</h2>
        <p className="lead">
          Clinic staff and admin passwords are reset by the clinic admin under Manage, Users. The admin will give
          you a new temporary password.
        </p>
        <button className="btn primary block" onClick={back}>Back to sign in</button>
      </Shell>
    );
  }

  const agency = state.agencies.find((a) => a.username === username.trim());

  const sendCode = (ev) => {
    ev.preventDefault();
    if (!agency) return setError('No manning agency account uses that username.');
    // Demo only: a real system sends this by email or SMS and never shows it on screen.
    const fresh = String(Math.floor(100000 + Math.random() * 900000));
    setSent({
      code: fresh,
      to: channel === 'email' ? maskEmail(agency.authorized.email) : maskPhone(agency.authorized.contact),
    });
    setError('');
    setCode('');
    return setStep(2);
  };

  const save = (ev) => {
    ev.preventDefault();
    if (code.trim() !== sent.code) return setError('That verification code is not correct.');
    if (password.length < 8) return setError('Use at least 8 characters for the new password.');
    if (password !== again) return setError('The two passwords do not match.');
    dispatch({ type: 'resetAgencyPassword', username: agency.username, password });
    toast('Password changed. Sign in with your new password.');
    return reset('signin');
  };

  return (
    <Shell title="Forgot password" back>
      <h2>Reset agency password</h2>
      {step === 1 ? (
        <>
          <p className="lead">We send a verification code to the authorized person on your agency account.</p>
          <form className="form" onSubmit={sendCode} noValidate>
            <Field label="Agency username" error={error}>
              <input type="text" value={username} autoCapitalize="none"
                onChange={(ev) => { setUsername(ev.target.value); setError(''); }} />
            </Field>
            <Field label="Send the code to">
              <Select
                value={channel}
                onChange={setChannel}
                options={[{ value: 'email', label: 'Email address' }, { value: 'sms', label: 'Mobile number' }]}
              />
            </Field>
            <button className="btn primary block">Send verification code</button>
          </form>
        </>
      ) : (
        <>
          <p className="lead">A 6-digit code was sent to {sent.to}.</p>
          <form className="form" onSubmit={save} noValidate>
            <Note tone="amber" icon="alert" title="Demo only">
              No real message is sent in this prototype. Your code is {sent.code}.
            </Note>
            <Field label="Verification code">
              <input type="text" inputMode="numeric" maxLength={6} value={code}
                onChange={(ev) => { setCode(ev.target.value); setError(''); }} />
            </Field>
            <Field label="New password (min. 8 characters)">
              <input type="password" value={password} onChange={(ev) => { setPassword(ev.target.value); setError(''); }} />
            </Field>
            <Field label="Repeat new password">
              <input type="password" value={again} onChange={(ev) => { setAgain(ev.target.value); setError(''); }} />
            </Field>
            {error && <Note tone="red" icon="alert">{error}</Note>}
            <button className="btn primary block">Change password</button>
            <button type="button" className="btn block" onClick={() => { setStep(1); setError(''); }}>
              Send a new code
            </button>
          </form>
        </>
      )}
    </Shell>
  );
}

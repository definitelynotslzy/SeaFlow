// Signed-out screens: sign in, agency registration, agency password reset.
import { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { Shell, Field, Select, Note, Icon, useNav } from '../ui.jsx';
import { loginClinicUser } from "../adminAuth.js";
import { createAgencyRequest } from "../createAgencyRequest.js";
import { loginAgency } from "../agencyAuth.js";
import {
  LIMITS, AGENCY_RULES, agencyRequestErrors, agencyKey, passwordError, confirmError, codeError, digitsOnly,
  friendlyError,
} from '../validators.js';

/** Counts down the seconds left until `until` (a time in ms), then stays at 0. */
function useCountdown(until) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (until <= Date.now()) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [until]);
  return Math.max(0, Math.ceil((until - now) / 1000));
}

export function SignIn() {
  const { state, dispatch } = useStore();
  const { nav } = useNav();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(0);
  const [pausedUntil, setPausedUntil] = useState(0);
  const wait = useCountdown(pausedUntil);

  // There is no account type picker. The system works out who is signing in:
  // it checks clinic accounts (admin and staff) first, then manning agencies.
  const submit = async (ev) => {
    ev.preventDefault();
    if (busy || wait) return;

    const u = username.trim().toLowerCase();
    const e = {};
    if (!u) e.username = 'Enter your username.';
    if (!password) e.password = 'Enter your password.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    let clinicError;
    try {
      const session = await loginClinicUser(u, password);
      dispatch({ type: 'login', session });
      return;
    } catch (err) {
      clinicError = err;
    }

    // These two mean the account exists but is not a clinic account, so try agencies.
    const notClinicAccount =
      clinicError.message === 'Account profile not found.' ||
      clinicError.message === 'Account is not authorized.';

    if (notClinicAccount) {
      try {
        const session = await loginAgency(u, password);
        dispatch({ type: 'login', session });
        return;
      } catch (err) {
        // "Agency registration not found." means it was never an agency either,
        // so the clinic message (for example a deactivated account) is the useful one.
        if (err.message !== 'Agency registration not found.') clinicError = err;
      }
    }

    console.error('Sign-in failed:', clinicError);
    setBusy(false);

    // Too many wrong tries: pause the form for a short while.
    const wrongPassword = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(clinicError.code);
    const tries = wrongPassword ? failed + 1 : failed;
    if (clinicError.code === 'auth/too-many-requests') {
      setPausedUntil(Date.now() + 60e3);
    } else if (tries >= LIMITS.signInAttempts) {
      setFailed(0);
      setPausedUntil(Date.now() + LIMITS.signInPauseSeconds * 1000);
      return setErrors({ form: `Too many failed attempts. Please wait ${LIMITS.signInPauseSeconds} seconds before trying again.` });
    } else {
      setFailed(tries);
    }
    return setErrors({ form: friendlyError(clinicError, 'Unable to sign in. Please try again.') });
  };

  const edit = (setter, k) => (ev) => {
    setter(ev.target.value);
    if (errors[k] || errors.form) setErrors({ ...errors, [k]: undefined, form: undefined });
  };

  return (
    <Shell title="Sign in">
      <h2>Welcome back to SeaFlow</h2>
      <p className="lead">Enter your username and password to continue.</p>
      <form className="form" onSubmit={submit} noValidate>
        <Field label="Username" error={errors.username || (errors.form && ' ')}>
          <input type="text" value={username} maxLength={LIMITS.username.max} autoCapitalize="none" spellCheck={false}
            autoComplete="username" onChange={edit(setUsername, 'username')} />
        </Field>
        <Field label="Password" error={errors.password || (errors.form && ' ')}>
          <input type={show ? 'text' : 'password'} value={password} maxLength={LIMITS.password.max}
            autoComplete="current-password" onChange={edit(setPassword, 'password')} />
        </Field>
        <div className="link-row">
          <button type="button" className="link" onClick={() => setShow(!show)}>
            {show ? 'Hide' : 'Show'} password
          </button>
          <button type="button" className="link" onClick={() => nav('g.forgot', { role: 'agency', username: username.trim() })}>
            Forgot password?
          </button>
        </div>
        {errors.form && <Note tone="red" icon="alert">{errors.form}</Note>}
        <button className="btn primary block lg" disabled={busy || wait > 0}>
          {wait > 0 ? `Try again in ${wait}s` : busy ? 'Signing in...' : 'Sign in to SeaFlow'}
        </button>
      </form>

      <div className="auth-alt">
        <span>New manning agency?</span>
        <button type="button" className="btn block" onClick={() => nav('g.request')}>Request an agency account</button>
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
  username: '', password: '', again: '',
  confirm: false,
};

// Typing limits and keyboard hints for each field.
const NAME = { maxLength: LIMITS.name.max, autoComplete: 'name' };
const TITLE = { maxLength: LIMITS.position.max, autoComplete: 'organization-title' };
const PHONE = { maxLength: 16, inputMode: 'tel', autoComplete: 'tel' };
const MAIL = { maxLength: LIMITS.email.max, inputMode: 'email', autoCapitalize: 'none', autoComplete: 'email' };
const INPUT_PROPS = {
  agencyName: { maxLength: LIMITS.agencyName.max, autoComplete: 'organization' },
  address: { maxLength: LIMITS.address.max, autoComplete: 'street-address' },
  authName: NAME, authPosition: TITLE, authContact: PHONE, authEmail: MAIL,
  billName: NAME, billPosition: TITLE, billContact: PHONE, billEmail: MAIL,
  username: { maxLength: LIMITS.username.max, autoCapitalize: 'none', spellCheck: false, autoComplete: 'username' },
  password: { maxLength: LIMITS.password.max, autoComplete: 'new-password' },
  again: { maxLength: LIMITS.password.max, autoComplete: 'new-password' },
};

const RULES = { ...AGENCY_RULES, again: (f) => confirmError(f.password, f.again) };

/** Agency registration. No supporting documents are needed. */
export function RequestAccess() {
  const { state } = useStore();
  const { nav, back } = useNav();
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (ev) => {
    setF({ ...f, [k]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value });
    if (errors[k] || errors.submit) setErrors({ ...errors, [k]: undefined, submit: undefined }); // editing clears the error
  };

  // An agency with the same name, ignoring case and endings such as "Inc." or "Corp."
  const taken = (name) => {
    const key = agencyKey(name);
    return key && state.agencies.some((a) => agencyKey(a.name || a.agencyName || '') === key);
  };

  // Each field is checked as soon as the user leaves it.
  const blur = (k) => () => {
    if (!String(f[k]).trim()) return;
    const next = { ...errors, [k]: RULES[k](f) || undefined };
    if (k === 'agencyName' && !next.agencyName && taken(f.agencyName)) next.agencyName = 'This agency is already registered. Sign in, or contact the clinic.';
    if (k === 'password' && f.again) next.again = RULES.again(f) || undefined;
    if (k === 'username' && f.password) next.password = RULES.password(f) || undefined;
    setErrors(next);
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (submitting) return;

    const e = agencyRequestErrors(f);
    if (!e.agencyName && taken(f.agencyName)) e.agencyName = 'This agency is already registered. Sign in, or contact the clinic.';
    const again = RULES.again(f);
    if (again) e.again = again;
    if (!f.confirm) e.confirm = 'Please confirm you are authorized.';

    setErrors(e);
    if (Object.keys(e).length) return;

    setSubmitting(true);

    try {
      await createAgencyRequest(f); // cleans the details before saving
      nav('g.submitted', { name: f.agencyName.trim() });
    } catch (error) {
      console.error('Agency registration failed:', error);
      const message = friendlyError(error, 'Unable to submit your registration. Please try again.');
      // A username that is already in use is shown beside the username field.
      setErrors(/username/i.test(message) ? { username: message } : { submit: message });
    } finally {
      setSubmitting(false);
    }
  };

  const text = (k, label, placeholder, type = 'text', hint) => (
    <Field label={`${label} *`} error={errors[k]} hint={hint}>
      <input type={type} value={f[k]} placeholder={placeholder} onChange={set(k)} onBlur={blur(k)} {...INPUT_PROPS[k]} />
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
          <div className="full">
            {text('username', 'Username', 'Choose a username', 'text', 'Starts with a letter. Letters, numbers, dots, underscores and hyphens only.')}
          </div>
          {text('password', 'Password', '', 'password', 'At least 8 characters, with a letter and a number.')}
          {text('again', 'Confirm password', '', 'password')}
        </div>

        <div>
          <label className="check">
            <input type="checkbox" checked={f.confirm} onChange={set('confirm')} />
            I confirm I am authorized to register this agency and the details are accurate.
          </label>
          {errors.confirm && <p className="err">{errors.confirm}</p>}
        </div>
        {errors.submit && <Note tone="red" icon="alert">{errors.submit}</Note>}
        <div className="actions">
          <button className="btn primary" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit request'}
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
 * The code works for a limited time and a limited number of tries.
 */
export function ForgotPassword({ role = 'agency', username: initial = '' }) {
  const { state, dispatch } = useStore();
  const { back, reset, toast } = useNav();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState(initial);
  const [channel, setChannel] = useState('email');
  const [sent, setSent] = useState(null); // { code, to, expires, tries }
  const [resendAt, setResendAt] = useState(0);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState({});
  const wait = useCountdown(resendAt);

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

  const agency = state.agencies.find((a) => a.username === username.trim().toLowerCase());

  const sendCode = (ev) => {
    ev?.preventDefault();
    if (wait) return undefined;
    if (!username.trim()) return setErrors({ username: 'Enter your agency username.' });
    if (!agency) return setErrors({ username: 'No manning agency account uses that username. Clinic staff and admin should ask the clinic admin to reset their password.' });
    // Demo only: a real system sends this by email or SMS and never shows it on screen.
    const fresh = String(Math.floor(100000 + Math.random() * 900000));
    setSent({
      code: fresh,
      to: channel === 'email' ? maskEmail(agency.authorized.email) : maskPhone(agency.authorized.contact),
      expires: Date.now() + LIMITS.codeMinutes * 60e3,
      tries: 0,
    });
    setResendAt(Date.now() + LIMITS.resendSeconds * 1000);
    setErrors({});
    setCode('');
    return setStep(2);
  };

  const used = sent && sent.tries >= LIMITS.codeAttempts;

  const save = (ev) => {
    ev.preventDefault();
    if (used) return setErrors({ code: 'Too many wrong codes. Send a new code to continue.' });
    if (Date.now() > sent.expires) return setErrors({ code: `That code has expired. Codes last ${LIMITS.codeMinutes} minutes. Send a new code.` });

    const e = {};
    if (codeError(code)) e.code = codeError(code);
    const pw = passwordError(password, { username: agency.username, previous: agency.password });
    if (pw) e.password = pw;
    const match = confirmError(password, again);
    if (match) e.again = match;
    if (Object.keys(e).length) return setErrors(e);

    if (code !== sent.code) {
      const tries = sent.tries + 1;
      const left = LIMITS.codeAttempts - tries;
      setSent({ ...sent, tries });
      return setErrors({
        code: left > 0
          ? `That code is not correct. ${left} ${left === 1 ? 'try' : 'tries'} left.`
          : 'Too many wrong codes. Send a new code to continue.',
      });
    }

    dispatch({ type: 'resetAgencyPassword', username: agency.username, password });
    toast('Password changed. Sign in with your new password.');
    return reset('signin');
  };

  const clear = (k) => { if (errors[k]) setErrors({ ...errors, [k]: undefined }); };

  return (
    <Shell title="Forgot password" back>
      <h2>Reset agency password</h2>
      {step === 1 ? (
        <>
          <p className="lead">We send a verification code to the authorized person on your agency account.</p>
          <form className="form" onSubmit={sendCode} noValidate>
            <Field label="Agency username" error={errors.username}>
              <input type="text" value={username} maxLength={LIMITS.username.max} autoCapitalize="none" spellCheck={false}
                autoComplete="username" onChange={(ev) => { setUsername(ev.target.value); clear('username'); }} />
            </Field>
            <Field label="Send the code to">
              <Select
                value={channel}
                onChange={setChannel}
                options={[{ value: 'email', label: 'Email address' }, { value: 'sms', label: 'Mobile number' }]}
              />
            </Field>
            <button className="btn primary block" disabled={wait > 0}>
              {wait > 0 ? `Send another code in ${wait}s` : 'Send verification code'}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="lead">A 6-digit code was sent to {sent.to}. It works for {LIMITS.codeMinutes} minutes.</p>
          <form className="form" onSubmit={save} noValidate>
            <Note tone="amber" icon="alert" title="Demo only">
              No real message is sent in this prototype. Your code is {sent.code}.
            </Note>
            <Field label="Verification code" error={errors.code}>
              <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={6} value={code}
                disabled={used}
                onChange={(ev) => { setCode(digitsOnly(ev.target.value, 6)); clear('code'); }} />
            </Field>
            <Field label="New password" error={errors.password} hint="At least 8 characters, with a letter and a number.">
              <input type="password" value={password} maxLength={LIMITS.password.max} autoComplete="new-password"
                onChange={(ev) => { setPassword(ev.target.value); clear('password'); }}
                onBlur={() => password && setErrors({ ...errors, password: passwordError(password, { username: agency.username, previous: agency.password }) || undefined })} />
            </Field>
            <Field label="Confirm new password" error={errors.again}>
              <input type="password" value={again} maxLength={LIMITS.password.max} autoComplete="new-password"
                onChange={(ev) => { setAgain(ev.target.value); clear('again'); }}
                onBlur={() => again && setErrors({ ...errors, again: confirmError(password, again) || undefined })} />
            </Field>
            <button className="btn primary block" disabled={used}>Change password</button>
            <button type="button" className="btn block" disabled={wait > 0} onClick={() => sendCode()}>
              {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
            </button>
          </form>
        </>
      )}
    </Shell>
  );
}

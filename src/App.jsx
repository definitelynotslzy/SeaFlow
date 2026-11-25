import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StoreProvider, useStore } from './store.jsx';
import { NavCtx } from './ui.jsx';
import * as G from './screens/General.jsx';
import * as M from './screens/Agency.jsx';
import * as S from './screens/Staff.jsx';
import * as A from './screens/Admin.jsx';
import * as Shared from './screens/Shared.jsx';
import { logoutUser } from "./logout.js";

// Screen registry. Codes in comments match the prototype screen document.
const SCREENS = {
  signin: G.SignIn, // G1–G2
  'g.request': G.RequestAccess, // G3–G4
  'g.submitted': G.RequestSubmitted, // G5
  'g.forgot': G.ForgotPassword, // agency password reset by verification code

  'm.home': M.Home, // M1
  'm.list': M.Endorsements, // M2–M3
  'm.new': M.NewEndorsement, // M4–M7, M16–M17
  'm.submitted': M.Submitted, // M18
  'm.billing': M.Billing, // billing statements received by the agency

  's.dash': S.Dashboard, // S1
  's.queue': S.Queue, // S2–S3, S6
  's.active': S.Active, // S4–S5, S7–S9
  's.billing': S.Billing, // S10–S12
  's.patients': S.Patients, // S13
  's.patient': S.PatientOverview, // S14–S15, S17–S18
  's.breakglass': S.BreakGlass, // S16

  'a.overview': A.Overview, // A1–A2
  'a.manage': A.Manage, // A3–A7
  'a.request': A.AgencyRequest, // A8
  'a.agency': A.AgencyDetails, // A9
  'a.all': A.AllEndorsements, // A10–A11
  'a.reports': A.Reports, // A12–A13
  'a.bg': A.BreakGlassReview, // A14
  'a.audit': A.AuditLog, // A15

  timeline: Shared.Timeline, // M8–M12, S19
  alerts: Shared.Alerts, // M13, S20, A16
  profile: Shared.Profile, // M14–M15, S21, A17
};

const HOME = { agency: 'm.home', staff: 's.dash', admin: 'a.overview' };
const OWN = { agency: 'm.', staff: 's.', admin: 'a.' };

/** Records an attempt to open a screen that belongs to another role. */
function BlockedScreen({ name }) {
  const { dispatch } = useStore();
  useEffect(() => {
    dispatch({ type: 'logDenied', detail: `Tried to open a screen of another role (${name})` });
  }, [name, dispatch]);
  return null;
}
const PUBLIC = ['signin', 'g.request', 'g.submitted', 'g.forgot'];

function Inner() {
  const { state, dispatch } = useStore();
  const role = state.session?.role;
  const [stack, setStack] = useState([{ name: 'signin', params: {} }]);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const ctx = useMemo(
    () => ({
      nav: (name, params = {}) => setStack((st) => [...st, { name, params }]),
      back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
      reset: (name, params = {}) => setStack([{ name, params }]),
      toast: showToast,
    }),
    [showToast],
  );

  // Signing in or out resets navigation to that role's starting screen.
  useEffect(() => {
    setStack([{ name: role ? HOME[role] : 'signin', params: {} }]);
  }, [role]);

  // Auto-logout after inactivity (duration comes from the admin access policy).
  const idleMinutes = state.policy.autoLogoutMinutes;
  useEffect(() => {
    if (!role) return undefined;
    let timer;
    const arm = () => {
      clearTimeout(timer);
      
timer = setTimeout(async () => {
  const success = await logoutUser(dispatch, role);

  if (success) {
    showToast("Signed out after inactivity");
  } else {
    showToast("Unable to sign out. Please try again.");
  }
}, idleMinutes * 60e3);

    };
    arm();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, [role, idleMinutes, dispatch, showToast]);

  // Guard: never show a signed-in screen without a session, or the reverse.
  let top = stack[stack.length - 1];
  let depth = stack.length;
  const isPublic = PUBLIC.includes(top.name);
  // Each role may open only its own screens (m. agency, s. clinic staff, a. clinic admin).
  const wanted = top.name;
  const blocked = !!role && /^[msa]\./.test(wanted) && !wanted.startsWith(OWN[role]);
  if (!role && !isPublic) { top = { name: 'signin', params: {} }; depth = 1; }
  if (role && isPublic) { top = { name: HOME[role], params: {} }; depth = 1; }
  if (blocked) { top = { name: HOME[role], params: {} }; depth = 1; }
  const Screen = SCREENS[top.name];

  return (
    <div className="root">
      <NavCtx.Provider value={ctx}>
        {blocked && <BlockedScreen name={wanted} />}
        <Screen key={`${depth}:${top.name}`} {...top.params} />
      </NavCtx.Provider>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Inner />
    </StoreProvider>
  );
}

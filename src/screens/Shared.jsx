// Screens used by more than one role: status timeline, alerts, profile.
import { useState } from 'react';
import { useStore, myAlerts, stamp, fmtDate, isClosed, visitsOf, agencyName, ROLE_LABEL } from '../store.jsx';
import { Shell, Intro, Card, Chip, Field, Details, FileRow, Note, Empty, Icon, Modal, useNav } from '../ui.jsx';
import { logoutUser } from "../logout.js";

/** Seafarer name with position and vessel underneath (first column of most tables). */
export function Person({ e }) {
  return (
    <>
      <span className="strong">{e.name}</span>
      <span className="meta">{e.position}, {e.vessel}</span>
    </>
  );
}

const HOME_TAB = { agency: 'm.list', staff: 's.active', admin: 'a.overview' };

/** Status timeline: case summary on the left, clinic visits on the right. */
export function Timeline({ id }) {
  const { state, dispatch } = useStore();
  const { toast } = useNav();
  const { role, agencyId } = state.session;
  const e = state.endorsements.find((x) => x.ref === id);

  // Agencies may only open their own patients.
  if (!e || (role === 'agency' && e.agencyId !== agencyId)) {
    return (
      <Shell title="Status timeline" back tab={HOME_TAB[role]}>
        <Card><Empty text="Record not found." /></Card>
      </Shell>
    );
  }

  const items = [...e.timeline].reverse(); // newest first
  const latest = items[0];
  const closed = isClosed(e);
  const visits = visitsOf(e);
  const lastVisit = visits[visits.length - 1];

  const request = () => {
    dispatch({ type: 'requestUpdate', id });
    toast('The clinic has been notified.');
  };

  return (
    <Shell title="Status timeline" back tab={HOME_TAB[role]}>
      <div className="split aside-left">
        <div className="stack">
          <Card>
            <div className="over">{e.ref}</div>
            <div className="card-name">{e.name}</div>
            <div className="meta">{e.position}, {e.vessel}</div>
            <div className="chips" style={{ margin: '12px 0 16px' }}>
              <Chip>{e.status}</Chip>
              {e.cashBasis && <Chip>Cash basis</Chip>}
            </div>
            <Details
              items={[
                ...(role !== 'agency' ? [['Manning agency', agencyName(state, e.agencyId)]] : []),
                ['Can come to the clinic', fmtDate(e.visitDate)],
                ['Clinic visits', lastVisit ? `${visits.length}, last on ${stamp(lastVisit.ms)}` : 'None yet'],
              ]}
            />
            <div style={{ marginTop: 16 }}>
              <FileRow label="Referral letter" file={e.referral} />
            </div>
          </Card>

          {closed && (
            <Note tone="teal" icon="check" title="Case closed.">
              Final status: {e.status}. No further updates. The final medical report is in the timeline.
            </Note>
          )}
          {role === 'agency' && e.status === 'Pending' && (
            <Note tone="amber" icon="alert">Waiting for the clinic to review this endorsement.</Note>
          )}
          {role === 'agency' && !closed && e.status !== 'Pending' && !lastVisit && (
            <Note tone="amber" icon="alert" title="No clinic visit yet.">
              The clinic sends a medical report at each visit; the billing statement follows separately. Expected first visit:{' '}
              {fmtDate(e.visitDate)}.
            </Note>
          )}
          {role === 'agency' && !closed && lastVisit && (
            e.updateRequested ? (
              <Note tone="teal" icon="check" title="Medical update requested.">
                The clinic has been notified.
              </Note>
            ) : (
              <button className="btn primary" onClick={request}>Request medical update</button>
            )
          )}
        </div>

        <Card title="Updates from the clinic" sub="Each clinic visit sets a status and sends its medical report. The billing statement for a visit is sent separately, later.">
          <Note tone="teal" title="Latest authorized update" className="banner">
            {latest.kind === 'visit'
              ? `Clinic visit ${latest.n}: ${latest.label}, medical report attached`
              : latest.label}
          </Note>
          <ul className="tl">
            {items.map((t, i) => (
              <li key={i}>
                <b>{t.kind === 'visit' ? `Clinic visit ${t.n} · ${t.label}` : t.label}</b>
                <small>
                  {stamp(t.ms)}
                  {role !== 'agency' && t.reportBy ? ` · Report by ${t.reportBy}` : ''}
                  {role !== 'agency' && t.by ? ` · Sent by ${t.by}` : ''}
                </small>
                {t.kind === 'visit' && (
                  <div className="files">
                    <FileRow label="Medical report" file={t.report} />
                    {!t.billing && <small>Billing statement for this visit to follow.</small>}
                  </div>
                )}
                {t.kind === 'billing' && (
                  <div className="files">
                    <FileRow label="Billing statement" file={t.file} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Shell>
  );
}

/** Notifications for the signed-in user. */
export function Alerts() {
  const { state } = useStore();
  const list = myAlerts(state);
  return (
    <Shell title="Alerts" tab="alerts">
      <Intro title="Notifications" sub="Updates about your endorsements, requests and accounts." />
      <Card className="narrow">
        {list.length === 0 ? (
          <Empty text="You have no notifications yet." icon="bell" />
        ) : (
          <div className="rowlist">
            {list.map((a) => (
              <div className="row" key={a.id}>
                <div>
                  <div>{a.text}</div>
                  <div className="meta">{stamp(a.ms)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Shell>
  );
}

/** Profile: account details, and contact editing for agencies. */
export function Profile() {
  const { state, dispatch } = useStore();
  const { role, name, duty } = state.session;
const signOut = async () => {
  const success = await logoutUser(dispatch, role);

  if (!success) {
    alert("Unable to sign out. Please try again.");
  }
};

  if (role === 'agency') return <AgencyProfile onSignOut={signOut} />;

  return (
    <Shell title="Profile" tab="profile">
      <Intro title={name} sub="Your clinic account.">
        <button className="btn" onClick={signOut}><Icon name="logout" size={16} /> Sign out</button>
      </Intro>
      <Card className="narrow" title="Account">
        <Details
          cols
          items={[
            ['Role', ROLE_LABEL[role]],
            ['Organization', 'NGC Medical Specialists Clinic'],
            ...(role === 'staff' ? [['Assigned to', duty]] : []),
            ['Password', 'Reset by the clinic admin'],
          ]}
        />
      </Card>
    </Shell>
  );
}

function AgencyProfile({ onSignOut }) {
  const { state, dispatch } = useStore();
  const { toast } = useNav();
  const a = state.agencies.find((x) => x.id === state.session.agencyId);
  const [editing, setEditing] = useState(false);
  const blank = () => ({
    address: a.address,
    authContact: a.authorized.contact, authEmail: a.authorized.email,
    billContact: a.billing.contact, billEmail: a.billing.email,
  });
  const [f, setF] = useState(blank);
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });

  const save = () => {
    dispatch({
      type: 'updateAgencyContacts', id: a.id, address: f.address,
      authorized: { contact: f.authContact, email: f.authEmail },
      billing: { contact: f.billContact, email: f.billEmail },
    });
    setEditing(false);
    toast('Details updated');
  };

  return (
    <Shell title="Profile" tab="profile">
      <Intro title={a.name} sub="Manning agency account. To change the agency name or the named persons, contact the clinic.">
        <button className="btn primary" onClick={() => { setF(blank()); setEditing(true); }}>Edit details</button>
        <button className="btn" onClick={onSignOut}><Icon name="logout" size={16} /> Sign out</button>
      </Intro>
      <div className="split even">
        <Card title="Agency" action={<Chip>{a.status}</Chip>}>
          <Details items={[['Agency name', a.name], ['Address', a.address], ['Username', a.username]]} />
        </Card>
        <div className="stack">
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
      </div>

      {editing && (
        <Modal
          wide
          title="Edit details"
          sub="Contact details the clinic uses to reach your agency."
          onClose={() => setEditing(false)}
          footer={(
            <>
              <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
              <button className="btn primary" onClick={save}>Save changes</button>
            </>
          )}
        >
          <Field label="Address"><input type="text" value={f.address} onChange={set('address')} /></Field>
          <div className="form-grid">
            <h3 className="full">Authorized person: {a.authorized.name}</h3>
            <Field label="Contact no."><input type="tel" value={f.authContact} onChange={set('authContact')} /></Field>
            <Field label="Email address"><input type="email" value={f.authEmail} onChange={set('authEmail')} /></Field>
            <h3 className="full">Medical report and billing: {a.billing.name}</h3>
            <Field label="Contact no."><input type="tel" value={f.billContact} onChange={set('billContact')} /></Field>
            <Field label="Email address"><input type="email" value={f.billEmail} onChange={set('billEmail')} /></Field>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

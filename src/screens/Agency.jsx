// Manning agency side. Agencies only ever see their own endorsements.
import { useState } from 'react';
import { useStore, IN_PROGRESS, CLOSED, isClosed, refOf, stamp, visitsOf } from '../store.jsx';
import { Shell, Intro, Card, Chip, Field, Select, FilePick, Table, Stat, Empty, Note, Icon, useNav } from '../ui.jsx';
import { Person } from './Shared.jsx';
import { createEndorsement } from "../endorsementService.js";
import {
  LIMITS, FILE_RULES, ENDORSEMENT_RULES, endorsementErrors, cleanEndorsement, fileError, acceptOf,
  ageFrom, sameText, todayISO, addDays, friendlyError,
} from '../validators.js';


function useMine() {
  const { state } = useStore();

  const agencyId = state.session?.agencyId;

  const agency = state.agencies.find(
    (a) => a.id === agencyId
  ) || {
    id: agencyId,
    name: state.session?.name || "Manning Agency",
    billing: {
      name: "Billing Officer"
    }
  };

  const mine = state.endorsements.filter(
    (e) => e.agencyId === agencyId
  );

  const bills = mine
    .flatMap((e) =>
      visitsOf(e)
        .filter((v) => v.billing)
        .map((v) => ({ e, v }))
    )
    .sort((a, b) => b.v.billingMs - a.v.billingMs);

  return { agency, mine, bills };
}


const GROUPS = {
  All: () => true,
  Pending: (e) => e.status === 'Pending',
  'In progress': (e) => IN_PROGRESS.includes(e.status),
  Concluded: (e) => CLOSED.includes(e.status),
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}


const ENDORSEMENT_COLUMNS = [
  { head: 'Seafarer', cell: (e) => <Person e={e} /> },
  {
    head: 'Patient Code',
    cell: (e) => e.patientCode || `PT-${e.ref}`,
    className: 'nowrap'
  },
  { head: 'Received', cell: (e) => stamp(e.receivedMs), className: 'nowrap' },
  { head: 'Clinic visits', cell: (e) => visitsOf(e).length || 'None yet' },
  { head: 'Status', cell: (e) => <Chip>{e.status}</Chip> },
];


/** Agency home: counts, recent endorsements, latest billing. */
export function Home() {
  const { nav, reset, toast } = useNav();
  const { agency, mine, bills } = useMine();
  const count = (g) => mine.filter(GROUPS[g]).length;
  const short = agency.name.split(' ').slice(0, 2).join(' ');

  return (
    <Shell title="Agency home" tab="m.home">
      <Intro title={`${greeting()}, ${short}`} sub={`${agency.name}. Only your agency's records are shown.`}>
        <button className="btn primary" onClick={() => nav('m.new')}><Icon name="plus" size={16} /> New endorsement</button>
      </Intro>

      <div className="stats">
        <Stat solid tone="amber" icon="clock" value={count('Pending')} label="Pending review" onClick={() => nav('m.list', { group: 'Pending' })} />
        <Stat solid tone="teal" icon="pulse" value={count('In progress')} label="In progress" onClick={() => nav('m.list', { group: 'In progress' })} />
        <Stat solid tone="green" icon="check" value={count('Concluded')} label="Concluded" onClick={() => nav('m.list', { group: 'Concluded' })} />
        <Stat solid tone="blue" icon="receipt" value={bills.length} label="Billing statements" onClick={() => reset('m.billing')} />
      </div>

      <div className="split section">
        <Card
          flush
          title="Recent endorsements"
          action={<button className="link" onClick={() => reset('m.list')}>View all</button>}
        >
          <Table
            columns={ENDORSEMENT_COLUMNS.filter((c) => c.head !== 'Clinic visits')}
            rows={mine.slice(0, 6)}
            rowKey={(e) => e.ref}
            onRow={(e) => nav('timeline', { id: e.ref })}
            pager={false}
            empty="No endorsements yet. Start with New endorsement."
          />
        </Card>

        <Card
          title="Latest billing statements"
          sub={`One per clinic visit, sent to ${agency.billing.name}.`}
          action={<button className="link" onClick={() => reset('m.billing')}>View all</button>}
        >
          {bills.length === 0 ? (
            <Empty text="No billing statements yet." icon="receipt" />
          ) : (
            <div className="rowlist">
              {bills.slice(0, 5).map(({ e, v }) => (
                <div className="row" key={`${e.ref}:${v.n}`}>
                  <div>
                    <div className="strong">{e.name}</div>
                    <div className="meta">{e.ref}, clinic visit {v.n}</div>
                    <div className="meta">{stamp(v.billingMs)}</div>
                  </div>
                  <button className="link" onClick={() => toast(`${v.billing} is a demo file`)}>View</button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}

/** Agency billing: every billing statement received from the clinic. */
export function Billing() {
  const { nav, toast } = useNav();
  const { bills } = useMine();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = bills.filter(
    ({ e, v }) => !needle || `${e.name} ${e.ref} ${e.vessel} ${v.billing}`.toLowerCase().includes(needle),
  );

  return (
    <Shell title="Billing" tab="m.billing">
      <Intro title="Billing statements" sub="One billing statement per clinic visit, sent by the clinic after the medical report." />
      <div className="toolbar">
        <Field label="Search" className="grow">
          <input type="search" value={q} placeholder="Search name, reference or vessel" onChange={(ev) => setQ(ev.target.value)} />
        </Field>
      </div>
      <Card flush>
        <Table
          key={needle}
          columns={[
            { head: 'Seafarer', cell: ({ e }) => <Person e={e} /> },
            { head: 'Reference', cell: ({ e }) => e.ref, className: 'nowrap' },
            { head: 'Clinic visit', cell: ({ v }) => `Visit ${v.n}, ${v.label}` },
            { head: 'Received', cell: ({ v }) => stamp(v.billingMs), className: 'nowrap' },
            { head: 'Billing statement', cell: ({ v }) => v.billing },
            {
              head: '', stop: true, className: 'right',
              cell: ({ e, v }) => (
                <div className="actions">
                  <button className="btn sm" onClick={() => toast(`${v.billing} is a demo file`)}>View</button>
                  <button className="btn sm" onClick={() => nav('timeline', { id: e.ref })}>Open case</button>
                </div>
              ),
            },
          ]}
          rows={list}
          rowKey={({ e, v }) => `${e.ref}:${v.n}`}
          empty="No billing statements match."
        />
      </Card>
    </Shell>
  );
}

/** Endorsements: history and search. */
export function Endorsements({ group = 'All' }) {
  const { nav } = useNav();
  const { mine } = useMine();
  const [q, setQ] = useState('');
  const [g, setG] = useState(group);
  const needle = q.trim().toLowerCase();
  const list = mine.filter(
    (e) => GROUPS[g](e) && (!needle || `${e.name} ${e.vessel} ${e.ref}`.toLowerCase().includes(needle)),
  );

  return (
    <Shell title="Endorsements" tab="m.list" back={group !== 'All'}>
      <Intro title="Endorsements" sub="Past and active endorsements. Open one to see its clinic visits.">
        <button className="btn primary" onClick={() => nav('m.new')}><Icon name="plus" size={16} /> New endorsement</button>
      </Intro>
      <div className="toolbar">
        <Field label="Search" className="grow">
          <input type="search" value={q} placeholder="Search name, vessel or reference" onChange={(ev) => setQ(ev.target.value)} />
        </Field>
        <Field label="Show">
          <Select value={g} onChange={setG} options={Object.keys(GROUPS)} />
        </Field>
      </div>
      <Card flush>
        <Table
          key={`${g}:${needle}`}
          columns={ENDORSEMENT_COLUMNS}
          rows={list}
          rowKey={(e) => e.ref}
          onRow={(e) => nav('timeline', { id: e.ref })}
          empty="No endorsements match."
        />
      </Card>
    </Shell>
  );
}

const BLANK = {
  name: '', birthday: '', age: '', address: '', email: '', contact: '',
  position: '', vessel: '', repatriation: '', case: '', visitDate: '', referral: '', confirm: false,
};

// Typing limits and keyboard hints for each text field.
const INPUT_PROPS = {
  name: { maxLength: LIMITS.name.max, autoComplete: 'off' },
  birthday: { min: addDays(todayISO(), -366 * LIMITS.ageMax), max: todayISO() },
  address: { maxLength: LIMITS.address.max, autoComplete: 'off' },
  email: { maxLength: LIMITS.email.max, inputMode: 'email', autoCapitalize: 'none', autoComplete: 'off' },
  contact: { maxLength: 16, inputMode: 'tel', autoComplete: 'off' },
  position: { maxLength: LIMITS.position.max, autoComplete: 'off' },
  vessel: { maxLength: LIMITS.vessel.max, autoComplete: 'off' },
  repatriation: { min: LIMITS.earliestRepatriation, max: addDays(todayISO(), LIMITS.repatriationFutureDays) },
  case: { maxLength: LIMITS.reason.max, autoComplete: 'off' },
  visitDate: { min: todayISO(), max: addDays(todayISO(), LIMITS.visitWindowDays) },
};

/** New endorsement, in three sections, with the duplicate check. */
export function NewEndorsement() {
  const { reset, back } = useNav();
  const { dispatch } = useStore();
  const { agency, mine } = useMine();
  const [f, setF] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [dupWarned, setDupWarned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (ev) => {
    const value = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
    const next = { ...f, [k]: value };
    if (k === 'birthday') next.age = ageFrom(value); // the age always follows the birthday
    if (k === 'name' || k === 'vessel' || k === 'birthday') setDupWarned(false);
    setF(next);
    if (errors[k] || errors.submit) setErrors({ ...errors, [k]: undefined, submit: undefined }); // editing clears the error
  };

  // Each field is checked as soon as the user leaves it. An untouched empty
  // field stays quiet until the form is submitted.
  const blur = (k) => () => {
    if (!String(f[k]).trim()) return;
    const next = { ...errors, [k]: ENDORSEMENT_RULES[k](f) || undefined };
    // The visit date depends on the repatriation date, so re-check it too.
    if (k === 'repatriation' && f.visitDate) next.visitDate = ENDORSEMENT_RULES.visitDate(f) || undefined;
    setErrors(next);
  };

  // The referral letter is checked when it is picked: PDF, JPG or PNG, not empty, within the size limit.
  const pickReferral = (name, file) => {
    const problem = fileError(file, FILE_RULES.referral);
    if (problem) {
      setF({ ...f, referral: '' });
      return setErrors({ ...errors, referral: problem });
    }
    setF({ ...f, referral: name });
    return setErrors({ ...errors, referral: undefined });
  };

  // Open endorsements of the same person. Case, spacing and punctuation are ignored.
  const samePerson = mine.filter(
    (x) => !isClosed(x) && sameText(x.name, f.name) && (x.birthday || '') === f.birthday,
  );
  const exactDuplicate = samePerson.find((x) => sameText(x.vessel, f.vessel));

  const submit = async (ev) => {
    ev.preventDefault();
    if (submitting) return;

    const e = endorsementErrors(f);
    if (!f.confirm) e.confirm = 'Please confirm authorization.';
    setErrors(e);
    if (Object.keys(e).length) return;

    // The same seafarer on the same vessel is already open: this is blocked.
    if (exactDuplicate) {
      setErrors({
        submit: `${exactDuplicate.name} on ${exactDuplicate.vessel} already has an open endorsement (PT-${exactDuplicate.ref}). Open that record instead of sending a new one.`,
      });
      return;
    }

    // The same seafarer on another vessel is only a warning.
    if (samePerson.length && !dupWarned) {
      setDupWarned(true);
      return;
    }

    setSubmitting(true);

    try {
      const { confirm, ...data } = cleanEndorsement(f);
      const endorsement = await createEndorsement(data);
      dispatch({ type: 'logAction', action: 'Submitted endorsement', id: endorsement.ref, note: `Patient: ${data.name} · ${data.vessel}` });
      reset('m.submitted', { id: endorsement.ref });
    } catch (error) {
      console.error('Endorsement submission failed:', error);
      if (error.code === 'permission-denied') {
        dispatch({ type: 'logDenied', detail: 'Firebase refused to save a new endorsement' });
      }
      setErrors((prev) => ({
        ...prev,
        submit: error.code === 'permission-denied'
          ? 'Your agency account is not allowed to submit endorsements yet. Contact the clinic.'
          : friendlyError(error, 'Unable to submit the endorsement. Please try again.'),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const input = (k, label, placeholder, type = 'text', hint) => (
    <Field label={`${label} *`} error={errors[k]} hint={hint}>
      <input type={type} value={f[k]} placeholder={placeholder} onChange={set(k)} onBlur={blur(k)} {...INPUT_PROPS[k]} />
    </Field>
  );

  return (
    <Shell title="New endorsement" back tab="m.list">
      <Intro title="Endorse a seafarer" sub="Fields marked * are required. Share coordination details only." />
      <form className="stack" onSubmit={submit} noValidate>
        {dupWarned && (
          <Note tone="amber" icon="alert" title="Possible duplicate">
            A seafarer with the same name and birthday already has an open endorsement on another vessel. Submit again to confirm.
          </Note>
        )}
        <div className="split even">
          <Card title="Seafarer details">
            <div className="form">
              {input('name', 'Seafarer full name', 'Juan Dela Cruz')}
              <div className="two">
                {input('birthday', 'Birthday', '', 'date')}
                <Field label="Age" hint="Filled in from the birthday.">
                  <input type="text" value={f.age} placeholder="—" readOnly tabIndex={-1} />
                </Field>
              </div>
              {input('address', 'Address', 'Street, barangay, city')}
              <div className="two">
                {input('email', 'Email address', 'name@email.com', 'email')}
                {input('contact', 'Contact number', '09xx xxx xxxx', 'tel')}
              </div>
            </div>
          </Card>
          <div className="stack">
            <Card title="Assignment and Case">
              <div className="form">
                <div className="two">
                  {input('position', 'Position', '')}
                  {input('vessel', 'Vessel', '')}
                </div>
                <div className="two">
                  <Field label="Agent *">
                    <input type="text" value={agency.name} readOnly />
                  </Field>
                  {input('repatriation', 'Date of repatriation', '', 'date')}
                </div>
                {input('case', 'Case', 'Reason for endorsement')}
              </div>
            </Card>
            <Card title="Clinic visit">
              <div className="form">
                {input('visitDate', 'When can the patient come to the clinic?', '', 'date')}
                <div className="field">
                  <label><span>Referral letter (PDF, JPG or PNG, up to {LIMITS.referralMaxMb} MB) *</span></label>
                  <FilePick
                    file={f.referral}
                    accept={acceptOf(FILE_RULES.referral)}
                    empty="No referral letter attached"
                    onPick={pickReferral}
                    onRemove={() => setF({ ...f, referral: '' })}
                  />
                  {errors.referral && <p className="err">{errors.referral}</p>}
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Card>
          <label className="check">
            <input type="checkbox" checked={f.confirm} onChange={set('confirm')} />
            I confirm my agency is authorized to share this information with the clinic.
          </label>
          {errors.confirm && <p className="err">{errors.confirm}</p>}
          <div className="card-foot">
            {errors.submit && (
  <Note tone="red" icon="alert">
    {errors.submit}
  </Note>
)}
            <button
  className="btn primary"
  disabled={submitting}
>
  {submitting ? "Submitting..." : "Submit endorsement"}
</button>
            <button type="button" className="btn" onClick={back}>Cancel</button>
          </div>
        </Card>
      </form>
    </Shell>
  );
}

/** Confirmation after submitting an endorsement. */

export function Submitted({ id }) {
  const { nav, reset } = useNav();

  return (
    <Shell title="Submitted" tab="m.list">
      <Card className="narrow center">
        <div className="success-mark">
          <Icon name="check" size={28} />
        </div>

        <h2>Endorsement submitted</h2>

        <p className="meta" style={{ margin: '4px 0 16px' }}>
          Sent to the clinic review queue.
        </p>

        <div className="meta">Patient Code</div>
        <div className="ref">{`PT-${id}`}</div>

        <div className="card-foot" style={{ justifyContent: 'center' }}>
          <button
            className="btn primary"
            onClick={() => nav('timeline', { id })}
          >
            View status
          </button>

          <button
            className="btn"
            onClick={() => reset('m.home')}
          >
            Back to home
          </button>
        </div>
      </Card>
    </Shell>
  );
}

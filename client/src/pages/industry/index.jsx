import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post, put } from '../../api.js';
import { useFetch, Async, Card, Badge, Button, Input, Select, Textarea, Alert, ErrorBox, Stat, StatusBadge, Table, useAction, useForm, label, fmtDate } from '../../components/ui.jsx';
import { BarChart, countsToBars } from '../../components/Charts.jsx';
import { OppManager } from '../../components/OppManager.jsx';
import { ApplicantList, ApplicantView } from '../../components/Applicants.jsx';
import { DocPicker, DownloadLink } from '../../components/Docs.jsx';

export function Dashboard() {
  const st = useFetch('/industry/dashboard'); const org = useFetch('/industry/organization');
  return <div className="stack"><h1>Recruiter dashboard</h1>{org.data && org.data.status !== 'VERIFIED' && <Alert tone="warn">Your organization is <b>{label(org.data.status)}</b>. You can prepare drafts, but publishing needs administrator verification and an active college partnership.</Alert>}
    <Async state={st} isEmpty={() => false}>{(d) => <><div className="grid g4"><Stat value={d.publishedVacancies} label="Published vacancies" /><Stat value={d.applicants} label="Applicants" /><Stat value={d.eligibleApplicants} label="Fully eligible applicants" /><Stat value={d.conversionPercent === null ? '—' : `${d.conversionPercent}%`} label="Application → accepted offer" /><Stat value={d.avgDaysToFill ?? '—'} label="Avg. days to fill" /></div><p className="small muted">{d.definition}</p>
      <div className="grid g2"><Card title="Hiring pipeline"><BarChart title="Pipeline" data={countsToBars(d.pipeline)} /></Card><Card title="Candidate match-score distribution"><BarChart title="Match distribution" data={d.matchDistribution.map((b) => ({ label: b.label, value: b.count }))} /></Card></div></>}</Async></div>;
}
export function Organization() {
  const st = useFetch('/industry/organization'); const a = useAction();
  return <div className="stack"><h1>Organization</h1><Async state={st} isEmpty={() => false}>{(o) => <OrgForm o={o} onSaved={st.reload} a={a} />}</Async></div>;
}
function OrgForm({ o, onSaved, a }) {
  const f = useForm({ displayName: o.displayName, website: o.website || '', industry: o.industry || '', sizeBand: o.sizeBand || '', address: o.address || '', repName: o.repName, repDesignation: o.repDesignation });
  return <form className="card" onSubmit={async (e) => { e.preventDefault(); const v = f.values; if (await a.run(() => put('/industry/organization', { displayName: v.displayName, website: v.website || undefined, industry: v.industry || undefined, sizeBand: v.sizeBand || undefined, address: v.address || undefined, repName: v.repName, repDesignation: v.repDesignation }), 'Saved')) onSaved(); }}>
    <p><b>{o.legalName}</b> · Verification: <StatusBadge status={o.status} /> {o.verificationNote && <span className="small muted">({o.verificationNote})</span>}</p><ErrorBox error={a.error} /><div className="grid g2"><Input label="Display name" required {...f.bind('displayName')} /><Input label="Website" type="url" {...f.bind('website')} /><Input label="Industry" {...f.bind('industry')} /><Input label="Size" {...f.bind('sizeBand')} /><Input label="Authorised representative" required {...f.bind('repName')} /><Input label="Designation" required {...f.bind('repDesignation')} /></div><Input label="Address" {...f.bind('address')} /><Button busy={a.busy}>Save</Button></form>;
}
export function Partnerships() {
  const st = useFetch('/industry/partnerships'); const insts = useFetch('/industry/institutions'); const f = useForm({ institutionId: '', note: '' }); const a = useAction(); const [pick, setPick] = useState({});
  return <div className="stack"><h1>College partnerships</h1><p className="muted">A partnership with an institution is required before your opportunities reach its students.</p>
    <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => post('/industry/partnerships', { institutionId: f.values.institutionId, note: f.values.note || undefined }), 'Request sent')) { f.reset(); st.reload(); } }}><h3>Request a partnership</h3><ErrorBox error={a.error} /><Select label="Institution" required value={f.values.institutionId} onChange={f.bind('institutionId').onChange} name="institutionId" options={(insts.data || []).map((i) => ({ value: i.id, label: `${i.name}${i.city ? ', ' + i.city : ''}` }))} placeholder="Choose" /><Textarea label="Message" {...f.bind('note')} /><Button busy={a.busy}>Send request</Button></form>
    <Async state={st} empty="No partnership requests yet.">{(rows) => rows.map((p) => { const latest = p.agreements[0]; const canSubmit = !['REJECTED', 'TERMINATED'].includes(p.status) && !(latest?.status === 'SUBMITTED'); return <Card key={p.id}><div className="row between"><h3 style={{ margin: 0 }}>{p.institution.name}</h3><StatusBadge status={p.status} /></div>{p.validUntil && <p className="small">Valid {fmtDate(p.validFrom)} → {fmtDate(p.validUntil)}</p>}
      {p.agreements.length > 0 && <ul className="small">{p.agreements.map((x) => <li key={x.id}>v{x.version} <StatusBadge status={x.status} /> <DownloadLink id={x.document.id} name={x.document.originalName} />{x.reviewNote && ` — reviewer: ${x.reviewNote}`}</li>)}</ul>}
      {canSubmit && <><p className="small muted">{p.status === 'ACTIVE' ? 'Submit a renewal agreement before expiry.' : 'Upload the agreement or MoU for the college to review. This is a document record, not a legally valid e-signature.'}</p><DocPicker kinds={['AGREEMENT']} title="Agreement document" selected={pick[p.id] || []} onChange={(ids) => setPick({ ...pick, [p.id]: ids.slice(-1) })} /><Button variant="secondary" disabled={!(pick[p.id] || []).length} onClick={async () => { await a.run(() => post(`/industry/partnerships/${p.id}/agreements`, { documentId: pick[p.id][0] }), 'Agreement submitted'); st.reload(); }}>Submit selected agreement</Button></>}</Card>; })}</Async></div>;
}
export const Opportunities = () => <OppManager base="/industry/opportunities" kind="industry" title="Your opportunities" />;
export const Applicants = () => <ApplicantList base="/industry/applicants" page="/industry/applicants" />;
export const ApplicantDetail = () => <ApplicantView base="/industry/applicants" back="/industry/applicants" full />;
export function Referrals() {
  const st = useFetch('/industry/referrals'); const a = useAction();
  return <div className="stack"><h1>Alumni referrals</h1><p className="muted">Referrals appear here only after the student consented. Accepting one creates an application that is checked against every eligibility rule; a referral never bypasses your criteria.</p><ErrorBox error={a.error} />
    <Async state={st} empty="No referrals yet.">{(rows) => rows.map((r) => <Card key={r.id}><div className="row between"><h3 style={{ margin: 0 }}>{r.candidate.name} → {r.opportunity.title}</h3><StatusBadge status={r.status} /></div><p className="small muted">{r.candidate.department} · class of {r.candidate.graduationYear} · referred by {r.alumni.name}{r.alumni.employer ? ` (${r.alumni.employer}${r.alumni.role ? ', ' + r.alumni.role : ''})` : ''} · eligibility {label(r.eligibility)}</p>{r.note && <p>“{r.note}”</p>}
      {r.status === 'SUBMITTED' && <div className="row"><Button onClick={async () => { await a.run(() => post(`/industry/referrals/${r.id}/decision`, { accept: true }), 'Added to pipeline'); st.reload(); }}>Accept into pipeline</Button><Button variant="secondary" onClick={async () => { await a.run(() => post(`/industry/referrals/${r.id}/decision`, { accept: false })); st.reload(); }}>Decline</Button></div>}{r.applicationId && <Link to={`/industry/applicants/${r.applicationId}`}>Open application</Link>}</Card>)}</Async></div>;
}

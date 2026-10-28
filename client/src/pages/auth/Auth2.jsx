import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useAuth, ROLE_HOME } from '../../auth/AuthContext.jsx';
import { post, get } from '../../api.js';
import { Card, Input, Button, ErrorBox, Alert, useForm, useAction, useFetch, Async, StatusBadge } from '../../components/ui.jsx';
import { DocPicker } from '../../components/Docs.jsx';

export function VerifyEmail() {
  const [sp] = useSearchParams(); const [state, setState] = useState({ loading: true });
  useEffect(() => { post('/auth/verify-email', { token: sp.get('token') || '' }).then((r) => setState({ ok: true, status: r.data.status })).catch((e) => setState({ error: e })); }, [sp]);
  return <div className="container section" style={{ maxWidth: 560 }}><h1>Email verification</h1>{state.loading && <span className="spinner" />}{state.ok && <Alert tone="ok">Your email is verified. {state.status === 'ACTIVE' ? 'You can sign in now.' : 'Your account now waits for approval; you can sign in to see its status.'}</Alert>}{state.error && <ErrorBox error={state.error} />}<Link className="btn" to="/login">Sign in</Link></div>;
}
export function Forgot() {
  const f = useForm({ email: '' }); const a = useAction(); const [sent, setSent] = useState(false);
  return <div className="container section" style={{ maxWidth: 520 }}><h1>Reset your password</h1>{sent ? <Alert tone="ok">If an account exists for that email, a reset link is on its way. It expires in one hour.</Alert> : <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => post('/auth/forgot-password', f.values))) setSent(true); }}><ErrorBox error={a.error} /><Input label="Email" type="email" required {...f.bind('email')} /><Button busy={a.busy}>Send reset link</Button></form>}</div>;
}
export function Reset() {
  const [sp] = useSearchParams(); const nav = useNavigate(); const f = useForm({ password: '' }); const a = useAction();
  return <div className="container section" style={{ maxWidth: 520 }}><h1>Choose a new password</h1><form className="card" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => post('/auth/reset-password', { token: sp.get('token'), password: f.values.password }), 'Password updated')) nav('/login'); }}><ErrorBox error={a.error} /><Input label="New password" type="password" minLength={10} required hint="At least 10 characters with a letter and a number." {...f.bind('password')} /><Button busy={a.busy}>Update password</Button></form></div>;
}
export const Unauthorized = () => <div className="container section"><h1>Access denied</h1><p>Your account does not have permission to view that page.</p><Link className="btn" to="/">Back to home</Link></div>;

// Shown while an account waits for email verification / approval. Students and alumni can add evidence here.
export function Pending() {
  const { user, logout, refresh } = useAuth(); const me = useFetch(user?.role === 'STUDENT' ? '/student/status' : null); const [docs, setDocs] = useState([]); const a = useAction(); const [done, setDone] = useState(false);
  if (user.status === 'ACTIVE') return <div className="container section"><Alert tone="ok">Your account is approved.</Alert><Link className="btn" to={ROLE_HOME[user.role]}>Open dashboard</Link></div>;
  const send = async () => { const r = await a.run(() => user.role === 'STUDENT' ? post('/student/enrollment/resubmit', { documentIds: docs }) : post('/alumni/evidence', { documentIds: docs }), 'Documents sent for review'); if (r) setDone(true); };
  return <div className="container section" style={{ maxWidth: 700 }}><h1>Your account is awaiting approval</h1>
    <Card><p><b>Status:</b> <StatusBadge status={user.status} /></p>
      <p>{user.role === 'STUDENT' && 'Your college must verify your enrollment before you can use the platform.'}{user.role === 'ALUMNI' && 'Your college must confirm your graduation.'}{user.role === 'COLLEGE_AUTHORITY' && 'A platform administrator (or an administrator at your institution) must approve your access.'}{user.role === 'INDUSTRY' && 'A platform administrator must verify your organization.'}</p>
      {user.role === 'STUDENT' && me.data && <p>Registration review: <StatusBadge status={me.data.registrationStatus} /> at {me.data.institution}.</p>}
      <div className="row"><Button variant="secondary" onClick={refresh}>Check status again</Button><Button variant="ghost" onClick={logout}>Sign out</Button></div></Card>
    {['STUDENT', 'ALUMNI'].includes(user.role) && <div style={{ marginTop: '1rem' }}><h2>Add supporting documents</h2><p className="muted">An ID proof or marksheet helps your reviewer. Only reviewers of your own institution can open these files.</p><DocPicker kinds={['ID_PROOF', 'MARKSHEET', 'CERTIFICATE']} selected={docs} onChange={setDocs} /><ErrorBox error={a.error} />{done ? <Alert tone="ok">Sent. You will be notified of the decision.</Alert> : <Button busy={a.busy} onClick={send} disabled={!docs.length}>Send selected documents for review</Button>}</div>}</div>;
}

export function ForcedPasswordChange() {
  const { user, refresh, logout } = useAuth(); const nav = useNavigate(); const f = useForm({ currentPassword: '', newPassword: '' }); const a = useAction();
  if (!user) return <div className="container section"><Link to="/login">Sign in</Link></div>;
  return <div className="container section" style={{ maxWidth: 520 }}><h1>Change your password</h1>{user.mustChangePassword && <Alert tone="warn">This account was created with a temporary password. You must choose a new one before continuing.</Alert>}
    <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await a.run(() => post('/auth/change-password', f.values), 'Password changed')) { await refresh(); nav(ROLE_HOME[user.role]); } }}><ErrorBox error={a.error} /><Input label="Current password" type="password" required {...f.bind('currentPassword')} /><Input label="New password" type="password" minLength={10} required {...f.bind('newPassword')} /><div className="row"><Button busy={a.busy}>Change password</Button><Button type="button" variant="ghost" onClick={logout}>Sign out</Button></div></form></div>;
}

export function VerifyCredential() {
  const { jti } = useParams(); const st = useFetch(`/public/credentials/${jti}`);
  return <div className="container section" style={{ maxWidth: 640 }}><h1>Credential verification</h1><Async state={st} isEmpty={() => false}>{(r) => r.valid ? <Card><Alert tone="ok"><b>Valid.</b> This token was issued by the platform and has not been revoked or expired.</Alert><dl><dt>Institution</dt><dd>{r.claims.institution}</dd><dt>Discipline</dt><dd>{r.claims.discipline || '—'}</dd><dt>Degree / graduation year</dt><dd>{r.claims.degree}, {r.claims.graduationYear}</dd><dt>Verified items</dt><dd>{Object.entries(r.claims.verifiedCounts).map(([k, n]) => `${k}: ${n}`).join(' · ')}</dd><dt>Valid until</dt><dd>{new Date(r.claims.expiresAt).toLocaleDateString('en-IN')}</dd></dl><p className="small muted">The token contains no personal details such as name, contact or identifiers.</p></Card> : <Alert tone="error"><b>Not valid.</b> Reason: {r.reason.replace(/_/g, ' ').toLowerCase()}.</Alert>}</Async></div>;
}
export { get };

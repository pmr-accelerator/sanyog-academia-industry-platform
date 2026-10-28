import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams, Navigate } from 'react-router-dom';
import { useAuth, ROLE_HOME } from '../../auth/AuthContext.jsx';
import { post } from '../../api.js';
import { Card, Input, Select, Textarea, Button, ErrorBox, Alert, useForm, useAction, useFetch, Check, Async } from '../../components/ui.jsx';

const ROLES = [['student', 'Student', 'Build a verified profile, find opportunities, get an AI roadmap.'], ['college', 'College authority', 'Verify students, manage partnerships and placement support.'], ['industry', 'Industry / recruiter', 'Publish opportunities and hire from partner colleges.'], ['alumni', 'Alumni', 'Refer students and mentor them.']];
export function RoleSelect() {
  return <div className="container section"><h1>Create your account</h1><p className="muted">Choose how you will use the platform. Platform administrators are created by the operator, not through public registration.</p>
    <div className="grid g4">{ROLES.map(([k, t, d]) => <Card key={k}><h3>{t}</h3><p className="small muted">{d}</p><Link className="btn small" to={`/register/${k}`}>Register as {t.toLowerCase()}</Link></Card>)}</div><p style={{ marginTop: '1rem' }}>Already registered? <Link to="/login">Sign in</Link></p></div>;
}

export function Login() {
  const { login, config, user } = useAuth(); const nav = useNavigate(); const [sp] = useSearchParams();
  const f = useForm({ email: '', password: '' }); const a = useAction();
  const demo = useFetch(config.demoMode ? '/public/demo-accounts' : null);
  if (user && !user.mustChangePassword) return <Navigate to={sp.get('next') || ROLE_HOME[user.role]} replace />;
  const submit = async (e) => {
    e.preventDefault();
    const d = await a.run(() => login(f.values.email.trim(), f.values.password));
    if (!d) return;
    if (d.user.mustChangePassword) nav('/change-password'); else if (d.user.status !== 'ACTIVE') nav('/pending'); else nav(sp.get('next') || ROLE_HOME[d.user.role]);
  };
  return <div className="container section" style={{ maxWidth: 520 }}><h1>Sign in</h1>
    {sp.get('expired') && <Alert tone="warn">Your session expired. Please sign in again.</Alert>}
    <form className="card" onSubmit={submit}><ErrorBox error={a.error} />{a.error?.code === 'EMAIL_NOT_VERIFIED' && <Button type="button" variant="secondary small" onClick={() => post('/auth/resend-verification', { email: f.values.email })}>Resend verification email</Button>}
      <Input label="Email" type="email" autoComplete="username" required {...f.bind('email')} /><Input label="Password" type="password" autoComplete="current-password" required {...f.bind('password')} />
      <Button busy={a.busy}>Sign in</Button> <Link to="/forgot-password" className="small" style={{ marginLeft: '1rem' }}>Forgot password?</Link></form>
    <p>New here? <Link to="/register">Create an account</Link></p>
    {config.demoMode && <Card title="Demonstration accounts"><p className="small muted">Demo mode is on. These synthetic accounts use the password set as SEED_DEMO_PASSWORD in the server’s .env file. Privileged demo accounts must change it at first sign-in.</p>
      <Async state={demo} empty="No demo accounts found. Run the seed command.">{(rows) => <ul>{rows.map((r) => <li key={r.email}><button className="btn ghost small" type="button" onClick={() => f.set({ email: r.email })}>{r.email}</button> <span className="small muted">{r.role.toLowerCase().replace('_', ' ')}</span></li>)}</ul>}</Async></Card>}
  </div>;
}

const accountFields = (f) => <><Input label="Full name" required {...f.bind('fullName')} /><Input label="Email" type="email" autoComplete="email" required {...f.bind('email')} /><Input label="Phone (optional)" type="tel" {...f.bind('phone')} /><Input label="Password" type="password" autoComplete="new-password" minLength={10} required hint="At least 10 characters with a letter and a number." {...f.bind('password')} /></>;

export function Register() {
  const { role } = useParams(); const a = useAction(); const [done, setDone] = useState(false);
  const inst = useFetch('/public/institutions'); const disc = useFetch('/public/disciplines');
  const f = useForm({ fullName: '', email: '', phone: '', password: '', institutionId: '', departmentId: '', degree: 'B.Tech', academicYear: 1, semester: 1, graduationYear: new Date().getFullYear() + 3, studentIdNumber: '', registrationNumber: '', enrollmentNumber: '', title: '', mode: 'existing', instName: '', instCode: '', instCity: '', instState: '', repName: '', repDesignation: '', legalName: '', displayName: '', regNo: '', website: '', industry: '', sizeBand: '', address: '', currentEmployer: '', currentRole: '', expertise: '', bio: '', linkedinUrl: '' });
  if (!ROLES.some((r) => r[0] === role)) return <Navigate to="/register" replace />;
  const v = f.values; const chosen = (inst.data || []).find((i) => i.id === v.institutionId); const required = chosen?.registrationRules?.requiredStudentFields || [];
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== '' && x !== undefined));
  const payload = () => {
    const acct = { fullName: v.fullName, email: v.email.trim(), phone: v.phone, password: v.password };
    if (role === 'student') return clean({ ...acct, institutionId: v.institutionId, departmentId: v.departmentId, degree: v.degree, academicYear: Number(v.academicYear), semester: Number(v.semester), graduationYear: Number(v.graduationYear), studentIdNumber: v.studentIdNumber, registrationNumber: v.registrationNumber, enrollmentNumber: v.enrollmentNumber });
    if (role === 'college') return v.mode === 'existing' ? clean({ ...acct, title: v.title, institutionId: v.institutionId }) : clean({ ...acct, title: v.title, newInstitution: clean({ name: v.instName, institutionCode: v.instCode, city: v.instCity, state: v.instState, website: v.website }) });
    if (role === 'industry') return clean({ ...acct, repName: v.repName || v.fullName, repDesignation: v.repDesignation, organization: clean({ legalName: v.legalName, displayName: v.displayName || v.legalName, registrationNumber: v.regNo, website: v.website, industry: v.industry, sizeBand: v.sizeBand, address: v.address }) });
    return clean({ ...acct, institutionId: v.institutionId, departmentId: v.departmentId, degree: v.degree, graduationYear: Number(v.graduationYear), currentEmployer: v.currentEmployer, currentRole: v.currentRole, expertise: v.expertise ? v.expertise.split(',').map((s) => s.trim()).filter(Boolean) : undefined, bio: v.bio, linkedinUrl: v.linkedinUrl });
  };
  const submit = async (e) => { e.preventDefault(); const r = await a.run(() => post(`/auth/register/${role}`, payload())); if (r) setDone(true); };
  if (done) return <div className="container section" style={{ maxWidth: 620 }}><h1>Check your email</h1><Alert tone="ok">We sent a verification link to <b>{v.email}</b>.</Alert><p>After you verify your email, your account waits for approval: {role === 'student' ? 'your college verifies your enrollment' : role === 'alumni' ? 'your college confirms your graduation' : role === 'college' ? 'a platform administrator approves your institution access' : 'a platform administrator verifies your organization'}. You can sign in meanwhile to see your status{role === 'student' || role === 'alumni' ? ' and upload supporting documents' : ''}.</p><p className="small muted">Development note: with the default console mail transport the link is printed in the server terminal.</p><Link className="btn" to="/login">Go to sign in</Link></div>;
  const deps = chosen?.departments || [];
  const instSelect = <Select label="Institution" required value={v.institutionId} onChange={(e) => f.set({ institutionId: e.target.value, departmentId: '' })} options={(inst.data || []).map((i) => ({ value: i.id, label: `${i.name}${i.city ? ', ' + i.city : ''}` }))} placeholder="Select your institution" hint="Only verified institutions are listed." />;
  const deptSelect = <Select label="Department" value={v.departmentId} onChange={f.bind('departmentId').onChange} name="departmentId" options={deps.map((d) => ({ value: d.id, label: d.name }))} placeholder="Select department" />;
  return <div className="container section" style={{ maxWidth: 720 }}><h1>Register as {ROLES.find((r) => r[0] === role)[1].toLowerCase()}</h1>
    <form className="card" onSubmit={submit}><ErrorBox error={a.error} />{accountFields(f)}
      {role === 'student' && <>{instSelect}{deptSelect}<div className="grid g3"><Input label="Degree" required {...f.bind('degree')} /><Input label="Academic year" type="number" min="1" max="6" required {...f.bind('academicYear')} /><Input label="Semester" type="number" min="1" max="12" required {...f.bind('semester')} /></div><Input label="Graduation year" type="number" required {...f.bind('graduationYear')} />
        <div className="grid g3"><Input label={`Student ID${required.includes('studentIdNumber') ? ' (required)' : ''}`} required={required.includes('studentIdNumber')} {...f.bind('studentIdNumber')} /><Input label={`Registration no.${required.includes('registrationNumber') ? ' (required)' : ''}`} required={required.includes('registrationNumber')} {...f.bind('registrationNumber')} /><Input label={`Enrollment no.${required.includes('enrollmentNumber') ? ' (required)' : ''}`} required={required.includes('enrollmentNumber')} {...f.bind('enrollmentNumber')} /></div><p className="small muted">Your institution decides which identifiers are required.</p></>}
      {role === 'college' && <><Input label="Your title" {...f.bind('title')} /><Select label="Institution" value={v.mode} onChange={f.bind('mode').onChange} name="mode" options={[{ value: 'existing', label: 'My institution is already on the platform' }, { value: 'new', label: 'Register a new institution' }]} />{v.mode === 'existing' ? instSelect : <><Input label="Institution name" required {...f.bind('instName')} /><Input label="Official institution code (optional)" {...f.bind('instCode')} /><div className="grid g2"><Input label="City" {...f.bind('instCity')} /><Input label="State" {...f.bind('instState')} /></div><Input label="Website" type="url" {...f.bind('website')} /></>}<Alert tone="info">A platform administrator reviews new institutions and staff access before you can verify students.</Alert></>}
      {role === 'industry' && <><Input label="Legal name of organization" required {...f.bind('legalName')} /><Input label="Display name" {...f.bind('displayName')} /><Input label="Registration number" {...f.bind('regNo')} /><div className="grid g2"><Input label="Industry" {...f.bind('industry')} /><Select label="Size" value={v.sizeBand} onChange={f.bind('sizeBand').onChange} name="sizeBand" options={['1-50', '51-200', '201-500', '501-1000', '1000+']} placeholder="Select" /></div><Input label="Website" type="url" {...f.bind('website')} /><Input label="Address" {...f.bind('address')} /><div className="grid g2"><Input label="Authorised representative" {...f.bind('repName')} hint="Defaults to your name." /><Input label="Representative’s designation" required {...f.bind('repDesignation')} /></div><Alert tone="info">A platform administrator verifies organizations before they can publish opportunities.</Alert></>}
      {role === 'alumni' && <>{instSelect}{deptSelect}<div className="grid g2"><Input label="Degree" required {...f.bind('degree')} /><Input label="Graduation year" type="number" required {...f.bind('graduationYear')} /></div><div className="grid g2"><Input label="Current employer" {...f.bind('currentEmployer')} /><Input label="Current role" {...f.bind('currentRole')} /></div><Input label="Expertise (comma separated)" {...f.bind('expertise')} /><Textarea label="Short bio" {...f.bind('bio')} /><Input label="Professional profile URL" type="url" {...f.bind('linkedinUrl')} /></>}
      <Check label={<>I agree to the <Link to="/terms" target="_blank">Terms</Link> and <Link to="/privacy" target="_blank">Privacy policy</Link>.</>} required /><Button busy={a.busy}>Create account</Button></form></div>;
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LinkButton, Card, Input, Textarea, Button, useAction, ErrorBox, Alert, useFetch, Async, label } from '../../components/ui.jsx';
import { BarChart, CollabGraph, Radar } from '../../components/Charts.jsx';
import { post } from '../../api.js';

function Page({ title, lead, children, cta }) {
  return <div className="container section"><h1>{title}</h1>{lead && <p className="lead muted" style={{ fontSize: '1.15rem', maxWidth: '70ch' }}>{lead}</p>}<div className="stack" style={{ marginTop: '1.5rem' }}>{children}</div>{cta && <div className="row" style={{ marginTop: '2rem' }}>{cta}</div>}</div>;
}
const Cards = ({ items }) => <div className="grid g3">{items.map(([h, p]) => <Card key={h}><h3>{h}</h3><p className="small" style={{ margin: 0 }}>{p}</p></Card>)}</div>;

export const About = () => <Page title="About the platform" lead="An independent platform that helps colleges, students, employers and alumni work from the same trusted facts.">
  <p>Employers often cannot tell which student claims are accurate, and students often cannot tell why they were not shortlisted. The platform puts the college in the middle as the party that verifies identity, enrollment, marks, skills and projects, and makes every eligibility decision explainable.</p>
  <Cards items={[['Trust through verification', 'Credentials are verified by authorised college reviewers. Reviewer, time and reason are recorded.'], ['Explainable matching', 'Eligibility uses the criteria written on the opportunity. You see which requirements you meet and which you miss.'], ['Privacy by consent', 'Recruiters and alumni see only what a student chose to share, and students can withdraw consent.']]} />
  <Alert tone="info">This platform is independent. It does not claim government affiliation, approval or endorsement.</Alert></Page>;

export const HowItWorks = () => <Page title="How it works" lead="Five roles, one verified record." cta={<LinkButton to="/register">Create an account</LinkButton>}>
  <ol className="steps" style={{ padding: 0 }}>{[['Register', 'Students, colleges, organizations and alumni each have their own registration with the checks that apply to them.'], ['Get verified', 'Colleges verify students and alumni; platform administrators verify institutions and organizations.'], ['Partner', 'Organizations request partnerships with colleges and submit agreements for review.'], ['Match', 'Opportunities carry structured criteria. Students see eligible, needs-review and not-eligible results with reasons.'], ['Apply & track', 'Applications, interviews and offers are tracked end to end, with placement-cell support.'], ['Learn & grow', 'An AI-assisted roadmap and a learning library help close skill gaps.']].map(([h, p]) => <li key={h}><h3>{h}</h3><p className="small">{p}</p></li>)}</ol></Page>;

export const ForStudents = () => <Page title="For students" lead="Know where you stand, and what to do next." cta={<LinkButton to="/register/student">Register as a student</LinkButton>}>
  <Cards items={[['Verified profile', 'Marks, skills, projects and certificates verified by your college.'], ['Clear eligibility', 'For each opportunity: eligible, needs review or not eligible — with the exact reasons.'], ['Readiness simulator', 'See which missing requirements block you and what would qualify you.'], ['AI career roadmap', 'A plan fitted to your department, year and target role, with free resources.'], ['Placement support', 'Ask your placement cell for interview preparation, resume review and offer guidance.'], ['You control sharing', 'Choose what each employer or alumnus can see and withdraw consent any time.']]} /></Page>;

export const ForInstitutions = () => <Page title="For institutions" lead="Verify once, serve every employer, and see your own outcomes." cta={<LinkButton to="/register/college">Register an institution</LinkButton>}>
  <Cards items={[['Verification workflow', 'A queue of student, skill, project and certificate submissions with approve, reject or request-changes decisions and a full audit trail.'], ['Partnerships and MoUs', 'Review agreements, set validity dates, get renewal reminders.'], ['Placement cell tools', 'Assign officers, schedule appointments, message students privately.'], ['Analytics and reports', 'Department skill distribution, conversion, time-to-placement, skill gaps. Export to CSV and PDF.'], ['Your rules', 'Configure registration requirements, backlog and CGPA rules, and your academic calendar.'], ['Scoped access', 'Staff see only their own institution’s records.']]} /></Page>;

export const ForIndustry = () => <Page title="For industry partners" lead="Hire from institutions you trust, with evidence you can check." cta={<LinkButton to="/register/industry">Register an organization</LinkButton>}>
  <Cards items={[['Verified organization', 'Organizations are verified by platform administrators before they can publish.'], ['Partnership first', 'Opportunities reach only institutions you have an approved partnership with.'], ['Consent-based access', 'You see applicants’ verified details only when they chose to share them.'], ['Explainable skill match', 'Every candidate comes with matched and missing requirements and a score you can inspect.'], ['Pipeline tools', 'Shortlist, schedule interviews, make offers, track conversion and time-to-fill.'], ['Alumni referrals', 'Receive referrals from verified alumni, which still pass every eligibility check.']]} /></Page>;

export const ForAlumni = () => <Page title="For alumni" lead="Give back in a structured, accountable way." cta={<LinkButton to="/register/alumni">Register as an alumnus</LinkButton>}>
  <Cards items={[['Verified alumni', 'Your college confirms your graduation before you can refer anyone.'], ['Refer with context', 'Nominate eligible students for specific vacancies and add a note.'], ['Student consent', 'Students must agree before their profile is shared with the employer.'], ['Mentorship', 'Publish career sessions and workshops for students of your college.'], ['Track outcomes', 'See how your referrals progress.'], ['No shortcuts', 'A referral never bypasses employer rules, verification or privacy settings.']]} /></Page>;

const SAMPLE = [{ skill: 'Circuit analysis', required: 3, current: 3 }, { skill: 'Embedded C', required: 4, current: 2 }, { skill: 'Digital electronics', required: 3, current: 3 }, { skill: 'Protocols', required: 3, current: 1 }, { skill: 'Microcontrollers', required: 4, current: 2 }];
export const AiCareer = () => <Page title="AI career guidance" lead="A personalised roadmap, honestly labelled." cta={<LinkButton to="/register/student">Try it as a student</LinkButton>}>
  <div className="grid g2"><div className="stack"><p>The roadmap considers your department and degree, academic year and semester, current skills and proficiency, projects, interests, target role and weekly study time. It covers many disciplines — not only software — including electronics, electrical, mechanical, civil, biotechnology and management.</p>
    <ul><li>Beginner, intermediate and advanced milestones with weekly targets</li><li>Free learning resources from the library, project ideas and assessment milestones</li><li>A skill-gap radar and progress tracking</li><li>Opportunity suggestions that still pass the explicit eligibility rules</li></ul>
    <Alert tone="warn"><b>Advisory only.</b> Roadmaps do not predict or guarantee selection, placement or salary, and AI can never override eligibility or permissions. AI output is validated before it is stored. When no AI provider is configured, a rule-based plan is generated and labelled “Rule-based plan (not AI-generated)”.</Alert></div>
    <Card title="Illustrative sample"><Radar items={SAMPLE} title="Sample radar" size={300} /><p className="small muted">Sample data for illustration only.</p></Card></div></Page>;

export function Collaboration() {
  const g = useFetch('/public/graph');
  return <Page title="Industry collaboration" lead="Approved relationships between institutions, organizations and the skills they ask for.">
    <Async state={g}>{(d) => <Card title="Collaboration graph"><CollabGraph graph={d} /><p className="small muted">Teal: institutions · Amber: verified organizations · Outlined: skills requested in open opportunities. Only active, verified partnerships are shown.</p></Card>}</Async>
    <Cards items={[['Request', 'A verified organization asks a college for a partnership.'], ['Review', 'The college reviews the agreement, requests changes or approves with validity dates.'], ['Operate', 'Opportunities reach students; renewals are reminded before expiry.']]} />
    <p className="small muted">The platform stores agreement documents and review decisions. It does not provide legally valid electronic signatures.</p></Page>;
}

export const PlacementSupport = () => <Page title="Placement support" lead="Help when you need it most: interview invitations and offers.">
  <Cards items={[['Interview preparation', 'Available once you have an interview scheduled.'], ['Resume review', 'Ask for feedback at any time.'], ['Mock interviews', 'Book a slot with a placement officer.'], ['Offer guidance', 'Understand and respond to an offer.'], ['Document checklist', 'Know what to prepare before joining.'], ['Private messages', 'Talk to your placement officer on the platform.']]} />
  <p className="small muted">The placement cell supports your preparation. It cannot guarantee selection or placement.</p></Page>;

export function Impact() {
  const s = useFetch('/public/stats'); const d = useFetch('/public/skill-demand');
  return <Page title="Platform statistics" lead="Counts computed from platform records.">
    <Async state={s}>{(x) => <><div className="grid g4">{[['verifiedInstitutions', 'Verified institutions'], ['verifiedOrganizations', 'Verified organizations'], ['verifiedStudents', 'Verified students'], ['activePartnerships', 'Active partnerships'], ['openOpportunities', 'Open opportunities'], ['libraryResources', 'Library resources']].map(([k, l]) => <Card key={k} className="stat"><b>{x[k]}</b><span>{l}</span></Card>)}</div>{x.isDemoData && <Alert tone="warn">These numbers come from the synthetic demonstration data set.</Alert>}</>}</Async>
    <Card title="Most requested skills in open opportunities"><Async state={d} empty="No open opportunities list skills yet.">{(rows) => <BarChart horizontal title="Most requested skills" data={rows.map((r) => ({ label: r.skill, value: r.demand }))} />}</Async></Card>
    <p className="small muted">Placement outcomes are not published here. Real results appear only in institution dashboards, computed from recorded offers.</p></Page>;
}

const FAQS = [['Is this a government platform?', 'No. It is independent and makes no claim of government affiliation or endorsement.'], ['Who verifies my profile?', 'Authorised staff at your own college review your evidence. Platform administrators verify institutions and organizations.'], ['Can any recruiter see my data?', 'No. A recruiter sees only the fields you chose to share when you applied or consented to a referral, and only for opportunities you are involved in.'], ['Does the AI decide whether I am eligible?', 'Never. Eligibility is computed from the written criteria. AI only suggests learning plans.'], ['What if I have no AI provider configured?', 'The platform uses a rule-based roadmap generator and labels it as such.'], ['Can I delete my account?', 'Yes. You can export your data and delete your account from Account settings. Some records are kept in anonymised form for audit.'], ['Are the learning resources free?', 'They are links to external, publicly available resources. Check each provider’s terms.']];
export const Faq = () => <Page title="Frequently asked questions">{FAQS.map(([q, a]) => <details key={q} className="card"><summary style={{ cursor: 'pointer', fontWeight: 700 }}>{q}</summary><p style={{ margin: '.6rem 0 0' }}>{a}</p></details>)}</Page>;

export function Contact() {
  const [f, setF] = useState({ name: '', email: '', subject: '', message: '' }); const [done, setDone] = useState(false); const a = useAction();
  const b = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  return <Page title="Contact and support" lead="Send us a message and an administrator will respond.">
    {done ? <Alert tone="ok">Thank you. Your message was received.</Alert> : <form className="card" style={{ maxWidth: 560 }} onSubmit={async (e) => { e.preventDefault(); const r = await a.run(() => post('/public/contact', f)); if (r) setDone(true); }}>
      <ErrorBox error={a.error} /><Input label="Your name" required {...b('name')} /><Input label="Email" type="email" required {...b('email')} /><Input label="Subject" required {...b('subject')} /><Textarea label="Message" required {...b('message')} /><Button busy={a.busy}>Send message</Button></form>}</Page>;
}

const DRAFT = <Alert tone="warn">Draft text for review. Have this document reviewed by qualified legal counsel and adapted to your organisation and applicable law before publishing.</Alert>;
export const Privacy = () => <Page title="Privacy policy">{DRAFT}
  <h2>What we collect</h2><p>Account details, academic and skill information you provide, documents you upload for verification, application activity, and security logs.</p>
  <h2>Who can see it</h2><p>Your college’s authorised reviewers see your verification submissions. Recruiters and alumni see only what you consent to share. Administrators see aggregate data and audit logs.</p>
  <h2>Your controls</h2><p>You can revoke consent, export your data and request deletion from Account settings. Deletion anonymises your account; audit records are retained without personal details.</p>
  <h2>Security</h2><p>Passwords are hashed, sessions use HTTP-only cookies, uploads are stored privately, and sensitive actions are logged. No system is perfectly secure.</p>
  <h2>Contact</h2><p>Use the <Link to="/contact">contact form</Link> for privacy requests.</p></Page>;
export const Terms = () => <Page title="Terms of use">{DRAFT}
  <h2>Using the platform</h2><p>You must give accurate information and upload only documents you are allowed to share. Misrepresentation can lead to suspension.</p>
  <h2>No guarantees</h2><p>The platform does not guarantee interviews, offers or placement. AI-generated guidance is advisory.</p>
  <h2>Agreements</h2><p>Documents stored for partnerships are records only. The platform does not provide legally valid electronic signatures.</p>
  <h2>Conduct</h2><p>No impersonation, scraping, or attempts to access data you are not authorised to see.</p></Page>;
export const Accessibility = () => <Page title="Accessibility statement">{DRAFT}
  <p>We aim for the interface to be usable with a keyboard and screen reader, with readable contrast and responsive layouts. A skip link, visible focus indicators, labelled form fields and an “accessible reading mode” (larger text, wider spacing, no animation) are provided. Charts include text labels.</p>
  <p>This site has not yet been audited against WCAG by an independent specialist. If you find a barrier, please <Link to="/contact">tell us</Link>.</p></Page>;
export { label };

import { Link } from 'react-router-dom';
import { useAuth, ROLE_HOME } from '../../auth/AuthContext.jsx';
import { useFetch, Async, Card, LinkButton, Badge, label, fmtDate } from '../../components/ui.jsx';
import { Radar, CollabGraph } from '../../components/Charts.jsx';

// Illustrative sample only – clearly labelled, not real student data.
const SAMPLE_GAPS = [{ skill: 'Python', required: 4, current: 3 }, { skill: 'SQL', required: 3, current: 3 }, { skill: 'REST APIs', required: 3, current: 1 }, { skill: 'Git', required: 3, current: 2 }, { skill: 'Algorithms', required: 4, current: 2 }];

export default function Home() {
  const { user, config } = useAuth();
  const stats = useFetch('/public/stats');
  const opps = useFetch('/public/opportunities?pageSize=3');
  const res = useFetch('/public/resources?pageSize=3');
  const graph = useFetch('/public/graph');
  return (
    <>
      <section className="hero"><div className="container">
        <p className="small" style={{ fontWeight: 700, color: 'var(--brand)' }}>COLLEGE-VERIFIED · SKILL-BASED · TRANSPARENT</p>
        <h1>The college is the bridge between students and industry.</h1>
        <p className="lead">{config.platformName} gives every student a profile their college has verified, shows exactly why an opportunity fits or does not, and helps employers hire from institutions they trust.</p>
        <div className="row">
          {user ? <LinkButton to={ROLE_HOME[user.role]}>Go to your dashboard</LinkButton> : <>
            <LinkButton to="/register/student">I am a student</LinkButton><LinkButton to="/register/college" variant="secondary">I represent a college</LinkButton><LinkButton to="/register/industry" variant="secondary">I am a recruiter</LinkButton><LinkButton to="/register/alumni" variant="secondary">I am an alumnus</LinkButton></>}
        </div>
      </div></section>

      <section className="section"><div className="container">
        <h2>How college-mediated verification works</h2>
        <ol className="steps" style={{ padding: 0 }}>
          <li><h3>Student submits</h3><p className="small">Profile, marks, skills, projects and supporting documents.</p></li>
          <li><h3>College reviews</h3><p className="small">An authorised reviewer checks the evidence and approves, rejects or asks for changes.</p></li>
          <li><h3>Decision is recorded</h3><p className="small">Reviewer, time and reason are stored; the student is notified.</p></li>
          <li><h3>Industry sees only what is allowed</h3><p className="small">Recruiters see verified fields of applicants who chose to share them.</p></li>
        </ol>
        <p className="small muted" style={{ marginTop: '1rem' }}>Verified and unverified information is always labelled differently. Nothing is shown as “verified” unless an authorised reviewer approved it.</p>
      </div></section>

      <section className="section alt"><div className="container">
        <div className="row between"><h2>Open opportunities</h2><Link to="/opportunities">See all →</Link></div>
        <Async state={opps} empty="No opportunities are open right now.">{(rows) => <div className="grid g3">{rows.map((o) => <Card key={o.id}><Badge>{label(o.type)}</Badge><h3 style={{ marginTop: '.5rem' }}><Link to={`/opportunities/${o.id}`}>{o.title}</Link></h3><p className="small muted">{o.organization?.name || o.postedByInstitution} · {o.location || 'Location flexible'}<br />Apply by {fmtDate(o.deadline)}</p></Card>)}</div>}</Async>
      </div></section>

      <section className="section"><div className="container">
        <div className="grid g2">
          <div><h2>AI-assisted career roadmap</h2><p>Tell the platform your department, year, skills and target role. You get a milestone plan with free learning resources, project ideas and a skill-gap view. If no AI provider is configured, a clearly labelled rule-based plan is used instead.</p><p className="small muted">Guidance is advisory. It never changes eligibility rules and never guarantees selection.</p><LinkButton to="/ai-career-guidance" variant="secondary">Learn more</LinkButton></div>
          <Card title="Skill-gap radar (illustrative sample)"><Radar items={SAMPLE_GAPS} title="Sample skill-gap radar" size={300} /><p className="small muted">Sample data for illustration only.</p></Card>
        </div>
      </div></section>

      <section className="section alt"><div className="container">
        <div className="row between"><h2>Learning library</h2><Link to="/library">Browse all →</Link></div>
        <Async state={res} empty="The library is empty.">{(rows) => <div className="grid g3">{rows.map((r) => <Card key={r.id}><Badge>{label(r.type)}</Badge><h3 style={{ marginTop: '.5rem' }}>{r.title}</h3><p className="small muted">{r.provider} · external resource</p><a href={r.url} target="_blank" rel="noopener noreferrer">Open ↗</a></Card>)}</div>}</Async>
      </div></section>

      <section className="section"><div className="container">
        <h2>Verified partners</h2>
        <p className="muted">Institutions and organizations appear here only after platform verification and an approved partnership.</p>
        <Async state={graph}>{(g) => <CollabGraph graph={g} />}</Async>
      </div></section>

      <section className="section alt"><div className="container">
        <h2>Platform in numbers</h2>
        <Async state={stats}>{(s) => <>
          <div className="grid g4">{[['verifiedInstitutions', 'Verified institutions'], ['verifiedOrganizations', 'Verified organizations'], ['verifiedStudents', 'Verified students'], ['openOpportunities', 'Open opportunities']].map(([k, l]) => <Card key={k} className="stat"><b>{s[k]}</b><span>{l}</span></Card>)}</div>
          <p className="small muted" style={{ marginTop: '.8rem' }}>{s.isDemoData ? 'These figures come from the synthetic demonstration data set, not from real institutions.' : 'Live counts from platform records.'}</p></>}</Async>
      </div></section>
    </>
  );
}

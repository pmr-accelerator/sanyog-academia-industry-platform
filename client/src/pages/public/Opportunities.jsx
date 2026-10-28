import { Link, useParams } from 'react-router-dom';
import { useFetch, Async, Card, Badge, Input, Select, Pager, useQuery, qs, label, fmtDate, LinkButton } from '../../components/ui.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';

const TYPES = ['JOB', 'INTERNSHIP', 'APPRENTICESHIP', 'GRADUATE_TRAINEE', 'INDUSTRY_PROJECT', 'SPONSORED_TRAINING', 'COURSE', 'RESEARCH', 'MENTORSHIP'];
export function OpportunityList() {
  const [q, setQ, setPage] = useQuery({ type: '', q: '', location: '', skill: '' });
  const st = useFetch('/public/opportunities' + qs({ ...q, pageSize: 9 }));
  return <div className="container section"><h1>Opportunities</h1><p className="muted">Open opportunities from verified organizations and colleges. Sign in as a student to see your personal eligibility.</p>
    <form className="card grid g4" onSubmit={(e) => e.preventDefault()} role="search"><Input label="Search" value={q.q} onChange={(e) => setQ({ q: e.target.value })} /><Select label="Type" value={q.type} onChange={(e) => setQ({ type: e.target.value })} options={TYPES} placeholder="All types" /><Input label="Location" value={q.location} onChange={(e) => setQ({ location: e.target.value })} /><Input label="Skill" value={q.skill} onChange={(e) => setQ({ skill: e.target.value })} /></form>
    <div style={{ marginTop: '1rem' }}><Async state={st} empty="No open opportunities match your search.">{(rows, meta) => <><div className="grid g3">{rows.map((o) => <Card key={o.id}><div className="row"><Badge>{label(o.type)}</Badge><Badge tone="neutral">{label(o.workMode)}</Badge></div><h3 style={{ marginTop: '.5rem' }}><Link to={`/opportunities/${o.id}`}>{o.title}</Link></h3><p className="small muted">{o.organization?.name || o.postedByInstitution || 'Posted by an institution'} · {o.location || 'Flexible'}<br />Deadline {fmtDate(o.deadline)}</p><p className="small">{o.skills.slice(0, 4).map((s) => s.name).join(', ')}</p></Card>)}</div><Pager meta={meta} onPage={setPage} /></>}</Async></div></div>;
}
export function OpportunityPublicDetail() {
  const { id } = useParams(); const { user } = useAuth(); const st = useFetch(`/public/opportunities/${id}`);
  return <div className="container section"><Link to="/opportunities">← All opportunities</Link><Async state={st}>{(o) => <div className="stack"><h1>{o.title}</h1><div className="row"><Badge>{label(o.type)}</Badge><Badge tone="neutral">{label(o.workMode)}</Badge><span className="muted">{o.organization?.name || o.postedByInstitution} · {o.location || 'Flexible'} · Apply by {fmtDate(o.deadline)}</span></div>
    <Card title="About this opportunity"><p style={{ whiteSpace: 'pre-wrap' }}>{o.description}</p>{o.compensation && <p><b>Compensation:</b> {o.compensation.min?.toLocaleString('en-IN')}–{o.compensation.max?.toLocaleString('en-IN')} {o.compensation.period}</p>}</Card>
    <div className="grid g2"><Card title="Skills">{o.skills.length ? <ul>{o.skills.map((s) => <li key={s.name}>{s.name} (level {s.level}){s.mandatory ? '' : ' — optional'}</li>)}</ul> : <p className="muted">None listed.</p>}</Card><Card title="Eligibility highlights"><ul><li>Disciplines: {o.allowedDisciplines.length ? o.allowedDisciplines.join(', ') : 'any'}</li><li>Minimum academic year: {o.minAcademicYear || 'any'}</li></ul>{o.selectionCriteria && <p className="small"><b>Selection:</b> {o.selectionCriteria}</p>}</Card></div>
    {user?.role === 'STUDENT' ? <LinkButton to={`/student/opportunities/${o.id}`}>Check my eligibility and apply</LinkButton> : <p className="muted">Students of partner institutions can <Link to="/login">sign in</Link> to see eligibility and apply.</p>}</div>}</Async></div>;
}

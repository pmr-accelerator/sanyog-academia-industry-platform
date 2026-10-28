import { useFetch, Async, Card, Badge, Input, Select, Pager, useQuery, qs, label } from '../../components/ui.jsx';

export const RESOURCE_TYPES = ['BOOK', 'OPEN_TEXTBOOK', 'RESEARCH_PAPER', 'COURSE', 'DOCUMENTATION', 'TUTORIAL', 'PRACTICE', 'PROJECT_IDEA', 'CERTIFICATION_PREP'];
export function ResourceCard({ r, actions }) {
  return <Card><div className="row"><Badge>{label(r.type)}</Badge>{r.isExternal && <Badge tone="neutral">External</Badge>}{r.completed && <Badge tone="ok">Completed</Badge>}</div><h3 style={{ marginTop: '.5rem' }}>{r.title}</h3><p className="small muted">{r.provider}{r.licenseNote ? ` · ${r.licenseNote}` : ''}</p>{r.description && <p className="small">{r.description}</p>}{r.skills?.length > 0 && <p className="small">Skills: {r.skills.join(', ')}</p>}<div className="row"><a href={r.url} target="_blank" rel="noopener noreferrer">Open external resource ↗</a>{actions}</div></Card>;
}
export default function Library({ base = '/public/resources', renderActions }) {
  const [q, setQ, setPage] = useQuery({ q: '', type: '', discipline: '', year: '', skill: '' });
  const st = useFetch(base + qs({ ...q, pageSize: 9 }));
  const disc = useFetch('/public/disciplines');
  return <div className={base === '/public/resources' ? 'container section' : ''}><h1>Learning library</h1><p className="muted">Free and openly available resources hosted by their original providers. Links are external; check each provider’s terms and licence.</p>
    <form className="card grid g4" onSubmit={(e) => e.preventDefault()} role="search"><Input label="Search" value={q.q} onChange={(e) => setQ({ q: e.target.value })} /><Select label="Type" value={q.type} onChange={(e) => setQ({ type: e.target.value })} options={RESOURCE_TYPES} placeholder="All" /><Select label="Discipline" value={q.discipline} onChange={(e) => setQ({ discipline: e.target.value })} options={(disc.data || []).map((d) => ({ value: d.key, label: d.label }))} placeholder="All" /><Select label="Academic year" value={q.year} onChange={(e) => setQ({ year: e.target.value })} options={['1', '2', '3', '4'].map((y) => ({ value: y, label: `Year ${y}` }))} placeholder="Any" /></form>
    <div style={{ marginTop: '1rem' }}><Async state={st} empty="No resources match.">{(rows, meta) => <><div className="grid g3">{rows.map((r) => <ResourceCard key={r.id} r={r} actions={renderActions?.(r, st.reload)} />)}</div><Pager meta={meta} onPage={setPage} /></>}</Async></div></div>;
}

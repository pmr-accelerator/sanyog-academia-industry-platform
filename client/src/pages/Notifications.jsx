import { Link } from 'react-router-dom';
import { useFetch, Async, Card, Button, Pager, useQuery, qs, fmtDateTime, Badge, label } from '../components/ui.jsx';
import { post } from '../api.js';

export default function Notifications() {
  const [q, , setPage] = useQuery({}); const st = useFetch('/notifications' + qs({ page: q.page, pageSize: 20 }));
  return <div className="stack"><div className="row between"><h1>Notifications</h1><Button variant="secondary small" onClick={async () => { await post('/notifications/read-all'); st.reload(); }}>Mark all as read</Button></div>
    <Async state={st} isEmpty={(d) => !d.items.length} empty="You have no notifications.">{(d, meta) => <>{d.items.map((n) => <Card key={n.id} className={n.readAt ? '' : 'unread'}><div className="row between"><div><Badge tone={n.readAt ? 'neutral' : ''}>{label(n.type)}</Badge> <b>{n.title}</b></div><span className="small muted">{fmtDateTime(n.createdAt)}</span></div><p style={{ margin: '.4rem 0' }}>{n.body}</p><div className="row">{n.linkPath && <Link to={n.linkPath} onClick={() => post(`/notifications/${n.id}/read`)}>Open</Link>}{!n.readAt && <Button variant="ghost small" onClick={async () => { await post(`/notifications/${n.id}/read`); st.reload(); }}>Mark read</Button>}</div></Card>)}<Pager meta={meta} onPage={setPage} /></>}</Async></div>;
}

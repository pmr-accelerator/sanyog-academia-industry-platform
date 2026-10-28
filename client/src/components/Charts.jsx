// Small dependency-free SVG charts (accessible: every chart has a title and a text/table alternative).
import { label } from './ui.jsx';

export function BarChart({ data, title, height = 200, horizontal = false }) {
  if (!data?.length) return <div className="empty">No data yet.</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  if (horizontal) {
    const rowH = 26; const h = data.length * rowH + 8;
    return <svg className="chart" role="img" aria-label={title} viewBox={`0 0 520 ${h}`} width="100%">{data.map((d, i) => <g key={d.label} transform={`translate(0 ${i * rowH + 4})`}><text x="0" y="14" fontSize="11">{String(d.label).slice(0, 26)}</text><rect className="bar" x="190" y="2" height="16" rx="3" width={Math.max(2, (d.value / max) * 280)} /><text x={190 + Math.max(2, (d.value / max) * 280) + 6} y="14">{d.value}</text></g>)}</svg>;
  }
  const w = 520; const bw = Math.min(54, (w - 40) / data.length - 8);
  return <svg className="chart" role="img" aria-label={title} viewBox={`0 0 ${w} ${height + 34}`} width="100%"><line className="grid" x1="30" x2={w} y1={height} y2={height} />{data.map((d, i) => { const bh = (d.value / max) * (height - 20); const x = 36 + i * ((w - 40) / data.length); return <g key={d.label}><rect className="bar" x={x} y={height - bh} width={bw} height={bh} rx="3" /><text x={x + bw / 2} y={height - bh - 5} textAnchor="middle">{d.value}</text><text x={x + bw / 2} y={height + 16} textAnchor="middle">{String(d.label).slice(0, 10)}</text></g>; })}</svg>;
}

export function LineChart({ data, title, height = 180 }) {
  if (!data?.length) return <div className="empty">No data yet.</div>;
  const w = 520; const max = Math.max(...data.map((d) => d.value), 1);
  const pts = data.map((d, i) => [36 + (data.length === 1 ? 0 : (i / (data.length - 1)) * (w - 60)), height - (d.value / max) * (height - 20)]);
  return <svg className="chart" role="img" aria-label={title} viewBox={`0 0 ${w} ${height + 34}`} width="100%"><line className="grid" x1="30" x2={w} y1={height} y2={height} /><polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--brand)" strokeWidth="2.5" />{pts.map((p, i) => <g key={i}><circle cx={p[0]} cy={p[1]} r="4" fill="var(--brand)" /><text x={p[0]} y={height + 16} textAnchor="middle">{data[i].label}</text><text x={p[0]} y={p[1] - 8} textAnchor="middle">{data[i].value}</text></g>)}</svg>;
}

// Skill-gap radar: filled area = current level, dashed outline = level required by the target role.
export function Radar({ items, title, size = 320 }) {
  if (!items || items.length < 3) return <div className="empty">A radar needs at least three skills.</div>;
  const c = size / 2; const R = size / 2 - 52; const n = items.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + Math.cos(a) * R * (v / 5), c + Math.sin(a) * R * (v / 5)]; };
  const poly = (key) => items.map((it, i) => pt(i, it[key]).join(',')).join(' ');
  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" role="img" aria-label={title} viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 420 }}>
        {[1, 2, 3, 4, 5].map((l) => <polygon key={l} className="grid" fill="none" points={items.map((_, i) => pt(i, l).join(',')).join(' ')} />)}
        {items.map((it, i) => { const [x, y] = pt(i, 5.9); return <text key={it.skill} x={x} y={y} textAnchor={x < c - 5 ? 'end' : x > c + 5 ? 'start' : 'middle'}>{it.skill.length > 18 ? it.skill.slice(0, 17) + '…' : it.skill}</text>; })}
        <polygon className="area" fillOpacity=".5" points={poly('current')} />
        <polygon className="req" points={poly('required')} />
      </svg>
      <figcaption className="small muted">Filled area: your current level. Dashed outline: level needed for the target role (scale 0–5).</figcaption>
    </figure>
  );
}

export function Donut({ value, size = 96, text }) {
  const r = 38; const circ = 2 * Math.PI * r; const v = Math.max(0, Math.min(100, value || 0));
  return <svg role="img" aria-label={`${text || ''} ${v}%`} width={size} height={size} viewBox="0 0 100 100"><circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="10" /><circle cx="50" cy="50" r={r} fill="none" stroke="var(--brand)" strokeWidth="10" strokeDasharray={`${(v / 100) * circ} ${circ}`} transform="rotate(-90 50 50)" strokeLinecap="round" /><text x="50" y="55" textAnchor="middle" fontSize="20" fontWeight="700" style={{ fill: 'var(--ink)' }}>{v}%</text></svg>;
}

export const countsToBars = (obj) => Object.entries(obj || {}).map(([k, v]) => ({ label: label(k), value: v }));

// Collaboration graph: three columns (institutions · organizations · skills), edges drawn between them.
export function CollabGraph({ graph }) {
  if (!graph?.nodes?.length) return <div className="empty">No active partnerships yet. Once institutions and verified organizations form partnerships they will appear here.</div>;
  const cols = { institution: 80, organization: 330, skill: 580 };
  const byType = (t) => graph.nodes.filter((n) => n.type === t);
  const pos = {};
  Object.keys(cols).forEach((t) => byType(t).forEach((n, i, arr) => { pos[n.id] = { x: cols[t], y: 40 + i * Math.min(46, 360 / Math.max(arr.length, 1)) }; }));
  const h = Math.max(...Object.values(pos).map((p) => p.y), 100) + 40;
  return (
    <svg className="chart" role="img" aria-label="Collaboration graph of institutions, organizations and requested skills" viewBox={`0 0 680 ${h}`} width="100%">
      {graph.edges.map((e, i) => pos[e.from] && pos[e.to] && <line key={i} x1={pos[e.from].x + 60} y1={pos[e.from].y} x2={pos[e.to].x - 60} y2={pos[e.to].y} stroke={e.kind === 'partnership' ? 'var(--brand)' : 'var(--accent)'} strokeWidth={e.kind === 'partnership' ? 2 : 1 + (e.weight || 1) * 0.6} opacity=".7" />)}
      {graph.nodes.map((n) => <g key={n.id}><rect x={pos[n.id].x - 60} y={pos[n.id].y - 14} width="120" height="28" rx="14" fill={n.type === 'institution' ? 'var(--brand)' : n.type === 'organization' ? 'var(--accent)' : 'var(--card)'} stroke="var(--line)" /><text x={pos[n.id].x} y={pos[n.id].y + 4} textAnchor="middle" style={{ fill: n.type === 'skill' ? 'var(--ink)' : '#fff', fontSize: 10 }}>{n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label}</text></g>)}
    </svg>
  );
}

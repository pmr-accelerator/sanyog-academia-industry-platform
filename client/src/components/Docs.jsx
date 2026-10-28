import { useState } from 'react';
import { api } from '../api.js';
import { useFetch, Async, Select, Button, ErrorBox, useAction, label, fmtDate, Check } from './ui.jsx';

// Upload a document (PDF/PNG/JPEG, size-limited by the server) and optionally pick documents as evidence.
export function DocPicker({ kinds, selected = [], onChange, title = 'Supporting documents' }) {
  const docs = useFetch('/documents');
  const [kind, setKind] = useState(kinds[0]);
  const a = useAction();
  const upload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append('kind', kind); fd.append('file', file);
    const r = await a.run(() => api('/documents', { method: 'POST', form: fd }), 'Document uploaded');
    e.target.value = '';
    if (r) { docs.reload(); onChange?.([...selected, r.data.id]); }
  };
  const list = (docs.data || []).filter((d) => kinds.includes(d.kind));
  return (
    <fieldset className="card" style={{ marginBottom: '1rem' }}><legend><b>{title}</b></legend>
      <ErrorBox error={a.error} />
      <div className="row"><Select label="Document type" value={kind} onChange={(e) => setKind(e.target.value)} options={kinds} /><label className="field"><span>Choose file (PDF, PNG or JPEG)</span><input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={upload} disabled={a.busy} /></label></div>
      <Async state={docs} empty="No documents uploaded yet.">{() => list.length === 0 ? <p className="muted small">No documents of this kind yet.</p> : <div>{list.map((d) => <div key={d.id} className="row between"><Check label={`${label(d.kind)} — ${d.originalName} (${fmtDate(d.createdAt)})`} checked={selected.includes(d.id)} onChange={(e) => onChange?.(e.target.checked ? [...selected, d.id] : selected.filter((x) => x !== d.id))} /><a className="small" href={`/api/documents/${d.id}/download`}>Download</a></div>)}</div>}</Async>
    </fieldset>
  );
}
export const DownloadLink = ({ id, name }) => <a href={`/api/documents/${id}/download`}>{name || 'Download'}</a>;

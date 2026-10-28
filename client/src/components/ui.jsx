import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { get, qs } from '../api.js';

// ── data fetching ───────────────────────────────────────────────────────────
export function useFetch(path, deps = []) {
  const [s, setS] = useState({ data: null, meta: null, loading: Boolean(path), error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    let live = true;
    setS((x) => ({ ...x, loading: true, error: null }));
    get(path).then((r) => live && setS({ data: r.data, meta: r.meta || null, loading: false, error: null })).catch((e) => live && setS({ data: null, meta: null, loading: false, error: e }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  return { ...s, reload: () => setTick((x) => x + 1) };
}

// Renders loading / error / empty states for a useFetch result.
export function Async({ state, children, empty = 'Nothing here yet.', isEmpty }) {
  if (state.loading) return <div className="center" role="status" aria-live="polite"><span className="spinner" /> <span className="sr-only">Loading</span></div>;
  if (state.error) return <div className="alert error" role="alert">{state.error.message} <button className="btn small secondary" onClick={state.reload}>Try again</button></div>;
  const blank = isEmpty ? isEmpty(state.data) : Array.isArray(state.data) && state.data.length === 0;
  if (blank) return <div className="empty">{empty}</div>;
  return children(state.data, state.meta);
}

export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const bind = (name) => ({ name, value: values[name] ?? '', onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })) });
  const bindCheck = (name) => ({ name, checked: Boolean(values[name]), onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.checked })) });
  return { values, set: (patch) => setValues((v) => ({ ...v, ...patch })), reset: () => setValues(initial), bind, bindCheck };
}

// Runs an async action with busy + error state, optionally toasting on success.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const run = useCallback(async (fn, success) => {
    setBusy(true); setError(null);
    try { const r = await fn(); if (success) toast(success); return r; } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
  }, [toast]);
  return { run, busy, error, clear: () => setError(null) };
}

// ── toast ───────────────────────────────────────────────────────────────────
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((text) => { const id = Math.random(); setItems((x) => [...x, { id, text }]); setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 4000); }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts" role="status" aria-live="polite">{items.map((i) => <div key={i.id} className="toast">{i.text}</div>)}</div></ToastCtx.Provider>;
}

// ── primitives ──────────────────────────────────────────────────────────────
export const Card = ({ title, actions, children, className = '' }) => (
  <section className={`card ${className}`}>{(title || actions) && <div className="row between" style={{ marginBottom: '.5rem' }}>{title && <h3 style={{ margin: 0 }}>{title}</h3>}{actions}</div>}{children}</section>
);
export const Button = ({ variant = '', busy, children, ...p }) => <button className={`btn ${variant}`} disabled={busy || p.disabled} {...p}>{busy ? <span className="spinner" style={{ width: 14, height: 14 }} /> : null}{children}</button>;
export const LinkButton = ({ to, variant = '', children, ...p }) => <Link className={`btn ${variant}`} to={to} {...p}>{children}</Link>;

const TONE = { VERIFIED: 'ok', ACTIVE: 'ok', ELIGIBLE: 'ok', APPROVED: 'ok', COMPLETED: 'ok', MET: 'ok', HIRED: 'ok', OFFER_ACCEPTED: 'ok', PUBLISHED: 'ok', ACCEPTED: 'ok', RESOLVED: 'ok',
  SUBMITTED: 'info', UNDER_REVIEW: 'info', SHORTLISTED: 'info', INTERVIEW_SCHEDULED: 'info', SELECTED: 'info', OFFER_MADE: 'info', REQUESTED: 'info', OPEN: 'info', ASSIGNED: 'info', SCHEDULED: 'info', IN_PROGRESS: 'info',
  CHANGES_REQUESTED: 'warn', REQUIRES_REVIEW: 'warn', PENDING: 'warn', PENDING_APPROVAL: 'warn', PENDING_EMAIL: 'warn', REVIEW: 'warn', DRAFT: 'neutral', NOT_STARTED: 'neutral', CLOSED: 'neutral',
  REJECTED: 'bad', NOT_ELIGIBLE: 'bad', NOT_MET: 'bad', REVOKED: 'bad', EXPIRED: 'bad', SUSPENDED: 'bad', TERMINATED: 'bad', WITHDRAWN: 'neutral', CANCELLED: 'bad', OFFER_DECLINED: 'bad', NOT_SELECTED: 'bad' };
export const label = (s) => String(s ?? '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
export const StatusBadge = ({ status }) => status ? <span className={`badge ${TONE[status] || ''}`}>{label(status)}</span> : null;
export const Badge = ({ tone = '', children }) => <span className={`badge ${tone}`}>{children}</span>;
export const Alert = ({ tone = 'info', children }) => <div className={`alert ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="alert error" role="alert">{error.message}{error.details?.length ? <ul style={{ margin: '.3rem 0 0' }}>{error.details.map((d, i) => <li key={i}>{d.path ? <b>{d.path}: </b> : null}{d.message || d.detail || d.label}</li>)}</ul> : null}{error.details?.checks ? <ul style={{ margin: '.3rem 0 0' }}>{error.details.checks.filter((c) => c.status !== 'MET').map((c, i) => <li key={i}>{c.detail}</li>)}</ul> : null}</div>;
}
export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const Stat = ({ value, label: l, hint }) => <div className="card stat"><b>{value ?? '—'}</b><span>{l}</span>{hint && <div className="small muted">{hint}</div>}</div>;
export const Progress = ({ value, label: l }) => <div><div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={l}><div style={{ width: `${Math.min(100, value || 0)}%` }} /></div></div>;

export function Field({ label: l, hint, children }) { return <label className="field"><span>{l}</span>{children}{hint && <small>{hint}</small>}</label>; }
export const Input = ({ label: l, hint, ...p }) => <Field label={l} hint={hint}><input {...p} /></Field>;
export const Textarea = ({ label: l, hint, ...p }) => <Field label={l} hint={hint}><textarea {...p} /></Field>;
export const Select = ({ label: l, hint, options, placeholder, ...p }) => (
  <Field label={l} hint={hint}><select {...p}>{placeholder !== undefined && <option value="">{placeholder}</option>}{options.map((o) => { const v = typeof o === 'object' ? o.value : o; const t = typeof o === 'object' ? o.label : label(o); return <option key={v} value={v}>{t}</option>; })}</select></Field>
);
export const Check = ({ label: l, ...p }) => <label className="check"><input type="checkbox" {...p} /><span>{l}</span></label>;

export function Table({ columns, rows, caption, empty = 'No records.' }) {
  if (!rows?.length) return <Empty>{empty}</Empty>;
  return <div className="table-wrap"><table>{caption && <caption className="sr-only">{caption}</caption>}<thead><tr>{columns.map((c) => <th key={c.header} scope="col">{c.header}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={r.id || i}>{columns.map((c) => <td key={c.header}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}</tbody></table></div>;
}
export function Pager({ meta, onPage }) {
  if (!meta || meta.totalPages <= 1) return null;
  return <div className="row" style={{ justifyContent: 'center', marginTop: '1rem' }}><Button variant="secondary small" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</Button><span className="small">Page {meta.page} of {meta.totalPages}</span><Button variant="secondary small" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Next</Button></div>;
}
export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}>{t.label}</button>)}</div>;
}
export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); const h = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return <div className="modal-back" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}><div className="row between"><h3>{title}</h3><button className="btn ghost small" onClick={onClose} aria-label="Close">✕</button></div>{children}</div></div>;
}
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const useQuery = (initial = {}) => { const [q, setQ] = useState({ page: 1, ...initial }); return [q, (patch) => setQ((x) => ({ ...x, page: 1, ...patch })), (page) => setQ((x) => ({ ...x, page }))]; };
export { qs };

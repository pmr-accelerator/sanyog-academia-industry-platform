// Thin fetch wrapper. The session lives in an HTTP-only cookie; JavaScript only holds the CSRF token.
let csrf = '';
let authListener = () => {};
export const setCsrf = (t) => { csrf = t || ''; };
export const onAuthError = (fn) => { authListener = fn; };

export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, credentials: 'same-origin', body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    const e = json?.error || {};
    const err = new ApiError(res.status, e.code || 'ERROR', e.message || 'Something went wrong.', e.details);
    if (res.status === 401 && !path.startsWith('/auth/login')) authListener(err);
    throw err;
  }
  return json;
}
export const get = (p) => api(p);
export const post = (p, body = {}) => api(p, { method: 'POST', body });
export const put = (p, body = {}) => api(p, { method: 'PUT', body });
export const patch = (p, body = {}) => api(p, { method: 'PATCH', body });
export const del = (p) => api(p, { method: 'DELETE' });
export const qs = (o) => { const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v !== undefined && v !== null)); const s = p.toString(); return s ? '?' + s : ''; };

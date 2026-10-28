import test from 'node:test';
import assert from 'node:assert/strict';
import { qs, api, setCsrf, onAuthError, ApiError } from '../src/api.js';

test('qs drops empty values and encodes the rest', () => {
  assert.equal(qs({ a: '', b: undefined, c: null }), '');
  assert.equal(qs({ q: 'a b', page: 2 }), '?q=a+b&page=2');
});
test('api sends the CSRF header and returns data on success', async () => {
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ ok: true, data: { x: 1 } }) }; };
  setCsrf('tok123');
  const r = await api('/thing', { method: 'POST', body: { a: 1 } });
  assert.equal(seen.url, '/api/thing');
  assert.equal(seen.init.headers['X-CSRF-Token'], 'tok123');
  assert.equal(seen.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(r.data, { x: 1 });
});
test('api converts error responses into ApiError and notifies on 401', async () => {
  let notified = null; onAuthError((e) => { notified = e; });
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ ok: false, error: { code: 'SESSION_EXPIRED', message: 'expired' } }) });
  await assert.rejects(() => api('/x'), (e) => e instanceof ApiError && e.code === 'SESSION_EXPIRED');
  assert.equal(notified.status, 401);
});
test('a failed login (401) does not trigger the session-expired handler', async () => {
  let n = 0; onAuthError(() => { n += 1; });
  globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ ok: false, error: { code: 'INVALID_CREDENTIALS', message: 'bad' } }) });
  await assert.rejects(() => api('/auth/login', { method: 'POST', body: {} }));
  assert.equal(n, 0);
});
test('network failures give a friendly error', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(() => api('/x'), (e) => e.code === 'NETWORK');
});

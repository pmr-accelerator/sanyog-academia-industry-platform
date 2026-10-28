// Integration tests run the real Express app against a real PostgreSQL database that has been
// migrated and seeded (`npm run db:migrate && npm run db:seed`). They are NOT run in CI-less sandboxes.
import { createApp } from '../../src/app.js';
import env from '../../src/config/env.js';

export async function startServer() {
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  return { server, base: `http://127.0.0.1:${server.address().port}/api` };
}

// Tiny cookie-aware client that also sends the CSRF header like the browser app does.
export class Client {
  constructor(base) { this.base = base; this.cookie = ''; this.csrf = ''; }
  async req(method, path, body) {
    const headers = { 'Content-Type': 'application/json', Origin: env.CLIENT_ORIGIN };
    if (this.cookie) headers.Cookie = this.cookie;
    if (this.csrf) headers['X-CSRF-Token'] = this.csrf;
    const res = await fetch(this.base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  put(p, b = {}) { return this.req('PUT', p, b); }
  async login(emailLocal, password = env.SEED_DEMO_PASSWORD) {
    const r = await this.post('/auth/login', { email: `${emailLocal}@demo.sanyog.invalid`, password });
    if (r.status === 200) this.csrf = r.body.data.csrfToken;
    return r;
  }
}

import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { post, get } from '../api.js';
import { Card, Input, Button, ErrorBox, Alert, useForm, useAction } from '../components/ui.jsx';

export default function Account() {
  const { user, logout } = useAuth(); const pw = useForm({ currentPassword: '', newPassword: '' }); const del = useForm({ password: '', confirm: '' }); const a1 = useAction(); const a2 = useAction(); const a3 = useAction();
  const download = async () => { const r = await a3.run(() => get('/privacy/export')); if (r) { const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const el = document.createElement('a'); el.href = url; el.download = 'my-data-export.json'; el.click(); URL.revokeObjectURL(url); } };
  return <div className="stack" style={{ maxWidth: 680 }}><h1>Account</h1><Card><p><b>{user.fullName}</b><br />{user.email}</p></Card>
    <Card title="Change password"><form onSubmit={async (e) => { e.preventDefault(); if (await a1.run(() => post('/auth/change-password', pw.values), 'Password changed')) pw.reset(); }}><ErrorBox error={a1.error} /><Input label="Current password" type="password" required {...pw.bind('currentPassword')} /><Input label="New password" type="password" minLength={10} required {...pw.bind('newPassword')} /><Button busy={a1.busy}>Change password</Button></form></Card>
    <Card title="Download my data"><p className="small muted">A JSON export of the personal data held about your account.</p><ErrorBox error={a3.error} /><Button variant="secondary" onClick={download} busy={a3.busy}>Export my data</Button></Card>
    {user.role !== 'ADMIN' && <Card title="Delete my account"><Alert tone="warn">This anonymises your account, removes your uploaded documents and withdraws open applications. It cannot be undone.</Alert><form onSubmit={async (e) => { e.preventDefault(); if (await a2.run(() => post('/privacy/delete', del.values))) logout(); }}><ErrorBox error={a2.error} /><Input label="Password" type="password" required {...del.bind('password')} /><Input label="Type DELETE to confirm" required {...del.bind('confirm')} /><Button variant="danger" busy={a2.busy} disabled={del.values.confirm !== 'DELETE'}>Delete my account</Button></form></Card>}</div>;
}

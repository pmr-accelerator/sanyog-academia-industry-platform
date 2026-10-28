import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, get, post, setCsrf, onAuthError } from '../api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export const ROLE_HOME = { STUDENT: '/student', COLLEGE_AUTHORITY: '/college', INDUSTRY: '/industry', ALUMNI: '/alumni', ADMIN: '/admin' };

export function AuthProvider({ children }) {
  const [me, setMe] = useState(null);       // { user, csrfToken, ... }
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState({ platformName: import.meta.env.VITE_PLATFORM_NAME || 'Sanyog', demoMode: false });
  const navigate = useNavigate();

  const apply = useCallback((data) => { setCsrf(data?.csrfToken); setMe(data || null); }, []);
  const refresh = useCallback(async () => {
    try { apply((await get('/auth/me')).data); } catch { apply(null); }
  }, [apply]);

  useEffect(() => {
    (async () => {
      try { const c = (await get('/public/config')).data; setConfig(c); document.title = c.platformName; } catch { /* API offline: keep defaults */ }
      await refresh();
      setReady(true);
    })();
  }, [refresh]);

  // Any 401 after sign-in means the session expired → send the user to the login page with a message.
  useEffect(() => onAuthError(() => { setCsrf(''); setMe((cur) => { if (cur) navigate('/login?expired=1'); return null; }); }), [navigate]);

  const login = async (email, password) => { const d = (await post('/auth/login', { email, password })).data; apply(d); return d; };
  const logout = async () => { try { await post('/auth/logout'); } catch { /* ignore */ } apply(null); navigate('/'); };

  return <Ctx.Provider value={{ me, user: me?.user, ready, config, login, logout, refresh, permissions: me?.permissions || [] }}>{children}</Ctx.Provider>;
}
export { api };

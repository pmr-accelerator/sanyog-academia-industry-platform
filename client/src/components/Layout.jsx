import { useState, useEffect } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth, ROLE_HOME } from '../auth/AuthContext.jsx';
import { Logo } from './Logo.jsx';
import { useFetch } from './ui.jsx';
import { t } from '../i18n/index.js';

function useA11yMode() {
  const [on, setOn] = useState(localStorage.getItem('a11y') === 'on');
  useEffect(() => { document.documentElement.dataset.a11y = on ? 'on' : 'off'; localStorage.setItem('a11y', on ? 'on' : 'off'); }, [on]);
  return [on, setOn];
}
const A11yToggle = () => { const [on, setOn] = useA11yMode(); return <button className="btn ghost small" aria-pressed={on} onClick={() => setOn(!on)} title={t('a11y.mode')}>Aa {on ? 'On' : ''}<span className="sr-only"> {t('a11y.mode')}</span></button>; };

function DemoBanner() {
  const s = useFetch('/public/stats');
  if (!s.data?.isDemoData) return null;
  return <div className="demo-banner" role="note">{t('footer.demo')} Nothing here is a real institution, employer, placement or statistic.</div>;
}

export function PublicLayout() {
  const { user, config, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const L = ({ to, children }) => <NavLink to={to}>{children}</NavLink>;
  return (
    <>
      <a className="skip-link" href="#main">{t('skip')}</a>
      <DemoBanner />
      <header className="topbar"><div className="container">
        <Logo />
        <button className="btn ghost small menu-btn" aria-expanded={open} aria-controls="mainnav" onClick={() => setOpen(!open)}>Menu</button>
        <nav id="mainnav" className={`nav ${open ? 'open' : ''}`} aria-label="Main">
          <L to="/how-it-works">{t('nav.how')}</L><L to="/for-students">{t('nav.students')}</L><L to="/for-institutions">{t('nav.institutions')}</L><L to="/for-industry">{t('nav.industry')}</L><L to="/for-alumni">{t('nav.alumni')}</L><L to="/opportunities">{t('nav.opportunities')}</L><L to="/library">{t('nav.library')}</L>
          <details style={{ position: 'relative' }}><summary style={{ cursor: 'pointer', padding: '.4rem .7rem', fontWeight: 600, fontSize: '.92rem' }}>{t('nav.more')}</summary>
            <div className="card" style={{ position: 'absolute', right: 0, top: '100%', minWidth: 220, zIndex: 30 }}>
              {[['/ai-career-guidance', 'AI career guidance'], ['/collaboration', 'Industry collaboration'], ['/placement-support', 'Placement support'], ['/impact', 'Platform statistics'], ['/about', 'About'], ['/faq', 'FAQ'], ['/contact', 'Contact & support']].map(([to, l]) => <div key={to}><NavLink to={to}>{l}</NavLink></div>)}
            </div></details>
          <A11yToggle />
          {user ? <><Link to={ROLE_HOME[user.role]} className="btn small">{t('nav.dashboard')}</Link><button className="btn secondary small" onClick={logout}>{t('nav.logout')}</button></> : <><Link to="/login" className="btn secondary small">{t('nav.login')}</Link><Link to="/register" className="btn small">{t('nav.register')}</Link></>}
        </nav>
      </div></header>
      <main id="main" tabIndex={-1}><Outlet /></main>
      <footer className="footer"><div className="container">
        <div className="grid g4">
          <div><h4>{config.platformName}</h4><p className="small">A college-verified platform connecting students, institutions, industry and alumni. Independent; not affiliated with or endorsed by any government body.</p></div>
          <div><h4>Platform</h4><ul><li><Link to="/how-it-works">How it works</Link></li><li><Link to="/opportunities">Opportunities</Link></li><li><Link to="/library">Learning library</Link></li><li><Link to="/impact">Statistics</Link></li></ul></div>
          <div><h4>For</h4><ul><li><Link to="/for-students">Students</Link></li><li><Link to="/for-institutions">Institutions</Link></li><li><Link to="/for-industry">Industry partners</Link></li><li><Link to="/for-alumni">Alumni</Link></li></ul></div>
          <div><h4>Support</h4><ul><li><Link to="/faq">FAQ</Link></li><li><Link to="/contact">Contact</Link></li><li><Link to="/privacy">Privacy policy</Link></li><li><Link to="/terms">Terms of use</Link></li><li><Link to="/accessibility">Accessibility</Link></li></ul></div>
        </div>
        <p className="small" style={{ marginTop: '1.5rem', opacity: .8 }}>© {new Date().getFullYear()} {config.platformName}. AI-generated guidance is advisory and does not guarantee selection or placement.</p>
      </div></footer>
    </>
  );
}

const NAV = {
  STUDENT: [['/student', 'Dashboard'], ['/student/profile', 'Profile & verification'], ['/student/opportunities', 'Opportunities'], ['/student/applications', 'Applications'], ['/student/roadmap', 'AI career roadmap'], ['/student/library', 'Learning library'], ['/student/placement', 'Placement support'], ['/student/sessions', 'Alumni sessions'], ['/student/referrals', 'Referrals'], ['/student/privacy', 'Consent & credentials'], ['/account', 'Account']],
  COLLEGE_AUTHORITY: [['/college', 'Dashboard'], ['/college/verification', 'Verification queue'], ['/college/students', 'Students'], ['/college/alumni', 'Alumni'], ['/college/partnerships', 'Partnerships & MoUs'], ['/college/opportunities', 'Vacancies'], ['/college/applications', 'Vacancy applicants'], ['/college/placement', 'Placement cell'], ['/college/reports', 'Reports'], ['/college/settings', 'Institution settings'], ['/account', 'Account']],
  INDUSTRY: [['/industry', 'Dashboard'], ['/industry/organization', 'Organization'], ['/industry/partnerships', 'College partnerships'], ['/industry/opportunities', 'Opportunities'], ['/industry/applicants', 'Applicants'], ['/industry/referrals', 'Alumni referrals'], ['/account', 'Account']],
  ALUMNI: [['/alumni', 'Dashboard'], ['/alumni/profile', 'Profile'], ['/alumni/students', 'Discover students'], ['/alumni/opportunities', 'Opportunities'], ['/alumni/referrals', 'My referrals'], ['/alumni/sessions', 'Mentorship sessions'], ['/account', 'Account']],
  ADMIN: [['/admin', 'Overview'], ['/admin/approvals', 'Approvals'], ['/admin/users', 'Users & roles'], ['/admin/audit', 'Audit log'], ['/admin/taxonomy', 'Skill taxonomy'], ['/admin/resources', 'Library resources'], ['/admin/moderation', 'Moderation'], ['/admin/settings', 'Configuration & AI'], ['/account', 'Account']],
};

export function DashLayout() {
  const { user, config, logout } = useAuth();
  const unread = useFetch('/notifications?unread=true&pageSize=1');
  const count = unread.data?.unread ?? 0;
  return (
    <>
      <a className="skip-link" href="#main">{t('skip')}</a>
      <div className="dash">
        <aside className="side"><Logo /><p className="small muted" style={{ margin: '.4rem 0 1rem' }}>{user.fullName}<br />{user.role.replace('_', ' ').toLowerCase()}</p>
          <nav aria-label="Dashboard">{NAV[user.role].map(([to, l]) => <NavLink key={to} to={to} end={['/student', '/college', '/industry', '/alumni', '/admin'].includes(to)}>{l}</NavLink>)}</nav>
        </aside>
        <div>
          <div className="demo-banner" style={{ display: config.demoMode ? 'block' : 'none' }}>Demonstration mode — all data is synthetic.</div>
          <div className="main">
            <div className="dash-top"><span className="muted small">{config.platformName}</span>
              <div className="row"><A11yToggle /><Link className="btn secondary small" to="/notifications" aria-label={`Notifications, ${count} unread`}>🔔 {count > 0 && <span className="badge bad">{count}</span>}</Link><button className="btn secondary small" onClick={logout}>{t('nav.logout')}</button></div></div>
            <main id="main" tabIndex={-1}><Outlet /></main>
          </div>
        </div>
      </div>
    </>
  );
}

import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth, ROLE_HOME } from './auth/AuthContext.jsx';
import { PublicLayout, DashLayout } from './components/Layout.jsx';
import Home from './pages/public/Home.jsx';
import * as Info from './pages/public/Info.jsx';
import { OpportunityList, OpportunityPublicDetail } from './pages/public/Opportunities.jsx';
import Library from './pages/public/Library.jsx';
import * as Auth from './pages/auth/Auth.jsx';
import * as Auth2 from './pages/auth/Auth2.jsx';
import Notifications from './pages/Notifications.jsx';
import Account from './pages/Account.jsx';
import * as Student from './pages/student/index.jsx';
import * as College from './pages/college/index.jsx';
import * as Industry from './pages/industry/index.jsx';
import * as Alumni from './pages/alumni/index.jsx';
import * as Admin from './pages/admin/index.jsx';

// Route guard. The server enforces every permission again; this only decides what the UI shows.
function Guard({ roles, children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="container section center"><span className="spinner" /></div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (user.status !== 'ACTIVE' && !(roles === 'any')) return <Navigate to="/pending" replace />;
  if (roles !== 'any' && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return children;
}
const Dash = ({ roles, children }) => <Guard roles={roles}><DashLayout />{children}</Guard>;

export default function App() {
  const { user } = useAuth();
  const R = (path, el) => <Route path={path} element={el} />;
  const guarded = (role, items) => (
    <Route element={<Guard roles={[role]}><DashLayout /></Guard>}>{items}</Route>
  );
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        {R('/', <Home />)}{R('/about', <Info.About />)}{R('/how-it-works', <Info.HowItWorks />)}{R('/for-students', <Info.ForStudents />)}{R('/for-institutions', <Info.ForInstitutions />)}{R('/for-industry', <Info.ForIndustry />)}{R('/for-alumni', <Info.ForAlumni />)}
        {R('/opportunities', <OpportunityList />)}{R('/opportunities/:id', <OpportunityPublicDetail />)}{R('/library', <Library />)}{R('/ai-career-guidance', <Info.AiCareer />)}{R('/collaboration', <Info.Collaboration />)}{R('/placement-support', <Info.PlacementSupport />)}{R('/impact', <Info.Impact />)}{R('/faq', <Info.Faq />)}{R('/contact', <Info.Contact />)}{R('/privacy', <Info.Privacy />)}{R('/terms', <Info.Terms />)}{R('/accessibility', <Info.Accessibility />)}
        {R('/register', <Auth.RoleSelect />)}{R('/register/:role', <Auth.Register />)}{R('/login', <Auth.Login />)}{R('/verify-email', <Auth2.VerifyEmail />)}{R('/forgot-password', <Auth2.Forgot />)}{R('/reset-password', <Auth2.Reset />)}{R('/unauthorized', <Auth2.Unauthorized />)}{R('/verify-credential/:jti', <Auth2.VerifyCredential />)}
        {R('/pending', <Guard roles="any"><Auth2.Pending /></Guard>)}{R('/change-password', <Auth2.ForcedPasswordChange />)}
      </Route>

      <Route element={<Guard roles="any"><DashLayout /></Guard>}>{R('/notifications', <Notifications />)}{R('/account', <Account />)}</Route>

      {guarded('STUDENT', <>{R('/student', <Student.Dashboard />)}{R('/student/profile', <Student.Profile />)}{R('/student/opportunities', <Student.Opportunities />)}{R('/student/opportunities/:id', <Student.OpportunityDetail />)}{R('/student/applications', <Student.Applications />)}{R('/student/roadmap', <Student.Roadmap />)}{R('/student/library', <Student.LibraryPage />)}{R('/student/placement', <Student.Placement />)}{R('/student/placement/:id', <Student.PlacementDetail />)}{R('/student/sessions', <Student.Sessions />)}{R('/student/referrals', <Student.Referrals />)}{R('/student/privacy', <Student.PrivacyCenter />)}</>)}
      {guarded('COLLEGE_AUTHORITY', <>{R('/college', <College.Dashboard />)}{R('/college/verification', <College.Verification />)}{R('/college/verification/:id', <College.VerificationDetail />)}{R('/college/students', <College.Students />)}{R('/college/alumni', <College.AlumniList />)}{R('/college/partnerships', <College.Partnerships />)}{R('/college/opportunities', <College.Opportunities />)}{R('/college/applications', <College.Applicants />)}{R('/college/applications/:id', <College.ApplicantDetail />)}{R('/college/placement', <College.PlacementList />)}{R('/college/placement/:id', <College.PlacementDetail />)}{R('/college/reports', <College.Reports />)}{R('/college/settings', <College.Settings />)}</>)}
      {guarded('INDUSTRY', <>{R('/industry', <Industry.Dashboard />)}{R('/industry/organization', <Industry.Organization />)}{R('/industry/partnerships', <Industry.Partnerships />)}{R('/industry/opportunities', <Industry.Opportunities />)}{R('/industry/applicants', <Industry.Applicants />)}{R('/industry/applicants/:id', <Industry.ApplicantDetail />)}{R('/industry/referrals', <Industry.Referrals />)}</>)}
      {guarded('ALUMNI', <>{R('/alumni', <Alumni.Dashboard />)}{R('/alumni/profile', <Alumni.Profile />)}{R('/alumni/students', <Alumni.Students />)}{R('/alumni/opportunities', <Alumni.Opportunities />)}{R('/alumni/referrals', <Alumni.Referrals />)}{R('/alumni/sessions', <Alumni.Sessions />)}</>)}
      {guarded('ADMIN', <>{R('/admin', <Admin.Overview />)}{R('/admin/approvals', <Admin.Approvals />)}{R('/admin/users', <Admin.Users />)}{R('/admin/audit', <Admin.Audit />)}{R('/admin/taxonomy', <Admin.Taxonomy />)}{R('/admin/resources', <Admin.Resources />)}{R('/admin/moderation', <Admin.Moderation />)}{R('/admin/settings', <Admin.Settings />)}</>)}

      <Route path="*" element={user ? <Navigate to={ROLE_HOME[user.role]} replace /> : <Navigate to="/" replace />} />
    </Routes>
  );
}
export { Dash };

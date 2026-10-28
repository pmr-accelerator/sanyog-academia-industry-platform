import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// Original mark: a bridge arch (the college as the bridge) with a verification node on top.
export const LogoMark = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="var(--brand)" /><path d="M10 40c8-18 36-18 44 0" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" /><circle cx="32" cy="22" r="5" fill="#f2b84b" /><path d="M14 44v6M32 36v14M50 44v6" stroke="#fff" strokeWidth="4" strokeLinecap="round" /></svg>
);
export function Logo() {
  const { config } = useAuth();
  return <Link to="/" className="logo" aria-label={`${config.platformName} home`}><LogoMark /><span>{config.platformName}</span></Link>;
}

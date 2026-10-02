import { BRAND } from '@truecontact/shared';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { authClient } from '../auth-client';

export function AppLayout() {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();

  async function handleSignOut() {
    await authClient.signOut();
    navigate('/sign-in');
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="topbar-left">
          <strong>{BRAND.name}</strong>
          <nav className="nav">
            <NavLink to="/" end className={navClass}>
              Contacts
            </NavLink>
            <NavLink to="/review" className={navClass}>
              Review
            </NavLink>
            <NavLink to="/imports" className={navClass}>
              Imports
            </NavLink>
          </nav>
        </div>
        <div className="topbar-right">
          <span className="muted">{session?.user.email}</span>
          <button type="button" className="button-secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link nav-link-active' : 'nav-link';
}

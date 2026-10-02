import { BRAND } from '@truecontact/shared';
import { useNavigate } from 'react-router';
import { authClient } from '../auth-client';

export function HomePage() {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();

  async function handleSignOut() {
    await authClient.signOut();
    navigate('/sign-in');
  }

  return (
    <main className="page">
      <header className="topbar">
        <strong>{BRAND.name}</strong>
        <div className="topbar-right">
          <span className="muted">{session?.user.email}</span>
          <button type="button" className="button-secondary" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <section className="empty-state">
        <h1>Your contact graph will live here</h1>
        <p className="muted">
          Import contacts from WhatsApp or a vCard file, review matches, duplicates, and conflicts,
          and keep a history of what changed. That experience lands in the next phase — this page is
          the authenticated shell it will hang from.
        </p>
      </section>
    </main>
  );
}

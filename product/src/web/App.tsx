import { type ReactNode, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AccessContext } from './access';
import { authClient } from './auth-client';
import { api, type Me } from './client';
import { AppLayout } from './components/AppLayout';
import { AdminPage } from './pages/AdminPage';
import { ContactPage } from './pages/ContactPage';
import { ContactsPage } from './pages/ContactsPage';
import { ImportsPage } from './pages/ImportsPage';
import { ReviewPage } from './pages/ReviewPage';
import { SignInPage } from './pages/SignInPage';
import { WaitingPage } from './pages/WaitingPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route
          element={
            <RequireSession>
              <AppLayout />
            </RequireSession>
          }
        >
          <Route path="/" element={<ContactsPage />} />
          <Route path="/contacts/:id" element={<ContactPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/imports" element={<ImportsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function RequireSession({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!session) {
      setMe(null);
      setFailed(false);
      return;
    }

    let active = true;

    api
      .me()
      .then((value) => {
        if (active) {
          setMe(value);
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [session]);

  if (isPending) {
    return <div className="page-center muted">Loading…</div>;
  }

  if (!session) {
    return <Navigate to="/sign-in" replace />;
  }

  if (failed) {
    return <div className="page-center muted">Could not load your account. Refresh to retry.</div>;
  }

  if (!me) {
    return <div className="page-center muted">Loading…</div>;
  }

  if (me.membership.status !== 'approved') {
    return <WaitingPage email={me.user.email} status={me.membership.status} />;
  }

  return <AccessContext.Provider value={me}>{children}</AccessContext.Provider>;
}

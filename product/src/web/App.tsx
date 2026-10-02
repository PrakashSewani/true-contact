import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { authClient } from './auth-client';
import { AppLayout } from './components/AppLayout';
import { ContactPage } from './pages/ContactPage';
import { ContactsPage } from './pages/ContactsPage';
import { ImportsPage } from './pages/ImportsPage';
import { ReviewPage } from './pages/ReviewPage';
import { SignInPage } from './pages/SignInPage';

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
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function RequireSession({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <div className="page-center muted">Loading…</div>;
  }

  if (!session) {
    return <Navigate to="/sign-in" replace />;
  }

  return children;
}

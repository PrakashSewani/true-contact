import { BRAND } from '@truecontact/shared';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { authClient } from '../auth-client';

type Mode = 'sign-in' | 'sign-up';

export function SignInPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isPending && session) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result =
      mode === 'sign-up'
        ? await authClient.signUp.email({ email, password, name })
        : await authClient.signIn.email({ email, password });

    setBusy(false);

    if (result.error) {
      setError(result.error.message ?? 'Something went wrong. Please try again.');
      return;
    }

    navigate('/');
  }

  return (
    <main className="page-center">
      <div className="card">
        <h1>{BRAND.name}</h1>
        <p className="muted">{BRAND.tagline}</p>

        <form onSubmit={handleSubmit}>
          {mode === 'sign-up' && (
            <label>
              Name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" className="button-primary" disabled={busy}>
            {mode === 'sign-up' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="muted">
          {mode === 'sign-in' ? (
            <>
              New here?{' '}
              <button type="button" className="link-button" onClick={() => setMode('sign-up')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button type="button" className="link-button" onClick={() => setMode('sign-in')}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}

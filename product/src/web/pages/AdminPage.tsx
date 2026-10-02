import { useEffect, useState } from 'react';
import { useAccess } from '../access';
import { type AdminUser, api, errorMessage } from '../client';

export function AdminPage() {
  const access = useAccess();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    api
      .adminUsers()
      .then((data) => {
        if (!cancelled) {
          setUsers(data.users);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(errorMessage(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [version]);

  if (access.membership.role !== 'admin') {
    return (
      <section className="section">
        <p className="muted">Not authorized.</p>
      </section>
    );
  }

  async function decide(user: AdminUser, action: 'approve' | 'reject') {
    setBusyId(user.id);
    setError(null);

    try {
      if (action === 'approve') {
        await api.approveUser(user.id);
      } else {
        await api.rejectUser(user.id);
      }
      setVersion((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  const pending = users?.filter((user) => user.status === 'pending').length ?? 0;

  return (
    <section className="section">
      <div className="section-header">
        <h1>Members</h1>
        <div className="toolbar">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setVersion((value) => value + 1)}
          >
            Refresh
          </button>
        </div>
      </div>

      <p className="muted">
        New accounts wait here until they are approved. No email notifications yet — tell people to
        check the app after you approve them.{pending > 0 ? ` ${pending} pending.` : ''}
      </p>

      {error && <p className="error">{error}</p>}

      {users === null ? (
        <p className="muted">Loading…</p>
      ) : (
        <ul className="list">
          {users.map((user) => (
            <li key={user.id} className="panel">
              <div className="list-main">
                <strong>{user.name || user.email}</strong>
                <span className="muted">
                  {user.email} · joined {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>
              <span className={`badge ${statusClass(user)}`}>
                {user.role === 'admin' ? 'admin' : user.status}
              </span>
              {user.role !== 'admin' && (
                <div className="toolbar">
                  {user.status !== 'approved' && (
                    <button
                      type="button"
                      className="button-primary"
                      disabled={busyId === user.id}
                      onClick={() => void decide(user, 'approve')}
                    >
                      Approve
                    </button>
                  )}
                  {user.status !== 'rejected' && (
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={busyId === user.id}
                      onClick={() => void decide(user, 'reject')}
                    >
                      Reject
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function statusClass(user: AdminUser): string {
  if (user.role === 'admin') {
    return 'badge-complete';
  }

  if (user.status === 'pending') {
    return 'badge-pending';
  }

  if (user.status === 'rejected') {
    return 'badge-failed';
  }

  return 'badge-complete';
}

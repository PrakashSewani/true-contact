import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, errorMessage, type ReviewConflict, type ReviewProposal } from '../client';

export function ReviewPage() {
  const [version, setVersion] = useState(0);
  const [conflicts, setConflicts] = useState<ReviewConflict[] | null>(null);
  const [proposals, setProposals] = useState<ReviewProposal[] | null>(null);
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .review()
      .then((data) => {
        if (!cancelled) {
          setConflicts(data.conflicts);
          setProposals(data.proposals);
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

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);

    try {
      await action();
      setVersion((value) => value + 1);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusyId(null);
    }
  }

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (conflicts === null || proposals === null) {
    return <p className="muted">Loading…</p>;
  }

  if (conflicts.length === 0 && proposals.length === 0) {
    return (
      <section className="empty-state">
        <h1>Nothing to review</h1>
        <p className="muted">Conflicts and possible matches will show up here after imports.</p>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="section-header">
        <h1>Review</h1>
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

      {conflicts.length > 0 && (
        <div className="panel">
          <h2>Conflicts ({conflicts.length})</h2>
          <ul className="list">
            {conflicts.map((conflict) => (
              <li key={conflict.id} className="panel">
                <div className="list-main">
                  <strong>{conflict.identityName}</strong>
                  <span className="muted">
                    {conflict.field === 'display_name' ? 'Name' : conflict.field} · current “
                    {conflict.existingValue}” vs proposed “{conflict.proposedValue}”
                  </span>
                </div>
                <div className="toolbar">
                  <Link className="button-secondary" to={`/contacts/${conflict.identityId}`}>
                    Open
                  </Link>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busyId === conflict.id}
                    onClick={() =>
                      run(conflict.id, () => api.resolveConflict(conflict.id, 'keep_existing'))
                    }
                  >
                    Keep current
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    disabled={busyId === conflict.id}
                    onClick={() =>
                      run(conflict.id, () => api.resolveConflict(conflict.id, 'use_proposed'))
                    }
                  >
                    Use proposed
                  </button>
                  <input
                    placeholder="Custom value"
                    value={customValues[conflict.id] ?? ''}
                    onChange={(event) =>
                      setCustomValues((previous) => ({
                        ...previous,
                        [conflict.id]: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={
                      busyId === conflict.id || (customValues[conflict.id] ?? '').trim() === ''
                    }
                    onClick={() =>
                      run(conflict.id, () =>
                        api.resolveConflict(
                          conflict.id,
                          'custom',
                          (customValues[conflict.id] ?? '').trim(),
                        ),
                      )
                    }
                  >
                    Apply
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {proposals.length > 0 && (
        <div className="panel">
          <h2>Possible matches ({proposals.length})</h2>
          <ul className="list">
            {proposals.map((proposal) => (
              <li key={proposal.id} className="panel">
                <div className="list-main">
                  <strong>{proposal.observationName}</strong>
                  <span className="muted">
                    looks like{' '}
                    <Link to={`/contacts/${proposal.identityId}`}>{proposal.identityName}</Link> ·{' '}
                    {proposal.method.replace(/_/g, ' ')} · confidence{' '}
                    {Math.round(proposal.confidence * 100)}%
                  </span>
                </div>
                <div className="toolbar">
                  <button
                    type="button"
                    className="button-primary"
                    disabled={busyId === proposal.id}
                    onClick={() => run(proposal.id, () => api.confirmLink(proposal.id))}
                  >
                    Same person
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busyId === proposal.id}
                    onClick={() => run(proposal.id, () => api.rejectLink(proposal.id))}
                  >
                    Not the same
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

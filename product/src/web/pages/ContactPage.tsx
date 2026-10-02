import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, type ContactDetail, type ContactSummary, errorMessage } from '../client';

export function ContactPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [version, setVersion] = useState(0);
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [others, setOthers] = useState<ContactSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editName, setEditName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [newKind, setNewKind] = useState<'phone' | 'email'>('phone');
  const [newValue, setNewValue] = useState('');
  const [mergeTarget, setMergeTarget] = useState('');

  useEffect(() => {
    let cancelled = false;

    api
      .contact(id)
      .then((data) => {
        if (!cancelled) {
          setContact(data.contact);
          setEditName(data.contact.displayName);
          setEditNotes(data.contact.notes ?? '');
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(errorMessage(cause));
        }
      });

    api
      .contacts()
      .then((data) => {
        if (!cancelled) {
          setOthers(data.contacts.filter((item) => item.id !== id));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [id, version]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);

    try {
      await action();
      setVersion((value) => value + 1);
    } catch (cause) {
      setActionError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (!contact) {
    return <p className="muted">Loading…</p>;
  }

  const openConflicts = contact.conflicts.filter((conflict) => conflict.status === 'open');

  return (
    <section className="section">
      <div className="section-header">
        <div>
          <Link className="muted back-link" to="/">
            ← Contacts
          </Link>
          <h1>{contact.displayName}</h1>
          {contact.mergedIntoId && <span className="badge badge-warn">Merged</span>}
        </div>
      </div>

      {actionError && <p className="error">{actionError}</p>}

      <div className="panel">
        <h2>Canonical</h2>
        <div className="inline-form">
          <label>
            Name
            <input value={editName} onChange={(event) => setEditName(event.target.value)} />
          </label>
          <label>
            Notes
            <input value={editNotes} onChange={(event) => setEditNotes(event.target.value)} />
          </label>
          <button
            type="button"
            className="button-primary"
            disabled={busy}
            onClick={() =>
              run(() => api.updateContact(contact.id, { displayName: editName, notes: editNotes }))
            }
          >
            Save
          </button>
        </div>
      </div>

      <div className="panel">
        <h2>Values</h2>
        <ul className="list">
          {contact.values.map((value) => (
            <li key={value.id} className="value-row">
              <span>
                {value.value}{' '}
                <span className="muted">
                  {value.kind}
                  {value.label ? ` · ${value.label}` : ''}
                </span>
              </span>
              <button
                type="button"
                className="button-secondary"
                disabled={busy}
                onClick={() => run(() => api.deleteValue(contact.id, value.id))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="inline-form">
          <select
            value={newKind}
            onChange={(event) => setNewKind(event.target.value === 'email' ? 'email' : 'phone')}
          >
            <option value="phone">Phone</option>
            <option value="email">Email</option>
          </select>
          <input
            value={newValue}
            placeholder={newKind === 'phone' ? '+91 98765 43210' : 'name@example.com'}
            onChange={(event) => setNewValue(event.target.value)}
          />
          <button
            type="button"
            className="button-secondary"
            disabled={busy || newValue.trim() === ''}
            onClick={() =>
              run(async () => {
                await api.addValue(contact.id, { kind: newKind, value: newValue });
                setNewValue('');
              })
            }
          >
            Add
          </button>
        </div>
      </div>

      {openConflicts.length > 0 && (
        <div className="panel">
          <h2>Conflicts</h2>
          <ul className="list">
            {openConflicts.map((conflict) => (
              <li key={conflict.id} className="value-row">
                <span>
                  {conflict.existingValue ?? '(empty)'} <span className="muted">vs</span>{' '}
                  {conflict.proposedValue}
                </span>
                <div className="toolbar">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={busy}
                    onClick={() => run(() => api.resolveConflict(conflict.id, 'keep_existing'))}
                  >
                    Keep current
                  </button>
                  <button
                    type="button"
                    className="button-primary"
                    disabled={busy}
                    onClick={() => run(() => api.resolveConflict(conflict.id, 'use_proposed'))}
                  >
                    Use proposed
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel">
        <h2>Observations</h2>
        <ul className="list">
          {contact.observations.map((observation) => (
            <li key={observation.linkId} className="value-row">
              <span>
                {observation.displayName}
                <span className="muted">
                  {' '}
                  ·{' '}
                  {observation.source
                    ? `${observation.source.kind}${observation.source.label ? ` (${observation.source.label})` : ''}`
                    : 'unknown source'}{' '}
                  · {new Date(observation.observedAt).toLocaleString()} · {observation.link.status}/
                  {observation.link.method}
                </span>
              </span>
              <button
                type="button"
                className="button-secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await api.splitContact(contact.id, [observation.observationId]);
                    navigate(`/contacts/${result.identityId}`);
                  })
                }
              >
                Split out
              </button>
            </li>
          ))}
        </ul>
      </div>

      {others.length > 0 && (
        <div className="panel">
          <h2>Merge</h2>
          <div className="inline-form">
            <select value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}>
              <option value="">Choose a contact…</option>
              {others.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button-secondary"
              disabled={busy || mergeTarget === ''}
              onClick={() =>
                run(async () => {
                  await api.mergeContact(contact.id, mergeTarget);
                  navigate(`/contacts/${mergeTarget}`);
                })
              }
            >
              Merge into selected
            </button>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>History</h2>
        <ul className="list">
          {contact.history.map((event) => (
            <li key={event.id} className="value-row">
              <span>{eventLabel(event.type)}</span>
              <span className="muted">
                {event.actor} · {new Date(event.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    created: 'Created',
    observed: 'Observed in a source',
    value_added: 'Value added',
    value_changed: 'Value changed',
    value_removed: 'Value removed',
    conflict_opened: 'Conflict opened',
    conflict_resolved: 'Conflict resolved',
    merged: 'Merged',
    split: 'Split',
    link_confirmed: 'Match confirmed',
    link_rejected: 'Match rejected',
  };

  return labels[type] ?? type;
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type ContactSummary, errorMessage } from '../client';

export function ContactsPage() {
  const [version, setVersion] = useState(0);
  const [contacts, setContacts] = useState<ContactSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .contacts()
      .then((data) => {
        if (!cancelled) {
          setContacts(data.contacts);
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

  if (error) {
    return <p className="error">{error}</p>;
  }

  if (contacts === null) {
    return <p className="muted">Loading…</p>;
  }

  if (contacts.length === 0) {
    return (
      <section className="empty-state">
        <h1>No contacts yet</h1>
        <p className="muted">Import a vCard or CSV file to build your contact graph.</p>
        <Link className="button-primary" to="/imports">
          Import contacts
        </Link>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="section-header">
        <h1>Contacts</h1>
        <div className="toolbar">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setVersion((value) => value + 1)}
          >
            Refresh
          </button>
          <Link className="button-primary" to="/imports">
            Import
          </Link>
        </div>
      </div>

      <ul className="list">
        {contacts.map((contact) => (
          <li key={contact.id}>
            <Link className="list-row" to={`/contacts/${contact.id}`}>
              <div className="list-main">
                <strong>{contact.displayName}</strong>
                <span className="muted">
                  {contact.phones[0]?.value ?? contact.emails[0]?.value ?? ''}
                </span>
              </div>
              <div className="badges">
                {contact.openConflicts > 0 && (
                  <span className="badge badge-warn">
                    {contact.openConflicts} conflict{contact.openConflicts === 1 ? '' : 's'}
                  </span>
                )}
                {contact.proposedLinks > 0 && (
                  <span className="badge">{contact.proposedLinks} to review</span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

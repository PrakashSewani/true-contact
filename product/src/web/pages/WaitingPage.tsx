import { BRAND } from '@truecontact/shared';

interface WaitingPageProps {
  email: string;
  status: 'pending' | 'rejected';
}

export function WaitingPage({ email, status }: WaitingPageProps) {
  return (
    <div className="page-center">
      <div className="panel">
        <strong>{BRAND.name}</strong>
        {status === 'pending' ? (
          <>
            <h1>Waiting for approval</h1>
            <p className="muted">
              Your account ({email}) is registered — but {BRAND.name} is in a personal preview right
              now, and the owner reviews new accounts before they get access.
            </p>
            <p className="muted">
              There are no email notifications yet, so check back here after you have been approved.
            </p>
          </>
        ) : (
          <>
            <h1>Access not granted</h1>
            <p className="muted">
              This account ({email}) does not have access to {BRAND.name}.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

import { BRAND } from '@truecontact/shared';

export function App() {
  return (
    <main>
      <h1>{BRAND.name}</h1>
      <p className="muted">
        Pairing with your TrueContact web session and WhatsApp contact import arrive in the next
        phase. This connector will never ask for your WhatsApp credentials.
      </p>
      <button type="button" disabled>
        Pair with TrueContact
      </button>
    </main>
  );
}

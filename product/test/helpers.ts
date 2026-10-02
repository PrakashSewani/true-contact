import { exports } from 'cloudflare:workers';

export const worker = exports.default;

const ORIGIN = 'http://localhost:5173';

export interface RegisteredUser {
  cookie: string;
  email: string;
  userId: string;
}

export async function registerUser(): Promise<RegisteredUser> {
  const email = `test-${crypto.randomUUID()}@example.com`;
  const response = await worker.fetch(
    new Request('http://truecontact.test/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ email, password: 'correct-horse-battery-staple', name: 'Test User' }),
    }),
  );

  if (response.status !== 200) {
    throw new Error(`sign-up failed with status ${response.status}`);
  }

  const body = (await response.json()) as { user?: { id?: string } };
  const userId = body.user?.id;

  if (!userId) {
    throw new Error('sign-up response did not include a user id');
  }

  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0] ?? '')
    .join('; ');

  return { cookie, email, userId };
}

export function apiRequest(
  path: string,
  options: { cookie?: string; method?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  return worker.fetch(
    new Request(`http://truecontact.test${path}`, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
  );
}

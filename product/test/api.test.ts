import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const ORIGIN = 'http://localhost:5173';
const worker = exports.default;

function post(path: string, body: unknown): Promise<Response> {
  return worker.fetch(
    new Request(`http://truecontact.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify(body),
    }),
  );
}

function get(path: string, headers?: HeadersInit): Promise<Response> {
  return worker.fetch(new Request(`http://truecontact.test${path}`, { headers }));
}

function cookieHeader(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0] ?? '')
    .join('; ');
}

describe('api', () => {
  it('serves the health endpoint', async () => {
    const response = await get('/api/health');

    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe('truecontact');
  });

  it('rejects unauthenticated access to the session endpoint', async () => {
    const response = await get('/api/me');

    expect(response.status).toBe(401);
  });

  it('registers a user and reads the session back', async () => {
    const email = `test-${crypto.randomUUID()}@example.com`;

    const signUp = await post('/api/auth/sign-up/email', {
      email,
      password: 'correct-horse-battery-staple',
      name: 'Test User',
    });
    expect(signUp.status).toBe(200);

    const cookie = cookieHeader(signUp);
    expect(cookie).toContain('better-auth');

    const me = await get('/api/me', { cookie });
    expect(me.status).toBe(200);

    const body = (await me.json()) as { user: { email: string; name: string } };
    expect(body.user.email).toBe(email);
    expect(body.user.name).toBe('Test User');
  });
});

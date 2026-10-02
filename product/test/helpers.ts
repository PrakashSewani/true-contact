import { createExecutionContext, createMessageBatch, getQueueResult } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import appWorker from '../src/api/index';

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

export function vcard(name: string, phone: string, email?: string): string {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    `TEL;TYPE=CELL:${phone}`,
    ...(email ? [`EMAIL:${email}`] : []),
    'END:VCARD',
  ].join('\r\n');
}

export async function upload(cookie: string, fileName: string, content: string): Promise<string> {
  const response = await apiRequest('/api/imports', { cookie, body: { fileName, content } });

  if (response.status !== 201) {
    throw new Error(`upload failed with status ${response.status}`);
  }

  const { import: job } = (await response.json()) as { import: { id: string } };
  return job.id;
}

export async function runQueue(importId: string): Promise<void> {
  const batch = createMessageBatch('truecontact-imports', [
    { id: crypto.randomUUID(), timestamp: new Date(), attempts: 1, body: { importId } },
  ]);
  const ctx = createExecutionContext();

  await (
    appWorker as {
      queue: (batch: MessageBatch, env: Env, ctx: ExecutionContext) => Promise<void>;
    }
  ).queue(batch, env, ctx);
  await getQueueResult(batch, ctx);
}

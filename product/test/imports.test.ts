import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { apiRequest, registerUser } from './helpers';

const db = drizzle(env.DB, { schema });

const VCF = [
  'BEGIN:VCARD',
  'VERSION:3.0',
  'FN:Rahul Sharma',
  'TEL;TYPE=CELL:+91 98765 43210',
  'END:VCARD',
].join('\r\n');

describe('imports api', () => {
  it('rejects unauthenticated uploads', async () => {
    const response = await apiRequest('/api/imports', {
      body: { fileName: 'contacts.vcf', content: VCF },
    });

    expect(response.status).toBe(401);
  });

  it('accepts a vCard upload, stores the raw payload, and lists it', async () => {
    const { cookie } = await registerUser();

    const created = await apiRequest('/api/imports', {
      cookie,
      body: { fileName: 'contacts.vcf', content: VCF },
    });

    expect(created.status).toBe(201);
    const { import: job } = (await created.json()) as {
      import: { id: string; kind: string; status: string };
    };
    expect(job.kind).toBe('vcard');
    expect(job.status).toBe('pending');

    const [row] = await db.select().from(schema.imports).where(eq(schema.imports.id, job.id));
    expect(row?.status).toBe('pending');
    expect(row?.rawKey).toBeTruthy();

    const raw = await env.IMPORTS_BUCKET.get(row?.rawKey ?? '');
    expect(raw).not.toBeNull();
    expect(await raw?.text()).toBe(VCF);

    const list = await apiRequest('/api/imports', { cookie });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { imports: { id: string }[] };
    expect(listBody.imports.some((item) => item.id === job.id)).toBe(true);

    const detail = await apiRequest(`/api/imports/${job.id}`, { cookie });
    expect(detail.status).toBe(200);
  });

  it('rejects missing fields and unsupported file types', async () => {
    const { cookie } = await registerUser();

    const missing = await apiRequest('/api/imports', { cookie, body: { fileName: 'a.vcf' } });
    expect(missing.status).toBe(400);

    const unsupported = await apiRequest('/api/imports', {
      cookie,
      body: { fileName: 'notes.txt', content: 'hello there' },
    });
    expect(unsupported.status).toBe(400);
  });

  it('does not expose other users imports', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();

    const created = await apiRequest('/api/imports', {
      cookie: owner.cookie,
      body: { fileName: 'contacts.csv', content: 'Name,Phone\nRahul,+91 98765 43210\n' },
    });
    const { import: job } = (await created.json()) as { import: { id: string } };

    const detail = await apiRequest(`/api/imports/${job.id}`, { cookie: stranger.cookie });
    expect(detail.status).toBe(404);
  });
});

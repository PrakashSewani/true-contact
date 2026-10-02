import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/db/schema';
import { renderCsv, renderVCard } from '../src/domain/export';
import { parseCsv } from '../src/domain/parse-csv';
import { parseVCard } from '../src/domain/parse-vcard';
import { apiRequest, registerUser, runQueue, upload, vcard } from './helpers';

const db = drizzle(env.DB, { schema });
const OBSERVED_AT = '2026-10-02T00:00:00.000Z';

describe('export renderers', () => {
  it('escapes vCard values', () => {
    const rendered = renderVCard([
      {
        displayName: 'Doe, John',
        notes: 'a;b\nc',
        phones: [{ value: '+1 555', label: 'cell' }],
        emails: [],
      },
    ]);

    expect(rendered).toContain('FN:Doe\\, John');
    expect(rendered).toContain('TEL;TYPE=CELL:+1 555');
    expect(rendered).toContain('NOTE:a\\;b\\nc');
  });

  it('quotes CSV cells', () => {
    const rendered = renderCsv([
      {
        displayName: 'Doe, John',
        notes: 'line1\nline2',
        phones: [{ value: '+1', label: null }],
        emails: [],
      },
    ]);

    expect(rendered.split('\r\n')[0]).toBe('Name,Phone,Email,Notes');
    expect(rendered).toContain('"Doe, John",+1,,');
    expect(rendered).toContain('"line1\nline2"');
  });
});

describe('export api', () => {
  it('round-trips contacts through the vCard export and parser', async () => {
    const { cookie, userId } = await registerUser();
    await runQueue(
      await upload(
        cookie,
        'contacts.vcf',
        `${vcard('Rahul Sharma', '+91 98765 43210', 'rahul@example.com')}\r\n${vcard('Jane Doe', '+1 555 0100')}`,
      ),
    );

    const response = await apiRequest('/api/export/vcard', { cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/vcard');

    const parsed = parseVCard(await response.text(), { observedAt: OBSERVED_AT });
    expect(parsed.skipped).toEqual([]);
    expect(parsed.contacts.map((contact) => contact.displayName).sort()).toEqual([
      'Jane Doe',
      'Rahul Sharma',
    ]);

    const rahul = parsed.contacts.find((contact) => contact.displayName === 'Rahul Sharma');
    expect(rahul?.phones[0]?.value).toBe('+91 98765 43210');
    expect(rahul?.emails[0]?.value).toBe('rahul@example.com');

    const usage = await db
      .select()
      .from(schema.usageOperations)
      .where(
        and(eq(schema.usageOperations.userId, userId), eq(schema.usageOperations.kind, 'export')),
      );
    expect(usage.length).toBeGreaterThan(0);
  });

  it('round-trips contacts through the CSV export and parser, scoped per user', async () => {
    const { cookie } = await registerUser();
    await runQueue(await upload(cookie, 'contacts.vcf', vcard('Rahul Sharma', '+91 98765 43210')));

    const response = await apiRequest('/api/export/csv', { cookie });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');

    const parsed = parseCsv(await response.text(), { observedAt: OBSERVED_AT });
    expect(parsed.contacts.map((contact) => contact.displayName)).toEqual(['Rahul Sharma']);
    expect(parsed.contacts[0]?.phones[0]?.value).toBe('+91 98765 43210');

    const stranger = await registerUser();
    const strangerResponse = await apiRequest('/api/export/csv', { cookie: stranger.cookie });
    const strangerParsed = parseCsv(await strangerResponse.text(), { observedAt: OBSERVED_AT });
    expect(strangerParsed.contacts).toEqual([]);
  });

  it('rejects unauthenticated exports', async () => {
    const response = await apiRequest('/api/export/vcard');
    expect(response.status).toBe(401);
  });
});

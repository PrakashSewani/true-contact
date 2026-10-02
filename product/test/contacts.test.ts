import { describe, expect, it } from 'vitest';
import { apiRequest, registerUser, runQueue, upload, vcard } from './helpers';

describe('contacts api', () => {
  it('lists contacts with canonical values', async () => {
    const { cookie } = await registerUser();
    await runQueue(
      await upload(
        cookie,
        'contacts.vcf',
        `${vcard('Rahul Sharma', '+91 98765 43210')}\r\n${vcard('Jane Doe', '+1 555 0100', 'jane@example.com')}`,
      ),
    );

    const response = await apiRequest('/api/contacts', { cookie });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      contacts: { displayName: string; phones: { value: string }[]; emails: { value: string }[] }[];
    };

    expect(body.contacts.map((contact) => contact.displayName).sort()).toEqual([
      'Jane Doe',
      'Rahul Sharma',
    ]);

    const jane = body.contacts.find((contact) => contact.displayName === 'Jane Doe');
    expect(jane?.phones).toEqual([{ id: expect.any(String), value: '+1 555 0100', label: 'cell' }]);
    expect(jane?.emails).toEqual([
      { id: expect.any(String), value: 'jane@example.com', label: null },
    ]);
  });

  it('returns a contact with values, observations, and history', async () => {
    const { cookie } = await registerUser();
    await runQueue(await upload(cookie, 'one.vcf', vcard('Rahul Sharma', '+91 98765 43210')));

    const list = await apiRequest('/api/contacts', { cookie });
    const listBody = (await list.json()) as { contacts: { id: string }[] };
    const id = listBody.contacts[0]?.id ?? '';

    const detail = await apiRequest(`/api/contacts/${id}`, { cookie });
    expect(detail.status).toBe(200);

    const body = (await detail.json()) as {
      contact: {
        displayName: string;
        values: unknown[];
        observations: { displayName: string; link: { status: string; method: string } }[];
        conflicts: unknown[];
        history: { type: string }[];
      };
    };

    expect(body.contact.displayName).toBe('Rahul Sharma');
    expect(body.contact.values).toHaveLength(1);
    expect(body.contact.observations).toHaveLength(1);
    expect(body.contact.observations[0]?.displayName).toBe('Rahul Sharma');
    expect(body.contact.observations[0]?.link.status).toBe('auto');
    expect(body.contact.observations[0]?.link.method).toBe('new_identity');
    expect(body.contact.conflicts).toEqual([]);
    expect(body.contact.history.map((event) => event.type)).toContain('created');
  });

  it('surfaces conflicts and proposals in the review queue', async () => {
    const { cookie } = await registerUser();
    await runQueue(await upload(cookie, 'one.vcf', vcard('Rahul Sharma', '+91 98765 43210')));
    await runQueue(await upload(cookie, 'two.vcf', vcard('Rahul S.', '+91 98765 43210')));
    await runQueue(await upload(cookie, 'three.vcf', vcard('Jane Doe', '+1 555 0100')));
    await runQueue(await upload(cookie, 'four.vcf', vcard('Jane Doe', '+1 555 0200')));

    const response = await apiRequest('/api/review', { cookie });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      conflicts: { identityName: string; field: string; proposedValue: string }[];
      proposals: { identityName: string; observationName: string; method: string }[];
    };

    expect(body.conflicts).toHaveLength(1);
    expect(body.conflicts[0]).toMatchObject({
      identityName: 'Rahul Sharma',
      field: 'display_name',
      proposedValue: 'Rahul S.',
    });

    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0]).toMatchObject({
      identityName: 'Jane Doe',
      observationName: 'Jane Doe',
      method: 'name_similarity',
    });
  });

  it('does not expose other users contacts', async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    await runQueue(await upload(owner.cookie, 'one.vcf', vcard('Private Person', '+1 555 0900')));

    const list = await apiRequest('/api/contacts', { cookie: owner.cookie });
    const { contacts } = (await list.json()) as { contacts: { id: string }[] };

    const detail = await apiRequest(`/api/contacts/${contacts[0]?.id ?? ''}`, {
      cookie: stranger.cookie,
    });
    expect(detail.status).toBe(404);

    const strangerList = await apiRequest('/api/contacts', { cookie: stranger.cookie });
    const strangerBody = (await strangerList.json()) as { contacts: unknown[] };
    expect(strangerBody.contacts).toEqual([]);
  });
});

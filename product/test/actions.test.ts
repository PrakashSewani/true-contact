import { describe, expect, it } from 'vitest';
import { apiRequest, registerUser, runQueue, upload, vcard } from './helpers';

interface ContactDetail {
  id: string;
  displayName: string;
  notes: string | null;
  mergedIntoId: string | null;
  values: { id: string; kind: string; value: string }[];
  observations: { observationId: string; link: { status: string; method: string } }[];
  conflicts: { id: string; status: string }[];
  history: { type: string }[];
}

async function getContact(cookie: string, id: string): Promise<ContactDetail> {
  const response = await apiRequest(`/api/contacts/${id}`, { cookie });
  expect(response.status).toBe(200);

  const body = (await response.json()) as { contact: ContactDetail };
  return body.contact;
}

async function getOnlyContactId(cookie: string): Promise<string> {
  const response = await apiRequest('/api/contacts', { cookie });
  const body = (await response.json()) as { contacts: { id: string }[] };
  const id = body.contacts[0]?.id;

  if (!id) {
    throw new Error('no contacts found');
  }

  return id;
}

async function getProposal(cookie: string): Promise<{ id: string; identityId: string }> {
  const response = await apiRequest('/api/review', { cookie });
  const body = (await response.json()) as {
    proposals: { id: string; identityId: string }[];
  };
  const proposal = body.proposals[0];

  if (!proposal) {
    throw new Error('no proposals found');
  }

  return proposal;
}

describe('review actions', () => {
  it('confirms a proposed link and adopts the observation values', async () => {
    const { cookie } = await registerUser();
    await runQueue(await upload(cookie, 'one.vcf', vcard('Jane Doe', '+1 555 0100')));
    await runQueue(await upload(cookie, 'two.vcf', vcard('Jane Doe', '+1 555 0200')));

    const proposal = await getProposal(cookie);

    const confirm = await apiRequest(`/api/links/${proposal.id}/confirm`, {
      cookie,
      method: 'POST',
      body: {},
    });
    expect(confirm.status).toBe(200);

    const contact = await getContact(cookie, proposal.identityId);
    expect(contact.values.map((value) => value.value).sort()).toEqual([
      '+1 555 0100',
      '+1 555 0200',
    ]);
    expect(contact.observations.some((item) => item.link.status === 'confirmed')).toBe(true);
    expect(contact.history.map((event) => event.type)).toContain('link_confirmed');

    const review = await apiRequest('/api/review', { cookie });
    const after = (await review.json()) as { proposals: unknown[] };
    expect(after.proposals).toEqual([]);
  });

  it('rejects a proposed link by giving the observation its own contact', async () => {
    const { cookie } = await registerUser();
    await runQueue(await upload(cookie, 'one.vcf', vcard('Jane Doe', '+1 555 0100')));
    await runQueue(await upload(cookie, 'two.vcf', vcard('Jane Doe', '+1 555 0200')));

    const proposal = await getProposal(cookie);

    const reject = await apiRequest(`/api/links/${proposal.id}/reject`, {
      cookie,
      method: 'POST',
      body: {},
    });
    expect(reject.status).toBe(200);
    const { identityId } = (await reject.json()) as { identityId: string };

    const created = await getContact(cookie, identityId);
    expect(created.values.map((value) => value.value)).toEqual(['+1 555 0200']);
    expect(created.observations[0]?.link).toMatchObject({ status: 'confirmed', method: 'manual' });

    const original = await getContact(cookie, proposal.identityId);
    expect(original.values.map((value) => value.value)).toEqual(['+1 555 0100']);
    expect(original.history.map((event) => event.type)).toContain('link_rejected');
  });

  it('resolves a display-name conflict with the proposed value', async () => {
    const { cookie } = await registerUser();
    await runQueue(await upload(cookie, 'one.vcf', vcard('Rahul Sharma', '+91 98765 43210')));
    await runQueue(await upload(cookie, 'two.vcf', vcard('Rahul S.', '+91 98765 43210')));

    const contactId = await getOnlyContactId(cookie);
    const before = await getContact(cookie, contactId);
    const conflictId = before.conflicts[0]?.id ?? '';
    expect(conflictId).toBeTruthy();

    const resolve = await apiRequest(`/api/conflicts/${conflictId}/resolve`, {
      cookie,
      method: 'POST',
      body: { resolution: 'use_proposed' },
    });
    expect(resolve.status).toBe(200);

    const after = await getContact(cookie, contactId);
    expect(after.displayName).toBe('Rahul S.');
    expect(after.conflicts[0]?.status).toBe('resolved');
    const types = after.history.map((event) => event.type);
    expect(types).toContain('value_changed');
    expect(types).toContain('conflict_resolved');
  });

  it('merges two identities and tombstones the source', async () => {
    const { cookie } = await registerUser();
    await runQueue(await upload(cookie, 'one.vcf', vcard('Alice One', '+1 555 0300')));
    await runQueue(await upload(cookie, 'two.vcf', vcard('Bob Two', '+1 555 0400')));

    const list = await apiRequest('/api/contacts', { cookie });
    const { contacts } = (await list.json()) as { contacts: { id: string; displayName: string }[] };
    const alice = contacts.find((contact) => contact.displayName === 'Alice One');
    const bob = contacts.find((contact) => contact.displayName === 'Bob Two');

    const merge = await apiRequest(`/api/contacts/${alice?.id}/merge`, {
      cookie,
      method: 'POST',
      body: { intoId: bob?.id },
    });
    expect(merge.status).toBe(200);

    const target = await getContact(cookie, bob?.id ?? '');
    expect(target.values.map((value) => value.value).sort()).toEqual([
      '+1 555 0300',
      '+1 555 0400',
    ]);
    expect(target.observations).toHaveLength(2);
    expect(target.history.map((event) => event.type)).toContain('merged');

    const listAfter = await apiRequest('/api/contacts', { cookie });
    const after = (await listAfter.json()) as { contacts: { id: string }[] };
    expect(after.contacts).toHaveLength(1);

    const source = await getContact(cookie, alice?.id ?? '');
    expect(source.mergedIntoId).toBe(bob?.id);
  });

  it('splits observations onto a new identity', async () => {
    const { cookie } = await registerUser();
    await runQueue(await upload(cookie, 'one.vcf', vcard('Rahul Sharma', '+91 98765 43210')));
    await runQueue(await upload(cookie, 'two.vcf', vcard('Rahul Sharma', '+91 98765 43210')));

    const contactId = await getOnlyContactId(cookie);
    const before = await getContact(cookie, contactId);
    expect(before.observations).toHaveLength(2);
    const movedObservationId = before.observations[0]?.observationId ?? '';

    const split = await apiRequest(`/api/contacts/${contactId}/split`, {
      cookie,
      method: 'POST',
      body: { observationIds: [movedObservationId] },
    });
    expect(split.status).toBe(200);
    const { identityId } = (await split.json()) as { identityId: string };

    const source = await getContact(cookie, contactId);
    expect(source.observations).toHaveLength(1);
    expect(source.history.map((event) => event.type)).toContain('split');

    const created = await getContact(cookie, identityId);
    expect(created.observations).toHaveLength(1);
    expect(created.observations[0]?.observationId).toBe(movedObservationId);
    expect(created.observations[0]?.link.status).toBe('confirmed');
    expect(created.values.map((value) => value.value)).toEqual(['+91 98765 43210']);
  });

  it('edits canonical fields and values with history', async () => {
    const { cookie } = await registerUser();
    await runQueue(await upload(cookie, 'one.vcf', vcard('Rahul Sharma', '+91 98765 43210')));
    const contactId = await getOnlyContactId(cookie);

    const patch = await apiRequest(`/api/contacts/${contactId}`, {
      cookie,
      method: 'PATCH',
      body: { displayName: 'Rahul S. Sharma', notes: 'edited' },
    });
    expect(patch.status).toBe(200);

    const add = await apiRequest(`/api/contacts/${contactId}/values`, {
      cookie,
      method: 'POST',
      body: { kind: 'email', value: 'Rahul@Example.com' },
    });
    expect(add.status).toBe(201);
    const { value } = (await add.json()) as { value: { id: string } };

    const duplicate = await apiRequest(`/api/contacts/${contactId}/values`, {
      cookie,
      method: 'POST',
      body: { kind: 'email', value: 'rahul@example.com' },
    });
    expect(duplicate.status).toBe(409);

    const remove = await apiRequest(`/api/contacts/${contactId}/values/${value.id}`, {
      cookie,
      method: 'DELETE',
    });
    expect(remove.status).toBe(200);

    const contact = await getContact(cookie, contactId);
    expect(contact.displayName).toBe('Rahul S. Sharma');
    expect(contact.notes).toBe('edited');
    expect(contact.values.map((item) => item.kind)).toEqual(['phone']);

    const types = contact.history.map((event) => event.type);
    expect(types).toContain('value_changed');
    expect(types).toContain('value_added');
    expect(types).toContain('value_removed');
  });
});

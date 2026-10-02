import { describe, expect, it } from 'vitest';
import { apiRequest, registerUser, setMembership } from './helpers';

describe('access approvals', () => {
  it('blocks product routes while pending and allows them after admin approval', async () => {
    const admin = await registerUser();
    await setMembership(admin.userId, 'admin', 'approved');
    const joiner = await registerUser({ approved: false });

    const me = await apiRequest('/api/me', { cookie: joiner.cookie });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { membership: { status: string } };
    expect(meBody.membership.status).toBe('pending');

    const blocked = await apiRequest('/api/contacts', { cookie: joiner.cookie });
    expect(blocked.status).toBe(403);

    const list = await apiRequest('/api/admin/users', { cookie: admin.cookie });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { users: { id: string; status: string }[] };
    expect(listBody.users.find((user) => user.id === joiner.userId)?.status).toBe('pending');

    const approve = await apiRequest(`/api/admin/users/${joiner.userId}/approve`, {
      cookie: admin.cookie,
      method: 'POST',
      body: {},
    });
    expect(approve.status).toBe(200);

    const allowed = await apiRequest('/api/contacts', { cookie: joiner.cookie });
    expect(allowed.status).toBe(200);
  });

  it('rejects an account and keeps non-admins out of admin routes', async () => {
    const admin = await registerUser();
    await setMembership(admin.userId, 'admin', 'approved');
    const joiner = await registerUser({ approved: false });

    const attempt = await apiRequest(`/api/admin/users/${joiner.userId}/reject`, {
      cookie: joiner.cookie,
      method: 'POST',
      body: {},
    });
    expect(attempt.status).toBe(403);

    const reject = await apiRequest(`/api/admin/users/${joiner.userId}/reject`, {
      cookie: admin.cookie,
      method: 'POST',
      body: {},
    });
    expect(reject.status).toBe(200);

    const me = await apiRequest('/api/me', { cookie: joiner.cookie });
    const meBody = (await me.json()) as { membership: { status: string } };
    expect(meBody.membership.status).toBe('rejected');

    const blocked = await apiRequest('/api/imports', { cookie: joiner.cookie });
    expect(blocked.status).toBe(403);
  });
});

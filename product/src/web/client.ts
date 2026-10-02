export interface ContactValue {
  id: string;
  value: string;
  label: string | null;
}

export interface ContactSummary {
  id: string;
  displayName: string;
  notes: string | null;
  updatedAt: string;
  phones: ContactValue[];
  emails: ContactValue[];
  openConflicts: number;
  proposedLinks: number;
  lastObservedAt: string | null;
}

export interface ContactObservation {
  linkId: string;
  observationId: string;
  displayName: string;
  observedAt: string;
  source: { id: string; kind: string; label: string | null } | null;
  link: { confidence: number; method: string; status: string };
}

export interface ContactConflict {
  id: string;
  field: string;
  existingValue: string | null;
  proposedValue: string;
  status: string;
  createdAt: string;
}

export interface ContactEvent {
  id: string;
  type: string;
  actor: string;
  createdAt: string;
}

export interface ContactDetail {
  id: string;
  displayName: string;
  notes: string | null;
  mergedIntoId: string | null;
  createdAt: string;
  updatedAt: string;
  values: { id: string; kind: string; value: string; label: string | null }[];
  observations: ContactObservation[];
  conflicts: ContactConflict[];
  history: ContactEvent[];
}

export interface ReviewConflict {
  id: string;
  identityId: string;
  identityName: string;
  field: string;
  existingValue: string | null;
  proposedValue: string;
  proposedObservationId: string | null;
  createdAt: string;
}

export interface ReviewProposal {
  id: string;
  identityId: string;
  identityName: string;
  observationId: string;
  observationName: string;
  confidence: number;
  method: string;
  createdAt: string;
}

export interface ImportStats {
  contacts?: number;
  created?: number;
  linked?: number;
  proposed?: number;
  conflicts?: number;
  skipped?: number;
}

export interface ImportJob {
  id: string;
  fileName: string | null;
  status: string;
  stats: ImportStats | null;
  error: string | null;
  cursor: number;
  total: number;
  progressAt: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface Membership {
  role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'rejected';
}

export interface Me {
  user: { id: string; email: string; name: string };
  membership: Membership;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  role: 'admin' | 'member';
  status: 'pending' | 'approved' | 'rejected';
  decidedAt: string | null;
}

export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong';
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export const api = {
  me: () => request<Me>('/api/me'),
  contacts: () => request<{ contacts: ContactSummary[] }>('/api/contacts'),
  contact: (id: string) => request<{ contact: ContactDetail }>(`/api/contacts/${id}`),
  review: () =>
    request<{ conflicts: ReviewConflict[]; proposals: ReviewProposal[] }>('/api/review'),
  imports: () =>
    request<{
      imports: ImportJob[];
      usage: { importedContacts: number; limit: number };
    }>('/api/imports'),
  startPairing: () =>
    request<{ pairing: { code: string; expiresAt: string } }>('/api/pairing/start', {
      method: 'POST',
      body: {},
    }),
  createImport: (fileName: string, content: string) =>
    request<{ import: ImportJob }>('/api/imports', { method: 'POST', body: { fileName, content } }),
  resumeImport: (id: string) =>
    request<{ import: ImportJob }>(`/api/imports/${id}/resume`, { method: 'POST', body: {} }),
  confirmLink: (id: string) => request(`/api/links/${id}/confirm`, { method: 'POST', body: {} }),
  rejectLink: (id: string) => request(`/api/links/${id}/reject`, { method: 'POST', body: {} }),
  resolveConflict: (id: string, resolution: string, value?: string) =>
    request(`/api/conflicts/${id}/resolve`, { method: 'POST', body: { resolution, value } }),
  mergeContact: (id: string, intoId: string) =>
    request(`/api/contacts/${id}/merge`, { method: 'POST', body: { intoId } }),
  splitContact: (id: string, observationIds: string[]) =>
    request<{ identityId: string }>(`/api/contacts/${id}/split`, {
      method: 'POST',
      body: { observationIds },
    }),
  updateContact: (id: string, patch: { displayName?: string; notes?: string }) =>
    request(`/api/contacts/${id}`, { method: 'PATCH', body: patch }),
  addValue: (id: string, value: { kind: 'phone' | 'email'; value: string; label?: string }) =>
    request(`/api/contacts/${id}/values`, { method: 'POST', body: value }),
  deleteValue: (id: string, valueId: string) =>
    request(`/api/contacts/${id}/values/${valueId}`, { method: 'DELETE' }),
  adminUsers: () => request<{ users: AdminUser[] }>('/api/admin/users'),
  approveUser: (id: string) =>
    request(`/api/admin/users/${id}/approve`, { method: 'POST', body: {} }),
  rejectUser: (id: string) =>
    request(`/api/admin/users/${id}/reject`, { method: 'POST', body: {} }),
};

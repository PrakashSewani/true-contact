import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import { rawImportKey } from '../domain/imports';

export interface QueueImportParams {
  userId: string;
  kind: 'whatsapp' | 'vcard' | 'csv';
  fileName: string;
  content: string;
}

export interface QueuedImport {
  importId: string;
  sourceId: string;
}

export async function queueImport(env: Env, params: QueueImportParams): Promise<QueuedImport> {
  const db = drizzle(env.DB, { schema });
  const now = new Date();
  const sourceId = crypto.randomUUID();
  const importId = crypto.randomUUID();
  const rawKey = rawImportKey(params.userId, importId);

  await env.IMPORTS_BUCKET.put(rawKey, params.content);
  await db.insert(schema.sources).values({
    id: sourceId,
    userId: params.userId,
    kind: params.kind,
    label: params.fileName,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.imports).values({
    id: importId,
    userId: params.userId,
    sourceId,
    status: 'pending',
    rawKey,
    fileName: params.fileName,
    createdAt: now,
  });
  await env.IMPORTS_QUEUE.send({ importId });

  return { importId, sourceId };
}

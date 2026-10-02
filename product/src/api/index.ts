import { markImportFailed, processImport } from '../imports/process';
import { createApp } from './app';

const MAX_IMPORT_ATTEMPTS = 4;

const app = createApp();

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const { importId, cursor } = (message.body ?? {}) as { importId?: unknown; cursor?: unknown };

      if (typeof importId !== 'string') {
        message.ack();
        continue;
      }

      const start =
        typeof cursor === 'number' && Number.isFinite(cursor) && cursor > 0
          ? Math.floor(cursor)
          : 0;

      try {
        await processImport(env, importId, start);
        message.ack();
      } catch (error) {
        console.error('import processing failed', error);

        if (message.attempts >= MAX_IMPORT_ATTEMPTS) {
          await markImportFailed(env, importId, error);
          message.ack();
        } else {
          message.retry();
        }
      }
    }
  },
} satisfies ExportedHandler<Env>;

import { processImport } from '../imports/process';
import { createApp } from './app';

const app = createApp();

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const { importId } = (message.body ?? {}) as { importId?: unknown };

      if (typeof importId === 'string') {
        try {
          await processImport(env, importId);
        } catch (error) {
          console.error('import processing failed', error);
        }
      }

      message.ack();
    }
  },
} satisfies ExportedHandler<Env>;

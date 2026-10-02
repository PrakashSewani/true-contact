import { createApp } from './app';

const app = createApp();

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch, _env: Env): Promise<void> {
    for (const message of batch.messages) {
      message.ack();
    }
  },
} satisfies ExportedHandler<Env>;

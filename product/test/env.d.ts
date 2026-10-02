import type { D1Migration } from '@cloudflare/vitest-pool-workers';
import '@cloudflare/vitest-pool-workers/types';

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

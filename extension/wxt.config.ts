import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'TrueContact',
    description: 'Import contacts from WhatsApp Web into your TrueContact account.',
    permissions: ['storage'],
    host_permissions: ['http://localhost:8787/*'],
  },
});

import { Hono } from 'hono';
import { actionRoutes } from './actions';
import { createAuth } from './auth';
import { contactRoutes } from './contacts';
import { exportRoutes } from './export';
import { extensionRoutes } from './extension';
import { importRoutes } from './imports';
import { pairingRoutes } from './pairing';
import { getSessionUser } from './session';

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/api/health', (c) =>
    c.json({ ok: true, service: 'truecontact', now: new Date().toISOString() }),
  );

  app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));

  app.get('/api/me', async (c) => {
    const user = await getSessionUser(c);

    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    return c.json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  app.route('/', importRoutes);
  app.route('/', contactRoutes);
  app.route('/', actionRoutes);
  app.route('/', exportRoutes);
  app.route('/', pairingRoutes);
  app.route('/', extensionRoutes);

  return app;
}

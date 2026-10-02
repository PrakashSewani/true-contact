import { Hono } from 'hono';
import { membershipFor } from './access';
import { actionRoutes } from './actions';
import { adminRoutes } from './admin';
import { createAuth } from './auth';
import { contactRoutes } from './contacts';
import { exportRoutes } from './export';
import { extensionRoutes } from './extension';
import { importRoutes } from './imports';
import { pairingRoutes } from './pairing';
import { getSessionUser } from './session';

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use('/api/*', async (c, next) => {
    const path = c.req.path;

    if (
      path === '/api/health' ||
      path === '/api/me' ||
      path.startsWith('/api/auth/') ||
      path === '/api/pairing/exchange' ||
      path === '/api/imports/extension'
    ) {
      return next();
    }

    const user = await getSessionUser(c);
    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const membership = await membershipFor(c.env, user.id);

    if (path.startsWith('/api/admin/')) {
      if (membership.role !== 'admin' || membership.status !== 'approved') {
        return c.json({ error: 'forbidden' }, 403);
      }
      return next();
    }

    if (membership.status !== 'approved') {
      return c.json({ error: 'pending approval' }, 403);
    }

    return next();
  });

  app.get('/api/health', (c) =>
    c.json({ ok: true, service: 'truecontact', now: new Date().toISOString() }),
  );

  app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));

  app.get('/api/me', async (c) => {
    const user = await getSessionUser(c);

    if (!user) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    const membership = await membershipFor(c.env, user.id);

    return c.json({ user: { id: user.id, email: user.email, name: user.name }, membership });
  });

  app.route('/', importRoutes);
  app.route('/', contactRoutes);
  app.route('/', actionRoutes);
  app.route('/', exportRoutes);
  app.route('/', pairingRoutes);
  app.route('/', extensionRoutes);
  app.route('/', adminRoutes);

  return app;
}

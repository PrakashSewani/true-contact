import { Hono } from 'hono';
import { createAuth } from './auth';

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.get('/api/health', (c) =>
    c.json({ ok: true, service: 'truecontact', now: new Date().toISOString() }),
  );

  app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));

  app.get('/api/me', async (c) => {
    const auth = createAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      return c.json({ error: 'unauthorized' }, 401);
    }

    return c.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    });
  });

  return app;
}

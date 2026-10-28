import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import env from './config/env.js';
import { attachSession } from './middleware/auth.js';
import { csrfProtect } from './middleware/csrf.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import sharedRoutes from './routes/shared.js';
import studentRoutes from './routes/student.js';
import collegeRoutes from './routes/college.js';
import industryRoutes from './routes/industry.js';
import alumniRoutes from './routes/alumni.js';
import adminRoutes from './routes/admin.js';

export function createApp() {
  const app = express();
  if (env.TRUST_PROXY) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'same-site' }
}));


  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] }));
  app.use(globalLimiter);
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(attachSession);
  app.use(csrfProtect);

  app.get('/api/healthz', (req, res) => res.json({ ok: true, data: { status: 'up' } }));
  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/student', studentRoutes);
  app.use('/api/college', collegeRoutes);
  app.use('/api/industry', industryRoutes);
  app.use('/api/alumni', alumniRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', sharedRoutes); // notifications, documents, privacy (after role routers on purpose)
  
const clientDist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../client/dist'
);

app.use(express.static(clientDist, { index: false }));

app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next(err);
  });
});

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

import cors from 'cors';
import express from 'express';
import { errorHandler } from '@/middleware/error-handler';
import { benefitsRouter } from '@/routes/benefits.routes';
import { formsRouter } from '@/routes/forms.routes';

const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:8081,http://127.0.0.1:8081')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cors({ origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS.'));
  } }));

  app.get('/api/v1/health', (_request, response) => {
    response.json({ success: true, data: { status: 'ok' } });
  });
  app.use('/api/v1/benefits', benefitsRouter);
  app.use('/api/v1/forms', formsRouter);
  app.use(errorHandler);
  return app;
}

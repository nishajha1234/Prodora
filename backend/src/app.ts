import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requestId } from './middleware/request-id.js';
import { healthRouter } from './routes/health.routes.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    methods: ['GET'],
    credentials: true,
  }),
);
app.use(express.json({ limit: '100kb' }));
app.use(requestId);

app.use('/api/v1/health', healthRouter);

app.use(notFound);
app.use(errorHandler);

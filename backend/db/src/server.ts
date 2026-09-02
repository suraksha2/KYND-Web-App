import path from 'path';
import dotenv from 'dotenv';

const projectRoot = path.join(__dirname, '..');

// Next.js used to load these implicitly; Express does not.
// Resolve relative to this source file so the API can be launched from any cwd.
dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env') });

// Express 4 does not forward rejected promises from async handlers, which would
// hang the request instead of returning a 500. A few ported handlers rely on
// the framework catching throws (Next.js did), so patch Router to do the same.
import 'express-async-errors';
import express from 'express';
import cookieParser from 'cookie-parser';
import { corsMiddleware } from './http/cors';
import { apiAuthGate } from './http/session';
import apiRouter from './routes';

const app = express();

app.disable('x-powered-by');
app.use(corsMiddleware);
app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));

// Service artwork. Next.js served `public/` automatically; the SPAs resolve
// image URLs against this origin with `/api` stripped.
app.use(express.static(path.join(projectRoot, 'public'), { fallthrough: true }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api', apiAuthGate, apiRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Malformed JSON bodies and anything a handler forwards with next(err).
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body.' });
  }
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

const port = Number(process.env.PORT) || 3001;
const host = process.env.HOSTNAME || '0.0.0.0';

app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
});

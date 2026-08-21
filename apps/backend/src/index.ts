import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { supabase } from '@smartbudget/shared/lib/supabase';
import authRouter from './routes/auth';
import receiptsRouter from './routes/receipts';
import budgetsRouter from './routes/budgets';

export const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors());
// Base64-encoded receipt photos are larger than Express's 100kb JSON default.
app.use(express.json({ limit: '15mb' }));

// Health check route
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// API v1 routes
app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Auth routes
app.use('/api/v1/auth', authRouter);

// Receipt routes
app.use('/api/v1/receipts', receiptsRouter);

// Budget routes
app.use('/api/v1/budgets', budgetsRouter);

// Error handling middleware (must be last)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  const status = (err as any).status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ error: message, status });
});

// Only start the server if this is not a test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Backend listening on port ${port}`);
  });

  // Verify Supabase connection on startup
  supabase.auth.getUser().catch((err) => {
    console.warn('Warning: Supabase connection check failed (expected in test environments):', err.message);
  });
}

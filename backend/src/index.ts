import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import plantsRouter from './routes/plants';
import aiRouter from './routes/ai';
import sunpathRouter from './routes/sunpath';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  // In production the frontend is served from the same Express origin, so CORS
  // headers are not required for same-origin requests. Reflecting the request
  // origin (true) covers direct API access or a future separate deployment.
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_URL || true)
    : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/plants', plantsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/sunpath', sunpathRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    features: {
      plants: true,
      sunpath: true,
      ai: !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here',
    },
  });
});

// Serve the built React app in production.
// The wildcard catch-all must come AFTER all /api routes so it only handles
// client-side navigation paths, never intercepting API calls.
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*$/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n🌿 PlanYourYard Backend running on http://localhost:${PORT}`);
  console.log(`   Plants API:  http://localhost:${PORT}/api/plants/search`);
  console.log(`   Sun Path:    http://localhost:${PORT}/api/sunpath/calculate`);
  console.log(`   AI Features: ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here' ? '✅ Configured' : '⚠️  Not configured (add ANTHROPIC_API_KEY to .env)'}\n`);
});

export default app;

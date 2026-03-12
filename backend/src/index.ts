import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import plantsRouter from './routes/plants';
import aiRouter from './routes/ai';
import sunpathRouter from './routes/sunpath';
import authRouter from './routes/auth';
import projectsRouter from './routes/projects';
import adminRouter from './routes/admin';

dotenv.config();

// Initialize database (creates tables + seeds admin) on startup
import './database/db';

const app = express();
const PORT = process.env.PORT || 3001;

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_URL || true)
    : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded project images
app.use('/uploads', express.static(UPLOADS_DIR));

// API Routes
app.use('/api/plants', plantsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/sunpath', sunpathRouter);
app.use('/api/auth', authRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    features: {
      plants: true,
      sunpath: true,
      ai: !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here',
      auth: true,
      projects: true,
    },
  });
});

// Serve the built React app in production.
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
  console.log(`   Auth API:    http://localhost:${PORT}/api/auth`);
  console.log(`   Projects:    http://localhost:${PORT}/api/projects`);
  console.log(`   AI Features: ${process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here' ? '✅ Configured' : '⚠️  Not configured (add ANTHROPIC_API_KEY to .env)'}`);
  console.log(`   JWT Secret:  ${process.env.JWT_SECRET ? '✅ Set' : '⚠️  Using insecure fallback — set JWT_SECRET env var to persist sessions across deploys'}`);
  console.log(`   Database:    ${process.env.DB_PATH || path.join(__dirname, '../../planyard.db')}\n`);
});

export default app;

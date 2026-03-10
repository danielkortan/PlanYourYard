import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database/db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const getSecret = () => process.env.JWT_SECRET || 'changeme-set-JWT_SECRET-in-env';

// POST /api/auth/register
router.post('/register', (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    res.status(400).json({ error: 'Email, password, and name are required' });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    res.status(409).json({ error: 'Email already registered' });
    return;
  }

  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)').run(
    email.toLowerCase(), hash, name
  );
  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid) as any;
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, getSecret(), { expiresIn: '7d' });

  res.status(201).json({ user, token });
});

// POST /api/auth/login
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as any;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, getSecret(), { expiresIn: '7d' });
  const { password_hash, ...userWithout } = user;
  res.json({ user: userWithout, token });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.user!.id);
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }
  res.json(user);
});

// PUT /api/auth/me
router.put('/me', requireAuth, (req: AuthRequest, res: Response) => {
  const { name, currentPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  if (newPassword) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, user.password_hash)) {
      res.status(400).json({ error: 'Current password is incorrect' });
      return;
    }
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'New password must be at least 8 characters' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 12), user.id);
  }

  if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);

  const updated = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(user.id);
  res.json(updated);
});

export default router;

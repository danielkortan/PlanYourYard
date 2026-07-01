import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import db from '../database/db';

const router = Router();

// GET /api/admin/users
router.get('/users', requireAdmin, (req: Request, res: Response) => {
  const { q, page = '1', limit = '20' } = req.query as Record<string, string>;

  const search = q?.trim();
  const where = search ? 'WHERE (u.name LIKE ? OR u.email LIKE ?)' : '';
  const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

  const total = (db.prepare(`SELECT COUNT(*) as count FROM users u ${where}`).get(...searchParams) as any).count;

  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 20));
  const offset = (pageNum - 1) * limitNum;

  const results = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.created_at,
           COUNT(p.id) as project_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    ${where}
    GROUP BY u.id
    ORDER BY u.created_at ASC
    LIMIT ? OFFSET ?
  `).all(...searchParams, limitNum, offset);

  res.json({ total, page: pageNum, limit: limitNum, results });
});

// PUT /api/admin/users/:id — update role or name
router.put('/users/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const { role, name, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  if (role && !['user', 'admin'].includes(role)) {
    res.status(400).json({ error: 'Invalid role. Must be "user" or "admin"' });
    return;
  }

  if (role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  if (name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, req.params.id);
  if (newPassword) {
    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(newPassword, 12), req.params.id);
  }

  res.json(db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.params.id));
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', requireAdmin, (req: AuthRequest, res: Response) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any;
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  if (user.id === req.user!.id) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;

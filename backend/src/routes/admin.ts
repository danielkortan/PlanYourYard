import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import db from '../database/db';

const router = Router();

// GET /api/admin/users
router.get('/users', requireAdmin, (_req: AuthRequest, res: Response) => {
  const users = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.created_at,
           COUNT(p.id) as project_count
    FROM users u
    LEFT JOIN projects p ON p.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `).all();
  res.json(users);
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

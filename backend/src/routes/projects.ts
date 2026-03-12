import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth, AuthRequest } from '../middleware/auth';
import db from '../database/db';

const router = Router();

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// GET /api/projects
router.get('/', requireAuth, (req: AuthRequest, res: Response) => {
  const projects = db.prepare(`
    SELECT p.*, COUNT(pi.id) as image_count
    FROM projects p
    LEFT JOIN project_images pi ON pi.project_id = p.id
    WHERE p.user_id = ?
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all(req.user!.id);
  res.json(projects);
});

// POST /api/projects
router.post('/', requireAuth, (req: AuthRequest, res: Response) => {
  const { name, address, lat, lng, zoom, description } = req.body;
  if (!name) { res.status(400).json({ error: 'Project name is required' }); return; }

  const result = db.prepare(
    'INSERT INTO projects (user_id, name, address, lat, lng, zoom, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user!.id, name, address || '', lat || null, lng || null, zoom || 17, description || '');

  res.status(201).json(db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid));
});

// GET /api/projects/:id
router.get('/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id) as any;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const images = db.prepare('SELECT * FROM project_images WHERE project_id = ? ORDER BY created_at ASC').all(project.id) as any[];
  const imagesWithMarkers = images.map((img: any) => ({
    ...img,
    markers: db.prepare('SELECT * FROM plant_markers WHERE image_id = ? ORDER BY created_at ASC').all(img.id),
  }));

  const aerialMarkers = db.prepare('SELECT * FROM aerial_markers WHERE project_id = ? ORDER BY created_at ASC').all(project.id);

  res.json({ ...project, images: imagesWithMarkers, aerialMarkers });
});

// PUT /api/projects/:id
router.put('/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const { name, address, lat, lng, zoom, description, property_border } = req.body;
  db.prepare('UPDATE projects SET name = ?, address = ?, lat = ?, lng = ?, zoom = ?, description = ?, property_border = ? WHERE id = ?').run(
    name, address, lat || null, lng || null, zoom || 19, description,
    property_border !== undefined ? property_border : (project as any).property_border,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id));
});

// DELETE /api/projects/:id
router.delete('/:id', requireAuth, (req: AuthRequest, res: Response) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id) as any;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const images = db.prepare('SELECT filename FROM project_images WHERE project_id = ?').all(project.id) as any[];
  images.forEach((img: any) => {
    const fp = path.join(UPLOADS_DIR, img.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });

  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST /api/projects/:id/images
router.post('/:id/images', requireAuth, upload.single('image'), (req: AuthRequest, res: Response) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }
  if (!req.file) { res.status(400).json({ error: 'No image provided' }); return; }

  const result = db.prepare(
    'INSERT INTO project_images (project_id, filename, original_name) VALUES (?, ?, ?)'
  ).run(req.params.id, req.file.filename, req.file.originalname);

  res.status(201).json(db.prepare('SELECT * FROM project_images WHERE id = ?').get(result.lastInsertRowid));
});

// DELETE /api/projects/:id/images/:imageId
router.delete('/:id/images/:imageId', requireAuth, (req: AuthRequest, res: Response) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const image = db.prepare('SELECT * FROM project_images WHERE id = ? AND project_id = ?').get(req.params.imageId, req.params.id) as any;
  if (!image) { res.status(404).json({ error: 'Image not found' }); return; }

  const fp = path.join(UPLOADS_DIR, image.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  db.prepare('DELETE FROM project_images WHERE id = ?').run(image.id);
  res.json({ success: true });
});

// POST /api/projects/:id/images/:imageId/markers
router.post('/:id/images/:imageId/markers', requireAuth, (req: AuthRequest, res: Response) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const image = db.prepare('SELECT * FROM project_images WHERE id = ? AND project_id = ?').get(req.params.imageId, req.params.id);
  if (!image) { res.status(404).json({ error: 'Image not found' }); return; }

  const { plant_id, plant_name, x_percent, y_percent, notes } = req.body;
  if (!plant_id || !plant_name || x_percent == null || y_percent == null) {
    res.status(400).json({ error: 'plant_id, plant_name, x_percent, y_percent are required' });
    return;
  }

  const result = db.prepare(
    'INSERT INTO plant_markers (image_id, plant_id, plant_name, x_percent, y_percent, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.params.imageId, plant_id, plant_name, x_percent, y_percent, notes || '');

  res.status(201).json(db.prepare('SELECT * FROM plant_markers WHERE id = ?').get(result.lastInsertRowid));
});

// DELETE /api/projects/:id/images/:imageId/markers/:markerId
router.delete('/:id/images/:imageId/markers/:markerId', requireAuth, (req: AuthRequest, res: Response) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  db.prepare('DELETE FROM plant_markers WHERE id = ? AND image_id = ?').run(req.params.markerId, req.params.imageId);
  res.json({ success: true });
});

// ── Aerial markers (map-based) ─────────────────────────────────────────────

// POST /api/projects/:id/aerial-markers
router.post('/:id/aerial-markers', requireAuth, (req: AuthRequest, res: Response) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const { plant_id, plant_name, lat, lng, notes, status, year_planted, growth_rate, plant_type, max_height_ft } = req.body;
  if (!plant_id || !plant_name || lat == null || lng == null) {
    res.status(400).json({ error: 'plant_id, plant_name, lat, lng are required' });
    return;
  }

  const result = db.prepare(
    'INSERT INTO aerial_markers (project_id, plant_id, plant_name, lat, lng, notes, status, year_planted, growth_rate, plant_type, max_height_ft) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.params.id, plant_id, plant_name, lat, lng, notes || '', status || 'planted', year_planted || null, growth_rate || 'medium', plant_type || 'tree', max_height_ft || null);

  res.status(201).json(db.prepare('SELECT * FROM aerial_markers WHERE id = ?').get(result.lastInsertRowid));
});

// PATCH /api/projects/:id/aerial-markers/:markerId
router.patch('/:id/aerial-markers/:markerId', requireAuth, (req: AuthRequest, res: Response) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const marker = db.prepare('SELECT * FROM aerial_markers WHERE id = ? AND project_id = ?').get(req.params.markerId, req.params.id) as any;
  if (!marker) { res.status(404).json({ error: 'Marker not found' }); return; }

  const status = req.body.status !== undefined ? req.body.status : marker.status;
  const year_planted = req.body.year_planted !== undefined ? req.body.year_planted : marker.year_planted;
  db.prepare('UPDATE aerial_markers SET status = ?, year_planted = ? WHERE id = ?').run(status, year_planted, req.params.markerId);
  res.json(db.prepare('SELECT * FROM aerial_markers WHERE id = ?').get(req.params.markerId));
});

// DELETE /api/projects/:id/aerial-markers/:markerId
router.delete('/:id/aerial-markers/:markerId', requireAuth, (req: AuthRequest, res: Response) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  db.prepare('DELETE FROM aerial_markers WHERE id = ? AND project_id = ?').run(req.params.markerId, req.params.id);
  res.json({ success: true });
});

export default router;

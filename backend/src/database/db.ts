import Database from 'better-sqlite3';
import path from 'path';
import bcrypt from 'bcryptjs';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../planyard.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT DEFAULT '',
    lat REAL,
    lng REAL,
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS project_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS plant_markers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_id INTEGER NOT NULL REFERENCES project_images(id) ON DELETE CASCADE,
    plant_id TEXT NOT NULL,
    plant_name TEXT NOT NULL,
    x_percent REAL NOT NULL,
    y_percent REAL NOT NULL,
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS aerial_markers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    plant_id TEXT NOT NULL,
    plant_name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe column migrations (no-op if column already exists)
try { db.exec('ALTER TABLE projects ADD COLUMN zoom INTEGER DEFAULT 19'); } catch {}
try { db.exec('ALTER TABLE projects ADD COLUMN property_border TEXT DEFAULT NULL'); } catch {}
try { db.exec("ALTER TABLE aerial_markers ADD COLUMN status TEXT DEFAULT 'planted'"); } catch {}
try { db.exec('ALTER TABLE aerial_markers ADD COLUMN year_planted INTEGER'); } catch {}
try { db.exec("ALTER TABLE aerial_markers ADD COLUMN growth_rate TEXT DEFAULT 'medium'"); } catch {}
try { db.exec("ALTER TABLE aerial_markers ADD COLUMN plant_type TEXT DEFAULT 'tree'"); } catch {}
try { db.exec('ALTER TABLE aerial_markers ADD COLUMN max_height_ft REAL'); } catch {}

function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@planyouryard.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'PYY_Admin_2024!';
  const adminName = process.env.ADMIN_NAME || 'Admin';

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)').run(
      adminEmail, hash, adminName, 'admin'
    );
    console.log(`  Admin account created: ${adminEmail}`);
  }
}

seedAdmin();

export default db;

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

function isStrongPassword(password = "") {
  const trimmed = String(password).trim();
  return trimmed.length >= 10 && /[a-zA-Z]/.test(trimmed) && /\d/.test(trimmed);
}

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "app.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor')) DEFAULT 'editor',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  author_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploader_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(uploader_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  meta TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES oauth_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_page_id ON comments(page_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at);
`);

try {
  db.prepare("ALTER TABLE comments ADD COLUMN parent_id INTEGER").run();
} catch (error) {
  if (!String(error.message).includes("duplicate column name")) {
    throw error;
  }
}

db.prepare(
  "CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_id)",
).run();

const userCount = db.prepare("SELECT COUNT(*) AS total FROM users").get().total;
if (userCount === 0) {
  const now = new Date().toISOString();

  const adminName = (
    process.env.BOOTSTRAP_ADMIN_NAME || "Administrator"
  ).trim();
  const adminEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@local.test")
    .trim()
    .toLowerCase();
  const adminPassword =
    process.env.BOOTSTRAP_ADMIN_PASSWORD ||
    crypto.randomBytes(12).toString("base64url");
  const passwordHash = bcrypt.hashSync(adminPassword, 10);

  if (
    process.env.BOOTSTRAP_ADMIN_PASSWORD &&
    !isStrongPassword(adminPassword)
  ) {
    console.warn(
      "[security] BOOTSTRAP_ADMIN_PASSWORD lemah. Gunakan minimal 10 karakter dengan huruf dan angka.",
    );
  }

  db.prepare(
    `INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, 'admin', ?, ?)`,
  ).run(adminName, adminEmail, passwordHash, now, now);

  console.log(`[bootstrap] Admin awal dibuat: ${adminEmail}`);
  if (!process.env.BOOTSTRAP_ADMIN_PASSWORD) {
    console.log(`[bootstrap] Password admin acak: ${adminPassword}`);
  } else {
    console.log(
      "[bootstrap] Password admin diambil dari BOOTSTRAP_ADMIN_PASSWORD (.env).",
    );
  }
}

const defaultSettings = [
  ["site_title", "Personal Web Canvas"],
  ["site_tagline", "Kelola halaman publik Anda dengan mudah."],
  ["site_description", "Website publik dengan panel admin sederhana."],
  ["footer_text", "© 2026 Personal Web Canvas"],
  ["homepage_title", "Website Publik"],
  ["homepage_subtitle", "Halaman di bawah ini dikelola dari panel admin."],
];

const nowSettings = new Date().toISOString();
for (const [key, value] of defaultSettings) {
  db.prepare(
    "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
  ).run(key, value, nowSettings);
}

module.exports = db;

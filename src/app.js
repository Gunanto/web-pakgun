const crypto = require("crypto");
const { ensureEnvFile } = require("./utils/bootstrapEnv");

ensureEnvFile();
require("dotenv").config({
  path: process.env.ENV_PATH || path.join(__dirname, "..", "..", ".env"),
});

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { csrfSync } = require("csrf-sync");
const Database = require("better-sqlite3");
const multer = require("multer");
const sanitizeHtml = require("sanitize-html");
const fs = require("fs");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;

const SqliteStore = require("better-sqlite3-session-store")(session);

const db = require("./db");
const { ensureAuth, ensureRole } = require("./middleware/auth");
const { toSlug } = require("./utils/slugify");

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const useSecureCookie =
  isProduction && process.env.SESSION_COOKIE_SECURE !== "false";
const oauthBaseUrl = process.env.OAUTH_BASE_URL || "http://localhost:3010";
const hasGoogleAuth =
  Boolean(process.env.GOOGLE_CLIENT_ID) &&
  Boolean(process.env.GOOGLE_CLIENT_SECRET);
const hasGithubAuth =
  Boolean(process.env.GITHUB_CLIENT_ID) &&
  Boolean(process.env.GITHUB_CLIENT_SECRET);
const sessionSecret =
  process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex");
const sessionDb = new Database(
  path.join(__dirname, "..", "data", "sessions.db"),
);
const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => (req.body ? req.body._csrf : undefined),
});
const uploadDir = path.join(__dirname, "..", "data", "uploads");
const staticHeroDir = path.join(__dirname, "..", "public", "hero-backgrounds");
const defaultLandingAvatarPath = "/static/avatar/me.jpeg";
const hasDefaultLandingAvatar = fs.existsSync(
  path.join(__dirname, "..", "public", "avatar", "me.jpeg"),
);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(staticHeroDir)) {
  fs.mkdirSync(staticHeroDir, { recursive: true });
}

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[security] SESSION_SECRET tidak ditemukan. Secret sementara acak digunakan untuk sesi saat ini.",
  );
}

if (isProduction) {
  app.set("trust proxy", 1);
}

app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "style-src": [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdn.jsdelivr.net",
        ],
        "font-src": [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdn.jsdelivr.net",
        ],
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        "connect-src": ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/static", express.static(path.join(__dirname, "..", "public")));
app.use("/media", express.static(uploadDir));
app.use(
  session({
    store: new SqliteStore({
      client: sessionDb,
      expired: {
        clear: true,
        intervalMs: 1000 * 60 * 15,
      },
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: useSecureCookie,
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  req.oauthUser = req.user || null;
  req.user = null;

  if (req.session.userId) {
    const user = db
      .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
      .get(req.session.userId);

    if (user) {
      req.user = user;
    } else {
      req.session.userId = null;
    }
  }

  res.locals.currentUser = req.user;
  res.locals.oauthUser = req.oauthUser;
  res.locals.flash = req.session.flash || null;
  req.session.flash = null;
  res.locals.requestPath = req.path;
  res.locals.oauthProviders = {
    google: hasGoogleAuth,
    github: hasGithubAuth,
  };
  const settingsRows = db.prepare("SELECT key, value FROM settings").all();
  const settings = settingsRows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
  res.locals.siteTitle = settings.site_title || "Personal Web Canvas";
  res.locals.siteTagline =
    settings.site_tagline || "Kelola halaman publik Anda dengan mudah.";
  res.locals.siteDescription =
    settings.site_description || "Website publik dengan panel admin sederhana.";
  res.locals.footerText = settings.footer_text || "© 2026 Personal Web Canvas";
  res.locals.homepageTitle = settings.homepage_title || "Website Publik";
  res.locals.homepageSubtitle =
    settings.homepage_subtitle ||
    "Halaman di bawah ini dikelola dari panel admin.";
  res.locals.landingAvatarUrl =
    settings.landing_avatar_url ||
    (hasDefaultLandingAvatar ? defaultLandingAvatarPath : "");
  res.locals.socialLinks = {
    github: settings.social_github || "",
    linkedin: settings.social_linkedin || "",
    facebook: settings.social_facebook || "",
    twitter: settings.social_twitter || "",
    instagram: settings.social_instagram || "",
    youtube: settings.social_youtube || "",
    telegram: settings.social_telegram || "",
    email: settings.social_email || "",
  };
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    res.locals.csrfToken = generateToken(req);
  } else {
    res.locals.csrfToken = req.session ? req.session.csrfToken : undefined;
  }
  res.locals.pageDescription =
    res.locals.pageDescription || res.locals.siteDescription;
  res.locals.isPreview = false;

  next();
});

app.use(csrfSynchronisedProtection);

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function isStrongPassword(password = "") {
  const trimmed = String(password).trim();
  return trimmed.length >= 10 && /[a-zA-Z]/.test(trimmed) && /\d/.test(trimmed);
}

function isValidEmail(email = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function ensurePageAccess(page, user) {
  if (!page) return false;
  if (user.role === "admin") return true;
  return page.author_id === user.id;
}

function ensureOauthAuth(req, res, next) {
  if (!req.oauthUser) {
    req.session.flash = {
      type: "error",
      message: "Silakan login dengan Google atau GitHub untuk berdiskusi.",
    };
    return res.redirect(req.headers.referer || "/");
  }
  next();
}

function sanitizeContent(content = "") {
  return sanitizeHtml(content, {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "strong",
      "em",
      "u",
      "s",
      "blockquote",
      "ol",
      "ul",
      "li",
      "a",
      "pre",
      "code",
      "span",
      "hr",
      "img",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      img: ["src", "alt", "title"],
      span: ["class", "data-value", "style"],
      p: ["class", "style"],
      h1: ["class", "style"],
      h2: ["class", "style"],
      h3: ["class", "style"],
      h4: ["class", "style"],
      h5: ["class", "style"],
      h6: ["class", "style"],
      pre: ["class"],
      code: ["class"],
    },
    allowedStyles: {
      "*": {
        color: [
          /^#[0-9a-fA-F]{3,8}$/,
          /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/,
          /^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(0|1|0?\.\d+)\s*\)$/,
          /^[a-zA-Z]+$/,
        ],
      },
    },
    allowedSchemes: ["http", "https", "data"],
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href || "";
        const isExternal = /^https?:\/\//i.test(href);
        return {
          tagName,
          attribs: {
            ...attribs,
            rel: isExternal ? "noopener noreferrer" : undefined,
            target: isExternal ? "_blank" : attribs.target,
          },
        };
      },
    },
  });
}

function sanitizeComment(content = "") {
  const clean = sanitizeHtml(content, {
    allowedTags: [],
    allowedAttributes: {},
  });
  return clean.trim();
}

function logAudit(req, action, entity, entityId, meta) {
  const now = new Date().toISOString();
  const userId = req.user ? req.user.id : null;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  const payload = meta ? JSON.stringify(meta) : null;

  db.prepare(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, meta, ip, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, action, entity, entityId || null, payload, ip, userAgent, now);
}

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "-").toLowerCase();
    const ext = path.extname(safeName) || "";
    const base = crypto.randomBytes(8).toString("hex");
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Hanya file gambar yang diizinkan."));
    }
    cb(null, true);
  },
});

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  try {
    const user = db
      .prepare(
        "SELECT id, provider, provider_id, name, email, avatar_url FROM oauth_users WHERE id = ?",
      )
      .get(id);
    done(null, user || null);
  } catch (err) {
    done(err);
  }
});

if (hasGoogleAuth) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${oauthBaseUrl}/auth/google/callback`,
      },
      (accessToken, refreshToken, profile, done) => {
        try {
          const now = new Date().toISOString();
          const email =
            profile.emails && profile.emails[0]
              ? profile.emails[0].value
              : null;
          const avatar =
            profile.photos && profile.photos[0]
              ? profile.photos[0].value
              : null;
          let user = db
            .prepare(
              "SELECT * FROM oauth_users WHERE provider = ? AND provider_id = ?",
            )
            .get("google", profile.id);
          if (!user) {
            db.prepare(
              `INSERT INTO oauth_users (provider, provider_id, name, email, avatar_url, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            ).run(
              "google",
              profile.id,
              profile.displayName || "Google User",
              email,
              avatar,
              now,
            );
            user = db
              .prepare(
                "SELECT * FROM oauth_users WHERE provider = ? AND provider_id = ?",
              )
              .get("google", profile.id);
          }
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      },
    ),
  );
}

if (hasGithubAuth) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${oauthBaseUrl}/auth/github/callback`,
        scope: ["user:email"],
      },
      (accessToken, refreshToken, profile, done) => {
        try {
          const now = new Date().toISOString();
          const email =
            profile.emails && profile.emails[0]
              ? profile.emails[0].value
              : null;
          const avatar =
            profile.photos && profile.photos[0]
              ? profile.photos[0].value
              : null;
          let user = db
            .prepare(
              "SELECT * FROM oauth_users WHERE provider = ? AND provider_id = ?",
            )
            .get("github", profile.id);
          if (!user) {
            db.prepare(
              `INSERT INTO oauth_users (provider, provider_id, name, email, avatar_url, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`,
            ).run(
              "github",
              profile.id,
              profile.displayName || profile.username || "GitHub User",
              email,
              avatar,
              now,
            );
            user = db
              .prepare(
                "SELECT * FROM oauth_users WHERE provider = ? AND provider_id = ?",
              )
              .get("github", profile.id);
          }
          return done(null, user);
        } catch (err) {
          return done(err);
        }
      },
    ),
  );
}

const loginLimiter = rateLimit({
  windowMs: 1000 * 60 * 10,
  max: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (req, res) => {
    req.session.flash = {
      type: "error",
      message: "Terlalu banyak percobaan login. Coba lagi dalam 10 menit.",
    };
    return res.redirect("/admin/login");
  },
});

app.get("/", (req, res) => {
  const pages = db
    .prepare(
      `SELECT p.id, p.title, p.slug, p.updated_at, u.name AS author_name
       FROM pages p
       JOIN users u ON u.id = p.author_id
      WHERE p.status = 'published'
       ORDER BY p.updated_at DESC`,
    )
    .all();

  const allowedStaticHeroExt = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".avif",
  ]);
  const staticHeroMedia = fs
    .readdirSync(staticHeroDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        allowedStaticHeroExt.has(path.extname(entry.name).toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({
      src: `/static/hero-backgrounds/${entry.name}`,
      alt: path.parse(entry.name).name.replace(/[-_]+/g, " ").trim(),
    }));

  const heroMedia = staticHeroMedia.length
    ? staticHeroMedia
    : db
        .prepare(
          `SELECT filename, original_name, created_at
           FROM media
           WHERE mime_type LIKE 'image/%'
           ORDER BY created_at DESC
           LIMIT 12`,
        )
        .all()
        .map((item) => ({
          src: `/media/${item.filename}`,
          alt: item.original_name,
        }));

  res.render("public/home", { pageTitle: "Beranda", pages, heroMedia });
});

app.get("/auth/google", (req, res, next) => {
  if (!hasGoogleAuth) {
    setFlash(req, "error", "Login Google belum dikonfigurasi.");
    return res.redirect(req.headers.referer || "/");
  }
  return passport.authenticate("google", { scope: ["profile", "email"] })(
    req,
    res,
    next,
  );
});
app.get("/auth/google/callback", (req, res, next) => {
  if (!hasGoogleAuth) {
    setFlash(req, "error", "Login Google belum dikonfigurasi.");
    return res.redirect(req.headers.referer || "/");
  }
  return passport.authenticate("google", { failureRedirect: "/admin/login" })(
    req,
    res,
    () => res.redirect(req.session.returnTo || req.headers.referer || "/"),
  );
});

app.get("/auth/github", (req, res, next) => {
  if (!hasGithubAuth) {
    setFlash(req, "error", "Login GitHub belum dikonfigurasi.");
    return res.redirect(req.headers.referer || "/");
  }
  return passport.authenticate("github")(req, res, next);
});
app.get("/auth/github/callback", (req, res, next) => {
  if (!hasGithubAuth) {
    setFlash(req, "error", "Login GitHub belum dikonfigurasi.");
    return res.redirect(req.headers.referer || "/");
  }
  return passport.authenticate("github", { failureRedirect: "/admin/login" })(
    req,
    res,
    () => res.redirect(req.session.returnTo || req.headers.referer || "/"),
  );
});

app.post("/auth/logout", (req, res) => {
  req.logout(() => {
    res.redirect(req.headers.referer || "/");
  });
});

app.get("/p/:slug", (req, res) => {
  const page = db
    .prepare(
      `SELECT p.*, u.name AS author_name
       FROM pages p
       JOIN users u ON u.id = p.author_id
       WHERE p.slug = ? AND p.status = 'published'`,
    )
    .get(req.params.slug);

  if (!page) {
    return res
      .status(404)
      .render("public/not-found", { pageTitle: "Halaman Tidak Ditemukan" });
  }

  const commentsRaw = db
    .prepare(
      `SELECT c.*, u.name, u.avatar_url, u.provider
       FROM comments c
       JOIN oauth_users u ON u.id = c.user_id
       WHERE c.page_id = ?
       ORDER BY c.created_at ASC`,
    )
    .all(page.id);

  const comments = [];
  const repliesByParent = {};
  for (const item of commentsRaw) {
    if (item.parent_id) {
      if (!repliesByParent[item.parent_id]) {
        repliesByParent[item.parent_id] = [];
      }
      repliesByParent[item.parent_id].push(item);
    } else {
      comments.push(item);
    }
  }

  res.render("public/page", {
    pageTitle: page.title,
    page,
    comments,
    repliesByParent,
  });
});

app.get("/admin", (req, res) => {
  if (!req.user) return res.redirect("/admin/login");
  return res.redirect("/admin/dashboard");
});

app.get("/admin/login", (req, res) => {
  if (req.user) return res.redirect("/admin/dashboard");
  res.render("admin/login", { pageTitle: "Login Admin" });
});

app.post("/admin/login", loginLimiter, (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    setFlash(req, "error", "Email dan password wajib diisi.");
    return res.redirect("/admin/login");
  }

  const user = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.trim().toLowerCase());
  if (!user) {
    setFlash(req, "error", "Email atau password salah.");
    return res.redirect("/admin/login");
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    setFlash(req, "error", "Email atau password salah.");
    return res.redirect("/admin/login");
  }

  req.session.userId = user.id;
  setFlash(req, "success", `Selamat datang, ${user.name}!`);
  logAudit(req, "login", "auth", user.id, { email: user.email });
  res.redirect("/admin/dashboard");
});

app.post("/admin/logout", ensureAuth, (req, res) => {
  logAudit(req, "logout", "auth", req.user.id);
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

app.get("/admin/dashboard", ensureAuth, (req, res) => {
  const totalUsers = db
    .prepare("SELECT COUNT(*) AS total FROM users")
    .get().total;
  const totalPages = db
    .prepare("SELECT COUNT(*) AS total FROM pages")
    .get().total;
  const totalPublished = db
    .prepare("SELECT COUNT(*) AS total FROM pages WHERE status = 'published'")
    .get().total;
  const totalDraft = db
    .prepare("SELECT COUNT(*) AS total FROM pages WHERE status = 'draft'")
    .get().total;

  res.render("admin/dashboard", {
    pageTitle: "Dashboard Admin",
    stats: { totalUsers, totalPages, totalPublished, totalDraft },
  });
});

app.get("/admin/settings", ensureAuth, ensureRole("admin"), (req, res) => {
  const settingsRows = db.prepare("SELECT key, value FROM settings").all();
  const settings = settingsRows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {});

  res.render("admin/settings", {
    pageTitle: "Pengaturan",
    settings,
  });
});

app.post("/admin/settings", ensureAuth, ensureRole("admin"), (req, res) => {
  const fields = [
    "site_title",
    "site_tagline",
    "site_description",
    "footer_text",
    "homepage_title",
    "homepage_subtitle",
  ];
  const now = new Date().toISOString();

  for (const key of fields) {
    const value = String(req.body[key] || "").trim();
    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, value, now);
  }

  logAudit(req, "update", "settings", null, {
    keys: fields,
  });
  setFlash(req, "success", "Pengaturan berhasil disimpan.");
  res.redirect("/admin/settings");
});

app.get("/admin/pages", ensureAuth, (req, res) => {
  const sqlAdmin = `
    SELECT p.*, u.name AS author_name
    FROM pages p
    JOIN users u ON u.id = p.author_id
    ORDER BY p.updated_at DESC
  `;

  const sqlEditor = `
    SELECT p.*, u.name AS author_name
    FROM pages p
    JOIN users u ON u.id = p.author_id
    WHERE p.author_id = ?
    ORDER BY p.updated_at DESC
  `;

  const pages =
    req.user.role === "admin"
      ? db.prepare(sqlAdmin).all()
      : db.prepare(sqlEditor).all(req.user.id);

  res.render("admin/pages/list", { pageTitle: "Kelola Halaman", pages });
});

app.get("/admin/pages/new", ensureAuth, (req, res) => {
  res.render("admin/pages/new", { pageTitle: "Buat Halaman Baru" });
});

app.post("/admin/pages", ensureAuth, (req, res) => {
  const { title, slug, content, status } = req.body;

  if (!title || !content) {
    setFlash(req, "error", "Judul dan konten wajib diisi.");
    return res.redirect("/admin/pages/new");
  }

  const generatedSlug = toSlug(slug || title);
  if (!generatedSlug) {
    setFlash(req, "error", "Slug tidak valid.");
    return res.redirect("/admin/pages/new");
  }

  const now = new Date().toISOString();
  const safeContent = sanitizeContent(content);

  try {
    db.prepare(
      `INSERT INTO pages (title, slug, content, status, author_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      title.trim(),
      generatedSlug,
      safeContent,
      status === "published" ? "published" : "draft",
      req.user.id,
      now,
      now,
    );

    setFlash(req, "success", "Halaman berhasil dibuat.");
    const pageId = db
      .prepare("SELECT id FROM pages WHERE slug = ?")
      .get(generatedSlug).id;
    logAudit(req, "create", "page", pageId, { title: title.trim() });
    return res.redirect("/admin/pages");
  } catch (error) {
    if (
      String(error.message).includes("UNIQUE constraint failed: pages.slug")
    ) {
      setFlash(req, "error", "Slug sudah digunakan. Gunakan slug lain.");
      return res.redirect("/admin/pages/new");
    }
    throw error;
  }
});

app.get("/admin/pages/:id/preview", ensureAuth, (req, res) => {
  const page = db
    .prepare(
      "SELECT p.*, u.name AS author_name FROM pages p JOIN users u ON u.id = p.author_id WHERE p.id = ?",
    )
    .get(req.params.id);

  if (!ensurePageAccess(page, req.user)) {
    setFlash(req, "error", "Halaman tidak ditemukan atau tidak bisa diakses.");
    return res.redirect("/admin/pages");
  }

  res.render("public/page", {
    pageTitle: `Preview: ${page.title}`,
    page,
    isPreview: true,
  });
});

app.get("/admin/pages/:id/edit", ensureAuth, (req, res) => {
  const page = db
    .prepare("SELECT * FROM pages WHERE id = ?")
    .get(req.params.id);

  if (!ensurePageAccess(page, req.user)) {
    setFlash(req, "error", "Halaman tidak ditemukan atau tidak bisa diakses.");
    return res.redirect("/admin/pages");
  }

  res.render("admin/pages/edit", { pageTitle: "Edit Halaman", page });
});

app.post("/admin/pages/:id/update", ensureAuth, (req, res) => {
  const page = db
    .prepare("SELECT * FROM pages WHERE id = ?")
    .get(req.params.id);

  if (!ensurePageAccess(page, req.user)) {
    setFlash(req, "error", "Halaman tidak ditemukan atau tidak bisa diakses.");
    return res.redirect("/admin/pages");
  }

  const { title, slug, content, status } = req.body;
  if (!title || !content) {
    setFlash(req, "error", "Judul dan konten wajib diisi.");
    return res.redirect(`/admin/pages/${req.params.id}/edit`);
  }

  const generatedSlug = toSlug(slug || title);
  if (!generatedSlug) {
    setFlash(req, "error", "Slug tidak valid.");
    return res.redirect(`/admin/pages/${req.params.id}/edit`);
  }

  const now = new Date().toISOString();
  const safeContent = sanitizeContent(content);

  try {
    db.prepare(
      `UPDATE pages
       SET title = ?, slug = ?, content = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      title.trim(),
      generatedSlug,
      safeContent,
      status === "published" ? "published" : "draft",
      now,
      req.params.id,
    );

    setFlash(req, "success", "Halaman berhasil diperbarui.");
    logAudit(req, "update", "page", Number(req.params.id), {
      title: title.trim(),
    });
    return res.redirect("/admin/pages");
  } catch (error) {
    if (
      String(error.message).includes("UNIQUE constraint failed: pages.slug")
    ) {
      setFlash(req, "error", "Slug sudah digunakan. Gunakan slug lain.");
      return res.redirect(`/admin/pages/${req.params.id}/edit`);
    }
    throw error;
  }
});

app.post("/admin/pages/:id/delete", ensureAuth, (req, res) => {
  const page = db
    .prepare("SELECT * FROM pages WHERE id = ?")
    .get(req.params.id);

  if (!ensurePageAccess(page, req.user)) {
    setFlash(req, "error", "Halaman tidak ditemukan atau tidak bisa dihapus.");
    return res.redirect("/admin/pages");
  }

  db.prepare("DELETE FROM pages WHERE id = ?").run(req.params.id);
  setFlash(req, "success", "Halaman berhasil dihapus.");
  logAudit(req, "delete", "page", Number(req.params.id), {
    title: page.title,
  });
  res.redirect("/admin/pages");
});

app.post("/p/:slug/comments", ensureOauthAuth, (req, res) => {
  const page = db
    .prepare("SELECT id FROM pages WHERE slug = ? AND status = 'published'")
    .get(req.params.slug);
  if (!page) {
    setFlash(req, "error", "Halaman tidak ditemukan.");
    return res.redirect("/");
  }

  const content = sanitizeComment(req.body.content || "");
  if (!content) {
    setFlash(req, "error", "Komentar tidak boleh kosong.");
    return res.redirect(`/p/${req.params.slug}`);
  }
  if (content.length > 1000) {
    setFlash(req, "error", "Komentar maksimal 1000 karakter.");
    return res.redirect(`/p/${req.params.slug}`);
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO comments (page_id, user_id, parent_id, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(page.id, req.oauthUser.id, null, content, now);

  res.redirect(`/p/${req.params.slug}`);
});

app.post("/p/:slug/comments/:id/reply", ensureOauthAuth, (req, res) => {
  const page = db
    .prepare("SELECT id FROM pages WHERE slug = ? AND status = 'published'")
    .get(req.params.slug);
  if (!page) {
    setFlash(req, "error", "Halaman tidak ditemukan.");
    return res.redirect("/");
  }

  const parent = db
    .prepare("SELECT id FROM comments WHERE id = ? AND page_id = ?")
    .get(req.params.id, page.id);
  if (!parent) {
    setFlash(req, "error", "Komentar induk tidak ditemukan.");
    return res.redirect(`/p/${req.params.slug}`);
  }

  const content = sanitizeComment(req.body.content || "");
  if (!content) {
    setFlash(req, "error", "Balasan tidak boleh kosong.");
    return res.redirect(`/p/${req.params.slug}`);
  }
  if (content.length > 1000) {
    setFlash(req, "error", "Balasan maksimal 1000 karakter.");
    return res.redirect(`/p/${req.params.slug}`);
  }

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO comments (page_id, user_id, parent_id, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(page.id, req.oauthUser.id, parent.id, content, now);

  res.redirect(`/p/${req.params.slug}`);
});

app.post(
  "/admin/comments/:id/delete",
  ensureAuth,
  ensureRole("admin"),
  (req, res) => {
    const comment = db
      .prepare("SELECT id FROM comments WHERE id = ?")
      .get(req.params.id);
    if (!comment) {
      setFlash(req, "error", "Komentar tidak ditemukan.");
      return res.redirect(req.headers.referer || "/admin/dashboard");
    }

    db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.id);
    setFlash(req, "success", "Komentar berhasil dihapus.");
    res.redirect(req.headers.referer || "/admin/dashboard");
  },
);

app.get("/admin/media", ensureAuth, (req, res) => {
  const media = db
    .prepare(
      `SELECT m.*, u.name AS uploader_name
       FROM media m
       JOIN users u ON u.id = m.uploader_id
       ORDER BY m.created_at DESC`,
    )
    .all();

  res.render("admin/media/list", { pageTitle: "Media Library", media });
});

app.post(
  "/admin/media/upload",
  ensureAuth,
  upload.single("media"),
  (req, res) => {
    if (!req.file) {
      setFlash(req, "error", "Upload gagal. File tidak ditemukan.");
      return res.redirect("/admin/media");
    }

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO media (filename, original_name, mime_type, size, uploader_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      req.file.filename,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      req.user.id,
      now,
    );

    logAudit(req, "upload", "media", null, {
      filename: req.file.filename,
      originalName: req.file.originalname,
    });

    setFlash(req, "success", "Media berhasil diupload.");
    return res.redirect("/admin/media");
  },
);

app.get("/admin/users", ensureAuth, ensureRole("admin"), (req, res) => {
  const users = db
    .prepare(
      "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC",
    )
    .all();

  res.render("admin/users/list", { pageTitle: "Kelola User", users });
});

app.get("/admin/users/new", ensureAuth, ensureRole("admin"), (req, res) => {
  res.render("admin/users/new", { pageTitle: "Tambah User" });
});

app.post("/admin/users", ensureAuth, ensureRole("admin"), (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    setFlash(req, "error", "Nama, email, dan password wajib diisi.");
    return res.redirect("/admin/users/new");
  }

  if (!isValidEmail(email)) {
    setFlash(req, "error", "Format email tidak valid.");
    return res.redirect("/admin/users/new");
  }

  if (!isStrongPassword(password)) {
    setFlash(
      req,
      "error",
      "Password minimal 10 karakter dan harus mengandung huruf dan angka.",
    );
    return res.redirect("/admin/users/new");
  }

  if (!["admin", "editor"].includes(role)) {
    setFlash(req, "error", "Role tidak valid.");
    return res.redirect("/admin/users/new");
  }

  const now = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    db.prepare(
      `INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      name.trim(),
      email.trim().toLowerCase(),
      passwordHash,
      role,
      now,
      now,
    );

    setFlash(req, "success", "User berhasil ditambahkan.");
    const newUserId = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email.trim().toLowerCase()).id;
    logAudit(req, "create", "user", newUserId, {
      email: email.trim().toLowerCase(),
      role,
    });
    return res.redirect("/admin/users");
  } catch (error) {
    if (
      String(error.message).includes("UNIQUE constraint failed: users.email")
    ) {
      setFlash(req, "error", "Email sudah digunakan.");
      return res.redirect("/admin/users/new");
    }
    throw error;
  }
});

app.get(
  "/admin/users/:id/edit",
  ensureAuth,
  ensureRole("admin"),
  (req, res) => {
    const user = db
      .prepare("SELECT id, name, email, role FROM users WHERE id = ?")
      .get(req.params.id);

    if (!user) {
      setFlash(req, "error", "User tidak ditemukan.");
      return res.redirect("/admin/users");
    }

    res.render("admin/users/edit", { pageTitle: "Edit User", user });
  },
);

app.post(
  "/admin/users/:id/update",
  ensureAuth,
  ensureRole("admin"),
  (req, res) => {
    const existing = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(req.params.id);
    if (!existing) {
      setFlash(req, "error", "User tidak ditemukan.");
      return res.redirect("/admin/users");
    }

    const { name, email, role, password } = req.body;
    if (!name || !email || !role) {
      setFlash(req, "error", "Nama, email, dan role wajib diisi.");
      return res.redirect(`/admin/users/${req.params.id}/edit`);
    }

    if (!isValidEmail(email)) {
      setFlash(req, "error", "Format email tidak valid.");
      return res.redirect(`/admin/users/${req.params.id}/edit`);
    }

    if (!["admin", "editor"].includes(role)) {
      setFlash(req, "error", "Role tidak valid.");
      return res.redirect(`/admin/users/${req.params.id}/edit`);
    }

    try {
      const now = new Date().toISOString();

      if (password && password.trim()) {
        if (!isStrongPassword(password)) {
          setFlash(
            req,
            "error",
            "Password minimal 10 karakter dan harus mengandung huruf dan angka.",
          );
          return res.redirect(`/admin/users/${req.params.id}/edit`);
        }

        const passwordHash = bcrypt.hashSync(password.trim(), 10);
        db.prepare(
          `UPDATE users
         SET name = ?, email = ?, role = ?, password_hash = ?, updated_at = ?
         WHERE id = ?`,
        ).run(
          name.trim(),
          email.trim().toLowerCase(),
          role,
          passwordHash,
          now,
          req.params.id,
        );
      } else {
        db.prepare(
          `UPDATE users
         SET name = ?, email = ?, role = ?, updated_at = ?
         WHERE id = ?`,
        ).run(
          name.trim(),
          email.trim().toLowerCase(),
          role,
          now,
          req.params.id,
        );
      }

      setFlash(req, "success", "User berhasil diperbarui.");
      logAudit(req, "update", "user", Number(req.params.id), {
        email: email.trim().toLowerCase(),
        role,
      });
      return res.redirect("/admin/users");
    } catch (error) {
      if (
        String(error.message).includes("UNIQUE constraint failed: users.email")
      ) {
        setFlash(req, "error", "Email sudah digunakan.");
        return res.redirect(`/admin/users/${req.params.id}/edit`);
      }
      throw error;
    }
  },
);

app.post(
  "/admin/users/:id/delete",
  ensureAuth,
  ensureRole("admin"),
  (req, res) => {
    const targetId = Number(req.params.id);

    if (targetId === req.user.id) {
      setFlash(req, "error", "Anda tidak bisa menghapus akun sendiri.");
      return res.redirect("/admin/users");
    }

    const target = db.prepare("SELECT * FROM users WHERE id = ?").get(targetId);
    if (!target) {
      setFlash(req, "error", "User tidak ditemukan.");
      return res.redirect("/admin/users");
    }

    if (target.role === "admin") {
      const adminCount = db
        .prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'")
        .get().total;
      if (adminCount <= 1) {
        setFlash(req, "error", "Minimal harus ada 1 admin aktif.");
        return res.redirect("/admin/users");
      }
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
    setFlash(req, "success", "User berhasil dihapus.");
    logAudit(req, "delete", "user", targetId, { email: target.email });
    res.redirect("/admin/users");
  },
);

app.get("/admin/audit", ensureAuth, ensureRole("admin"), (req, res) => {
  const logs = db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.email AS user_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC
       LIMIT 200`,
    )
    .all();

  res.render("admin/audit/list", { pageTitle: "Audit Log", logs });
});

app.use((req, res) => {
  res
    .status(404)
    .render("public/not-found", { pageTitle: "Halaman Tidak Ditemukan" });
});

app.use((error, req, res, next) => {
  if (error && error.code === "EBADCSRFTOKEN") {
    setFlash(req, "error", "Sesi form tidak valid. Silakan coba lagi.");
    return res.redirect(req.headers.referer || "/");
  }
  if (error && error.code === "LIMIT_FILE_SIZE") {
    setFlash(req, "error", "Ukuran file terlalu besar. Maksimal 5MB.");
    return res.redirect(req.headers.referer || "/admin/media");
  }
  if (error && error.message === "Hanya file gambar yang diizinkan.") {
    setFlash(req, "error", "Hanya file gambar yang diizinkan.");
    return res.redirect(req.headers.referer || "/admin/media");
  }
  next(error);
});

app.use((error, req, res, next) => {
  console.error(error);
  setFlash(req, "error", "Terjadi kesalahan pada server.");
  if (req.path.startsWith("/admin")) {
    return res.redirect("/admin/dashboard");
  }
  res.status(500).send("Internal Server Error");
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});

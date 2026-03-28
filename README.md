# Personal Web Canvas (Admin + Publik)

Aplikasi web ringan berbasis **Node.js + Express + SQLite** untuk:
- Halaman publik dinamis
- Panel admin (`/admin`) untuk manajemen user dan halaman

## Fitur Inti

### 1) Halaman Publik
- Daftar halaman berstatus `published`
- Halaman detail per slug (`/p/:slug`)

### 2) Halaman Admin
- Login admin
- Dashboard statistik (total user, total halaman, draft, published)
- Manajemen halaman web (CRUD + status draft/published)
- Manajemen user (CRUD + role admin/editor)

## Hardening (Production Ready)
- **Tidak ada akun default lemah** (`admin123` dihapus)
- Saat pertama jalan, jika user masih kosong maka dibuat **bootstrap admin** dari `.env`
- Jika `.env` belum ada, sistem akan membuat `.env` otomatis dengan:
  - `SESSION_SECRET` acak kuat
  - `BOOTSTRAP_ADMIN_PASSWORD` acak kuat
- Cookie session otomatis `secure=true` saat `NODE_ENV=production`

## Teknologi
- Node.js
- Express
- EJS template
- SQLite (`better-sqlite3`)
- Session auth (`express-session`)

## Cara Menjalankan

### Opsi Docker (disarankan)

```bash
docker compose up -d --build
```

Akses:
- Publik: `http://localhost:3010`
- Admin: `http://localhost:3010/admin/login`

> Port host diset ke `3010` agar tidak bentrok. Jika masih bentrok, ubah bagian `ports` di `docker-compose.yml` untuk service ini saja.
> Untuk akses via HTTP lokal, `SESSION_COOKIE_SECURE=false` sudah diset di `docker-compose.yml`.

### Opsi GHCR + GitHub Actions

Repo ini sudah disiapkan untuk publish image ke GHCR lewat workflow:

```text
.github/workflows/ghcr.yml
```

Saat branch `main` di-push, GitHub Actions akan build image dan publish ke:

```text
ghcr.io/gunanto/web-pakgun:latest
```

Juga ada tag tambahan berbasis branch, tag git, dan SHA commit.

Jika package image masih private, pastikan akses pull di server tujuan sudah sesuai, atau ubah visibility package di GitHub menjadi public bila memang diinginkan.

Untuk deploy ke VPS memakai image GHCR, lihat:

```text
docs/deploy-ghcr.md
```

### Opsi Lokal

```bash
npm install
npm run dev
```

> Jika `.env` belum ada, aplikasi akan membuat otomatis saat startup.

Akses:
- Publik: `http://localhost:3000`
- Admin: `http://localhost:3000/admin/login`

## Kredensial Admin Pertama
Lihat file `.env`:
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`

Jika memakai Docker Compose, file env akan berada di `data/.env`.

## Login Diskusi (Google/GitHub)
Untuk mengaktifkan diskusi, isi variabel berikut di `data/.env`:
- `OAUTH_BASE_URL` (contoh: `http://localhost:3010`)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`

Setelah login pertama:
1. Ganti password admin
2. (Opsional) Hapus `BOOTSTRAP_ADMIN_PASSWORD` dari `.env`

## Struktur Folder

```text
docs/
  deploy-ghcr.md
src/
  app.js
  db.js
  middleware/auth.js
  utils/slugify.js
  utils/bootstrapEnv.js
views/
  partials/
  public/
  admin/
public/
  style.css
data/
  app.db (otomatis dibuat saat server dijalankan)
```

## Catatan Pengembangan Berikutnya
- Upload media/gambar
- Editor WYSIWYG
- SEO meta tags per halaman
- Audit log aktivitas admin
- Deploy ke VPS + reverse proxy (Nginx)

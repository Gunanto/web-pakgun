# Deploy dari GHCR

Panduan ini untuk menjalankan aplikasi dari image GHCR:

```text
ghcr.io/gunanto/web-pakgun:latest
```

## 1. Verifikasi workflow GitHub Actions

Setelah push ke `main`, cek:

```text
https://github.com/Gunanto/web-pakgun/actions
```

Workflow yang harus sukses:

```text
Build and Publish GHCR Image
```

Jika sukses, package image biasanya terlihat di:

```text
https://github.com/Gunanto/web-pakgun/pkgs/container/web-pakgun
```

## 2. Siapkan server

Pastikan VPS sudah memiliki:

- Docker Engine
- Docker Compose plugin

Buat direktori deploy, misalnya:

```bash
mkdir -p /opt/web-pakgun/data
cd /opt/web-pakgun
```

Salin file berikut dari repo:

- `docker-compose.prod.yml`

## 3. Siapkan environment aplikasi

Buat file:

```text
/opt/web-pakgun/data/.env
```

Contoh isi minimal:

```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=ganti_dengan_secret_panjang_min_32_char
BOOTSTRAP_ADMIN_NAME=Administrator
BOOTSTRAP_ADMIN_EMAIL=admin@domainanda.com
BOOTSTRAP_ADMIN_PASSWORD=ganti_dengan_password_kuat
OAUTH_BASE_URL=https://domainanda.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

## 4. Login ke GHCR jika package masih private

Jika package GHCR masih private:

```bash
echo 'PASTE_GITHUB_PAT' | docker login ghcr.io -u Gunanto --password-stdin
```

PAT minimal perlu akses package read.

Jika package sudah public, langkah login ini tidak perlu.

## 5. Jalankan container

Di server, dari direktori deploy:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## 6. Verifikasi

Periksa status:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

Tes HTTP lokal server:

```bash
curl -I http://127.0.0.1:3010/
```

## 7. Update rilis berikutnya

Setelah ada push baru ke `main` dan workflow sukses:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

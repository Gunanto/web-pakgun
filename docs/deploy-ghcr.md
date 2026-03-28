# Deploy dari GHCR

Panduan ini disesuaikan untuk direktori VPS Anda:

```text
~/apps/web-pakgun
```

Image yang dipakai:

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

## 2. Siapkan direktori deploy di VPS

Masuk ke direktori deploy yang sudah Anda buat:

```bash
cd ~/apps/web-pakgun
mkdir -p data
```

Jika direktori ini masih kosong, ambil isi repo:

```bash
git clone https://github.com/Gunanto/web-pakgun.git .
```

Jika direktori sudah berisi file, jangan clone dengan titik (`.`). Cukup pastikan file ini tersedia:

- `docker-compose.prod.yml`

## 3. Siapkan environment aplikasi

Buat file:

```text
~/apps/web-pakgun/data/.env
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

Catatan:

- `OAUTH_BASE_URL` harus memakai domain publik produksi Anda jika nanti login Google/GitHub diaktifkan.
- `SESSION_SECRET` sebaiknya acak panjang, minimal 32 karakter.

## 4. Login ke GHCR jika package masih private

Jika package GHCR masih private:

```bash
echo 'PASTE_GITHUB_PAT' | docker login ghcr.io -u Gunanto --password-stdin
```

PAT minimal perlu izin read package.

Jika package sudah public, langkah login ini tidak perlu.

## 5. Jalankan container

Dari direktori deploy:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## 6. Verifikasi

Periksa status container:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f
```

Tes HTTP lokal di VPS:

```bash
curl -I http://127.0.0.1:3010/
```

Jika Anda memakai reverse proxy seperti Nginx, arahkan proxy ke:

```text
127.0.0.1:3010
```

## 7. Update rilis berikutnya

Setelah ada push baru ke `main` dan workflow sukses:

```bash
cd ~/apps/web-pakgun
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

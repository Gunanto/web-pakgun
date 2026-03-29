# Deploy Ulang di VPS

Catatan ini untuk deploy ulang aplikasi `web-pakgun` di VPS yang menjalankan Docker Compose.

## 1. Masuk ke direktori aplikasi

```bash
cd ~/apps/web-pakgun
```

## 2. Update source code

Jika repo di VPS adalah clone dari GitHub:

```bash
git pull origin main
```

## 3. Deploy ulang jika memakai image GHCR

File production di repo ini memakai image:

```text
ghcr.io/gunanto/web-pakgun:latest
```

Lihat konfigurasi di `docker-compose.prod.yml`.

Perintah yang disarankan:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

Alternatif satu baris:

```bash
docker compose -f docker-compose.prod.yml up -d --pull always --force-recreate
```

Alasan:
- `up -d` saja belum tentu mengambil image terbaru.
- `pull` memastikan image terbaru dari registry sudah diambil.
- `--force-recreate` memastikan container dibuat ulang dari image terbaru.

## 4. Cek status container

```bash
docker compose -f docker-compose.prod.yml ps
```

## 5. Cek log aplikasi

```bash
docker compose -f docker-compose.prod.yml logs -n 100 web-pakgun
```

Jika perlu memantau live log:

```bash
docker compose -f docker-compose.prod.yml logs -f web-pakgun
```

## 6. Verifikasi aplikasi

Cek endpoint publik dan admin:

- `https://pakgun.my.id/`
- `https://pakgun.my.id/admin/login`

## 7. Jika memakai build lokal di VPS

Kalau suatu saat `docker-compose.prod.yml` diubah dari `image:` menjadi `build:`, maka deploy ulang bukan `pull`, tapi `build` ulang:

```bash
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

Atau:

```bash
docker compose -f docker-compose.prod.yml up -d --build --force-recreate
```

## 8. Jika perubahan tidak terlihat

Cek beberapa hal ini:

- Image terbaru benar-benar sudah ter-pull.
- Container sudah recreate, bukan hanya restart.
- Browser masih cache halaman lama.
- Reverse proxy atau CDN masih cache asset lama.

## Ringkasan Cepat

Untuk setup production repo ini, perintah yang paling aman:

```bash
cd ~/apps/web-pakgun
git pull origin main
docker compose -f docker-compose.prod.yml up -d --pull always --force-recreate
docker compose -f docker-compose.prod.yml logs -n 100 web-pakgun
```

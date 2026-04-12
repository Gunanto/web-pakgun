# Plan Besok

## Tujuan
Menambahkan `www.pakgun.my.id` agar mengarah rapi ke `pakgun.my.id` dengan redirect `301` dan tetap kompatibel dengan Cloudflare `Full (strict)`.

## Langkah

1. Tambah DNS di Cloudflare
- Buat record `CNAME`
- `Name`: `www`
- `Target`: `pakgun.my.id`
- `Proxy status`: `Proxied`

2. Tunggu propagasi DNS
- Cek `dig +short www.pakgun.my.id`
- Pastikan `www.pakgun.my.id` resolve ke origin yang sama melalui Cloudflare

3. Buat host redirect di server `107.172.27.102`
- Tambahkan host `www.pakgun.my.id` di Nginx Proxy Manager
- Arahkan menjadi redirect `301` ke:
  - `https://pakgun.my.id$request_uri`

4. Pasang SSL untuk `www.pakgun.my.id`
- Request sertifikat Let's Encrypt untuk `www.pakgun.my.id`
- Pastikan host redirect `www` juga punya HTTPS valid
- Target akhir: Cloudflare tetap bisa memakai `Full (strict)`

5. Verifikasi akhir
- `curl -I http://www.pakgun.my.id`
- `curl -I https://www.pakgun.my.id`
- Pastikan hasilnya redirect `301` ke `https://pakgun.my.id/...`
- Pastikan tidak ada error `525` atau `526`
- Pastikan `https://pakgun.my.id` tetap `200 OK`

## Catatan Kondisi Saat Ini
- `pakgun.my.id` sudah aktif di origin `107.172.27.102`
- SSL origin `pakgun.my.id` sudah valid dari Let's Encrypt
- Auto renew sudah dipasang di server origin
- `www.pakgun.my.id` belum punya DNS record saat dicek pada 2026-03-28

## Kalau Mau Sekalian Dirapikan
- Tambahkan redirect non-www/www secara konsisten di dokumentasi deploy
- Simpan catatan bahwa `cbt.pakgun.my.id` tetap berada di VPS `103.103.21.95`
- Simpan catatan bahwa `pakgun.my.id` dan `www.pakgun.my.id` berada di VPS `107.172.27.102`

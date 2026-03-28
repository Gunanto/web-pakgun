const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function ensureEnvFile() {
  const envPath =
    process.env.ENV_PATH || path.join(__dirname, "..", "..", ".env");
  if (fs.existsSync(envPath)) return;

  const generatedSecret = crypto.randomBytes(48).toString("hex");
  const generatedAdminPassword = crypto.randomBytes(12).toString("base64url");

  const content = [
    "PORT=3000",
    `SESSION_SECRET=${generatedSecret}`,
    "BOOTSTRAP_ADMIN_NAME=Administrator",
    "BOOTSTRAP_ADMIN_EMAIL=admin@local.test",
    `BOOTSTRAP_ADMIN_PASSWORD=${generatedAdminPassword}`,
    "",
  ].join("\n");

  fs.writeFileSync(envPath, content, { mode: 0o600 });

  console.log("[bootstrap] File .env dibuat otomatis dengan secret acak.");
  console.log(
    "[bootstrap] Kredensial admin awal disimpan di .env (BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD).",
  );
  console.log("[bootstrap] Ganti password admin setelah login pertama.");
}

module.exports = { ensureEnvFile };

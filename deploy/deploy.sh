#!/usr/bin/env bash
# Update aplikasi di VM ke satu commit.
#
# Dipanggil otomatis oleh GitHub Actions (.github/workflows/ci-cd.yml) setelah tes lulus:
#   ssh user@vm "bash -s -- <commit>" < deploy/deploy.sh
# Manual di VM (mis. rollback):
#   bash deploy/deploy.sh            -> versi terbaru di main
#   bash deploy/deploy.sh <commit>   -> commit tertentu
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/Corrector}"
TARGET="${1:-origin/main}"

cd "$APP_DIR"

# File yang di-track git jangan diedit langsung di VM; ubah lewat repo supaya tidak tertimpa.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ERROR: ada file yang diedit langsung di VM:"
  git status --short --untracked-files=no
  exit 1
fi

echo "==> Ambil kode $TARGET"
git fetch --quiet origin main
git checkout --quiet -B main "$TARGET"

echo "==> Supabase"
npx --yes supabase status >/dev/null 2>&1 || npx --yes supabase start
npx --yes supabase migration up --local

# Image dibuild dulu; kalau build gagal, container lama tetap jalan.
echo "==> Build & restart container"
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

echo "==> Cek http://localhost/health"
for _ in $(seq 1 12); do
  if curl -fsS -o /dev/null http://localhost/health; then
    docker compose ps
    echo "Deploy selesai: $(git log -1 --format='%h %s')"
    exit 0
  fi
  sleep 5
done

echo "ERROR: /health tidak merespons setelah deploy"
docker compose ps
docker compose logs --tail 50 api nginx
exit 1

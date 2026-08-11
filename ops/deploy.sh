#!/usr/bin/env bash
#
# Deploy IpdCharts ขึ้น prod ที่มี Kong เป็น gateway
#
# ลำดับสำคัญ: build ให้ผ่านก่อน แล้วค่อยสลับ container ที่รันอยู่
# ถ้า build ล้ม ของเดิมยังเสิร์ฟอยู่เหมือนเดิม
#
# migration ถูกรันโดย CMD ของ backend container ตอน start (prisma migrate deploy)
# จึงไม่ต้องมีขั้นตอนแยก
#
# ใช้:  ops/deploy.sh
# Env overrides: IPD_HOST, IPD_DIR, IPD_HEALTH_URL
set -euo pipefail

IPD_HOST="${IPD_HOST:-superuser10669@49.231.4.16}"
IPD_DIR="${IPD_DIR:-mdr-tracking}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.kong.yml}"
IPD_HEALTH_URL="${IPD_HEALTH_URL:-https://mdr-tracking.officesoft.shop/api/v1/health}"
DC="docker compose -f ${COMPOSE_FILE}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${here}"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

say "1/5 rsync working tree → ${IPD_HOST}:${IPD_DIR}"
# ไม่ส่ง .env ขึ้นไป — ไฟล์ .env บน prod ถือเป็น source of truth ของ secret
rsync -az --delete \
  --exclude node_modules --exclude dist --exclude .git \
  --exclude .env --exclude '*.log' --exclude '*.tsbuildinfo' \
  --exclude test-results --exclude playwright-report \
  ./ "${IPD_HOST}:${IPD_DIR}/"

say "2/5 build images"
ssh "${IPD_HOST}" "cd ${IPD_DIR} && ${DC} build" \
  || die "build ล้มเหลว — ของเดิมยังเสิร์ฟอยู่ ไม่ได้แตะ container ที่รันอยู่"

say "3/5 up db + backend (backend รัน prisma migrate deploy ตอน start)"
ssh "${IPD_HOST}" "cd ${IPD_DIR} && ${DC} up -d db backend"

say "4/5 up frontend"
ssh "${IPD_HOST}" "cd ${IPD_DIR} && ${DC} up -d frontend"

say "5/5 health check (${IPD_HEALTH_URL})"
ok=""
for i in $(seq 1 20); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "${IPD_HEALTH_URL}" || true)"
  if [ "${code}" = "200" ]; then ok="yes"; break; fi
  printf '  รอบ %s: HTTP %s — รออีก 3 วินาที\n' "${i}" "${code}"
  sleep 3
done
[ -n "${ok}" ] || die "health check ไม่ผ่าน — ดู log ด้วย: ssh ${IPD_HOST} 'cd ${IPD_DIR} && ${DC} logs --tail 50 backend frontend'"

printf '\n\033[1;32m✓ deploy สำเร็จ — %s\033[0m\n' "${IPD_HEALTH_URL%/api/v1/health}"

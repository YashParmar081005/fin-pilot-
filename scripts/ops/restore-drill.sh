#!/usr/bin/env bash
# Restore drill (plan.md §31): "An untested backup is not a backup."
# Dumps the live Mongo, restores into a THROWAWAY database, and verifies
# collection counts match. Result goes in docs/runbooks/restore-drill-*.md.
# Usage: ./scripts/ops/restore-drill.sh [source-db] (default: finpilot)
set -euo pipefail

SRC_DB="${1:-finpilot}"
DRILL_DB="restore_drill_$(date +%Y%m%d_%H%M%S)"
ARCHIVE="/tmp/${DRILL_DB}.archive"
START=$(date +%s)

echo "[1/4] dumping ${SRC_DB}…"
docker compose exec -T mongo mongodump --db "${SRC_DB}" --archive > "${ARCHIVE}"

echo "[2/4] restoring into ${DRILL_DB}…"
docker compose exec -T mongo mongorestore \
  --nsFrom "${SRC_DB}.*" --nsTo "${DRILL_DB}.*" --archive < "${ARCHIVE}"

echo "[3/4] verifying collection counts…"
docker compose exec -T mongo mongosh --quiet --eval "
  const src = db.getSiblingDB('${SRC_DB}');
  const dst = db.getSiblingDB('${DRILL_DB}');
  let failed = 0;
  for (const c of src.getCollectionNames()) {
    const a = src.getCollection(c).countDocuments();
    const b = dst.getCollection(c).countDocuments();
    if (a !== b) { print('MISMATCH ' + c + ': ' + a + ' vs ' + b); failed++; }
  }
  if (failed) { print('DRILL FAILED: ' + failed + ' mismatches'); quit(1); }
  print('all ' + src.getCollectionNames().length + ' collections match');
"

echo "[4/4] cleaning up ${DRILL_DB}…"
docker compose exec -T mongo mongosh --quiet --eval "db.getSiblingDB('${DRILL_DB}').dropDatabase()"
rm -f "${ARCHIVE}"

echo "restore drill PASSED in $(( $(date +%s) - START ))s (RTO target: 3600s)"

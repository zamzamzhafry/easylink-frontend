#!/usr/bin/env bash
# EasyLink Auth NIP QA Harness
# Usage: bash qa-harness.sh <login_id> <password>
# e.g.:  bash qa-harness.sh employee001 password

set -euo pipefail

LOGIN_ID="${1:?Usage: $0 <login_id> <password>}"
PASSWORD="${2:?Usage: $0 <login_id> <password>}"
COOKIE_JAR="/tmp/qa-harness-${LOGIN_ID}.cookie"
API_URL="http://localhost:3000/api/auth/login"

# --- Health check ---
echo "=== EasyLink Auth QA Harness ==="
echo "Login ID : ${LOGIN_ID}"
echo "Cookie   : ${COOKIE_JAR}"
echo ""

HTTP_CHECK=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null || true)
if [ "${HTTP_CHECK}" != "200" ]; then
  echo "WARNING: dev server on :3000 returned '${HTTP_CHECK}' — proceeding anyway"
else
  echo "Health   : dev server UP (:3000 -> ${HTTP_CHECK})"
fi
echo ""

# --- Build JSON body safely via jq ---
JSON_BODY=$(jq -n --arg lid "${LOGIN_ID}" --arg pw "${PASSWORD}" \
  '{"login_id": $lid, "password": $pw}')

# --- POST ---
RESPONSE=$(curl -s -w '\nHTTP_STATUS:%{http_code}' \
  -X POST "${API_URL}" \
  -H "Content-Type: application/json" \
  -d "${JSON_BODY}" \
  -c "${COOKIE_JAR}" \
  -b "${COOKIE_JAR}")

# Split body and status
HTTP_STATUS=$(printf '%s' "${RESPONSE}" | grep '^HTTP_STATUS:' | cut -d: -f2)
BODY=$(printf '%s' "${RESPONSE}" | grep -v '^HTTP_STATUS:')

echo "=== Response ==="
echo "HTTP Status : ${HTTP_STATUS}"
echo ""
echo "--- Parsed fields (jq) ---"
# Fields may be at root OR nested under .user (current API wraps in {ok, user:{...}})
printf '%s' "${BODY}" | jq 'if .user then .user else . end | {subject_type, karyawan_id, is_admin, is_leader, groups}'
echo ""
echo "--- Raw body ---"
printf '%s\n' "${BODY}" | jq .

echo ""
echo "=== Done ==="

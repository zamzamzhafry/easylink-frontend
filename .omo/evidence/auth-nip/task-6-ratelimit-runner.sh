#!/usr/bin/env bash
# Task 6 (H5) evidence: per-IP+per-loginId rate limit + unified credential error.
set -uo pipefail

API="http://localhost:3000/api/auth/login"
OUT="${1:-.omo/evidence/auth-nip/task-6-ratelimit.txt}"

# pick a fresh login_id per run so the in-memory bucket isn't already poisoned.
RUN_ID="$(date +%s)-$$"
BAD_LOGIN="brute-$RUN_ID"
PRESENT_LOGIN_1="enum-id-$RUN_ID"          # never exists -> "no row" branch
PRESENT_LOGIN_2="employee001"              # exists, but wrong password

{
  echo "=== Task 6 (H5) — login rate-limit + unified credential error evidence ==="
  date -u
  echo "API: $API"
  echo "Bad login_id (cap test):  $BAD_LOGIN"
  echo

  echo "=== A. 11 rapid bad-cred logins from same IP+loginId — expect 1..10=401, 11=429 ==="
  for i in $(seq 1 11); do
    body_status=$(curl -s -w '\n__STATUS__:%{http_code}' \
      -X POST "$API" \
      -H 'Content-Type: application/json' \
      -d "{\"login_id\":\"$BAD_LOGIN\",\"password\":\"wrong\"}")
    status=$(printf '%s' "$body_status" | sed -n 's/.*__STATUS__://p')
    body=$(printf '%s' "$body_status" | sed '/__STATUS__:/d')
    printf "  attempt %2d -> HTTP %s  body=%s\n" "$i" "$status" "$body"
  done
  echo

  echo "=== B. Different login_id from same IP NOT blocked (per-account scoping) ==="
  other="bystander-$RUN_ID"
  body_status=$(curl -s -w '\n__STATUS__:%{http_code}' \
    -X POST "$API" \
    -H 'Content-Type: application/json' \
    -d "{\"login_id\":\"$other\",\"password\":\"wrong\"}")
  status=$(printf '%s' "$body_status" | sed -n 's/.*__STATUS__://p')
  body=$(printf '%s' "$body_status" | sed '/__STATUS__:/d')
  printf "  unrelated login_id (%s) -> HTTP %s  body=%s\n" "$other" "$status" "$body"
  echo "  (must be 401, NOT 429 — proves cap is per ip+loginId, not per IP only.)"
  echo

  echo "=== C. Unified credential error: invalid-id body == invalid-password body ==="
  # invalid-id (no such login)
  curl -s -o /tmp/task6-invalid-id.json -w 'HTTP=%{http_code}\n' \
    -X POST "$API" \
    -H 'Content-Type: application/json' \
    -d "{\"login_id\":\"$PRESENT_LOGIN_1\",\"password\":\"anything\"}" | sed 's/^/  invalid-id     /'
  # invalid-password (real account, wrong password)
  curl -s -o /tmp/task6-invalid-pw.json -w 'HTTP=%{http_code}\n' \
    -X POST "$API" \
    -H 'Content-Type: application/json' \
    -d "{\"login_id\":\"$PRESENT_LOGIN_2\",\"password\":\"definitely-wrong\"}" | sed 's/^/  invalid-pw     /'

  echo
  echo "  invalid-id body : $(cat /tmp/task6-invalid-id.json)"
  echo "  invalid-pw body : $(cat /tmp/task6-invalid-pw.json)"
  echo
  echo "  diff (empty = byte-identical):"
  diff -u /tmp/task6-invalid-id.json /tmp/task6-invalid-pw.json | sed 's/^/    /'
  if diff -q /tmp/task6-invalid-id.json /tmp/task6-invalid-pw.json >/dev/null 2>&1; then
    echo "  RESULT: IDENTICAL — no user enumeration leak."
  else
    echo "  RESULT: DIVERGENT — FAIL."
  fi
} | tee "$OUT"

#!/usr/bin/env bash
# Smoke test: is a deployed copy of the app alive and answering correctly?
# Usage: scripts/smoke-test.sh https://your-app-address [expected-version]
# If expected-version is given, /health must report exactly that build.
# Exits 0 if every check passes, 1 if any fails.

base="${1:-}"
expected_version="${2:-}"
if [ -z "$base" ]; then
  echo "Usage: $0 <base-url> [expected-version]" >&2
  exit 2
fi
base="${base%/}"

failed=0

# fetch PATH -> sets $code and $body. --max-time 60 leaves room for a
# scaled-to-zero app to wake up.
fetch() {
  local out
  out=$(curl -s -w $'\n%{http_code}' --max-time 60 "$base$1")
  code="${out##*$'\n'}"
  body="${out%$'\n'*}"
}

# check PATH EXPECTED_CODE [TEXT THAT MUST APPEAR IN THE BODY]
check() {
  local path="$1" want="$2" needle="${3:-}"
  fetch "$path"
  if [ "$code" != "$want" ]; then
    echo "FAIL  $path -> $code (expected $want)"
    failed=1
  elif [ -n "$needle" ] && ! printf '%s' "$body" | grep -qF -- "$needle"; then
    echo "FAIL  $path -> $code but the body does not contain: $needle"
    failed=1
  else
    echo "PASS  $path -> $code${needle:+ (contains: $needle)}"
  fi
}

check /health 200 '"status":"ok"'
check /hello 200 '"message":"Hello from Sami Bistro'
check /menu 200 '"price":'
check /no-such-page 404

if [ -n "$expected_version" ]; then
  check /health 200 "\"version\":\"$expected_version\""
fi

if [ "$failed" = "0" ]; then echo "PASS: all checks passed"; else echo "FAIL: at least one check failed"; fi
exit "$failed"

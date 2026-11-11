#!/usr/bin/env bash
# Smoke test: is a deployed copy of the app alive and answering?
# Usage: scripts/smoke-test.sh https://your-app-address
# Exits 0 if every check passes, 1 if any fails.

base="${1:-}"
if [ -z "$base" ]; then
  echo "Usage: $0 <base-url>" >&2
  exit 2
fi
base="${base%/}"

failed=0
check() {
  local path="$1" code
  # --max-time 60 leaves room for a scaled-to-zero app to wake up.
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "$base$path")
  if [ "$code" = "200" ]; then
    echo "PASS  $path -> $code"
  else
    echo "FAIL  $path -> $code (expected 200)"
    failed=1
  fi
}

check /health
check /hello

if [ "$failed" = "0" ]; then echo "PASS: all checks passed"; else echo "FAIL: at least one check failed"; fi
exit "$failed"

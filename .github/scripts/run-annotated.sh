#!/usr/bin/env bash
# Runs a command; on failure, also publishes the tail of its output as one error annotation,
# so failures are readable from the Checks API without downloading raw logs.
set -uo pipefail

log="$(mktemp)"
"$@" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}

if [ "$status" -ne 0 ]; then
  message="$(tail -n 60 "$log" | sed -e 's/\x1b\[[0-9;]*[A-Za-z]//g' -e 's/%/%25/g' | sed -e ':a;N;$!ba;s/\r/%0D/g;s/\n/%0A/g')"
  echo "::error title=Failed: $*::${message}"
fi

exit "$status"

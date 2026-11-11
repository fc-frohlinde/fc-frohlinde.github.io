#!/bin/bash
# Alle Browser-Tests gegen index.html (oder die Datei im 1. Argument).
# Screenshots: SHOTS=/pfad bash tools/tests/run.sh
cd "$(dirname "$0")"
H="${1:-../../index.html}"; H="$(cd "$(dirname "$H")" && pwd)/$(basename "$H")"
node chk.js "$H" || exit 1
fail=0
for t in t_*.js; do
  out=$(timeout 300 node "$t" "$H" ${SHOTS:+"$SHOTS"} 2>&1); rc=$?
  n=$(printf '%s\n' "$out" | grep -c '^ok ')
  if [ $rc -eq 0 ]; then echo "ok   $t ($n)"; else fail=1; echo "FAIL $t"; printf '%s\n' "$out" | grep -v '^ok ' | head -20; fi
done
exit $fail

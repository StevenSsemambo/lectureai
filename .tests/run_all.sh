#!/bin/sh
# Runs every automated check. Used by `npm test`.
set -e
cd "$(dirname "$0")/.."
status=0
for t in .tests/t_*.mjs; do
  case "$t" in
    *_render.mjs) continue ;; # needs bundling, handled below
  esac
  node "$t" || status=1
done
# React render checks: bundle with esbuild (ships with vite), stub CSS, then run.
for t in .tests/t_*_render.mjs; do
  [ -e "$t" ] || continue
  out="$(mktemp -d)/bundle.cjs"
  npx --no-install esbuild "$t" --bundle --platform=node --format=cjs --loader:.css=empty --loader:.jsx=jsx --jsx=automatic --log-level=error --outfile="$out" \
    && node "$out" || status=1
done
exit $status

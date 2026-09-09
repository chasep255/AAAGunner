#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
if ! command -v emcmake >/dev/null 2>&1; then
  for sdk in "${EMSDK:-}/emsdk_env.sh" "$HOME/emsdk/emsdk_env.sh" /opt/emsdk/emsdk_env.sh; do
    if [[ -f "$sdk" ]]; then
      source "$sdk"
      break
    fi
  done
fi
if ! command -v emcmake >/dev/null 2>&1; then
  echo 'Install Emscripten 4.0.17 and source emsdk_env.sh first.' >&2
  exit 1
fi
emcmake cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
# Publish only game assets. Clear old output so removed files cannot linger.
rm -rf dist
mkdir -p dist/engine
cp -R web/. dist/
cp build/physics.js dist/engine/
cp LICENSE THIRD_PARTY_NOTICES.md dist/
printf 'Built AAAGunner in dist/\n'
if [[ "${1:-}" == '-s' ]]; then
  python3 -m http.server "${PORT:-8002}" --bind 127.0.0.1 --directory dist
fi

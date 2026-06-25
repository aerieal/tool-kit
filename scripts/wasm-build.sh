#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f "${HOME}/.cargo/env" ]; then
  # shellcheck disable=SC1091
  source "${HOME}/.cargo/env"
fi

export RUSTC="$(rustup which rustc)"
export CARGO="$(rustup which cargo)"
export PATH="$(dirname "$RUSTC"):${HOME}/.cargo/bin:${PATH}"

exec wasm-pack build wasm --target bundler --out-dir ../src/wasm/pkg --out-name toolkit "$@"

#!/usr/bin/env bash
# Vercel / CI 向け: Rust + wasm-pack を用意してからフロントをビルドする。
# ローカルではツールチェーンが既にあればインストールをスキップする。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain stable --profile minimal
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

if ! rustup target list --installed | grep -q '^wasm32-unknown-unknown$'; then
  rustup target add wasm32-unknown-unknown
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  WP=v0.13.1
  TRIPLE=x86_64-unknown-linux-musl
  mkdir -p "$HOME/.cargo/bin"
  curl -fsSL "https://github.com/rustwasm/wasm-pack/releases/download/${WP}/wasm-pack-${WP}-${TRIPLE}.tar.gz" \
    | tar xz -C "$HOME/.cargo/bin" --strip-components=1 \
        "wasm-pack-${WP}-${TRIPLE}/wasm-pack"
fi

export PATH="$HOME/.cargo/bin:${PATH}"

# Vercel (2 vCPU / 8 GB) では LTO 有効時に OOM になりやすい
if [ "${VERCEL:-}" = "1" ]; then
  export CARGO_PROFILE_RELEASE_LTO=false
fi

npm run wasm:build
npx tsc
npx vite build

#!/usr/bin/env bash
# Vercel の Node ビルドイメージには Rust / wasm-pack が含まれないため、
# 本番ビルド前に最小限のツールチェーンをセットアップする。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --default-toolchain stable --profile minimal
fi

# shellcheck disable=SC1091
source "$HOME/.cargo/env"

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

exec npm run build

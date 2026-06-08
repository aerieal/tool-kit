# tool-kit

Vite (TypeScript) + Rust (wasm-pack) によるローカルファースト Web 制作用ツールキットの土台です。

## 前提

- [Rust](https://www.rust-lang.org/tools/install)（`rustc`, `cargo`）
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)
- [Node.js](https://nodejs.org/) 20+

初回のみ Wasm ターゲットを追加します。

```bash
rustup target add wasm32-unknown-unknown
```

## プロジェクト構成

```
tool-kit/
├── wasm/                 # Rust クレート
│   ├── Cargo.toml
│   └── src/lib.rs
├── src/
│   ├── main.ts           # フロントエンド
│   ├── style.css
│   └── wasm/pkg/         # wasm-pack 生成物（git 管理外）
├── index.html
├── vite.config.ts
└── package.json
```

## セットアップと起動

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開き、画像をドラッグ＆ドロップして WebP / PNG / JPEG への変換・リサイズ・ダウンロードを試せます。

本番ビルド:

```bash
npm run build
npm run preview
```

Rust を変更したときは `npm run wasm:build` が `dev` / `build` の前に自動実行されます。

## プレースホルダー生成 (`generate_placeholder`)

placehold.jp 風のダミー画像をローカル生成します。フォントは `wasm/assets/DejaVuSans.ttf` を `include_bytes!` で埋め込み。

```typescript
import { generate_placeholder } from "./wasm/pkg/toolkit.js";

const output = generate_placeholder(
  600,           // width
  400,           // height
  "#cccccc",     // bg_color (HEX)
  "#ffffff",     // text_color (HEX)
  undefined,     // text（未指定 → "600 x 400"）
  "png",         // output_format: "png" | "webp"
);

const blob = new Blob([new Uint8Array(output)], { type: "image/png" });
const url = URL.createObjectURL(blob);
// <a download href={url}> などで保存
```

## SVG 最適化 (`optimize_svg`)

`usvg` でパース・正規化し、Illustrator / Figma 由来のメタデータやエディタ属性を除去したミニファイ SVG を返します。

```typescript
import { optimize_svg } from "./wasm/pkg/toolkit.js";

const raw = await file.text(); // ドロップした .svg
const minified = optimize_svg(raw);
document.querySelector("textarea")!.value = minified;
```

## CSS スプライト (`generate_css_sprite`)

```typescript
import { generate_css_sprite } from "./wasm/pkg/toolkit.js";
import type { WasmImageInput, SpriteSheetOutput } from "./toolkit-types";

const images: WasmImageInput[] = await filesToWasmImages(fileList);
const result: SpriteSheetOutput = {
  image: sheet.image,
  css: sheet.css,
  width: sheet.width,
  height: sheet.height,
};
// sheet = wasmSpriteToObject(generate_css_sprite(images, "sprites.png", "png"));
```

## 一括 ZIP (`batch_process_to_zip`)

```typescript
import { batch_process_to_zip } from "./wasm/pkg/toolkit.js";

const zipBytes = batch_process_to_zip(
  images,
  "icon",
  "webp",
  80,
  800,
  undefined,
  true, // preserve_original_names: hero.png → hero.webp
);
const blob = new Blob([new Uint8Array(zipBytes)], { type: "application/zip" });
```

## 技術メモ（2026 時点）

- **wasm-pack の `--target bundler`** … Vite などのバンドラー向け。`init()` なしで import 時に Wasm が初期化されます（wasm-bindgen 0.2.100+）。
- **`vite-plugin-wasm` + `vite-plugin-top-level-await`** … `.wasm` の ESM 読み込みと top-level `await` を有効化します。
- **`--out-dir ../src/wasm/pkg`** … `wasm-pack` の出力先はクレートディレクトリ基準のため、`wasm/` から見て `../src/wasm/pkg` に指定します。
# tool-kit

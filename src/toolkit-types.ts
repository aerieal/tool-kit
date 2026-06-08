import type { SpriteSheetResult } from "./wasm/pkg/toolkit.js";

/** Wasm に渡す 1 画像分の入力 */
export interface WasmImageInput {
  name: string;
  data: Uint8Array;
}

/** CSS スプライト生成の戻り値（アプリ側で使う形） */
export interface SpriteSheetOutput {
  image: Uint8Array;
  css: string;
  width: number;
  height: number;
}

/** 一括 ZIP 処理のオプション */
export interface BatchZipOptions {
  prefix: string;
  targetFormat: "webp" | "png" | "jpeg";
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
  /** true のとき ZIP 内のファイル名は元名の stem + 新拡張子 */
  preserveOriginalNames?: boolean;
}

export function wasmSpriteToObject(result: SpriteSheetResult): SpriteSheetOutput {
  return {
    image: result.image,
    css: result.css,
    width: result.width,
    height: result.height,
  };
}

export async function filesToWasmImages(
  files: FileList | File[],
): Promise<WasmImageInput[]> {
  const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
  return Promise.all(
    list.map(async (file) => ({
      name: file.name,
      data: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

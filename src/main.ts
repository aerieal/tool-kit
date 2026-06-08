import "./style.css";
import { ImageEditor } from "./image-editor";
import {
  apply_image_edit,
  batch_process_to_zip,
  convert_and_resize_image,
  generate_css_sprite,
  generate_placeholder,
  optimize_svg,
} from "./wasm/pkg/toolkit.js";
import {
  filesToWasmImages,
  wasmSpriteToObject,
  type SpriteSheetOutput,
} from "./toolkit-types";

type OutputFormat = "webp" | "png" | "jpeg";
type PlaceholderFormat = "webp" | "png";

const MIME: Record<OutputFormat, string> = {
  webp: "image/webp",
  png: "image/png",
  jpeg: "image/jpeg",
};

const EXT: Record<OutputFormat, string> = {
  webp: "webp",
  png: "png",
  jpeg: "jpg",
};

const TOOL_TABS = [
  { id: "convert", label: "画像変換" },
  { id: "editor", label: "画像編集" },
  { id: "placeholder", label: "プレースホルダー" },
  { id: "svg", label: "SVG" },
  { id: "sprite", label: "スプライト" },
  { id: "batch", label: "一括 ZIP" },
] as const;

type ToolId = (typeof TOOL_TABS)[number]["id"];

const ICON_UPLOAD = `<svg class="drop-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_LOGO = `<svg class="app-logo" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".9"/><rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".55"/><rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".55"/><rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".35"/></svg>`;

const DROP_HINT_SINGLE = `<div class="drop-zone__inner">${ICON_UPLOAD}<p class="drop-zone__title">ファイルをドロップ</p><p class="drop-zone__hint">またはクリックして選択</p></div>`;

const DROP_HINT_MULTI = `<div class="drop-zone__inner">${ICON_UPLOAD}<p class="drop-zone__title">複数ファイルをドロップ</p><p class="drop-zone__hint">またはクリックして選択</p></div>`;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="app-header">
    <div class="app-header__brand">
      ${ICON_LOGO}
      <div class="app-header__titles">
        <h1>tool-kit</h1>
        <p class="tagline">Wasm · 画像・SVG ユーティリティ</p>
      </div>
    </div>
  </header>
  <nav class="tool-nav" aria-label="ツール切り替え">
    ${TOOL_TABS.map(
      (t, i) =>
        `<button type="button" class="tool-tab${i === 0 ? " active" : ""}" data-tab="${t.id}" aria-selected="${i === 0}">${t.label}</button>`,
    ).join("")}
  </nav>
  <main class="app-main">

  <section class="panel panel-active" data-panel="convert">
    <div class="panel-header">
      <h2>画像変換</h2>
      <p>WebP / PNG / JPEG へ変換し、必要ならリサイズします。</p>
    </div>
    <form class="controls" id="controls">
      <label>
        出力形式
        <select id="format" name="format">
          <option value="webp" selected>WebP</option>
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
        </select>
      </label>
      <label>
        品質 (1–100)
        <span class="range-row">
          <input type="range" id="quality" min="1" max="100" value="80" />
          <output id="quality-value">80</output>
        </span>
      </label>
      <div class="row-2">
        <label>
          最大幅 (px)
          <input type="number" id="max-width" min="1" placeholder="原寸" />
        </label>
        <label>
          最大高さ (px)
          <input type="number" id="max-height" min="1" placeholder="原寸" />
        </label>
      </div>
    </form>
    <div class="drop-zone" id="drop-zone" role="button" tabindex="0" aria-label="画像を選択">
      ${DROP_HINT_SINGLE}
    </div>
    <input type="file" id="file-input" accept="image/*" hidden />
    <div class="actions">
      <button type="button" class="btn btn-primary" id="download-btn" disabled>変換結果をダウンロード</button>
    </div>
    <div class="size-compare" id="size-compare" hidden>
      <p class="size-compare-heading">サイズ比較</p>
      <div class="size-compare-bars">
        <div class="size-compare-row">
          <span class="size-compare-label">変換前</span>
          <span class="size-compare-value" id="size-before-value">—</span>
          <div class="size-bar-track" aria-hidden="true">
            <div class="size-bar size-bar-before" id="size-bar-before"></div>
          </div>
        </div>
        <div class="size-compare-row">
          <span class="size-compare-label">変換後</span>
          <span class="size-compare-value" id="size-after-value">—</span>
          <div class="size-bar-track" aria-hidden="true">
            <div class="size-bar size-bar-after" id="size-bar-after"></div>
          </div>
        </div>
      </div>
      <p class="size-compare-delta" id="size-delta"></p>
    </div>
    <div class="status" role="status" id="status">準備完了。画像をドロップすると変換します。完了後にダウンロードできます。</div>
  </section>

  <section class="panel panel--editor" data-panel="editor">
    <div class="panel-header">
      <h2>画像編集</h2>
      <p>トリム・回転・リサイズをプレビューしながら操作します。枠をドラッグして切り抜き、上の丸ハンドルで回転（Shift で縦横比固定）。</p>
    </div>
    <div class="editor-workspace" id="editor-workspace" hidden>
      <div class="editor-stage" id="editor-stage">
        <canvas id="editor-canvas" aria-label="画像編集キャンバス"></canvas>
      </div>
      <aside class="editor-sidebar">
        <div class="editor-preview-block">
          <p class="editor-preview-label">出力プレビュー</p>
          <div class="editor-preview-frame">
            <canvas id="editor-preview" aria-label="編集結果プレビュー"></canvas>
          </div>
        </div>
        <form class="controls editor-controls" id="editor-form">
          <label>
            回転 (°)
            <span class="range-row">
              <input type="range" id="editor-rotation" min="-180" max="180" step="0.5" value="0" />
              <output id="editor-rotation-value">0</output>
            </span>
          </label>
          <div class="row-2">
            <label>
              出力幅 (px)
              <input type="number" id="editor-out-width" min="1" placeholder="自動" />
            </label>
            <label>
              出力高さ (px)
              <input type="number" id="editor-out-height" min="1" placeholder="自動" />
            </label>
          </div>
          <label>
            出力形式
            <select id="editor-format">
              <option value="webp" selected>WebP</option>
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
            </select>
          </label>
          <label>
            品質 (1–100)
            <span class="range-row">
              <input type="range" id="editor-quality" min="1" max="100" value="85" />
              <output id="editor-quality-value">85</output>
            </span>
          </label>
        </form>
        <div class="editor-meta" id="editor-meta"></div>
        <div class="actions row-actions">
          <button type="button" class="btn btn-secondary" id="editor-reset-btn">別の画像</button>
          <button type="button" class="btn btn-primary" id="editor-download-btn">ダウンロード</button>
        </div>
      </aside>
    </div>
    <div class="drop-zone" id="editor-drop-zone" role="button" tabindex="0" aria-label="編集する画像を選択">
      ${DROP_HINT_SINGLE}
    </div>
    <input type="file" id="editor-file-input" accept="image/*" hidden />
    <div class="status" role="status" id="editor-status"></div>
  </section>

  <section class="panel" data-panel="placeholder">
    <div class="panel-header">
      <h2>プレースホルダー生成</h2>
      <p>指定サイズのダミー画像を生成します（placehold.jp 風）。</p>
    </div>
    <form class="controls" id="placeholder-form">
      <div class="row-2">
        <label>
          幅 (px)
          <input type="number" id="ph-width" min="1" max="8192" value="600" required />
        </label>
        <label>
          高さ (px)
          <input type="number" id="ph-height" min="1" max="8192" value="400" required />
        </label>
      </div>
      <div class="row-2">
        <label>
          背景色
          <span class="color-row">
            <input type="color" id="ph-bg-picker" value="#cccccc" aria-label="背景色ピッカー" />
            <input type="text" id="ph-bg" value="#cccccc" spellcheck="false" />
          </span>
        </label>
        <label>
          文字色
          <span class="color-row">
            <input type="color" id="ph-fg-picker" value="#ffffff" aria-label="文字色ピッカー" />
            <input type="text" id="ph-fg" value="#ffffff" spellcheck="false" />
          </span>
        </label>
      </div>
      <label>
        テキスト（空欄で「幅 x 高さ」）
        <input type="text" id="ph-text" placeholder="600 x 400" />
      </label>
      <label>
        出力形式
        <select id="ph-format">
          <option value="png" selected>PNG</option>
          <option value="webp">WebP</option>
        </select>
      </label>
    </form>
    <div class="actions row-actions">
      <button type="button" class="btn btn-primary" id="ph-generate-btn">生成</button>
      <button type="button" class="btn btn-secondary" id="ph-download-btn" disabled>ダウンロード</button>
    </div>
    <div class="preview-wrap" id="ph-preview-wrap" hidden>
      <img id="ph-preview" alt="プレースホルダープレビュー" />
    </div>
    <div class="status" role="status" id="ph-status"></div>
  </section>

  <section class="panel" data-panel="svg">
    <div class="panel-header">
      <h2>SVG 最適化</h2>
      <p>不要な属性や空白を削除してファイルサイズを削減します。</p>
    </div>
    <div class="drop-zone" id="svg-drop-zone" role="button" tabindex="0" aria-label="SVG を選択">
      ${DROP_HINT_SINGLE}
    </div>
    <input type="file" id="svg-file-input" accept=".svg,image/svg+xml" hidden />
    <div class="status" role="status" id="svg-status"></div>
    <label class="code-block-label">
      最適化後の SVG
      <textarea id="svg-output" class="code-block" readonly spellcheck="false" placeholder="ここに最適化結果が表示されます"></textarea>
    </label>
    <div class="actions row-actions">
      <button type="button" class="btn btn-secondary" id="svg-copy-btn" disabled>コピー</button>
      <button type="button" class="btn btn-primary" id="svg-download-btn" disabled>ダウンロード</button>
    </div>
  </section>

  <section class="panel" data-panel="sprite">
    <div class="panel-header">
      <h2>CSS スプライト生成</h2>
      <p>複数画像を 1 枚のシートにまとめ、CSS を自動生成します。</p>
    </div>
    <div class="drop-zone" id="sprite-drop-zone" role="button" tabindex="0" aria-label="スプライト用画像を選択">
      ${DROP_HINT_MULTI}
    </div>
    <input type="file" id="sprite-file-input" accept="image/*" multiple hidden />
    <form class="controls">
      <label>
        スプライト画像ファイル名
        <input type="text" id="sprite-filename" value="sprites.png" spellcheck="false" />
      </label>
      <label>
        出力形式
        <select id="sprite-format">
          <option value="png" selected>PNG</option>
          <option value="webp">WebP</option>
        </select>
      </label>
    </form>
    <div class="actions">
      <button type="button" class="btn btn-primary" id="sprite-run-btn" disabled>スプライトを生成</button>
    </div>
    <div class="status" role="status" id="sprite-status"></div>
    <div class="preview-wrap" id="sprite-preview-wrap" hidden>
      <img id="sprite-preview" alt="スプライトシートプレビュー" />
    </div>
    <label class="code-block-label">
      生成 CSS
      <textarea id="sprite-css-output" class="code-block" readonly spellcheck="false"></textarea>
    </label>
    <div class="actions row-actions">
      <button type="button" class="btn btn-secondary" id="sprite-dl-image-btn" disabled>画像を DL</button>
      <button type="button" class="btn btn-secondary" id="sprite-dl-css-btn" disabled>CSS を DL</button>
    </div>
  </section>

  <section class="panel" data-panel="batch">
    <div class="panel-header">
      <h2>一括変換 → ZIP</h2>
      <p>複数画像をまとめて変換し、ZIP でダウンロードします。</p>
    </div>
    <div class="drop-zone" id="batch-drop-zone" role="button" tabindex="0" aria-label="一括変換用画像を選択">
      ${DROP_HINT_MULTI}
    </div>
    <input type="file" id="batch-file-input" accept="image/*" multiple hidden />
    <form class="controls" id="batch-form">
      <label class="checkbox-label">
        <input type="checkbox" id="batch-preserve-names" checked />
        元のファイル名を保持（拡張子のみ変換先に合わせる）
      </label>
      <label id="batch-prefix-wrap">
        ファイル名プレフィックス
        <input type="text" id="batch-prefix" value="image" spellcheck="false" />
      </label>
      <label>
        出力形式
        <select id="batch-format">
          <option value="webp" selected>WebP</option>
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
        </select>
      </label>
      <label>
        品質 (1–100)
        <span class="range-row">
          <input type="range" id="batch-quality" min="1" max="100" value="80" />
          <output id="batch-quality-value">80</output>
        </span>
      </label>
      <div class="row-2">
        <label>
          最大幅 (px)
          <input type="number" id="batch-max-width" min="1" placeholder="原寸" />
        </label>
        <label>
          最大高さ (px)
          <input type="number" id="batch-max-height" min="1" placeholder="原寸" />
        </label>
      </div>
    </form>
    <div class="actions row-actions">
      <button type="button" class="btn btn-primary" id="batch-run-btn" disabled>ZIP を生成</button>
      <button type="button" class="btn btn-secondary" id="batch-download-btn" disabled>project.zip をダウンロード</button>
    </div>
    <div class="status" role="status" id="batch-status"></div>
  </section>

  </main>
`;

function initToolTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tool-tab");
  const panels = document.querySelectorAll<HTMLElement>("[data-panel]");

  function activate(id: ToolId): void {
    tabs.forEach((tab) => {
      const on = tab.dataset.tab === id;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", String(on));
    });
    panels.forEach((panel) => {
      panel.classList.toggle("panel-active", panel.dataset.panel === id);
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.dataset.tab as ToolId | undefined;
      if (id) activate(id);
    });
  });
}

initToolTabs();

const dropZone = document.querySelector<HTMLDivElement>("#drop-zone")!;
const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const statusEl = document.querySelector<HTMLPreElement>("#status")!;
const formatSelect = document.querySelector<HTMLSelectElement>("#format")!;
const qualityInput = document.querySelector<HTMLInputElement>("#quality")!;
const qualityValue = document.querySelector<HTMLOutputElement>("#quality-value")!;
const maxWidthInput = document.querySelector<HTMLInputElement>("#max-width")!;
const maxHeightInput = document.querySelector<HTMLInputElement>("#max-height")!;
const downloadBtn = document.querySelector<HTMLButtonElement>("#download-btn")!;
const sizeCompareEl = document.querySelector<HTMLDivElement>("#size-compare")!;
const sizeBeforeValue = document.querySelector<HTMLSpanElement>("#size-before-value")!;
const sizeAfterValue = document.querySelector<HTMLSpanElement>("#size-after-value")!;
const sizeBarBefore = document.querySelector<HTMLDivElement>("#size-bar-before")!;
const sizeBarAfter = document.querySelector<HTMLDivElement>("#size-bar-after")!;
const sizeDeltaEl = document.querySelector<HTMLParagraphElement>("#size-delta")!;

const phWidth = document.querySelector<HTMLInputElement>("#ph-width")!;
const phHeight = document.querySelector<HTMLInputElement>("#ph-height")!;
const phBgPicker = document.querySelector<HTMLInputElement>("#ph-bg-picker")!;
const phBg = document.querySelector<HTMLInputElement>("#ph-bg")!;
const phFgPicker = document.querySelector<HTMLInputElement>("#ph-fg-picker")!;
const phFg = document.querySelector<HTMLInputElement>("#ph-fg")!;
const phText = document.querySelector<HTMLInputElement>("#ph-text")!;
const phFormat = document.querySelector<HTMLSelectElement>("#ph-format")!;
const phGenerateBtn = document.querySelector<HTMLButtonElement>("#ph-generate-btn")!;
const phDownloadBtn = document.querySelector<HTMLButtonElement>("#ph-download-btn")!;
const phStatus = document.querySelector<HTMLPreElement>("#ph-status")!;
const phPreviewWrap = document.querySelector<HTMLDivElement>("#ph-preview-wrap")!;
const phPreview = document.querySelector<HTMLImageElement>("#ph-preview")!;

const svgDropZone = document.querySelector<HTMLDivElement>("#svg-drop-zone")!;
const svgFileInput = document.querySelector<HTMLInputElement>("#svg-file-input")!;
const svgStatus = document.querySelector<HTMLPreElement>("#svg-status")!;
const svgOutput = document.querySelector<HTMLTextAreaElement>("#svg-output")!;
const svgCopyBtn = document.querySelector<HTMLButtonElement>("#svg-copy-btn")!;
const svgDownloadBtn = document.querySelector<HTMLButtonElement>("#svg-download-btn")!;

let lastSvgFilename = "optimized.svg";

const spriteDropZone = document.querySelector<HTMLDivElement>("#sprite-drop-zone")!;
const spriteFileInput = document.querySelector<HTMLInputElement>("#sprite-file-input")!;
const spriteFilenameInput = document.querySelector<HTMLInputElement>("#sprite-filename")!;
const spriteFormatSelect = document.querySelector<HTMLSelectElement>("#sprite-format")!;
const spriteRunBtn = document.querySelector<HTMLButtonElement>("#sprite-run-btn")!;
const spriteStatus = document.querySelector<HTMLPreElement>("#sprite-status")!;
const spritePreviewWrap = document.querySelector<HTMLDivElement>("#sprite-preview-wrap")!;
const spritePreview = document.querySelector<HTMLImageElement>("#sprite-preview")!;
const spriteCssOutput = document.querySelector<HTMLTextAreaElement>("#sprite-css-output")!;
const spriteDlImageBtn = document.querySelector<HTMLButtonElement>("#sprite-dl-image-btn")!;
const spriteDlCssBtn = document.querySelector<HTMLButtonElement>("#sprite-dl-css-btn")!;

const batchDropZone = document.querySelector<HTMLDivElement>("#batch-drop-zone")!;
const batchFileInput = document.querySelector<HTMLInputElement>("#batch-file-input")!;
const batchPreserveNamesInput =
  document.querySelector<HTMLInputElement>("#batch-preserve-names")!;
const batchPrefixWrap = document.querySelector<HTMLLabelElement>("#batch-prefix-wrap")!;
const batchPrefixInput = document.querySelector<HTMLInputElement>("#batch-prefix")!;
const batchFormatSelect = document.querySelector<HTMLSelectElement>("#batch-format")!;
const batchQualityInput = document.querySelector<HTMLInputElement>("#batch-quality")!;
const batchQualityValue = document.querySelector<HTMLOutputElement>("#batch-quality-value")!;
const batchMaxWidthInput = document.querySelector<HTMLInputElement>("#batch-max-width")!;
const batchMaxHeightInput = document.querySelector<HTMLInputElement>("#batch-max-height")!;
const batchRunBtn = document.querySelector<HTMLButtonElement>("#batch-run-btn")!;
const batchDownloadBtn = document.querySelector<HTMLButtonElement>("#batch-download-btn")!;
const batchStatus = document.querySelector<HTMLPreElement>("#batch-status")!;

let spriteFiles: File[] = [];
let lastSprite: SpriteSheetOutput | null = null;
let spritePreviewUrl: string | null = null;

let batchFiles: File[] = [];

let lastBlob: Blob | null = null;
let lastFilename = "converted.webp";
let lastPhBlob: Blob | null = null;
let lastPhFilename = "placeholder.png";
let lastBatchBlob: Blob | null = null;
let phPreviewUrl: string | null = null;

qualityInput.addEventListener("input", () => {
  qualityValue.textContent = qualityInput.value;
});

function syncColorInputs(picker: HTMLInputElement, text: HTMLInputElement): void {
  picker.addEventListener("input", () => {
    text.value = picker.value;
  });
  text.addEventListener("input", () => {
    if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(text.value)) {
      picker.value = text.value.length === 4 ? expandHexShort(text.value) : text.value;
    }
  });
}

function expandHexShort(hex: string): string {
  const [, r, g, b] = hex.match(/^#(.)(.)(.)$/) ?? [];
  return `#${r}${r}${g}${g}${b}${b}`;
}

syncColorInputs(phBgPicker, phBg);
syncColorInputs(phFgPicker, phFg);

function parseOptionalSize(input: HTMLInputElement): number | undefined {
  const v = input.value.trim();
  if (v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

function outputBasename(originalName: string, format: OutputFormat): string {
  const base = originalName.replace(/\.[^.]+$/, "") || "image";
  return `${base}.${EXT[format]}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`;
  }
  return `${(bytes / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 2 })} MB`;
}

function describeSizeDelta(before: number, after: number): {
  deltaText: string;
  reduced: boolean;
} {
  if (before <= 0) {
    return { deltaText: "比較できません", reduced: false };
  }
  const ratio = (after / before) * 100;
  const diff = after - before;
  const sign = diff <= 0 ? "−" : "+";
  const deltaText = `${sign}${formatBytes(Math.abs(diff))}（出力は入力の ${ratio.toFixed(1)}%）`;
  return {
    deltaText,
    reduced: after < before,
  };
}

function updateSizeCompare(before: number, after: number): void {
  const max = Math.max(before, after, 1);
  const beforePct = (before / max) * 100;
  const afterPct = (after / max) * 100;
  const { deltaText, reduced } = describeSizeDelta(before, after);

  sizeBeforeValue.textContent = formatBytes(before);
  sizeAfterValue.textContent = formatBytes(after);
  sizeBarBefore.style.width = `${beforePct}%`;
  sizeBarAfter.style.width = `${afterPct}%`;
  sizeDeltaEl.textContent = deltaText;
  sizeDeltaEl.classList.toggle("size-reduced", reduced);
  sizeDeltaEl.classList.toggle("size-increased", !reduced && after > before);
  sizeCompareEl.hidden = false;
}

function hideSizeCompare(): void {
  sizeCompareEl.hidden = true;
  sizeDeltaEl.classList.remove("size-reduced", "size-increased");
}

function syncBatchPrefixField(): void {
  const preserve = batchPreserveNamesInput.checked;
  batchPrefixWrap.hidden = preserve;
  batchPrefixInput.disabled = preserve;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showPreview(img: HTMLImageElement, wrap: HTMLDivElement, blob: Blob): void {
  if (phPreviewUrl) URL.revokeObjectURL(phPreviewUrl);
  phPreviewUrl = URL.createObjectURL(blob);
  img.src = phPreviewUrl;
  wrap.hidden = false;
}

/** placehold.jp 風プレースホルダーを生成して Blob で返す */
export function createPlaceholderBlob(
  width: number,
  height: number,
  bgColor: string,
  textColor: string,
  text: string | undefined,
  format: PlaceholderFormat,
): Blob {
  const output = generate_placeholder(
    width,
    height,
    bgColor,
    textColor,
    text ?? undefined,
    format,
  );
  const bytes = new Uint8Array(output);
  const mime = format === "webp" ? "image/webp" : "image/png";
  return new Blob([bytes], { type: mime });
}

function generatePlaceholder(): void {
  const width = Number(phWidth.value);
  const height = Number(phHeight.value);
  const format = phFormat.value as PlaceholderFormat;
  const customText = phText.value.trim();
  const text = customText === "" ? undefined : customText;

  phStatus.textContent = "生成中…";
  phStatus.classList.remove("error");
  phDownloadBtn.disabled = true;
  lastPhBlob = null;

  try {
    const blob = createPlaceholderBlob(
      width,
      height,
      phBg.value,
      phFg.value,
      text,
      format,
    );

    lastPhFilename = `placeholder-${width}x${height}.${format}`;
    lastPhBlob = blob;
    showPreview(phPreview, phPreviewWrap, blob);
    phDownloadBtn.disabled = false;

    phStatus.textContent = [
      `サイズ: ${width} × ${height}`,
      `背景: ${phBg.value} / 文字: ${phFg.value}`,
      `テキスト: ${text ?? `${width} x ${height}`}`,
      `出力: ${blob.size.toLocaleString()} bytes (${format.toUpperCase()})`,
      "生成完了。「ダウンロード」から保存できます。",
    ].join("\n");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    phStatus.textContent = `エラー: ${message}`;
    phStatus.classList.add("error");
  }
}

phGenerateBtn.addEventListener("click", generatePlaceholder);

phDownloadBtn.addEventListener("click", () => {
  if (lastPhBlob) downloadBlob(lastPhBlob, lastPhFilename);
});

function isSvgFile(file: File): boolean {
  return (
    file.type === "image/svg+xml" ||
    file.name.toLowerCase().endsWith(".svg")
  );
}

async function processSvgFile(file: File): Promise<void> {
  if (!isSvgFile(file)) {
    svgStatus.textContent = "SVG ファイルを選択してください。";
    svgStatus.classList.add("error");
    return;
  }

  svgStatus.textContent = "最適化中…";
  svgStatus.classList.remove("error");
  svgCopyBtn.disabled = true;
  svgDownloadBtn.disabled = true;
  svgOutput.value = "";

  try {
    const raw = await file.text();
    const optimized = optimize_svg(raw);

    svgOutput.value = optimized;
    lastSvgFilename = file.name.replace(/\.svg$/i, "") + ".optimized.svg";

    const ratio =
      raw.length > 0
        ? ((optimized.length / raw.length) * 100).toFixed(1)
        : "—";

    svgStatus.textContent = [
      `ファイル: ${file.name}`,
      `入力: ${raw.length.toLocaleString()} 文字`,
      `出力: ${optimized.length.toLocaleString()} 文字 (${ratio}%)`,
    ].join("\n");

    svgCopyBtn.disabled = false;
    svgDownloadBtn.disabled = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    svgStatus.textContent = `エラー: ${message}`;
    svgStatus.classList.add("error");
  }
}

svgCopyBtn.addEventListener("click", async () => {
  if (!svgOutput.value) return;
  await navigator.clipboard.writeText(svgOutput.value);
  svgStatus.textContent = "クリップボードにコピーしました。";
  svgStatus.classList.remove("error");
});

svgDownloadBtn.addEventListener("click", () => {
  if (!svgOutput.value) return;
  const blob = new Blob([svgOutput.value], { type: "image/svg+xml" });
  downloadBlob(blob, lastSvgFilename);
});

svgDropZone.addEventListener("click", () => svgFileInput.click());
svgFileInput.addEventListener("change", () => {
  const file = svgFileInput.files?.[0];
  if (file) void processSvgFile(file);
  svgFileInput.value = "";
});

svgDropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    svgFileInput.click();
  }
});

svgDropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  svgDropZone.classList.add("dragover");
});

svgDropZone.addEventListener("dragleave", () => {
  svgDropZone.classList.remove("dragover");
});

svgDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  svgDropZone.classList.remove("dragover");
  const file = e.dataTransfer?.files[0];
  if (file) void processSvgFile(file);
});

function setSpriteFiles(files: FileList | File[]): void {
  spriteFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
  spriteRunBtn.disabled = spriteFiles.length === 0;
  spriteStatus.textContent =
    spriteFiles.length > 0
      ? `${spriteFiles.length} 件の画像を選択中`
      : "";
}

function runSpritePack(): void {
  if (spriteFiles.length === 0) return;

  spriteStatus.textContent = "スプライトを生成中…";
  spriteStatus.classList.remove("error");
  spriteDlImageBtn.disabled = true;
  spriteDlCssBtn.disabled = true;
  lastSprite = null;

  void (async () => {
    try {
      const wasmImages = await filesToWasmImages(spriteFiles);
      const result = wasmSpriteToObject(
        generate_css_sprite(
          wasmImages,
          spriteFilenameInput.value.trim() || "sprites.png",
          spriteFormatSelect.value,
        ),
      );
      lastSprite = result;
      spriteCssOutput.value = result.css;

      const mime =
        spriteFormatSelect.value === "webp" ? "image/webp" : "image/png";
      const blob = new Blob([new Uint8Array(result.image)], { type: mime });
      if (spritePreviewUrl) URL.revokeObjectURL(spritePreviewUrl);
      spritePreviewUrl = URL.createObjectURL(blob);
      spritePreview.src = spritePreviewUrl;
      spritePreviewWrap.hidden = false;

      spriteStatus.textContent = [
        `画像数: ${spriteFiles.length}`,
        `シート: ${result.width} × ${result.height}px`,
        `画像: ${result.image.byteLength.toLocaleString()} bytes`,
        `CSS: ${result.css.length.toLocaleString()} 文字`,
      ].join("\n");

      spriteDlImageBtn.disabled = false;
      spriteDlCssBtn.disabled = false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      spriteStatus.textContent = `エラー: ${message}`;
      spriteStatus.classList.add("error");
    }
  })();
}

spriteRunBtn.addEventListener("click", runSpritePack);

spriteDlImageBtn.addEventListener("click", () => {
  if (!lastSprite) return;
  const mime =
    spriteFormatSelect.value === "webp" ? "image/webp" : "image/png";
  downloadBlob(
    new Blob([new Uint8Array(lastSprite.image)], { type: mime }),
    spriteFilenameInput.value.trim() || "sprites.png",
  );
});

spriteDlCssBtn.addEventListener("click", () => {
  if (!lastSprite) return;
  const base =
    (spriteFilenameInput.value.trim() || "sprites.png").replace(
      /\.[^.]+$/,
      "",
    ) || "sprites";
  downloadBlob(
    new Blob([lastSprite.css], { type: "text/css" }),
    `${base}.css`,
  );
});

spriteDropZone.addEventListener("click", () => spriteFileInput.click());
spriteFileInput.addEventListener("change", () => {
  if (spriteFileInput.files) setSpriteFiles(spriteFileInput.files);
  spriteFileInput.value = "";
});

spriteDropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  spriteDropZone.classList.add("dragover");
});

spriteDropZone.addEventListener("dragleave", () => {
  spriteDropZone.classList.remove("dragover");
});

spriteDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  spriteDropZone.classList.remove("dragover");
  if (e.dataTransfer?.files.length) setSpriteFiles(e.dataTransfer.files);
});

function setBatchFiles(files: FileList | File[]): void {
  batchFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
  batchRunBtn.disabled = batchFiles.length === 0;
  batchDownloadBtn.disabled = true;
  lastBatchBlob = null;
  batchStatus.textContent =
    batchFiles.length > 0
      ? `${batchFiles.length} 件の画像を選択中。「ZIP を生成」で変換します。`
      : "";
}

batchQualityInput.addEventListener("input", () => {
  batchQualityValue.textContent = batchQualityInput.value;
});

batchPreserveNamesInput.addEventListener("change", syncBatchPrefixField);
syncBatchPrefixField();

function runBatchZip(): void {
  if (batchFiles.length === 0) return;

  batchStatus.textContent = "ZIP を生成中…";
  batchStatus.classList.remove("error");
  batchDownloadBtn.disabled = true;
  lastBatchBlob = null;

  void (async () => {
    const wasmImages = await filesToWasmImages(batchFiles);
    const preserveNames = batchPreserveNamesInput.checked;
    const zipBytes = batch_process_to_zip(
      wasmImages,
      batchPrefixInput.value.trim() || "image",
      batchFormatSelect.value,
      Number(batchQualityInput.value),
      parseOptionalSize(batchMaxWidthInput),
      parseOptionalSize(batchMaxHeightInput),
      preserveNames,
    );

    const inputTotal = wasmImages.reduce((sum, img) => sum + img.data.byteLength, 0);

    lastBatchBlob = new Blob([new Uint8Array(zipBytes)], {
      type: "application/zip",
    });
    batchDownloadBtn.disabled = false;

    batchStatus.textContent = [
      `処理: ${batchFiles.length} ファイル`,
      `入力合計: ${formatBytes(inputTotal)}`,
      `ZIP: ${formatBytes(zipBytes.byteLength)}`,
      preserveNames
        ? "命名: 元ファイル名（拡張子のみ変換先形式）"
        : `命名: ${batchPrefixInput.value || "image"}_01.* 形式`,
      "生成完了。「project.zip をダウンロード」から保存できます。",
    ].join("\n");
  })().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    batchStatus.textContent = `エラー: ${message}`;
    batchStatus.classList.add("error");
  });
}

batchRunBtn.addEventListener("click", runBatchZip);

batchDownloadBtn.addEventListener("click", () => {
  if (lastBatchBlob) downloadBlob(lastBatchBlob, "project.zip");
});

batchDropZone.addEventListener("click", () => batchFileInput.click());
batchFileInput.addEventListener("change", () => {
  if (batchFileInput.files) setBatchFiles(batchFileInput.files);
  batchFileInput.value = "";
});

batchDropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  batchDropZone.classList.add("dragover");
});

batchDropZone.addEventListener("dragleave", () => {
  batchDropZone.classList.remove("dragover");
});

batchDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  batchDropZone.classList.remove("dragover");
  if (e.dataTransfer?.files.length) setBatchFiles(e.dataTransfer.files);
});

async function processFile(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    statusEl.textContent = "画像ファイルを選択してください。";
    statusEl.classList.add("error");
    return;
  }

  const format = formatSelect.value as OutputFormat;
  const quality = Number(qualityInput.value);
  const maxWidth = parseOptionalSize(maxWidthInput);
  const maxHeight = parseOptionalSize(maxHeightInput);

  statusEl.textContent = "変換中…";
  statusEl.classList.remove("error");
  downloadBtn.disabled = true;
  lastBlob = null;
  hideSizeCompare();

  try {
    const input = new Uint8Array(await file.arrayBuffer());
    const output = convert_and_resize_image(
      input,
      format,
      quality,
      maxWidth,
      maxHeight,
    );

    const mime = MIME[format];
    const bytes = new Uint8Array(output);
    lastBlob = new Blob([bytes], { type: mime });
    lastFilename = outputBasename(file.name, format);

    updateSizeCompare(input.byteLength, output.byteLength);

    statusEl.textContent = [
      `ファイル: ${file.name}`,
      `出力形式: ${format.toUpperCase()}`,
      `品質: ${quality}`,
      `リサイズ: ${maxWidth ?? "—"} × ${maxHeight ?? "—"} (最大)`,
      "変換完了。「変換結果をダウンロード」から保存できます。",
    ].join("\n");

    downloadBtn.disabled = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    statusEl.textContent = `エラー: ${message}`;
    statusEl.classList.add("error");
    hideSizeCompare();
  }
}

downloadBtn.addEventListener("click", () => {
  if (lastBlob) downloadBlob(lastBlob, lastFilename);
});

dropZone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void processFile(file);
  fileInput.value = "";
});

dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer?.files[0];
  if (file) void processFile(file);
});

// --- 画像編集（インタラクティブ） ---
const editorDropZone = document.querySelector<HTMLDivElement>("#editor-drop-zone")!;
const editorFileInput = document.querySelector<HTMLInputElement>("#editor-file-input")!;
const editorWorkspace = document.querySelector<HTMLDivElement>("#editor-workspace")!;
const editorStage = document.querySelector<HTMLDivElement>("#editor-stage")!;
const editorCanvas = document.querySelector<HTMLCanvasElement>("#editor-canvas")!;
const editorPreview = document.querySelector<HTMLCanvasElement>("#editor-preview")!;
const editorRotation = document.querySelector<HTMLInputElement>("#editor-rotation")!;
const editorRotationValue =
  document.querySelector<HTMLOutputElement>("#editor-rotation-value")!;
const editorOutWidth = document.querySelector<HTMLInputElement>("#editor-out-width")!;
const editorOutHeight = document.querySelector<HTMLInputElement>("#editor-out-height")!;
const editorFormat = document.querySelector<HTMLSelectElement>("#editor-format")!;
const editorQuality = document.querySelector<HTMLInputElement>("#editor-quality")!;
const editorQualityValue =
  document.querySelector<HTMLOutputElement>("#editor-quality-value")!;
const editorMeta = document.querySelector<HTMLDivElement>("#editor-meta")!;
const editorResetBtn = document.querySelector<HTMLButtonElement>("#editor-reset-btn")!;
const editorDownloadBtn = document.querySelector<HTMLButtonElement>("#editor-download-btn")!;
const editorStatus = document.querySelector<HTMLPreElement>("#editor-status")!;

function editorOutputBasename(originalName: string, format: OutputFormat): string {
  const base = originalName.replace(/\.[^.]+$/, "") || "image";
  return `${base}-edited.${EXT[format]}`;
}

function updateEditorMeta(): void {
  const params = imageEditor.getParams();
  const { crop, rotation, outputWidth, outputHeight } = params;
  editorMeta.textContent = [
    `切り抜き: ${Math.round(crop.x)}, ${Math.round(crop.y)} — ${Math.round(crop.w)} × ${Math.round(crop.h)} px`,
    `回転: ${rotation}°`,
    `出力: ${outputWidth ?? "自動"} × ${outputHeight ?? "自動"} px`,
  ].join("\n");
}

const imageEditor = new ImageEditor(editorStage, editorCanvas, (params) => {
  editorRotation.value = String(params.rotation);
  editorRotationValue.textContent = String(params.rotation);
  imageEditor.drawPreview(editorPreview);
  updateEditorMeta();
});

async function loadEditorFile(file: File): Promise<void> {
  editorStatus.textContent = "読み込み中…";
  editorStatus.classList.remove("error");

  try {
    await imageEditor.loadFile(file);
    editorDropZone.hidden = true;
    editorWorkspace.hidden = false;
    editorRotation.value = "0";
    editorRotationValue.textContent = "0";
    editorOutWidth.value = "";
    editorOutHeight.value = "";
    imageEditor.drawPreview(editorPreview);
    updateEditorMeta();
    editorStatus.textContent = `${file.name} を読み込みました。枠をドラッグして編集できます。`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    editorStatus.textContent = `エラー: ${message}`;
    editorStatus.classList.add("error");
  }
}

editorRotation.addEventListener("input", () => {
  editorRotationValue.textContent = editorRotation.value;
  imageEditor.setRotation(Number(editorRotation.value));
});

function syncEditorOutputSize(): void {
  const w = editorOutWidth.value.trim();
  const h = editorOutHeight.value.trim();
  imageEditor.setOutputSize(
    w === "" ? null : Math.max(1, Math.floor(Number(w))),
    h === "" ? null : Math.max(1, Math.floor(Number(h))),
  );
}

editorOutWidth.addEventListener("change", syncEditorOutputSize);
editorOutHeight.addEventListener("change", syncEditorOutputSize);

editorQuality.addEventListener("input", () => {
  editorQualityValue.textContent = editorQuality.value;
});

editorResetBtn.addEventListener("click", () => {
  imageEditor.reset();
  editorDropZone.hidden = false;
  editorWorkspace.hidden = true;
  editorStatus.textContent = "";
  editorFileInput.value = "";
});

editorDownloadBtn.addEventListener("click", () => {
  const buffer = imageEditor.getSourceBuffer();
  if (!buffer) return;

  const format = editorFormat.value as OutputFormat;
  const params = imageEditor.getParams();
  const { crop, rotation, outputWidth, outputHeight } = params;

  editorStatus.textContent = "エクスポート中…";
  editorStatus.classList.remove("error");

  try {
    const output = apply_image_edit(
      buffer,
      Math.round(crop.x),
      Math.round(crop.y),
      Math.round(crop.w),
      Math.round(crop.h),
      rotation,
      outputWidth ?? undefined,
      outputHeight ?? undefined,
      format,
      Number(editorQuality.value),
    );

    const blob = new Blob([new Uint8Array(output)], { type: MIME[format] });
    downloadBlob(blob, editorOutputBasename(imageEditor.getFileName(), format));
    editorStatus.textContent = `エクスポート完了（${formatBytes(output.byteLength)}）`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    editorStatus.textContent = `エラー: ${message}`;
    editorStatus.classList.add("error");
  }
});

editorDropZone.addEventListener("click", () => editorFileInput.click());
editorFileInput.addEventListener("change", () => {
  const file = editorFileInput.files?.[0];
  if (file) void loadEditorFile(file);
  editorFileInput.value = "";
});

editorDropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    editorFileInput.click();
  }
});

editorDropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  editorDropZone.classList.add("dragover");
});

editorDropZone.addEventListener("dragleave", () => {
  editorDropZone.classList.remove("dragover");
});

editorDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  editorDropZone.classList.remove("dragover");
  const file = e.dataTransfer?.files[0];
  if (file) void loadEditorFile(file);
});

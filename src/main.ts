import "./style.css";
import { ImageEditor } from "./image-editor";
import {
  apply_image_edit,
  batch_process_to_zip,
  convert_and_resize_image,
  generate_css_sprite,
  generate_placeholder,
  optimize_svg,
  rasterize_svg,
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

const ICON_CONVERT = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="8.5" cy="10" r="1.5" fill="currentColor"/><path d="M21 15l-5-5-9 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_EDITOR = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8V4h4M20 16v4h-4M4 16v4h4M20 8V4h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="7" y="7" width="10" height="10" rx="1" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/></svg>`;
const ICON_PLACEHOLDER = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M8 12h8M12 9v6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4h10l3 7-8 9-8-9 3-7Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="11" r="2" fill="currentColor"/></svg>`;
const ICON_SPRITE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>`;
const ICON_BATCH = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16v12H4V7Z" stroke="currentColor" stroke-width="1.5"/><path d="M8 7V5h8v2" stroke="currentColor" stroke-width="1.5"/><path d="M10 11h4M10 14h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

type ToolId = "convert" | "editor" | "placeholder" | "svg" | "sprite" | "batch";

interface ToolDef {
  id: ToolId;
  label: string;
  desc: string;
  steps: readonly string[];
  icon: string;
}

interface ToolGroup {
  label: string;
  tools: readonly ToolDef[];
}

const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    label: "画像",
    tools: [
      { id: "convert", label: "変換", desc: "WebP / PNG / JPEG", steps: ["ファイル選択", "形式・サイズ設定", "ダウンロード"], icon: ICON_CONVERT },
      { id: "editor", label: "編集", desc: "トリム・回転・リサイズ", steps: ["画像を選択", "編集", "ダウンロード"], icon: ICON_EDITOR },
      { id: "placeholder", label: "プレースホルダー", desc: "ダミー画像を生成", steps: ["サイズ・色", "プレビュー", "ダウンロード"], icon: ICON_PLACEHOLDER },
    ],
  },
  {
    label: "SVG",
    tools: [
      { id: "svg", label: "SVG", desc: "最適化・ラスタ出力", steps: ["ファイル選択", "モード・設定", "出力"], icon: ICON_SVG },
    ],
  },
  {
    label: "一括",
    tools: [
      { id: "sprite", label: "スプライト", desc: "CSS スプライト生成", steps: ["複数選択", "生成", "ダウンロード"], icon: ICON_SPRITE },
      { id: "batch", label: "一括 ZIP", desc: "まとめて変換", steps: ["複数選択", "設定", "ZIP DL"], icon: ICON_BATCH },
    ],
  },
];

const TOOL_TABS: readonly ToolDef[] = TOOL_GROUPS.flatMap((g) => g.tools);

function toolById(id: ToolId): ToolDef {
  return TOOL_TABS.find((t) => t.id === id) ?? TOOL_TABS[0];
}

const ICON_UPLOAD = `<svg class="drop-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M14 2v6h6M12 18v-6M9 15l3-3 3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const ICON_LOGO = `<svg class="app-logo" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".9"/><rect x="13" y="3" width="8" height="8" rx="2" fill="currentColor" opacity=".55"/><rect x="3" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".55"/><rect x="13" y="13" width="8" height="8" rx="2" fill="currentColor" opacity=".35"/></svg>`;

const DROP_HINT_SINGLE = `<div class="drop-zone__inner">${ICON_UPLOAD}<p class="drop-zone__title">ファイルをドロップ</p><p class="drop-zone__hint">またはクリックして選択</p></div>`;

const DROP_HINT_MULTI = `<div class="drop-zone__inner">${ICON_UPLOAD}<p class="drop-zone__title">複数ファイルをドロップ</p><p class="drop-zone__hint">またはクリックして選択</p></div>`;

function panelStepsHtml(steps: readonly string[]): string {
  return `<div class="panel-steps" aria-hidden="true">${steps
    .map((s, i) => `<span class="panel-step"><span class="panel-step__num">${i + 1}</span>${s}</span>`)
    .join("")}</div>`;
}

function renderToolTab(tool: ToolDef, active: boolean): string {
  return `<button type="button" role="tab" class="tool-tab${active ? " active" : ""}" data-tab="${tool.id}" aria-selected="${active}" aria-controls="panel-${tool.id}" id="tab-${tool.id}">
    <span class="tool-tab__icon" aria-hidden="true">${tool.icon}</span>
    <span class="tool-tab__text">
      <span class="tool-tab__label">${tool.label}</span>
      <span class="tool-tab__desc">${tool.desc}</span>
    </span>
  </button>`;
}

function renderNav(activeId: ToolId): string {
  return TOOL_GROUPS.map(
    (group) => `<div class="nav-group">
      <p class="nav-group__label">${group.label}</p>
      ${group.tools.map((tool) => renderToolTab(tool, tool.id === activeId)).join("")}
    </div>`,
  ).join("");
}

function workSectionHtml(step: number, title: string, body: string): string {
  return `<section class="work-section">
    <div class="work-section__head">
      <span class="work-section__num" aria-hidden="true">${step}</span>
      <h3 class="work-section__title">${title}</h3>
    </div>
    <div class="work-section__body">${body}</div>
  </section>`;
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer = 0;
  return ((...args: Parameters<T>) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  }) as T;
}

function showToast(message: string, durationMs = 2800): void {
  const container =
    document.querySelector<HTMLDivElement>(".toast-container") ??
    (() => {
      const el = document.createElement("div");
      el.className = "toast-container";
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
      return el;
    })();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
    if (!container.childElementCount) container.remove();
  }, durationMs);
}

function setStatus(
  el: HTMLElement,
  text: string,
  variant: "default" | "loading" | "success" | "error" = "default",
): void {
  el.classList.remove("is-loading", "is-success", "is-info", "error");
  if (variant === "error") {
    el.classList.add("error");
  } else if (variant === "loading") {
    el.classList.add("is-loading");
  } else if (variant === "success") {
    el.classList.add("is-success");
  } else if (variant === "default" && text) {
    el.classList.add("is-info");
  }

  if (variant === "loading") {
    el.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${text}</span>`;
  } else {
    el.textContent = text;
  }
}

function setButtonLoading(btn: HTMLButtonElement, loading: boolean, label?: string): void {
  if (loading) {
    btn.dataset.prevLabel = btn.textContent ?? "";
    btn.classList.add("is-loading");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>${label ?? btn.dataset.prevLabel}`;
  } else {
    btn.classList.remove("is-loading");
    btn.textContent = label ?? btn.dataset.prevLabel ?? btn.textContent;
    delete btn.dataset.prevLabel;
  }
}

function updateDropZoneSingle(
  zone: HTMLElement,
  file: File | null,
  defaultHint: string,
): void {
  zone.classList.toggle("has-file", file !== null);
  if (file) {
    zone.innerHTML = `<div class="drop-zone__inner">${ICON_UPLOAD}<p class="drop-zone__title">${escapeHtml(file.name)}</p><p class="drop-zone__change-hint">クリックまたはドロップで変更</p></div>`;
  } else {
    zone.innerHTML = defaultHint;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderFileList(
  container: HTMLElement | null,
  files: File[],
  onRemove: (index: number) => void,
): void {
  if (!container) return;
  container.innerHTML = "";
  if (files.length === 0) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const list = document.createElement("div");
  list.className = "file-list";
  list.setAttribute("role", "list");

  files.forEach((file, i) => {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    chip.setAttribute("role", "listitem");
    chip.innerHTML = `<span class="file-chip__name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>`;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "file-chip__remove";
    removeBtn.setAttribute("aria-label", `${file.name} を削除`);
    removeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onRemove(i);
    });
    chip.appendChild(removeBtn);
    list.appendChild(chip);
  });

  container.appendChild(list);
}

const app = document.querySelector<HTMLDivElement>("#app")!;
const initialTool: ToolId = "convert";
app.innerHTML = `
  <div class="app-shell">
  <a class="skip-link" href="#app-main">メインコンテンツへスキップ</a>

  <aside class="app-sidebar">
    <div class="app-sidebar__brand">
      ${ICON_LOGO}
      <div class="app-header__titles">
        <h1>tool-kit</h1>
        <p class="tagline">Wasm · 画像・SVG</p>
      </div>
    </div>
    <nav class="sidebar-nav" role="tablist" aria-label="ツール切り替え">
      ${renderNav(initialTool)}
    </nav>
  </aside>

  <div class="app-body">
    <header class="mobile-header">
      ${ICON_LOGO}
      <div class="mobile-header__titles">
        <h1>tool-kit</h1>
        <p class="tagline">Wasm · 画像・SVG ユーティリティ</p>
      </div>
    </header>
    <nav class="mobile-nav" role="tablist" aria-label="ツール切り替え（モバイル）">
      ${TOOL_TABS.map((t) => renderToolTab(t, t.id === initialTool)).join("")}
    </nav>

  <main class="app-main" id="app-main">

  <section class="panel panel-active" data-panel="convert" id="panel-convert" role="tabpanel" aria-labelledby="tab-convert">
    <div class="panel-header">
      <h2>画像変換</h2>
      <p>WebP / PNG / JPEG へ変換し、必要ならリサイズします。ファイルを選ぶと設定に応じて自動変換されます。</p>
      ${panelStepsHtml(toolById("convert").steps)}
    </div>
    <div class="panel-body">
    ${workSectionHtml(
      1,
      "ファイルを選択",
      `<div class="drop-zone" id="drop-zone" role="button" tabindex="0" aria-label="画像を選択">
        ${DROP_HINT_SINGLE}
      </div>
      <input type="file" id="file-input" accept="image/*" hidden />`,
    )}
    ${workSectionHtml(
      2,
      "変換設定",
      `<div class="work-split">
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
        <div class="stack stack--block">
          <div class="convert-preview-wrap preview-wrap" id="convert-preview-wrap" hidden>
            <img id="convert-preview" alt="変換結果プレビュー" />
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
        </div>
      </div>`,
    )}
    ${workSectionHtml(
      3,
      "ダウンロード",
      `<div class="action-bar">
        <div class="status" role="status" id="status">画像をドロップするか、クリックして選択してください。</div>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="download-btn" disabled>変換結果をダウンロード</button>
        </div>
      </div>`,
    )}
    </div>
  </section>

  <section class="panel panel--editor" data-panel="editor" id="panel-editor" role="tabpanel" aria-labelledby="tab-editor" hidden>
    <div class="panel-header">
      <h2>画像編集</h2>
      <p>トリム・回転・リサイズをプレビューしながら操作します。枠をドラッグして切り抜き、丸ハンドルで回転（Shift で縦横比固定）。</p>
      ${panelStepsHtml(toolById("editor").steps)}
    </div>
    <div class="panel-body">
    ${workSectionHtml(
      1,
      "画像を選択",
      `<div class="drop-zone" id="editor-drop-zone" role="button" tabindex="0" aria-label="編集する画像を選択">
        ${DROP_HINT_SINGLE}
      </div>
      <input type="file" id="editor-file-input" accept="image/*" hidden />`,
    )}
    ${workSectionHtml(
      2,
      "編集",
      `<div class="editor-workspace" id="editor-workspace" hidden>
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
    </div>`,
    )}
    ${workSectionHtml(
      3,
      "ステータス",
      `<div class="status" role="status" id="editor-status"></div>`,
    )}
    </div>
  </section>

  <section class="panel" data-panel="placeholder" id="panel-placeholder" role="tabpanel" aria-labelledby="tab-placeholder" hidden>
    <div class="panel-header">
      <h2>プレースホルダー生成</h2>
      <p>指定サイズのダミー画像を生成します。設定を変えると自動でプレビューが更新されます。</p>
      ${panelStepsHtml(toolById("placeholder").steps)}
    </div>
    <div class="panel-body">
    ${workSectionHtml(
      1,
      "サイズ・色の設定",
      `<form class="controls" id="placeholder-form">
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
    </form>`,
    )}
    ${workSectionHtml(
      2,
      "プレビュー",
      `<div class="preview-wrap" id="ph-preview-wrap" hidden>
        <img id="ph-preview" alt="プレースホルダープレビュー" />
      </div>
      <div class="status" role="status" id="ph-status"></div>`,
    )}
    ${workSectionHtml(
      3,
      "ダウンロード",
      `<div class="action-bar">
        <div class="actions row-actions">
          <button type="button" class="btn btn-secondary" id="ph-generate-btn">再生成</button>
          <button type="button" class="btn btn-primary" id="ph-download-btn" disabled>ダウンロード</button>
        </div>
      </div>`,
    )}
    </div>
  </section>

  <section class="panel panel--wide" data-panel="svg" id="panel-svg" role="tabpanel" aria-labelledby="tab-svg" hidden>
    <div class="panel-header">
      <h2>SVG</h2>
      <p>不要な属性を削除して最適化するか、PNG / WebP / JPEG にラスタ出力します。</p>
      ${panelStepsHtml(toolById("svg").steps)}
    </div>
    <div class="panel-body">
    ${workSectionHtml(
      1,
      "ファイルを選択",
      `<div class="drop-zone" id="svg-drop-zone" role="button" tabindex="0" aria-label="SVG を選択">
        ${DROP_HINT_SINGLE}
      </div>
      <input type="file" id="svg-file-input" accept=".svg,image/svg+xml" hidden />`,
    )}
    ${workSectionHtml(
      2,
      "操作モード",
      `<div class="svg-mode-nav" role="tablist" aria-label="SVG 操作モード">
        <button type="button" role="tab" class="svg-mode-tab active" data-svg-mode="optimize" aria-selected="true" id="svg-tab-optimize">最適化</button>
        <button type="button" role="tab" class="svg-mode-tab" data-svg-mode="raster" aria-selected="false" id="svg-tab-raster">ラスタ出力</button>
      </div>`,
    )}
    ${workSectionHtml(
      3,
      "出力",
      `<div class="svg-mode-panel" data-svg-mode-panel="optimize" id="svg-panel-optimize">
      <div class="svg-stats" id="svg-stats" hidden>
        <div class="svg-stat">
          <span class="svg-stat__label">入力</span>
          <span class="svg-stat__value" id="svg-stat-before">—</span>
        </div>
        <div class="svg-stat">
          <span class="svg-stat__label">出力</span>
          <span class="svg-stat__value" id="svg-stat-after">—</span>
        </div>
        <div class="svg-stat">
          <span class="svg-stat__label">削減率</span>
          <span class="svg-stat__value" id="svg-stat-ratio">—</span>
        </div>
      </div>
      <div class="status" role="status" id="svg-status"></div>
      <label class="code-block-label">
        最適化後の SVG
        <textarea id="svg-output" class="code-block" readonly spellcheck="false" placeholder="ここに最適化結果が表示されます"></textarea>
      </label>
      <div class="actions row-actions">
        <button type="button" class="btn btn-secondary" id="svg-copy-btn" disabled>コピー</button>
        <button type="button" class="btn btn-primary" id="svg-download-btn" disabled>ダウンロード</button>
      </div>
    </div>

    <div class="svg-mode-panel" data-svg-mode-panel="raster" id="svg-panel-raster" hidden>
      <form class="controls" id="svg-raster-form">
        <label>
          倍率
          <span class="range-row">
            <input type="range" id="svg-raster-scale" min="0.25" max="4" step="0.25" value="1" />
            <output id="svg-raster-scale-value">1</output>
          </span>
        </label>
        <div class="row-2">
          <label>
            最大幅 (px)
            <input type="number" id="svg-raster-max-width" min="1" placeholder="制限なし" />
          </label>
          <label>
            最大高さ (px)
            <input type="number" id="svg-raster-max-height" min="1" placeholder="制限なし" />
          </label>
        </div>
        <label>
          出力形式
          <select id="svg-raster-format">
            <option value="png" selected>PNG</option>
            <option value="webp">WebP</option>
            <option value="jpeg">JPEG</option>
          </select>
        </label>
        <label>
          品質 (1–100)
          <span class="range-row">
            <input type="range" id="svg-raster-quality" min="1" max="100" value="90" />
            <output id="svg-raster-quality-value">90</output>
          </span>
        </label>
        <label id="svg-raster-bg-label" hidden>
          背景色 (JPEG)
          <span class="color-row">
            <input type="color" id="svg-raster-bg-picker" value="#ffffff" />
            <input type="text" id="svg-raster-bg" value="#ffffff" maxlength="7" spellcheck="false" />
          </span>
        </label>
      </form>
      <div class="actions row-actions">
        <button type="button" class="btn btn-primary" id="svg-raster-run-btn" disabled>ラスタ化</button>
        <button type="button" class="btn btn-secondary" id="svg-raster-download-btn" disabled>ダウンロード</button>
      </div>
      <div class="preview-wrap" id="svg-raster-preview-wrap" hidden>
        <img id="svg-raster-preview" alt="ラスタ出力プレビュー" />
      </div>
      <p class="editor-meta" id="svg-raster-meta"></p>
      <div class="status" role="status" id="svg-raster-status">SVG をドロップするか、クリックして選択してください。</div>
    </div>`,
    )}
    </div>
  </section>

  <section class="panel panel--wide" data-panel="sprite" id="panel-sprite" role="tabpanel" aria-labelledby="tab-sprite" hidden>
    <div class="panel-header">
      <h2>CSS スプライト生成</h2>
      <p>複数画像を 1 枚のシートにまとめ、CSS を自動生成します。</p>
      ${panelStepsHtml(toolById("sprite").steps)}
    </div>
    <div class="panel-body">
    ${workSectionHtml(
      1,
      "画像を選択",
      `<div class="drop-zone" id="sprite-drop-zone" role="button" tabindex="0" aria-label="スプライト用画像を選択">
        ${DROP_HINT_MULTI}
      </div>
      <div id="sprite-file-list"></div>
      <input type="file" id="sprite-file-input" accept="image/*" multiple hidden />`,
    )}
    ${workSectionHtml(
      2,
      "設定・生成",
      `<form class="controls">
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
      <div class="action-bar">
        <div class="status" role="status" id="sprite-status"></div>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="sprite-run-btn" disabled>スプライトを生成</button>
        </div>
      </div>`,
    )}
    ${workSectionHtml(
      3,
      "結果",
      `<div class="work-split work-split--preview-first">
        <div class="preview-wrap" id="sprite-preview-wrap" hidden>
          <img id="sprite-preview" alt="スプライトシートプレビュー" />
        </div>
        <label class="code-block-label">
          生成 CSS
          <textarea id="sprite-css-output" class="code-block" readonly spellcheck="false"></textarea>
        </label>
      </div>
      <div class="actions row-actions">
        <button type="button" class="btn btn-secondary" id="sprite-dl-image-btn" disabled>画像を DL</button>
        <button type="button" class="btn btn-secondary" id="sprite-dl-css-btn" disabled>CSS を DL</button>
      </div>`,
    )}
    </div>
  </section>

  <section class="panel" data-panel="batch" id="panel-batch" role="tabpanel" aria-labelledby="tab-batch" hidden>
    <div class="panel-header">
      <h2>一括変換 → ZIP</h2>
      <p>複数画像をまとめて変換し、ZIP でダウンロードします。</p>
      ${panelStepsHtml(toolById("batch").steps)}
    </div>
    <div class="panel-body">
    ${workSectionHtml(
      1,
      "画像を選択",
      `<div class="drop-zone" id="batch-drop-zone" role="button" tabindex="0" aria-label="一括変換用画像を選択">
        ${DROP_HINT_MULTI}
      </div>
      <div id="batch-file-list"></div>
      <input type="file" id="batch-file-input" accept="image/*" multiple hidden />`,
    )}
    ${workSectionHtml(
      2,
      "変換設定",
      `<form class="controls" id="batch-form">
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
    </form>`,
    )}
    ${workSectionHtml(
      3,
      "ZIP ダウンロード",
      `<div class="action-bar">
        <div class="status" role="status" id="batch-status"></div>
        <div class="actions row-actions">
          <button type="button" class="btn btn-primary" id="batch-run-btn" disabled>ZIP を生成</button>
          <button type="button" class="btn btn-secondary" id="batch-download-btn" disabled>project.zip を DL</button>
        </div>
      </div>`,
    )}
    </div>
  </section>

  </main>
  </div>
  </div>
`;

function initToolTabs(): void {
  const tabs = document.querySelectorAll<HTMLButtonElement>(".tool-tab");
  const panels = document.querySelectorAll<HTMLElement>("[data-panel]");
  const mobileTitle = document.querySelector<HTMLHeadingElement>(".mobile-header h1");

  function activate(id: ToolId, updateHash = true): void {
    const tool = toolById(id);
    tabs.forEach((tab) => {
      const on = tab.dataset.tab === id;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      if (on) tab.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    });
    panels.forEach((panel) => {
      const on = panel.dataset.panel === id;
      panel.classList.toggle("panel-active", on);
      panel.hidden = !on;
    });
    if (mobileTitle) mobileTitle.textContent = tool.label;
    if (updateHash && location.hash !== `#${id}`) {
      history.replaceState(null, "", `#${id}`);
    }
  }

  const hash = location.hash.slice(1) as ToolId;
  if (hash && TOOL_TABS.some((t) => t.id === hash)) {
    activate(hash, false);
  } else {
    activate("convert", false);
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const id = tab.dataset.tab as ToolId | undefined;
      if (id) activate(id);
    });
  });

  document.querySelectorAll<HTMLElement>(".sidebar-nav, .mobile-nav").forEach((nav) => {
    nav.addEventListener("keydown", (e) => {
      const tabList = Array.from(nav.querySelectorAll<HTMLButtonElement>(".tool-tab"));
      const current = tabList.findIndex((t) => t.classList.contains("active"));
      if (current < 0) return;

      let next = current;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (current + 1) % tabList.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (current - 1 + tabList.length) % tabList.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabList.length - 1;
      else return;

      e.preventDefault();
      const id = tabList[next].dataset.tab as ToolId;
      activate(id);
      tabList[next].focus();
    });
  });

  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1) as ToolId;
    if (id && TOOL_TABS.some((t) => t.id === id)) activate(id, false);
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
const convertPreviewWrap = document.querySelector<HTMLDivElement>("#convert-preview-wrap")!;
const convertPreview = document.querySelector<HTMLImageElement>("#convert-preview")!;

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
const svgStatsEl = document.querySelector<HTMLDivElement>("#svg-stats")!;
const svgStatBefore = document.querySelector<HTMLSpanElement>("#svg-stat-before")!;
const svgStatAfter = document.querySelector<HTMLSpanElement>("#svg-stat-after")!;
const svgStatRatio = document.querySelector<HTMLSpanElement>("#svg-stat-ratio")!;
const svgModeTabs = document.querySelectorAll<HTMLButtonElement>(".svg-mode-tab");
const svgPanelOptimize = document.querySelector<HTMLDivElement>("#svg-panel-optimize")!;
const svgPanelRaster = document.querySelector<HTMLDivElement>("#svg-panel-raster")!;
const svgRasterScale = document.querySelector<HTMLInputElement>("#svg-raster-scale")!;
const svgRasterScaleValue = document.querySelector<HTMLOutputElement>("#svg-raster-scale-value")!;
const svgRasterMaxWidth = document.querySelector<HTMLInputElement>("#svg-raster-max-width")!;
const svgRasterMaxHeight = document.querySelector<HTMLInputElement>("#svg-raster-max-height")!;
const svgRasterFormat = document.querySelector<HTMLSelectElement>("#svg-raster-format")!;
const svgRasterQuality = document.querySelector<HTMLInputElement>("#svg-raster-quality")!;
const svgRasterQualityValue = document.querySelector<HTMLOutputElement>("#svg-raster-quality-value")!;
const svgRasterBgLabel = document.querySelector<HTMLLabelElement>("#svg-raster-bg-label")!;
const svgRasterBgPicker = document.querySelector<HTMLInputElement>("#svg-raster-bg-picker")!;
const svgRasterBg = document.querySelector<HTMLInputElement>("#svg-raster-bg")!;
const svgRasterRunBtn = document.querySelector<HTMLButtonElement>("#svg-raster-run-btn")!;
const svgRasterDownloadBtn = document.querySelector<HTMLButtonElement>("#svg-raster-download-btn")!;
const svgRasterPreviewWrap = document.querySelector<HTMLDivElement>("#svg-raster-preview-wrap")!;
const svgRasterPreview = document.querySelector<HTMLImageElement>("#svg-raster-preview")!;
const svgRasterMeta = document.querySelector<HTMLParagraphElement>("#svg-raster-meta")!;
const svgRasterStatus = document.querySelector<HTMLElement>("#svg-raster-status")!;

let lastSvgFilename = "optimized.svg";
let lastSvgRaw: string | null = null;
let lastSvgStem = "image";
let svgMode: "optimize" | "raster" = "optimize";
let lastRasterBlob: Blob | null = null;
let lastRasterFilename = "image.png";
let svgRasterPreviewUrl: string | null = null;

const spriteDropZone = document.querySelector<HTMLDivElement>("#sprite-drop-zone")!;
const spriteFileInput = document.querySelector<HTMLInputElement>("#sprite-file-input")!;
const spriteFileListEl = document.querySelector<HTMLDivElement>("#sprite-file-list")!;
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
const batchFileListEl = document.querySelector<HTMLDivElement>("#batch-file-list")!;
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
let convertPreviewUrl: string | null = null;
let lastConvertFile: File | null = null;
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

function generatePlaceholder(silent = false): void {
  const width = Number(phWidth.value);
  const height = Number(phHeight.value);
  const format = phFormat.value as PlaceholderFormat;
  const customText = phText.value.trim();
  const text = customText === "" ? undefined : customText;

  if (!silent) setStatus(phStatus, "生成中…", "loading");
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

    setStatus(
      phStatus,
      [
        `${width} × ${height} · ${format.toUpperCase()} · ${formatBytes(blob.size)}`,
        `背景 ${phBg.value} / 文字 ${phFg.value}`,
      ].join("\n"),
      "success",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(phStatus, `エラー: ${message}`, "error");
  }
}

const debouncedPlaceholderPreview = debounce(() => generatePlaceholder(true), 400);

phGenerateBtn.addEventListener("click", () => generatePlaceholder());

function bindPlaceholderLivePreview(): void {
  const trigger = () => debouncedPlaceholderPreview();
  [phWidth, phHeight, phBg, phFg, phText, phFormat].forEach((el) => {
    el.addEventListener("input", trigger);
    el.addEventListener("change", trigger);
  });
  phBgPicker.addEventListener("input", trigger);
  phFgPicker.addEventListener("input", trigger);
}

bindPlaceholderLivePreview();
generatePlaceholder(true);

phDownloadBtn.addEventListener("click", () => {
  if (lastPhBlob) downloadBlob(lastPhBlob, lastPhFilename);
});

function isSvgFile(file: File): boolean {
  return (
    file.type === "image/svg+xml" ||
    file.name.toLowerCase().endsWith(".svg")
  );
}

function svgStemFromFilename(name: string): string {
  return name.replace(/\.svg$/i, "") || "image";
}

function setSvgMode(mode: "optimize" | "raster"): void {
  svgMode = mode;
  svgModeTabs.forEach((tab) => {
    const on = tab.dataset.svgMode === mode;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
  });
  svgPanelOptimize.hidden = mode !== "optimize";
  svgPanelRaster.hidden = mode !== "raster";
  if (lastSvgRaw) {
    if (mode === "optimize") void processSvgOptimize();
    else void processSvgRaster();
  }
}

function updateSvgRasterBgVisibility(): void {
  const isJpeg = svgRasterFormat.value === "jpeg";
  svgRasterBgLabel.hidden = !isJpeg;
}

function clearSvgRasterPreview(): void {
  if (svgRasterPreviewUrl) {
    URL.revokeObjectURL(svgRasterPreviewUrl);
    svgRasterPreviewUrl = null;
  }
  svgRasterPreview.removeAttribute("src");
  svgRasterPreviewWrap.hidden = true;
  svgRasterMeta.textContent = "";
  lastRasterBlob = null;
  svgRasterDownloadBtn.disabled = true;
}

async function processSvgOptimize(): Promise<void> {
  if (!lastSvgRaw) return;

  setStatus(svgStatus, "最適化中…", "loading");
  svgCopyBtn.disabled = true;
  svgDownloadBtn.disabled = true;
  svgOutput.value = "";
  svgStatsEl.hidden = true;

  try {
    const raw = lastSvgRaw;
    const optimized = optimize_svg(raw);

    svgOutput.value = optimized;
    lastSvgFilename = `${lastSvgStem}.optimized.svg`;

    const ratioNum = raw.length > 0 ? (optimized.length / raw.length) * 100 : 100;
    const ratio = raw.length > 0 ? ratioNum.toFixed(1) : "—";

    svgStatBefore.textContent = `${raw.length.toLocaleString()} 文字`;
    svgStatAfter.textContent = `${optimized.length.toLocaleString()} 文字`;
    svgStatRatio.textContent = `${ratio}%`;
    svgStatRatio.classList.toggle("is-good", ratioNum < 100);
    svgStatsEl.hidden = false;

    setStatus(
      svgStatus,
      `${lastSvgStem}.svg — ${raw.length.toLocaleString()} → ${optimized.length.toLocaleString()} 文字`,
      "success",
    );

    svgCopyBtn.disabled = false;
    svgDownloadBtn.disabled = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(svgStatus, `エラー: ${message}`, "error");
  }
}

async function processSvgRaster(): Promise<void> {
  if (!lastSvgRaw) {
    setStatus(svgRasterStatus, "SVG をドロップするか、クリックして選択してください。", "default");
    return;
  }

  setStatus(svgRasterStatus, "ラスタ化中…", "loading");
  setButtonLoading(svgRasterRunBtn, true, "ラスタ化中…");
  svgRasterDownloadBtn.disabled = true;
  clearSvgRasterPreview();

  try {
    const format = svgRasterFormat.value as OutputFormat;
    const quality = Number(svgRasterQuality.value);
    const scale = Number(svgRasterScale.value);
    const maxWidth = parseOptionalSize(svgRasterMaxWidth);
    const maxHeight = parseOptionalSize(svgRasterMaxHeight);
    const background =
      format === "jpeg" ? svgRasterBg.value.trim() || "#ffffff" : undefined;

    const result = rasterize_svg(
      lastSvgRaw,
      format,
      quality,
      scale,
      maxWidth,
      maxHeight,
      background,
    );

    const blob = new Blob([new Uint8Array(result.data)], { type: MIME[format] });
    lastRasterBlob = blob;
    lastRasterFilename = `${lastSvgStem}.${EXT[format]}`;
    svgRasterPreviewUrl = URL.createObjectURL(blob);
    svgRasterPreview.src = svgRasterPreviewUrl;
    svgRasterPreviewWrap.hidden = false;
    svgRasterMeta.textContent = `${result.width} × ${result.height} · ${format.toUpperCase()} · ${formatBytes(blob.size)}`;

    setStatus(
      svgRasterStatus,
      `${lastSvgStem}.svg → ${result.width}×${result.height} ${format.toUpperCase()} (${formatBytes(blob.size)})`,
      "success",
    );
    svgRasterDownloadBtn.disabled = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(svgRasterStatus, `エラー: ${message}`, "error");
  } finally {
    setButtonLoading(svgRasterRunBtn, false);
  }
}

async function processSvgFile(file: File): Promise<void> {
  if (!isSvgFile(file)) {
    const msg = "SVG ファイルを選択してください。";
    setStatus(svgStatus, msg, "error");
    setStatus(svgRasterStatus, msg, "error");
    return;
  }

  updateDropZoneSingle(svgDropZone, file, DROP_HINT_SINGLE);

  try {
    lastSvgRaw = await file.text();
    lastSvgStem = svgStemFromFilename(file.name);
    svgRasterRunBtn.disabled = false;

    if (svgMode === "optimize") {
      await processSvgOptimize();
    } else {
      await processSvgRaster();
    }
  } catch (err) {
    lastSvgRaw = null;
    svgRasterRunBtn.disabled = true;
    const message = err instanceof Error ? err.message : String(err);
    setStatus(svgStatus, `エラー: ${message}`, "error");
    setStatus(svgRasterStatus, `エラー: ${message}`, "error");
    updateDropZoneSingle(svgDropZone, null, DROP_HINT_SINGLE);
  }
}

svgModeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const mode = tab.dataset.svgMode as "optimize" | "raster" | undefined;
    if (mode) setSvgMode(mode);
  });
});

svgRasterScale.addEventListener("input", () => {
  svgRasterScaleValue.textContent = svgRasterScale.value;
});
svgRasterQuality.addEventListener("input", () => {
  svgRasterQualityValue.textContent = svgRasterQuality.value;
});
svgRasterFormat.addEventListener("change", updateSvgRasterBgVisibility);
updateSvgRasterBgVisibility();

svgRasterBgPicker.addEventListener("input", () => {
  svgRasterBg.value = svgRasterBgPicker.value;
});
svgRasterBg.addEventListener("input", () => {
  const v = svgRasterBg.value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) svgRasterBgPicker.value = v;
});

const debouncedSvgRaster = debounce(() => {
  if (lastSvgRaw && svgMode === "raster") void processSvgRaster();
}, 400);

svgRasterScale.addEventListener("change", debouncedSvgRaster);
svgRasterMaxWidth.addEventListener("change", debouncedSvgRaster);
svgRasterMaxHeight.addEventListener("change", debouncedSvgRaster);
svgRasterFormat.addEventListener("change", debouncedSvgRaster);
svgRasterQuality.addEventListener("change", debouncedSvgRaster);
svgRasterBg.addEventListener("change", debouncedSvgRaster);

svgRasterRunBtn.addEventListener("click", () => void processSvgRaster());

svgRasterDownloadBtn.addEventListener("click", () => {
  if (lastRasterBlob) downloadBlob(lastRasterBlob, lastRasterFilename);
});

svgCopyBtn.addEventListener("click", async () => {
  if (!svgOutput.value) return;
  await navigator.clipboard.writeText(svgOutput.value);
  showToast("クリップボードにコピーしました");
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
  spriteDropZone.classList.toggle("has-file", spriteFiles.length > 0);
  renderFileList(spriteFileListEl, spriteFiles, (index) => {
    spriteFiles.splice(index, 1);
    setSpriteFiles(spriteFiles);
  });
  setStatus(
    spriteStatus,
    spriteFiles.length > 0
      ? `${spriteFiles.length} 件選択 — 「スプライトを生成」を押してください`
      : "",
  );
}

function runSpritePack(): void {
  if (spriteFiles.length === 0) return;

  setStatus(spriteStatus, "スプライトを生成中…", "loading");
  setButtonLoading(spriteRunBtn, true, "生成中…");
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

      setStatus(
        spriteStatus,
        [
          `${spriteFiles.length} 画像 → ${result.width} × ${result.height}px シート`,
          `画像 ${formatBytes(result.image.byteLength)} / CSS ${result.css.length.toLocaleString()} 文字`,
        ].join("\n"),
        "success",
      );

      spriteDlImageBtn.disabled = false;
      spriteDlCssBtn.disabled = false;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(spriteStatus, `エラー: ${message}`, "error");
    } finally {
      setButtonLoading(spriteRunBtn, false);
      spriteRunBtn.disabled = spriteFiles.length === 0;
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
  batchDropZone.classList.toggle("has-file", batchFiles.length > 0);
  renderFileList(batchFileListEl, batchFiles, (index) => {
    batchFiles.splice(index, 1);
    setBatchFiles(batchFiles);
  });
  setStatus(
    batchStatus,
    batchFiles.length > 0
      ? `${batchFiles.length} 件選択 — 設定を確認して「ZIP を生成」`
      : "",
  );
}

batchQualityInput.addEventListener("input", () => {
  batchQualityValue.textContent = batchQualityInput.value;
});

batchPreserveNamesInput.addEventListener("change", syncBatchPrefixField);
syncBatchPrefixField();

function runBatchZip(): void {
  if (batchFiles.length === 0) return;

  setStatus(batchStatus, "ZIP を生成中…", "loading");
  setButtonLoading(batchRunBtn, true, "生成中…");
  batchDownloadBtn.disabled = true;
  lastBatchBlob = null;

  void (async () => {
    try {
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

      setStatus(
        batchStatus,
        [
          `${batchFiles.length} ファイル → ZIP ${formatBytes(zipBytes.byteLength)}`,
          `入力合計 ${formatBytes(inputTotal)}`,
          preserveNames ? "元ファイル名を保持" : `${batchPrefixInput.value || "image"}_01.* 形式`,
        ].join("\n"),
        "success",
      );
      showToast("ZIP の生成が完了しました");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus(batchStatus, `エラー: ${message}`, "error");
    } finally {
      setButtonLoading(batchRunBtn, false);
      batchRunBtn.disabled = batchFiles.length === 0;
    }
  })();
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
    setStatus(statusEl, "画像ファイルを選択してください。", "error");
    return;
  }

  lastConvertFile = file;
  updateDropZoneSingle(dropZone, file, DROP_HINT_SINGLE);

  const format = formatSelect.value as OutputFormat;
  const quality = Number(qualityInput.value);
  const maxWidth = parseOptionalSize(maxWidthInput);
  const maxHeight = parseOptionalSize(maxHeightInput);

  setStatus(statusEl, "変換中…", "loading");
  setButtonLoading(downloadBtn, true, "変換中…");
  lastBlob = null;
  hideSizeCompare();
  convertPreviewWrap.hidden = true;

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

    if (convertPreviewUrl) URL.revokeObjectURL(convertPreviewUrl);
    convertPreviewUrl = URL.createObjectURL(lastBlob);
    convertPreview.src = convertPreviewUrl;
    convertPreviewWrap.hidden = false;

    setStatus(
      statusEl,
      `${file.name} → ${format.toUpperCase()}（品質 ${quality}）`,
      "success",
    );

    setButtonLoading(downloadBtn, false, "変換結果をダウンロード");
    downloadBtn.disabled = false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(statusEl, `エラー: ${message}`, "error");
    hideSizeCompare();
    updateDropZoneSingle(dropZone, null, DROP_HINT_SINGLE);
    lastConvertFile = null;
    setButtonLoading(downloadBtn, false, "変換結果をダウンロード");
    downloadBtn.disabled = true;
  }
}

downloadBtn.addEventListener("click", () => {
  if (lastBlob) {
    downloadBlob(lastBlob, lastFilename);
    showToast(`${lastFilename} をダウンロードしました`);
  }
});

// Re-convert when settings change if a file is already loaded
function reconvertIfReady(): void {
  if (lastConvertFile) void processFile(lastConvertFile);
}

formatSelect.addEventListener("change", reconvertIfReady);
maxWidthInput.addEventListener("change", reconvertIfReady);
maxHeightInput.addEventListener("change", reconvertIfReady);
qualityInput.addEventListener("input", debounce(reconvertIfReady, 350));

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
  setStatus(editorStatus, "読み込み中…", "loading");
  updateDropZoneSingle(editorDropZone, file, DROP_HINT_SINGLE);

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
    setStatus(editorStatus, `${file.name} — 枠をドラッグして編集`, "success");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(editorStatus, `エラー: ${message}`, "error");
    updateDropZoneSingle(editorDropZone, null, DROP_HINT_SINGLE);
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
  setStatus(editorStatus, "");
  updateDropZoneSingle(editorDropZone, null, DROP_HINT_SINGLE);
  editorFileInput.value = "";
});

editorDownloadBtn.addEventListener("click", () => {
  const buffer = imageEditor.getSourceBuffer();
  if (!buffer) return;

  const format = editorFormat.value as OutputFormat;
  const params = imageEditor.getParams();
  const { crop, rotation, outputWidth, outputHeight } = params;

  setStatus(editorStatus, "エクスポート中…", "loading");

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
    const fname = editorOutputBasename(imageEditor.getFileName(), format);
    downloadBlob(blob, fname);
    setStatus(editorStatus, `エクスポート完了 — ${formatBytes(output.byteLength)}`, "success");
    showToast(`${fname} をダウンロードしました`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(editorStatus, `エラー: ${message}`, "error");
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

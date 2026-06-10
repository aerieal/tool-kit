export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EditParams {
  crop: CropRect;
  rotation: number;
  outputWidth: number | null;
  outputHeight: number | null;
}

export type EditChangeHandler = (params: EditParams) => void;

type HandleId =
  | "move"
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "rotate";

const MIN_CROP = 24;
const HANDLE_RADIUS = 7;
const ROT_HANDLE_OFFSET = 36;
const OVERLAY_ALPHA = 0.48;

export class ImageEditor {
  private readonly stage: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly onChange: EditChangeHandler;
  private readonly resizeObserver: ResizeObserver;

  private image: HTMLImageElement | null = null;
  private sourceBuffer: Uint8Array | null = null;
  private fileName = "edited.png";
  private iw = 0;
  private ih = 0;
  private crop: CropRect = { x: 0, y: 0, w: 0, h: 0 };
  private rotation = 0;
  private outputWidth: number | null = null;
  private outputHeight: number | null = null;
  private scale = 1;
  private centerX = 0;
  private centerY = 0;

  private activeHandle: HandleId | null = null;
  private dragStartImage = { x: 0, y: 0 };
  private dragStartScreen = { x: 0, y: 0 };
  private dragStartCrop: CropRect = { x: 0, y: 0, w: 0, h: 0 };
  private dragStartRotation = 0;
  private aspectLock = false;

  constructor(
    stage: HTMLElement,
    canvas: HTMLCanvasElement,
    onChange: EditChangeHandler,
  ) {
    this.stage = stage;
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;
    this.onChange = onChange;

    this.resizeObserver = new ResizeObserver(() => this.layoutAndDraw());
    this.resizeObserver.observe(stage);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
  }

  async loadFile(file: File): Promise<void> {
    if (!file.type.startsWith("image/")) {
      throw new Error("画像ファイルを選択してください");
    }

    const buffer = await file.arrayBuffer();
    this.sourceBuffer = new Uint8Array(buffer);
    this.fileName = file.name;

    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      this.image = img;
      this.iw = img.naturalWidth;
      this.ih = img.naturalHeight;
      this.crop = { x: 0, y: 0, w: this.iw, h: this.ih };
      this.rotation = 0;
      this.outputWidth = null;
      this.outputHeight = null;
      this.layoutAndDraw();
      this.emitChange();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  reset(): void {
    this.image = null;
    this.sourceBuffer = null;
    this.iw = 0;
    this.ih = 0;
    this.crop = { x: 0, y: 0, w: 0, h: 0 };
    this.rotation = 0;
    this.outputWidth = null;
    this.outputHeight = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  hasImage(): boolean {
    return this.image !== null;
  }

  getSourceBuffer(): Uint8Array | null {
    return this.sourceBuffer;
  }

  getFileName(): string {
    return this.fileName;
  }

  getParams(): EditParams {
    return {
      crop: { ...this.crop },
      rotation: this.rotation,
      outputWidth: this.outputWidth,
      outputHeight: this.outputHeight,
    };
  }

  setRotation(deg: number): void {
    this.rotation = normalizeAngle(deg);
    this.layoutAndDraw();
    this.emitChange();
  }

  setOutputSize(width: number | null, height: number | null): void {
    this.outputWidth = width;
    this.outputHeight = height;
    this.layoutAndDraw();
    this.emitChange();
  }

  /** プレビュー用に編集結果を Canvas に描画 */
  drawPreview(target: HTMLCanvasElement): void {
    if (!this.image) return;
    const ctx = target.getContext("2d");
    if (!ctx) return;

    const { w: cw, h: ch } = this.crop;
    if (cw <= 0 || ch <= 0) return;

    const rad = (this.rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const rotW = Math.ceil(cw * cos + ch * sin);
    const rotH = Math.ceil(cw * sin + ch * cos);

    const outW = this.outputWidth ?? rotW;
    const outH = this.outputHeight ?? rotH;
    const dpr = window.devicePixelRatio || 1;
    target.width = Math.max(1, Math.round(outW * dpr));
    target.height = Math.max(1, Math.round(outH * dpr));

    const { displayW, displayH } = this.computePreviewDisplaySize(
      outW,
      outH,
      target.parentElement,
    );
    target.style.width = `${displayW}px`;
    target.style.height = `${displayH}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, outW, outH);

    const temp = document.createElement("canvas");
    temp.width = cw;
    temp.height = ch;
    const tctx = temp.getContext("2d");
    if (!tctx) return;

    tctx.drawImage(
      this.image,
      this.crop.x,
      this.crop.y,
      cw,
      ch,
      0,
      0,
      cw,
      ch,
    );

    const rotCanvas = document.createElement("canvas");
    rotCanvas.width = Math.ceil(rotW);
    rotCanvas.height = Math.ceil(rotH);
    const rctx = rotCanvas.getContext("2d");
    if (!rctx) return;

    rctx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
    rctx.rotate(rad);
    rctx.drawImage(temp, -cw / 2, -ch / 2);

    ctx.drawImage(rotCanvas, 0, 0, rotCanvas.width, rotCanvas.height, 0, 0, outW, outH);
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
  }

  private emitChange(): void {
    this.onChange(this.getParams());
  }

  private layoutAndDraw(): void {
    if (!this.image) return;

    const rect = this.stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));

    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const padding = 24;
    this.scale = Math.min((w - padding * 2) / this.iw, (h - padding * 2) / this.ih);
    this.centerX = w / 2;
    this.centerY = h / 2;

    this.draw();
    this.drawPreviewThrottled();
  }

  private computePreviewDisplaySize(
    outW: number,
    outH: number,
    frame: HTMLElement | null,
  ): { displayW: number; displayH: number } {
    const padding = 16;
    const maxHeight = 240;
    const availW = frame ? Math.max(1, frame.clientWidth - padding) : outW;
    const availH = Math.max(1, maxHeight - padding);
    const scale = Math.min(1, availW / outW, availH / outH);
    return {
      displayW: Math.max(1, Math.round(outW * scale)),
      displayH: Math.max(1, Math.round(outH * scale)),
    };
  }

  private draw(): void {
    const ctx = this.ctx;
    const { width: cw, height: ch } = this.canvas;
    const w = cw / (window.devicePixelRatio || 1);
    const h = ch / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#e8edf4";
    ctx.fillRect(0, 0, w, h);

    if (!this.image) return;

    const rad = (this.rotation * Math.PI) / 180;
    const ccx = this.crop.x + this.crop.w / 2;
    const ccy = this.crop.y + this.crop.h / 2;
    const cropScreen = this.cropToScreen();

    ctx.save();
    ctx.translate(this.centerX, this.centerY);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.iw / 2, -this.ih / 2);
    ctx.drawImage(this.image, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${OVERLAY_ALPHA})`;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillRect(cropScreen.x, cropScreen.y, cropScreen.w, cropScreen.h);
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(cropScreen.x, cropScreen.y, cropScreen.w, cropScreen.h);
    ctx.clip();
    ctx.save();
    ctx.translate(this.centerX, this.centerY);
    ctx.scale(this.scale, this.scale);
    ctx.translate(ccx, ccy);
    ctx.rotate(rad);
    ctx.translate(-ccx, -ccy);
    ctx.translate(-this.iw / 2, -this.ih / 2);
    ctx.drawImage(this.image, 0, 0);
    ctx.restore();
    ctx.restore();

    ctx.strokeStyle = "#0b57d0";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(cropScreen.x, cropScreen.y, cropScreen.w, cropScreen.h);

    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = 1;
    ctx.strokeRect(cropScreen.x, cropScreen.y, cropScreen.w, cropScreen.h);
    ctx.setLineDash([]);

    this.drawHandles();
    this.drawRotationHandle();
  }

  private drawHandles(): void {
    const corners = cropCorners(this.crop);
    const edges = cropEdgeCenters(this.crop);

    for (const pt of [...corners, ...edges]) {
      const s = this.imageToScreen(pt.x, pt.y);
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, HANDLE_RADIUS, 0, Math.PI * 2);
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fill();
      this.ctx.strokeStyle = "#0b57d0";
      this.ctx.lineWidth = 2;
      this.ctx.stroke();
    }
  }

  private drawRotationHandle(): void {
    const cropScreen = this.cropToScreen();
    const topS = { x: cropScreen.x + cropScreen.w / 2, y: cropScreen.y };
    const rotS = { x: topS.x, y: topS.y - ROT_HANDLE_OFFSET };

    this.ctx.beginPath();
    this.ctx.moveTo(topS.x, topS.y);
    this.ctx.lineTo(rotS.x, rotS.y);
    this.ctx.strokeStyle = "#0b57d0";
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(rotS.x, rotS.y, HANDLE_RADIUS + 1, 0, Math.PI * 2);
    this.ctx.fillStyle = "#0b57d0";
    this.ctx.fill();
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
  }

  private cropToScreen(): { x: number; y: number; w: number; h: number } {
    return {
      x: this.centerX + (this.crop.x - this.iw / 2) * this.scale,
      y: this.centerY + (this.crop.y - this.ih / 2) * this.scale,
      w: this.crop.w * this.scale,
      h: this.crop.h * this.scale,
    };
  }

  private imageToScreen(ix: number, iy: number): { x: number; y: number } {
    return {
      x: this.centerX + (ix - this.iw / 2) * this.scale,
      y: this.centerY + (iy - this.ih / 2) * this.scale,
    };
  }

  private screenToImage(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.centerX) / this.scale + this.iw / 2,
      y: (sy - this.centerY) / this.scale + this.ih / 2,
    };
  }

  private hitTest(sx: number, sy: number): HandleId | null {
    const rotS = this.rotationHandleScreenPos();
    if (dist(sx, sy, rotS.x, rotS.y) <= HANDLE_RADIUS + 6) return "rotate";

    const handles: { id: HandleId; x: number; y: number }[] = [
      { id: "nw", ...cropCorners(this.crop)[0] },
      { id: "n", ...cropEdgeCenters(this.crop)[0] },
      { id: "ne", ...cropCorners(this.crop)[1] },
      { id: "e", ...cropEdgeCenters(this.crop)[1] },
      { id: "se", ...cropCorners(this.crop)[2] },
      { id: "s", ...cropEdgeCenters(this.crop)[2] },
      { id: "sw", ...cropCorners(this.crop)[3] },
      { id: "w", ...cropEdgeCenters(this.crop)[3] },
    ];

    for (const h of handles) {
      const p = this.imageToScreen(h.x, h.y);
      if (dist(sx, sy, p.x, p.y) <= HANDLE_RADIUS + 4) return h.id;
    }

    const img = this.screenToImage(sx, sy);
    if (
      img.x >= this.crop.x &&
      img.x <= this.crop.x + this.crop.w &&
      img.y >= this.crop.y &&
      img.y <= this.crop.y + this.crop.h
    ) {
      return "move";
    }

    return null;
  }

  private rotationHandleScreenPos(): { x: number; y: number } {
    const cropScreen = this.cropToScreen();
    return {
      x: cropScreen.x + cropScreen.w / 2,
      y: cropScreen.y - ROT_HANDLE_OFFSET,
    };
  }

  private pointerPos(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.image) return;
    const pos = this.pointerPos(e);
    const handle = this.hitTest(pos.x, pos.y);
    if (!handle) return;

    this.activeHandle = handle;
    this.dragStartImage = this.screenToImage(pos.x, pos.y);
    this.dragStartScreen = { ...pos };
    this.dragStartCrop = { ...this.crop };
    this.dragStartRotation = this.rotation;
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = cursorForHandle(handle);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.image) return;

    const pos = this.pointerPos(e);

    if (!this.activeHandle) {
      const handle = this.hitTest(pos.x, pos.y);
      this.canvas.style.cursor = handle ? cursorForHandle(handle) : "default";
      return;
    }

    const current = this.screenToImage(pos.x, pos.y);

    if (this.activeHandle === "move") {
      const dx = current.x - this.dragStartImage.x;
      const dy = current.y - this.dragStartImage.y;
      this.crop = clampCrop(
        {
          x: this.dragStartCrop.x + dx,
          y: this.dragStartCrop.y + dy,
          w: this.dragStartCrop.w,
          h: this.dragStartCrop.h,
        },
        this.iw,
        this.ih,
      );
    } else if (this.activeHandle === "rotate") {
      const cropScreen = this.cropToScreen();
      const cx = cropScreen.x + cropScreen.w / 2;
      const cy = cropScreen.y + cropScreen.h / 2;
      const a0 = Math.atan2(
        this.dragStartScreen.y - cy,
        this.dragStartScreen.x - cx,
      );
      const a1 = Math.atan2(pos.y - cy, pos.x - cx);
      this.rotation = normalizeAngle(
        this.dragStartRotation + ((a1 - a0) * 180) / Math.PI,
      );
    } else {
      this.crop = resizeCrop(
        this.dragStartCrop,
        this.activeHandle,
        current,
        this.iw,
        this.ih,
        this.aspectLock,
      );
    }

    this.draw();
    this.drawPreviewThrottled();
    this.emitChange();
  };

  private previewRaf = 0;
  private drawPreviewThrottled(): void {
    if (this.previewRaf) return;
    this.previewRaf = requestAnimationFrame(() => {
      this.previewRaf = 0;
      const preview = document.querySelector<HTMLCanvasElement>("#editor-preview");
      if (preview) this.drawPreview(preview);
    });
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (this.activeHandle) {
      this.canvas.releasePointerCapture(e.pointerId);
      this.activeHandle = null;
      this.canvas.style.cursor = "default";
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Shift") this.aspectLock = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === "Shift") this.aspectLock = false;
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = url;
  });
}

function normalizeAngle(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return Math.round(d * 10) / 10;
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

function cropCorners(c: CropRect): { x: number; y: number }[] {
  return [
    { x: c.x, y: c.y },
    { x: c.x + c.w, y: c.y },
    { x: c.x + c.w, y: c.y + c.h },
    { x: c.x, y: c.y + c.h },
  ];
}

function cropEdgeCenters(c: CropRect): { x: number; y: number }[] {
  return [
    { x: c.x + c.w / 2, y: c.y },
    { x: c.x + c.w, y: c.y + c.h / 2 },
    { x: c.x + c.w / 2, y: c.y + c.h },
    { x: c.x, y: c.y + c.h / 2 },
  ];
}

function clampCrop(c: CropRect, maxW: number, maxH: number): CropRect {
  const w = Math.max(MIN_CROP, Math.min(c.w, maxW));
  const h = Math.max(MIN_CROP, Math.min(c.h, maxH));
  const x = Math.max(0, Math.min(c.x, maxW - w));
  const y = Math.max(0, Math.min(c.y, maxH - h));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function resizeCrop(
  start: CropRect,
  handle: HandleId,
  pointer: { x: number; y: number },
  maxW: number,
  maxH: number,
  lockAspect: boolean,
): CropRect {
  let { x, y, w, h } = start;
  const aspect = start.w / start.h;

  const px = pointer.x;
  const py = pointer.y;

  if (handle === "e" || handle === "ne" || handle === "se") {
    w = px - x;
  }
  if (handle === "w" || handle === "nw" || handle === "sw") {
    const newX = px;
    w = x + w - newX;
    x = newX;
  }
  if (handle === "s" || handle === "se" || handle === "sw") {
    h = py - y;
  }
  if (handle === "n" || handle === "ne" || handle === "nw") {
    const newY = py;
    h = y + h - newY;
    y = newY;
  }

  if (lockAspect && aspect > 0) {
    if (handle === "e" || handle === "w") {
      h = w / aspect;
    } else if (handle === "n" || handle === "s") {
      w = h * aspect;
    } else {
      h = w / aspect;
    }
  }

  if (w < MIN_CROP) w = MIN_CROP;
  if (h < MIN_CROP) h = MIN_CROP;

  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  if (x + w > maxW) w = maxW - x;
  if (y + h > maxH) h = maxH - y;

  return clampCrop({ x, y, w, h }, maxW, maxH);
}

function cursorForHandle(handle: HandleId): string {
  switch (handle) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "rotate":
      return "grab";
    case "move":
      return "move";
    default:
      return "default";
  }
}

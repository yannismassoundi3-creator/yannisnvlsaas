/**
 * Browser side of item photos: decoding a picked file, framing and resizing
 * with Canvas 2D, running the enhancement (./enhance.ts) and exporting JPEG
 * files. Client components only; nothing here leaves the device.
 */
import { centerSquare, enhance, fitWithin, PHOTO_SIZES, type Rect } from "./enhance";

export class PhotoDecodeError extends Error {
  constructor() {
    super("photo_decode_failed");
    this.name = "PhotoDecodeError";
  }
}

type Source = ImageBitmap | HTMLImageElement;

const sourceSize = (s: Source) => ({ width: "naturalWidth" in s ? s.naturalWidth : s.width, height: "naturalHeight" in s ? s.naturalHeight : s.height });

/** Decodes a picked file (orientation from EXIF applied). HEIC is not supported by every browser. */
export async function decodePhoto(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall back to an <img> element below (older Safari).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new PhotoDecodeError();
    return img;
  } catch {
    throw new PhotoDecodeError();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

function context(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new PhotoDecodeError();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

/** Draws `rect` of the source into a canvas of at most maxSide pixels on its longest side. */
function draw(source: Source | HTMLCanvasElement, rect: Rect, maxSide: number): HTMLCanvasElement {
  const size = fitWithin(rect.width, rect.height, maxSide);
  const c = canvas(size.width, size.height);
  context(c).drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, size.width, size.height);
  return c;
}

export function toJpeg(c: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new PhotoDecodeError())), "image/jpeg", quality));
}

export type ProcessedPhoto = {
  /** Framed and resized, before enhancement (for the before/after view). */
  before: Blob;
  /** Enhanced JPEG (1,600 px max side, quality 0.85). */
  after: Blob;
  /** Enhanced canvas, reused for the AI copy and the thumbnail. */
  canvas: HTMLCanvasElement;
};

/** Frames (square or original), resizes to 1,600 px and enhances one photo. */
export async function processPhoto(source: Source, square: boolean): Promise<ProcessedPhoto> {
  const { width, height } = sourceSize(source);
  const rect = square ? centerSquare(width, height) : { x: 0, y: 0, width, height };
  const framed = draw(source, rect, PHOTO_SIZES.enhanced);
  const ctx = context(framed);
  const before = await toJpeg(framed, PHOTO_SIZES.enhancedQuality);
  const pixels = ctx.getImageData(0, 0, framed.width, framed.height);
  const enhanced = enhance(pixels);
  const out = canvas(framed.width, framed.height);
  context(out).putImageData(new ImageData(new Uint8ClampedArray(enhanced.data), enhanced.width, enhanced.height), 0, 0);
  const after = await toJpeg(out, PHOTO_SIZES.enhancedQuality);
  return { before, after, canvas: out };
}

/** Copy of an enhanced photo for the AI (1,024 px max side, JPEG 0.8), as base64 without the data: prefix. */
export async function aiCopy(enhanced: HTMLCanvasElement): Promise<string> {
  const c = draw(enhanced, { x: 0, y: 0, width: enhanced.width, height: enhanced.height }, PHOTO_SIZES.ai);
  return blobToBase64(await toJpeg(c, PHOTO_SIZES.aiQuality));
}

/** Square 480 px thumbnail of an enhanced photo (JPEG), kept under the bucket's 300 KB limit. */
export async function thumbnail(enhanced: HTMLCanvasElement): Promise<Blob> {
  const c = draw(enhanced, centerSquare(enhanced.width, enhanced.height), PHOTO_SIZES.thumbnail);
  let quality: number = PHOTO_SIZES.thumbnailQuality;
  let blob = await toJpeg(c, quality);
  while (blob.size > 250_000 && quality > 0.4) {
    quality -= 0.15;
    blob = await toJpeg(c, quality);
  }
  return blob;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

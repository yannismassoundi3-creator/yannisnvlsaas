/**
 * Photo enhancement for item photos, run in the browser on a Canvas 2D
 * ImageData. Pure functions (no DOM), so they are unit-tested with synthetic
 * pixels.
 *
 * Only light, colour balance, contrast, sharpness and framing are adjusted,
 * always gently and within fixed limits: the goal is a photo that shows the
 * item as it really is (defects and true colours stay visible), not a
 * flattering one. Nothing is removed, retouched or invented.
 */

/** Same shape as the browser's ImageData (RGBA, 8 bits per channel). */
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

export type EnhanceOptions = {
  /** Fraction of the darkest / brightest pixels ignored when stretching levels. */
  clipLow: number;
  clipHigh: number;
  /** Largest levels gain per channel (1.8 = at most 80 % more range). */
  maxLevelsGain: number;
  /**
   * Share of each channel's own black and white points in the stretch (the rest
   * is common to the three channels). A fully per-channel stretch shifts hues
   * (a blue-gray background turns purple); a small share only trims casts.
   */
  levelsChannelShare: number;
  /** Black point and white point never move beyond these values. */
  maxBlackPoint: number;
  minWhitePoint: number;
  /** Mean luminance (0-1) targeted by the exposure step, and the gamma limits. */
  targetLuminance: number;
  minGamma: number;
  maxGamma: number;
  /** Share of the gray-world correction applied, and the largest gain change per channel. */
  whiteBalanceStrength: number;
  maxWhiteBalanceGain: number;
  /** Linear contrast around mid-gray (0.08 = +8 %). */
  contrast: number;
  /** Unsharp mask amount and the minimum difference (noise threshold). */
  sharpenAmount: number;
  sharpenThreshold: number;
};

export const DEFAULT_ENHANCE: EnhanceOptions = {
  clipLow: 0.005,
  clipHigh: 0.995,
  maxLevelsGain: 1.8,
  levelsChannelShare: 0.3,
  maxBlackPoint: 48,
  minWhitePoint: 170,
  targetLuminance: 0.48,
  minGamma: 0.65,
  maxGamma: 1.25,
  whiteBalanceStrength: 0.6,
  maxWhiteBalanceGain: 0.12,
  contrast: 0.06,
  sharpenAmount: 0.45,
  sharpenThreshold: 3,
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function clonePixels(img: Pixels): Pixels {
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
}

/** Value below which `fraction` of the samples fall, from a 256-bin histogram. */
function percentile(hist: Uint32Array, total: number, fraction: number): number {
  const target = fraction * total;
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen > target) return v;
  }
  return 255;
}

/** Per-channel histograms of R, G and B (alpha ignored). */
export function histograms(img: Pixels): [Uint32Array, Uint32Array, Uint32Array] {
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    r[d[i]]++;
    g[d[i + 1]]++;
    b[d[i + 2]]++;
  }
  return [r, g, b];
}

/** Black and white points of each channel at the given percentiles. */
export function channelPercentiles(img: Pixels, low: number, high: number): { low: [number, number, number]; high: [number, number, number] } {
  const total = img.width * img.height;
  const hs = histograms(img);
  return {
    low: hs.map((h) => percentile(h, total, low)) as [number, number, number],
    high: hs.map((h) => percentile(h, total, high)) as [number, number, number],
  };
}

/**
 * Lookup table of a levels stretch for one channel: [lo, hi] → [0, 255], with
 * the black point, white point and gain clamped so a nearly uniform photo (a
 * white T-shirt on a white sheet) is not blown out.
 */
export function levelsTable(lo: number, hi: number, o: Pick<EnhanceOptions, "maxLevelsGain" | "maxBlackPoint" | "minWhitePoint">): Uint8ClampedArray {
  const black = clamp(lo, 0, o.maxBlackPoint);
  let white = clamp(hi, o.minWhitePoint, 255);
  if (white - black < 1) white = black + 1;
  const gain = Math.min(255 / (white - black), o.maxLevelsGain);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round((v - black) * gain);
  return lut;
}

function applyTables(img: Pixels, r: ArrayLike<number>, g: ArrayLike<number>, b: ArrayLike<number>): Pixels {
  const out = clonePixels(img);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r[d[i]];
    d[i + 1] = g[d[i + 1]];
    d[i + 2] = b[d[i + 2]];
  }
  return out;
}

/**
 * Auto levels: percentile-based stretch of each channel, clamped. Each
 * channel's points are mostly the common ones (darkest and brightest of the
 * three), so colours keep their hue.
 */
export function autoLevels(img: Pixels, o: EnhanceOptions = DEFAULT_ENHANCE): Pixels {
  const p = channelPercentiles(img, o.clipLow, o.clipHigh);
  const commonLow = Math.min(...p.low);
  const commonHigh = Math.max(...p.high);
  const share = clamp(o.levelsChannelShare, 0, 1);
  const [r, g, b] = [0, 1, 2].map((c) => levelsTable(commonLow + share * (p.low[c] - commonLow), commonHigh + share * (p.high[c] - commonHigh), o));
  return applyTables(img, r, g, b);
}

/** Mean luminance (Rec. 709 weights) between 0 and 1. */
export function meanLuminance(img: Pixels): number {
  const d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const n = d.length / 4;
  return n ? sum / n / 255 : 0;
}

/**
 * Exposure: a gamma that moves the mean luminance towards the target, within
 * [minGamma, maxGamma] (a dark photo gets brighter, never washed out).
 */
export function exposureGamma(mean: number, o: Pick<EnhanceOptions, "targetLuminance" | "minGamma" | "maxGamma"> = DEFAULT_ENHANCE): number {
  if (mean <= 0.001 || mean >= 0.999) return 1;
  // mean^gamma = target  →  gamma = ln(target) / ln(mean)
  return clamp(Math.log(o.targetLuminance) / Math.log(mean), o.minGamma, o.maxGamma);
}

export function adjustExposure(img: Pixels, o: EnhanceOptions = DEFAULT_ENHANCE): Pixels {
  const gamma = exposureGamma(meanLuminance(img), o);
  if (Math.abs(gamma - 1) < 0.01) return clonePixels(img);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(v / 255, gamma));
  return applyTables(img, lut, lut, lut);
}

/**
 * Gains of a gentle gray-world white balance. Only fairly neutral mid-tone
 * pixels are averaged (very dark, very bright and strongly coloured pixels are
 * ignored), so a red dress does not turn the photo cyan; then only part of the
 * correction is applied and each gain stays within ±maxWhiteBalanceGain, so
 * the true colours of the item are preserved.
 */
export function whiteBalanceGains(img: Pixels, o: Pick<EnhanceOptions, "whiteBalanceStrength" | "maxWhiteBalanceGain"> = DEFAULT_ENHANCE): [number, number, number] {
  const d = img.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const max = Math.max(d[i], d[i + 1], d[i + 2]);
    const min = Math.min(d[i], d[i + 1], d[i + 2]);
    if (max < 24 || min > 245) continue;
    // Saturation in HSV terms; skip vivid pixels (the item's own colours).
    if ((max - min) / max > 0.45) continue;
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    n++;
  }
  if (n < (d.length / 4) * 0.02 || r === 0 || g === 0 || b === 0) return [1, 1, 1];
  const gray = (r + g + b) / 3;
  return [r, g, b].map((sum) => {
    const full = gray / sum;
    return clamp(1 + o.whiteBalanceStrength * (full - 1), 1 - o.maxWhiteBalanceGain, 1 + o.maxWhiteBalanceGain);
  }) as [number, number, number];
}

export function whiteBalance(img: Pixels, o: EnhanceOptions = DEFAULT_ENHANCE): Pixels {
  const gains = whiteBalanceGains(img, o);
  const [r, g, b] = gains.map((k) => {
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) lut[v] = Math.round(v * k);
    return lut;
  });
  return applyTables(img, r, g, b);
}

/** Slight linear contrast around mid-gray. */
export function adjustContrast(img: Pixels, amount: number = DEFAULT_ENHANCE.contrast): Pixels {
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round((v - 128) * (1 + amount) + 128);
  return applyTables(img, lut, lut, lut);
}

/**
 * Unsharp mask with a 3×3 box blur: adds back part of the detail lost by the
 * blur, ignoring differences below the threshold (sensor noise).
 */
export function unsharpMask(img: Pixels, amount: number = DEFAULT_ENHANCE.sharpenAmount, threshold: number = DEFAULT_ENHANCE.sharpenThreshold): Pixels {
  const { width: w, height: h, data: src } = img;
  const out = clonePixels(img);
  if (w < 3 || h < 3 || amount <= 0) return out;
  const d = out.data;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const row = ((y + dy) * w + x) * 4 + c;
          sum += src[row - 4] + src[row] + src[row + 4];
        }
        const diff = src[i + c] - sum / 9;
        if (Math.abs(diff) >= threshold) d[i + c] = Math.round(src[i + c] + amount * diff);
      }
    }
  }
  return out;
}

/** The whole pipeline: levels, exposure, white balance, contrast, sharpening. */
export function enhance(img: Pixels, o: EnhanceOptions = DEFAULT_ENHANCE): Pixels {
  let out = autoLevels(img, o);
  out = adjustExposure(out, o);
  out = whiteBalance(out, o);
  out = adjustContrast(out, o.contrast);
  return unsharpMask(out, o.sharpenAmount, o.sharpenThreshold);
}

// -----------------------------------------------------------------------------
// Framing and sizes (applied with drawImage in the browser)
// -----------------------------------------------------------------------------
export type Rect = { x: number; y: number; width: number; height: number };

/** Largest centred square of a w×h image (the framing Vinted shows in its grid). */
export function centerSquare(width: number, height: number): Rect {
  const side = Math.min(width, height);
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side };
}

/** Size that fits within maxSide on its longest side, never enlarged. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Copies a rectangle of pixels (used by tests; the browser crops with drawImage). */
export function cropPixels(img: Pixels, rect: Rect): Pixels {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const from = ((rect.y + y) * img.width + rect.x) * 4;
    out.set(img.data.subarray(from, from + rect.width * 4), y * rect.width * 4);
  }
  return { data: out, width: rect.width, height: rect.height };
}

/** Sizes used for item photos. */
export const PHOTO_SIZES = {
  /** Enhanced photo the seller downloads or shares. */
  enhanced: 1600,
  enhancedQuality: 0.85,
  /** Copy sent to Claude: smaller to keep input tokens and cost low. */
  ai: 1024,
  aiQuality: 0.8,
  /** Square thumbnail stored with the item. */
  thumbnail: 480,
  thumbnailQuality: 0.8,
  maxPhotos: 3,
} as const;

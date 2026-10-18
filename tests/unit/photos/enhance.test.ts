import { describe, expect, it } from "vitest";
import {
  adjustContrast,
  autoLevels,
  centerSquare,
  cropPixels,
  DEFAULT_ENHANCE,
  enhance,
  exposureGamma,
  fitWithin,
  levelsTable,
  meanLuminance,
  type Pixels,
  unsharpMask,
  whiteBalance,
  whiteBalanceGains,
} from "@/lib/photos/enhance";

/** Synthetic image filled by a function of (x, y). */
function image(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

function channelMeans(img: Pixels): [number, number, number] {
  const sums = [0, 0, 0];
  for (let i = 0; i < img.data.length; i += 4) for (let c = 0; c < 3; c++) sums[c] += img.data[i + c];
  const n = img.data.length / 4;
  return sums.map((s) => s / n) as [number, number, number];
}

// A dark, low-contrast photo: values between 20 and 90 with a gradient and some texture.
const dark = image(64, 48, (x, y) => {
  const v = 20 + Math.round((x / 63) * 60) + ((x + y) % 3) * 3;
  return [v, v + 2, v - 1];
});

// A photo under warm light: a neutral gray scene with a strong orange cast.
const warm = image(40, 40, (x, y) => {
  const v = 90 + ((x * 3 + y * 5) % 60);
  return [Math.min(255, v + 45), v + 10, Math.max(0, v - 35)];
});

describe("photo enhancement", () => {
  it("makes a dark photo brighter, within limits", () => {
    const before = meanLuminance(dark);
    const after = meanLuminance(enhance(dark));
    expect(after).toBeGreaterThan(before + 0.1);
    expect(after).toBeLessThan(0.75);
  });

  it("stretches levels per channel but caps the gain and the black and white points", () => {
    const lut = levelsTable(100, 110, DEFAULT_ENHANCE);
    // Gain capped at 1.8 even though the range is only 10 values wide.
    expect(lut[110] - lut[100]).toBeLessThanOrEqual(Math.ceil(10 * DEFAULT_ENHANCE.maxLevelsGain));
    const flat = image(10, 10, () => [128, 128, 128]);
    const out = autoLevels(flat);
    for (let i = 0; i < out.data.length; i += 4) expect(Math.abs(out.data[i] - 128)).toBeLessThan(110);
  });

  it("keeps the hue of a coloured but neutral-looking scene (no purple blue-gray)", () => {
    // Blue-gray background like a duvet in the evening.
    const blueGray = image(40, 40, (x, y) => {
      const v = 43 + ((x + y) % 30);
      return [v, v + 5, v + 21];
    });
    const [r0, , b0] = channelMeans(blueGray);
    const [r1, g1, b1] = channelMeans(enhance(blueGray));
    // Blue stays the dominant channel and red never overtakes green.
    expect(b1).toBeGreaterThan(r1);
    expect(b1).toBeGreaterThan(g1);
    expect(g1).toBeGreaterThanOrEqual(r1 - 2);
    // The relative blue excess is reduced by less than half: the scene stays blue-gray.
    expect((b1 - r1) / b1).toBeGreaterThan(((b0 - r0) / b0) * 0.5);
  });

  it("limits the exposure gamma", () => {
    expect(exposureGamma(0.05)).toBe(DEFAULT_ENHANCE.minGamma);
    expect(exposureGamma(0.95)).toBe(DEFAULT_ENHANCE.maxGamma);
    expect(exposureGamma(DEFAULT_ENHANCE.targetLuminance)).toBeCloseTo(1, 5);
  });

  it("reduces a colour cast, but only within the clamp", () => {
    const [r0, , b0] = channelMeans(warm);
    const gains = whiteBalanceGains(warm);
    for (const g of gains) {
      expect(g).toBeGreaterThanOrEqual(1 - DEFAULT_ENHANCE.maxWhiteBalanceGain - 1e-9);
      expect(g).toBeLessThanOrEqual(1 + DEFAULT_ENHANCE.maxWhiteBalanceGain + 1e-9);
    }
    const [r1, , b1] = channelMeans(whiteBalance(warm));
    expect(r1 - b1).toBeLessThan(r0 - b0);
    // Still warm: true colours are not forced to gray.
    expect(r1 - b1).toBeGreaterThan((r0 - b0) * 0.5);
  });

  it("leaves vivid colours alone when no neutral pixel is available", () => {
    const red = image(20, 20, () => [200, 20, 30]);
    expect(whiteBalanceGains(red)).toEqual([1, 1, 1]);
  });

  it("keeps every value between 0 and 255", () => {
    const harsh = image(32, 32, (x, y) => ((x + y) % 2 ? [255, 255, 255] : [0, 0, 0]));
    for (const out of [enhance(harsh), enhance(dark), enhance(warm), unsharpMask(harsh, 3, 0), adjustContrast(harsh, 2)]) {
      expect(out.data).toBeInstanceOf(Uint8ClampedArray);
      expect(out.data.length).toBe(harsh.width === out.width ? harsh.data.length : out.data.length);
      for (const v of out.data) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });

  it("does not modify its input", () => {
    const copy = new Uint8ClampedArray(dark.data);
    enhance(dark);
    expect(dark.data).toEqual(copy);
  });

  it("sharpens edges and ignores small differences", () => {
    const edge = image(9, 9, (x) => (x < 4 ? [100, 100, 100] : [140, 140, 140]));
    const out = unsharpMask(edge, 0.5, 3);
    const at = (img: Pixels, x: number, y: number) => img.data[(y * img.width + x) * 4];
    expect(at(out, 3, 4)).toBeLessThan(100);
    expect(at(out, 4, 4)).toBeGreaterThan(140);
    const noise = image(9, 9, (x, y) => ((x + y) % 2 ? [101, 101, 101] : [100, 100, 100]));
    expect(unsharpMask(noise, 0.5, 3).data).toEqual(noise.data);
  });
});

describe("photo framing", () => {
  it("crops the largest centred square", () => {
    expect(centerSquare(4000, 3000)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
    expect(centerSquare(3000, 4000)).toEqual({ x: 0, y: 500, width: 3000, height: 3000 });
    const crop = cropPixels(dark, centerSquare(dark.width, dark.height));
    expect(crop.width).toBe(48);
    expect(crop.height).toBe(48);
    expect(crop.data.length).toBe(48 * 48 * 4);
    // First pixel of the crop is pixel (8, 0) of the source.
    expect(crop.data[0]).toBe(dark.data[8 * 4]);
  });

  it("resizes to 1600 px on the longest side, never enlarging", () => {
    expect(fitWithin(4032, 3024, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 3000, 480)).toEqual({ width: 480, height: 480 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

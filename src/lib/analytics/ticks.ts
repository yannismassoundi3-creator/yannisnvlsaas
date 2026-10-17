/**
 * "Nice" axis scales: round steps of 1, 2, 2.5 or 5 × 10^n so tick labels read
 * as €0, €500, €1K, €1.5K rather than arbitrary values. Always includes zero.
 * Chart values are integers (minor currency units or counts), so steps are
 * whole numbers: a fractional tick would be a fraction of a cent.
 */
export function niceScale(min: number, max: number, maxTicks = 5): { domain: [number, number]; ticks: number[] } {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  // Nothing to scale (e.g. a product without sales in the period): a single zero line.
  if (lo === hi) return { domain: [lo, lo + 1], ticks: [lo] };

  const rawStep = (hi - lo) / Math.max(1, maxTicks - 1);
  const step = Math.max(1, niceStep(rawStep));
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;

  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { domain: [lo, hi], ticks };
}

function niceStep(raw: number): number {
  const exponent = Math.floor(Math.log10(raw));
  const base = 10 ** exponent;
  const fraction = raw / base;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * "Nice" axis scales: round steps of 1, 2, 2.5 or 5 × 10^n so tick labels read
 * as €0, €500, €1K, €1.5K rather than arbitrary values. Always includes zero.
 */
export function niceScale(min: number, max: number, maxTicks = 5): { domain: [number, number]; ticks: number[] } {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (lo === hi) hi = lo + 1;

  const rawStep = (hi - lo) / Math.max(1, maxTicks - 1);
  const step = niceStep(rawStep);
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

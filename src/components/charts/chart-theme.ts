/**
 * Chart colours mirror the CSS tokens in globals.css. Recharts needs literal
 * values for SVG attributes, so they are repeated here; keep both in sync.
 * The categorical order is fixed and was validated for colour-vision safety.
 */
export const CHART = {
  series: ["#3e5c99", "#1b8a6b", "#c28a2c", "#c65a84", "#3d93c2", "#cc5f45", "#8c5baf", "#7d8b2e"],
  positive: "#1b8a6b",
  negative: "#c2503a",
  context: "#a8a39a",
  grid: "#ece9e3",
  axis: "#d5d1c8",
  tick: "#5d6474",
  surface: "#ffffff",
  cursorFill: "rgba(23, 32, 51, 0.04)",
} as const;

export const AXIS_TICK = { fill: CHART.tick, fontSize: 12 } as const;

/**
 * Chart colour, validated rather than eyeballed.
 *
 * CATEGORICAL passes all six checks of the dataviz validator under `--pairs all`
 * on a light surface — lightness band, chroma floor, CVD separation
 * (protan ΔE 8.3 / deutan / tritan 13.0), normal-vision floor 19.1, and 3:1
 * contrast. Re-run the validator before changing any value here.
 *
 * Assign these in fixed order and never cycle: a fifth category folds into
 * "Other" rather than being given a generated hue.
 */
export const CATEGORICAL = ['#E85D26', '#2B8BC4', '#146B3A', '#B23A82'];

/** Neutral for the "Other" bucket — a bucket, not an identity. */
export const OTHER = '#8A8F98';

/**
 * Single-series marks use one hue. A bar chart of "orders per status" is one
 * series; colouring each bar differently would encode rank as identity, which
 * is meaningless and actively misleading.
 */
export const SERIES = '#E85D26';

export const INK = {
  primary: '#1f2328',
  secondary: '#5a6270',
  muted: '#8a8f98',
  grid: '#e6e8eb',
  axis: '#c9ced6',
  surface: '#ffffff'
};

/**
 * Default colours for Create Charts, where the author enters up to eight
 * series or slices by hand. Extends CATEGORICAL (the same first four, in the
 * same order) and passes the dataviz validator on the adjacent pairlist on a
 * light surface: worst adjacent CVD ΔE 9.1, normal-vision 19.6. The last four
 * are below 3:1 against white, which is why every chart carries a text legend
 * and a data-table view.
 *
 * Authors may pick any colour; these are only what each slot starts as.
 */
export const CHART_DEFAULTS = [
  '#E85D26', '#2B8BC4', '#146B3A', '#B23A82',
  '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7'
];

/**
 * Default colour for slot i of n. A pie or donut is a ring, so its last slice
 * also touches its first: with exactly seven, slot 7 (pink) beside slot 1
 * (orange) fails the normal-vision floor (ΔE 14.1 < 15), so that one case
 * takes slot 8 (violet, ΔE 36.9) instead. Every other wrap pair passes.
 */
export const chartDefaultColor = (i, n, circular = false) => {
  if (circular && n === 7 && i === 6) return CHART_DEFAULTS[7];
  return CHART_DEFAULTS[i % CHART_DEFAULTS.length];
};

/** Slices beyond the palette collapse into a single labelled "Other". */
export const foldCategories = (data, max = CATEGORICAL.length) => {
  if (data.length <= max) return data;
  const head = data.slice(0, max - 1);
  const tail = data.slice(max - 1);
  return [...head, { label: 'Other', value: tail.reduce((s, d) => s + d.value, 0), isOther: true }];
};

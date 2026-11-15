// Per-square-foot price ranges (USD) compiled from published 2026 pricing guides.
// Sources are listed on the calculator page. Review these at least once a year.
export type Surface = { id: string; label: string; low: number; high: number; hint: string };

export const surfaces: Surface[] = [
  { id: "siding", label: "House wash: vinyl siding (soft wash)", low: 0.12, high: 0.35, hint: "Siding area, not floor area. A rough rule: floor sq ft × 1.2 for one story" },
  { id: "stucco", label: "House wash: stucco", low: 0.18, high: 0.4, hint: "Wall area to be washed" },
  { id: "concrete", label: "Concrete: driveway, patio, sidewalk", low: 0.15, high: 0.35, hint: "A 2-car driveway is about 400–600 sq ft" },
  { id: "deck", label: "Wood or composite deck", low: 0.3, high: 0.6, hint: "Deck surface area (length × width)" },
  { id: "fence-wood", label: "Fence: wood (per sq ft of face)", low: 0.3, high: 0.55, hint: "Length × height, one side" },
  { id: "fence-vinyl", label: "Fence: vinyl", low: 0.2, high: 0.4, hint: "Length × height, one side" },
  { id: "roof", label: "Roof soft wash", low: 0.3, high: 0.75, hint: "Roof area; highest risk, so price at the top end if it's steep" },
];

// Our own adjustment for how dirty the surface is (not from a source). Tweak to taste.
export const conditions = [
  { id: "light", label: "Light: routine cleaning", factor: 1 },
  { id: "moderate", label: "Moderate: visible algae, mildew or grime", factor: 1.15 },
  { id: "heavy", label: "Heavy: years of buildup, heavy staining", factor: 1.3 },
];

export const OIL_STAIN = { low: 25, high: 75 }; // per stain treatment
export const DEFAULT_MINIMUM = 150; // published minimums commonly run $150–$350

export type LineItem = { surfaceId: string; sqft: number };

export function estimate(
  items: LineItem[],
  conditionFactor: number,
  oilStains: number,
  minimum: number,
): { low: number; high: number; mid: number; minimumApplied: boolean } {
  let low = 0;
  let high = 0;
  for (const item of items) {
    const s = surfaces.find((x) => x.id === item.surfaceId);
    if (!s || !(item.sqft > 0)) continue;
    low += s.low * item.sqft * conditionFactor;
    high += s.high * item.sqft * conditionFactor;
  }
  low += OIL_STAIN.low * oilStains;
  high += OIL_STAIN.high * oilStains;
  const minimumApplied = high < minimum;
  if (low < minimum) low = minimum;
  if (high < minimum) high = minimum;
  return { low: Math.round(low), high: Math.round(high), mid: Math.round((low + high) / 2), minimumApplied };
}

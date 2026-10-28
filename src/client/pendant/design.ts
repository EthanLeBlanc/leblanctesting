// The full description of a pendant. Every control in the UI edits one of
// these fields, and the geometry is rebuilt from scratch whenever it changes.
// All lengths are in millimetres.

export type ShapeKind =
  | "circle"
  | "oval"
  | "heart"
  | "star"
  | "polygon"
  | "roundedSquare"
  | "shield"
  | "teardrop"
  | "diamond";

export type TextMode = "raised" | "engraved" | "cutout";
export type BailKind = "loop" | "bail" | "hole" | "none";
export type GemPlacement = "none" | "center" | "top" | "bottom";
export type FontKey = "helvetiker" | "optimer" | "gentilis";
export type MaterialKey =
  | "gold"
  | "roseGold"
  | "silver"
  | "platinum"
  | "bronze"
  | "blackSteel"
  | "pla"
  | "resin";

export interface PendantDesign {
  shape: ShapeKind;
  size: number;
  thickness: number;
  bevel: number;
  starPoints: number;
  starInner: number;
  polygonSides: number;

  rim: boolean;
  rimWidth: number;
  rimHeight: number;

  text: string;
  textMode: TextMode;
  font: FontKey;
  textSize: number;
  textDepth: number;
  textOffsetY: number;
  backText: string;

  bail: BailKind;
  bailRadius: number;
  bailWire: number;
  holeRadius: number;

  gem: GemPlacement;
  gemSize: number;
  gemColor: string;

  material: MaterialKey;
  customColor: string;
}

export const DEFAULT_DESIGN: PendantDesign = {
  shape: "heart",
  size: 28,
  thickness: 2.5,
  bevel: 0.4,
  starPoints: 5,
  starInner: 0.45,
  polygonSides: 6,

  rim: true,
  rimWidth: 1.2,
  rimHeight: 0.6,

  text: "LOVE",
  textMode: "raised",
  font: "helvetiker",
  textSize: 4,
  textDepth: 0.6,
  textOffsetY: 1.5,
  backText: "",

  bail: "loop",
  bailRadius: 2.6,
  bailWire: 1.1,
  holeRadius: 1.3,

  gem: "none",
  gemSize: 4,
  gemColor: "#e0115f",

  material: "gold",
  customColor: "#3a7bd5",
};

export const SHAPES: { key: ShapeKind; label: string }[] = [
  { key: "heart", label: "Heart" },
  { key: "circle", label: "Circle" },
  { key: "oval", label: "Oval" },
  { key: "star", label: "Star" },
  { key: "polygon", label: "Polygon" },
  { key: "roundedSquare", label: "Square" },
  { key: "shield", label: "Shield" },
  { key: "teardrop", label: "Teardrop" },
  { key: "diamond", label: "Diamond" },
];

export interface MaterialInfo {
  label: string;
  color: string;
  metalness: number;
  roughness: number;
  // g/cm³, used for the weight estimate
  density: number;
  // Plastics take their colour from the custom colour picker
  customColor?: boolean;
}

export const MATERIALS: Record<MaterialKey, MaterialInfo> = {
  gold: { label: "18k Gold", color: "#e3b14f", metalness: 1, roughness: 0.22, density: 15.6 },
  roseGold: { label: "Rose Gold", color: "#e0a090", metalness: 1, roughness: 0.25, density: 15.0 },
  silver: { label: "Sterling Silver", color: "#e8e8ec", metalness: 1, roughness: 0.18, density: 10.36 },
  platinum: { label: "Platinum", color: "#cfd2d8", metalness: 1, roughness: 0.3, density: 21.45 },
  bronze: { label: "Bronze", color: "#b07a42", metalness: 1, roughness: 0.38, density: 8.8 },
  blackSteel: { label: "Black Steel", color: "#3a3a3f", metalness: 1, roughness: 0.32, density: 7.9 },
  pla: { label: "PLA (3D print)", color: "#3a7bd5", metalness: 0, roughness: 0.6, density: 1.24, customColor: true },
  resin: { label: "Resin", color: "#3a7bd5", metalness: 0, roughness: 0.12, density: 1.15, customColor: true },
};

export const PRESETS: { label: string; design: Partial<PendantDesign> }[] = [
  {
    label: "Golden Heart",
    design: { shape: "heart", material: "gold", text: "LOVE", textMode: "raised", rim: true, bail: "loop", gem: "none" },
  },
  {
    label: "Name Tag",
    design: { shape: "roundedSquare", material: "silver", text: "ALEX", textMode: "engraved", rim: false, bail: "hole", gem: "none", size: 26, textSize: 5.5, textOffsetY: -2, backText: "2026" },
  },
  {
    label: "Star Charm",
    design: { shape: "star", material: "roseGold", text: "", rim: true, rimWidth: 1, bail: "bail", gem: "center", gemColor: "#7fd3ff", gemSize: 5 },
  },
  {
    label: "Birthstone Drop",
    design: { shape: "teardrop", material: "platinum", text: "", rim: true, bail: "loop", gem: "center", gemColor: "#2e8b57", gemSize: 6, textOffsetY: 0 },
  },
  {
    label: "Stencil Tag",
    design: { shape: "shield", material: "pla", customColor: "#ff6b35", text: "HERO", textMode: "cutout", rim: true, bail: "hole", gem: "none", textSize: 5, textOffsetY: 1, size: 32 },
  },
];

// Designs are shared through the URL hash so a link reproduces the pendant.
export function encodeDesign(design: PendantDesign): string {
  const json = JSON.stringify(design);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeDesign(encoded: string): PendantDesign | null {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    return { ...DEFAULT_DESIGN, ...(JSON.parse(json) as Partial<PendantDesign>) };
  } catch {
    return null;
  }
}

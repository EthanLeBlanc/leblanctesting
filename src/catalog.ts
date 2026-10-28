// Everything the shop sells lives here. To add a product:
//   1. Upload the file to R2:
//      npx wrangler r2 object put mxbikes-shop-files/<key> --file ./my-file.zip --remote
//   2. Add an entry below with `file: "<key>"`.
//   3. npm run deploy
//
// The entries below are examples - replace them with your own setups, tracks and skins.

export type ProductKind = "setup" | "track" | "skin" | "bundle";

export type Product = {
  // URL slug, must be unique: /p/<id>
  id: string;
  name: string;
  kind: ProductKind;
  // Price in the smallest currency unit (cents). 0 = free download.
  priceCents: number;
  // One line shown on the catalog card.
  summary: string;
  // Paragraphs shown on the product page.
  description: string[];
  // Optional bullet list, e.g. bike, track, conditions, lap time.
  details?: string[];
  // Shown to the buyer next to their download link.
  install?: string;
  // R2 object key of the downloadable file (not used by bundles).
  file?: string;
  // For bundles: ids of the products included.
  includes?: string[];
  // Optional image path under public/, e.g. "/img/sand-setup.jpg".
  image?: string;
};

export const KIND_LABELS: Record<ProductKind, string> = {
  setup: "Setups",
  track: "Tracks",
  skin: "Skins",
  bundle: "Bundles",
};

const SETUP_INSTALL =
  "Extract the zip and copy the setup files into your MX Bikes profile's setups folder. The README inside the zip covers each bike.";
const TRACK_INSTALL =
  "Extract the zip into Documents\\PiBoSo\\MX Bikes\\mods\\tracks, then restart the game.";

export const PRODUCTS: Product[] = [
  {
    id: "starter-setup",
    name: "Starter Setup - 450F",
    kind: "setup",
    priceCents: 0,
    summary: "A forgiving all-round 450F setup. Free.",
    description: [
      "A stable, easy-to-ride base setup for the 450F that works on most hardpack tracks. Grab it for free and see what my setups feel like.",
    ],
    details: ["Bike: 450F", "Conditions: hardpack / intermediate"],
    install: SETUP_INSTALL,
    file: "setups/starter-450f.zip",
  },
  {
    id: "sand-setup-450f",
    name: "Sand Setup - 450F",
    kind: "setup",
    priceCents: 399,
    summary: "Keeps the front end up through deep sand and braking bumps.",
    description: [
      "Tuned for deep, rutted sand tracks: softer compression, more rear sag and gearing that pulls out of the turns without wheelspin.",
      "Includes a race version and a softer practice version.",
    ],
    details: ["Bike: 450F", "Conditions: deep sand", "Includes 2 variants"],
    install: SETUP_INSTALL,
    file: "setups/sand-450f.zip",
  },
  {
    id: "supercross-setup-250f",
    name: "Supercross Setup - 250F",
    kind: "setup",
    priceCents: 399,
    summary: "Stiff, precise and built for rhythm sections and whoops.",
    description: [
      "A stiff supercross setup for the 250F that holds up when you case a triple and skims the whoops.",
    ],
    details: ["Bike: 250F", "Conditions: supercross"],
    install: SETUP_INSTALL,
    file: "setups/sx-250f.zip",
  },
  {
    id: "practice-track",
    name: "Practice Compound Track",
    kind: "track",
    priceCents: 799,
    summary: "An original practice track with starts, ruts and a whoop section.",
    description: [
      "An original practice compound: a long start straight, rut-heavy corners, a whoop section and a sand section, built for training laps and race-start practice.",
    ],
    details: ["Original track", "Gate start and timing included"],
    install: TRACK_INSTALL,
    file: "tracks/practice-compound.zip",
  },
  {
    id: "setup-bundle",
    name: "Setup Bundle",
    kind: "bundle",
    priceCents: 699,
    summary: "Every paid setup in one download, for less.",
    description: [
      "The sand and supercross setups together, at a discount compared with buying them separately.",
    ],
    includes: ["sand-setup-450f", "supercross-setup-250f"],
  },
];

export function getProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

// The products a buyer receives: a bundle expands to its contents.
export function deliverables(product: Product): Product[] {
  if (product.kind !== "bundle") return product.file ? [product] : [];
  return (product.includes ?? [])
    .map(getProduct)
    .filter((p): p is Product => !!p?.file);
}

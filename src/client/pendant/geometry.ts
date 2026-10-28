import * as THREE from "three";
import { mergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import ClipperLib from "clipper-lib";

import helvetiker from "three/examples/fonts/helvetiker_bold.typeface.json";
import optimer from "three/examples/fonts/optimer_bold.typeface.json";
import gentilis from "three/examples/fonts/gentilis_bold.typeface.json";

import type { FontKey, PendantDesign, ShapeKind } from "./design";

type Pt = THREE.Vector2;

const FONTS: Record<FontKey, Font> = {
  helvetiker: new Font(helvetiker as never),
  optimer: new Font(optimer as never),
  gentilis: new Font(gentilis as never),
};

// ---------------------------------------------------------------------------
// Outlines
// ---------------------------------------------------------------------------

function sample(n: number, fn: (t: number) => [number, number]): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = fn((i / n) * Math.PI * 2);
    pts.push(new THREE.Vector2(x, y));
  }
  return pts;
}

function regular(n: number, radius: (i: number) => number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i / n) * Math.PI * 2;
    const r = radius(i);
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

function roundedRect(w: number, h: number, r: number, seg = 10): Pt[] {
  const pts: Pt[] = [];
  const corners: [number, number, number][] = [
    [w / 2 - r, h / 2 - r, 0],
    [-w / 2 + r, h / 2 - r, Math.PI / 2],
    [-w / 2 + r, -h / 2 + r, Math.PI],
    [w / 2 - r, -h / 2 + r, (Math.PI * 3) / 2],
  ];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = start + (i / seg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  }
  return pts;
}

function shield(): Pt[] {
  const right: Pt[] = [];
  // Gently arched top edge
  for (let i = 0; i <= 10; i++) {
    const x = (i / 10) * 0.8;
    right.push(new THREE.Vector2(x, 0.9 + 0.1 * (1 - (x / 0.8) ** 2)));
  }
  // Straight side, then a curve down to the point
  right.push(new THREE.Vector2(0.8, 0.2));
  const curve = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(0.8, 0.2),
    new THREE.Vector2(0.75, -0.65),
    new THREE.Vector2(0, -1),
  );
  right.push(...curve.getPoints(20).slice(1));
  const left = right
    .slice(1, -1)
    .map((p) => new THREE.Vector2(-p.x, p.y))
    .reverse();
  return [...right, ...left];
}

function unitOutline(d: PendantDesign): Pt[] {
  const kind: ShapeKind = d.shape;
  switch (kind) {
    case "circle":
      return sample(96, (t) => [Math.cos(t), Math.sin(t)]);
    case "oval":
      return sample(96, (t) => [0.72 * Math.cos(t), Math.sin(t)]);
    case "heart":
      return sample(160, (t) => [
        16 * Math.sin(t) ** 3,
        13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
      ]);
    case "star": {
      const n = Math.round(d.starPoints);
      return regular(n * 2, (i) => (i % 2 === 0 ? 1 : d.starInner));
    }
    case "polygon":
      return regular(Math.round(d.polygonSides), () => 1);
    case "roundedSquare":
      return roundedRect(1.6, 1.6, 0.35);
    case "shield":
      return shield();
    case "teardrop":
      // Point at the top so the bail sits on the tip
      return sample(128, (t) => [0.75 * Math.sin(t) * Math.abs(Math.sin(t / 2)) ** 1.3, Math.cos(t)]);
    case "diamond":
      return [
        new THREE.Vector2(0, 1),
        new THREE.Vector2(-0.68, 0),
        new THREE.Vector2(0, -1),
        new THREE.Vector2(0.68, 0),
      ];
  }
}

// Scale the unit outline so its largest dimension equals `size`, centre it,
// strip duplicate points and make it counter-clockwise.
function outline(d: PendantDesign): Pt[] {
  let pts = unitOutline(d);
  const box = new THREE.Box2().setFromPoints(pts);
  const dims = box.getSize(new THREE.Vector2());
  const centre = box.getCenter(new THREE.Vector2());
  const s = d.size / Math.max(dims.x, dims.y);
  pts = pts.map((p) => p.clone().sub(centre).multiplyScalar(s));
  pts = pts.filter((p, i) => p.distanceTo(pts[(i + 1) % pts.length]) > 1e-4);
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  return pts;
}

// Shrink a polygon by `dist`, rounding the corners. Narrow parts can vanish
// or split, so the result may contain several polygons.
const CLIPPER_SCALE = 1000;
function inset(pts: Pt[], dist: number): Pt[][] {
  const offset = new ClipperLib.ClipperOffset(2, 0.25 * (CLIPPER_SCALE / 100));
  offset.AddPath(
    pts.map((p) => ({ X: Math.round(p.x * CLIPPER_SCALE), Y: Math.round(p.y * CLIPPER_SCALE) })),
    ClipperLib.JoinType.jtRound,
    ClipperLib.EndType.etClosedPolygon,
  );
  const solution: { X: number; Y: number }[][] = [];
  offset.Execute(solution, -dist * CLIPPER_SCALE);
  return solution
    .map((path) => path.map((p) => new THREE.Vector2(p.X / CLIPPER_SCALE, p.Y / CLIPPER_SCALE)))
    .filter((path) => path.length >= 3);
}

function pointInPolygon(p: Pt, pts: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distanceToEdges(p: Pt, pts: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ab = b.clone().sub(a);
    const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
    best = Math.min(best, a.clone().addScaledVector(ab, t).distanceTo(p));
  }
  return best;
}

// Highest point of the outline along the vertical centre line. For a heart
// this is the dip between the lobes, which is where a bail belongs.
function topAtCentre(pts: Pt[]): number {
  let top = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if ((a.x <= 0 && b.x >= 0) || (a.x >= 0 && b.x <= 0)) {
      const y = a.x === b.x ? Math.max(a.y, b.y) : a.y + ((0 - a.x) / (b.x - a.x)) * (b.y - a.y);
      top = Math.max(top, y);
    }
  }
  return top;
}

// Walk down the centre line from the top until a circle of `radius` (plus a
// wall) fits fully inside the outline.
function fitHole(pts: Pt[], radius: number, wall: number): Pt {
  const top = topAtCentre(pts);
  for (let y = top - radius; y > -top; y -= 0.1) {
    const p = new THREE.Vector2(0, y);
    if (pointInPolygon(p, pts) && distanceToEdges(p, pts) >= radius + wall) return p;
  }
  return new THREE.Vector2(0, 0);
}

function circlePath(c: Pt, r: number): THREE.Path {
  const path = new THREE.Path();
  path.absarc(c.x, c.y, r, 0, Math.PI * 2, true);
  return path;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

// Extruded, centred text, one line per row, spanning z = 0..depth.
function textGeometry(d: PendantDesign, text: string, depth: number): THREE.BufferGeometry | null {
  const lines = text.split("\n").map((l) => l.trim());
  if (!lines.some(Boolean)) return null;
  const font = FONTS[d.font];
  const lineHeight = d.textSize * 1.3;
  const parts: THREE.BufferGeometry[] = [];
  lines.forEach((line, row) => {
    if (!line) return;
    const shapes = font.generateShapes(line, d.textSize);
    const geom = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 6 });
    geom.computeBoundingBox();
    const box = geom.boundingBox!;
    geom.translate(-(box.min.x + box.max.x) / 2, -row * lineHeight, 0);
    parts.push(geom);
  });
  if (!parts.length) return null;
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  parts.forEach((g) => g.dispose());
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  merged.translate(0, -(box.min.y + box.max.y) / 2 + d.textOffsetY, 0);
  return merged;
}

// Half the width of `area` around x = 0 along the horizontal line at `y`.
function halfWidthAt(area: Pt[], y: number): number {
  let left = -Infinity;
  let right = Infinity;
  for (let i = 0; i < area.length; i++) {
    const a = area[i];
    const b = area[(i + 1) % area.length];
    if (a.y > y === b.y > y) continue;
    const x = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
    if (x < 0) left = Math.max(left, x);
    else right = Math.min(right, x);
  }
  return Number.isFinite(left) && Number.isFinite(right) ? Math.min(-left, right) : 0;
}

// Shrink text (about its own centre) until it sits inside `area`. Returns
// whether it had to be shrunk.
function fitText(geom: THREE.BufferGeometry, area: Pt[] | null): boolean {
  if (!area) return false;
  geom.computeBoundingBox();
  const box = geom.boundingBox!;
  const cy = (box.min.y + box.max.y) / 2;
  const halfW = Math.max(-box.min.x, box.max.x);
  const halfH = (box.max.y - box.min.y) / 2;
  let scale = 1;
  for (let iter = 0; iter < 6; iter++) {
    let available = Infinity;
    for (let k = 0; k <= 8; k++) {
      available = Math.min(available, halfWidthAt(area, cy - halfH * scale + (k / 8) * 2 * halfH * scale));
    }
    if (halfW * scale <= available) break;
    scale = Math.max(0.15, scale * (available / (halfW * scale)) * 0.97);
  }
  if (scale >= 1) return false;
  geom.translate(0, -cy, 0);
  geom.scale(scale, scale, 1);
  geom.translate(0, cy, 0);
  return true;
}

function largest(polys: Pt[][]): Pt[] | null {
  let best: Pt[] | null = null;
  for (const p of polys) {
    if (!best || Math.abs(THREE.ShapeUtils.area(p)) > Math.abs(THREE.ShapeUtils.area(best))) best = p;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Gem
// ---------------------------------------------------------------------------

function gemGeometry(radius: number): THREE.BufferGeometry {
  // Brilliant-cut profile: pavilion point, girdle, crown, table
  const profile = [
    new THREE.Vector2(0, -0.85),
    new THREE.Vector2(1, 0),
    new THREE.Vector2(1, 0.08),
    new THREE.Vector2(0.58, 0.42),
    new THREE.Vector2(0, 0.42),
  ].map((p) => p.multiplyScalar(radius));
  const geom = new THREE.LatheGeometry(profile, 12);
  geom.rotateX(Math.PI / 2);
  return geom.toNonIndexed();
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface PendantParts {
  // Everything made of the pendant material
  metal: THREE.BufferGeometry[];
  // The stone, rendered with its own material
  gem: THREE.BufferGeometry | null;
  warnings: string[];
}

const evaluator = new Evaluator();
evaluator.useGroups = false;
evaluator.attributes = ["position", "normal"];

function stripToPositionNormal(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(out.attributes)) {
    if (name !== "position" && name !== "normal") out.deleteAttribute(name);
  }
  out.clearGroups();
  return out;
}

function subtract(base: THREE.BufferGeometry, cutter: THREE.BufferGeometry): THREE.BufferGeometry {
  const a = new Brush(stripToPositionNormal(base));
  const b = new Brush(stripToPositionNormal(cutter));
  a.updateMatrixWorld();
  b.updateMatrixWorld();
  const result = evaluator.evaluate(a, b, SUBTRACTION);
  a.geometry.dispose();
  b.geometry.dispose();
  return result.geometry;
}

export function buildPendant(d: PendantDesign): PendantParts {
  const warnings: string[] = [];
  const pts = outline(d);
  const t = d.thickness;
  const front = t / 2;
  const top = topAtCentre(pts);

  // --- Body -----------------------------------------------------------------
  // The bevel grows the outline outwards, so start from a rounded inset copy.
  // Rounding first keeps sharp tips (heart, star) from spiking.
  let bevel = Math.min(d.bevel, t / 2 - 0.1);
  const core = bevel > 0 ? largest(inset(pts, bevel)) : null;
  if (!core) bevel = 0;
  const shape = new THREE.Shape(core ?? pts);
  if (d.bail === "hole") {
    const wall = Math.max(1, d.rim ? d.rimWidth + 0.6 : 1);
    shape.holes.push(circlePath(fitHole(pts, d.holeRadius, wall), d.holeRadius + bevel));
  }
  let body: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: t - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 24,
  });
  body.translate(0, 0, bevel - t / 2);

  // --- Engraving / cut-through text (subtracted from the body) ---------------
  const engraveDepth = Math.min(d.textDepth, t * 0.45);
  const frontArea = largest(inset(pts, (d.rim ? d.rimWidth : 0) + 0.8));
  const backArea = largest(inset(pts, 0.8));
  let shrunk = false;
  try {
    if (d.text.trim() && d.textMode !== "raised") {
      const through = d.textMode === "cutout";
      const depth = through ? t + 2 : engraveDepth + 0.5;
      const cutter = textGeometry(d, d.text, depth);
      if (cutter) {
        shrunk = fitText(cutter, frontArea) || shrunk;
        cutter.translate(0, 0, through ? -t / 2 - 1 : front - engraveDepth);
        const next = subtract(body, cutter);
        body.dispose();
        cutter.dispose();
        body = next;
        if (through && /[ABDOPQRabdegopq04689&@]/.test(d.text)) {
          warnings.push("Cut-out letters with closed loops (O, A, 8…) leave loose centres.");
        }
      }
    }
    if (d.backText.trim()) {
      const cutter = textGeometry(d, d.backText, engraveDepth + 0.5);
      if (cutter) {
        shrunk = fitText(cutter, backArea) || shrunk;
        // Mirror so the engraving reads correctly when the pendant is flipped
        cutter.rotateY(Math.PI);
        cutter.translate(0, 0, -front + engraveDepth);
        const next = subtract(body, cutter);
        body.dispose();
        cutter.dispose();
        body = next;
      }
    }
  } catch (err) {
    console.error(err);
    warnings.push("Couldn't carve the text into this shape; try a smaller size.");
  }

  const metal: THREE.BufferGeometry[] = [stripToPositionNormal(body)];
  body.dispose();

  // --- Raised rim -----------------------------------------------------------
  if (d.rim && d.rimWidth > 0 && d.rimHeight > 0) {
    const ring = new THREE.Shape(pts);
    for (const hole of inset(pts, d.rimWidth)) ring.holes.push(new THREE.Path(hole));
    const rim = new THREE.ExtrudeGeometry(ring, { depth: d.rimHeight, bevelEnabled: false, curveSegments: 24 });
    rim.translate(0, 0, front - 0.01);
    metal.push(stripToPositionNormal(rim));
    rim.dispose();
  }

  // --- Raised text ----------------------------------------------------------
  if (d.text.trim() && d.textMode === "raised") {
    const raised = textGeometry(d, d.text, d.textDepth);
    if (raised) {
      shrunk = fitText(raised, frontArea) || shrunk;
      raised.translate(0, 0, front - 0.01);
      metal.push(stripToPositionNormal(raised));
      raised.dispose();
    }
  }

  if (shrunk) warnings.push("Text was scaled down to fit the pendant.");

  // --- Bail -----------------------------------------------------------------
  if (d.bail === "loop" || d.bail === "bail") {
    const R = d.bailRadius + d.bailWire / 2;
    const torus = new THREE.TorusGeometry(R, d.bailWire / 2, 20, 64);
    if (d.bail === "bail") torus.rotateY(Math.PI / 2);
    // Inner edge of the ring sits on the top edge; the wire sinks into the body
    torus.translate(0, top + R - d.bailWire / 2, 0);
    metal.push(stripToPositionNormal(torus));
    torus.dispose();
  }

  // --- Gem with a bezel setting --------------------------------------------
  let gem: THREE.BufferGeometry | null = null;
  if (d.gem !== "none") {
    const r = d.gemSize / 2;
    const y = d.gem === "center" ? 0 : d.gem === "top" ? top - r - d.size * 0.12 : -d.size * 0.22;
    const z = front + (d.rim ? Math.min(d.rimHeight, 0.4) : 0.15);
    gem = gemGeometry(r);
    gem.translate(0, y, z);
    const bezel = new THREE.TorusGeometry(r * 1.02, Math.max(0.3, r * 0.14), 12, 48);
    bezel.translate(0, y, z);
    metal.push(stripToPositionNormal(bezel));
    bezel.dispose();
    const seat = new THREE.CylinderGeometry(r * 1.02, r * 1.02, z - front + 0.02, 48);
    seat.rotateX(Math.PI / 2);
    seat.translate(0, y, front + (z - front) / 2 - 0.01);
    metal.push(stripToPositionNormal(seat));
    seat.dispose();
  }

  // Smooth shading across gentle curves, hard edges at corners
  const smoothed = metal.map((g) => {
    const out = flattenCaps(toCreasedNormals(g, Math.PI / 6));
    g.dispose();
    return out;
  });
  return { metal: smoothed, gem, warnings };
}

// Flat faces facing straight out of the pendant keep a straight normal.
// Otherwise the long, thin triangles that span a face would blend in the
// bevel's tilted normals and show up as streaks in the reflections.
function flattenCaps(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute("position");
  const normal = g.getAttribute("normal");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    if (Math.abs(a.z - b.z) > 1e-5 || Math.abs(b.z - c.z) > 1e-5) continue;
    // Boolean ops leave slivers too thin to give a reliable normal; those
    // lie on the front (z > 0) or back (z < 0) faces.
    const n = c.clone().sub(b).cross(a.clone().sub(b));
    const up = n.lengthSq() > 1e-10 ? Math.sign(n.z) : Math.sign(a.z);
    for (let k = 0; k < 3; k++) normal.setXYZ(i + k, 0, 0, up);
  }
  normal.needsUpdate = true;
  return g;
}

// Volume of a closed triangle mesh, in mm³.
export function meshVolume(geom: THREE.BufferGeometry): number {
  const pos = geom.getAttribute("position");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let vol = 0;
  const count = geom.index ? geom.index.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const [i0, i1, i2] = geom.index
      ? [geom.index.getX(i), geom.index.getX(i + 1), geom.index.getX(i + 2)]
      : [i, i + 1, i + 2];
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    vol += a.dot(b.cross(c)) / 6;
  }
  return Math.abs(vol);
}

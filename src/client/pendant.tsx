import "./pendant/pendant.css";

import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import {
  DEFAULT_DESIGN,
  MATERIALS,
  PRESETS,
  SHAPES,
  decodeDesign,
  encodeDesign,
  type MaterialKey,
  type PendantDesign,
} from "./pendant/design";
import { PendantViewer, type BuildStats } from "./pendant/viewer";

function initialDesign(): PendantDesign {
  const hash = window.location.hash.slice(1);
  return (hash && decodeDesign(hash)) || DEFAULT_DESIGN;
}

function download(blob: Blob | string, filename: string) {
  const a = document.createElement("a");
  a.href = typeof blob === "string" ? blob : URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  if (typeof blob !== "string") setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 0.1, unit = "mm", onChange } = props;
  return (
    <label className="slider">
      <span className="slider-label">
        {label}
        <output>
          {Number.isInteger(step) ? value : value.toFixed(1)}
          {unit && ` ${unit}`}
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

function Segmented<T extends string>(props: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {props.options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={props.value === o.key}
          className={props.value === o.key ? "active" : ""}
          onClick={() => props.onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

function App() {
  const [design, setDesign] = useState<PendantDesign>(initialDesign);
  const [stats, setStats] = useState<BuildStats | null>(null);
  const [spinning, setSpinning] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<PendantViewer | null>(null);

  const set = <K extends keyof PendantDesign>(key: K, value: PendantDesign[K]) =>
    setDesign((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    const viewer = new PendantViewer(viewportRef.current!);
    viewerRef.current = viewer;
    // Dragging the model stops the turntable; mirror that in the button
    const sync = window.setInterval(() => setSpinning(viewer.autoRotate), 300);
    return () => {
      window.clearInterval(sync);
      viewer.dispose();
    };
  }, []);

  // Rebuild after a short pause so dragging a slider stays responsive, since
  // carving text is a boolean mesh operation.
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (!viewerRef.current) return;
      setStats(viewerRef.current.update(design));
      history.replaceState(null, "", `#${encodeDesign(design)}`);
    }, 80);
    return () => window.clearTimeout(id);
  }, [design]);

  const filename = (design.text.trim().split("\n")[0] || design.shape).replace(/[^\w-]+/g, "_").toLowerCase();

  async function exportGLB() {
    setBusy(true);
    try {
      download(await viewerRef.current!.exportGLB(), `pendant-${filename}.glb`);
    } finally {
      setBusy(false);
    }
  }

  function share() {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function randomize() {
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
    const words = ["LOVE", "MOM", "DAD", "HOPE", "JOY", "A", "SKY", "", ""];
    setDesign((d) => ({
      ...d,
      shape: pick(SHAPES).key,
      material: pick(Object.keys(MATERIALS) as MaterialKey[]),
      customColor: `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0")}`,
      starPoints: pick([4, 5, 6, 7, 8]),
      polygonSides: pick([3, 5, 6, 8]),
      rim: Math.random() > 0.4,
      text: pick(words),
      textMode: pick(["raised", "engraved"] as const),
      bail: pick(["loop", "bail", "hole"] as const),
      gem: pick(["none", "none", "center", "bottom"] as const),
      gemColor: pick(["#e0115f", "#0f52ba", "#50c878", "#9966cc", "#ffd700", "#b9f2ff"]),
    }));
  }

  const material = MATERIALS[design.material];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◈
          </span>
          Pendant Studio
        </div>
        <div className="presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => setDesign({ ...DEFAULT_DESIGN, ...p.design })}>
              {p.label}
            </button>
          ))}
          <button type="button" className="accent" onClick={randomize}>
            Surprise me
          </button>
        </div>
      </header>

      <main className="workspace">
        <div className="stage">
          <div className="viewport" ref={viewportRef} />
          <div className="stage-tools">
            <button
              type="button"
              onClick={() => {
                viewerRef.current!.autoRotate = !spinning;
                setSpinning(!spinning);
              }}
            >
              {spinning ? "Pause spin" : "Spin"}
            </button>
            <button type="button" onClick={() => viewerRef.current!.resetView()}>
              Reset view
            </button>
          </div>
          {stats && (
            <div className="stats">
              <div>
                <b>
                  {stats.width.toFixed(1)} × {stats.height.toFixed(1)} × {stats.depth.toFixed(1)}
                </b>{" "}
                mm
              </div>
              <div>
                ≈ <b>{stats.weight.toFixed(stats.weight < 10 ? 2 : 1)} g</b> in {material.label} ·{" "}
                {(stats.volume / 1000).toFixed(2)} cm³
              </div>
              {stats.warnings.map((w) => (
                <div key={w} className="warning">
                  {w}
                </div>
              ))}
            </div>
          )}
          <p className="hint">Drag to orbit · scroll or pinch to zoom · right-drag to pan</p>
        </div>

        <aside className="panel">
          <Section title="Shape">
            <div className="shape-grid">
              {SHAPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={design.shape === s.key ? "active" : ""}
                  onClick={() => set("shape", s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {design.shape === "star" && (
              <>
                <Slider label="Points" value={design.starPoints} min={3} max={12} step={1} unit="" onChange={(v) => set("starPoints", v)} />
                <Slider label="Inner radius" value={design.starInner} min={0.25} max={0.8} step={0.01} unit="" onChange={(v) => set("starInner", v)} />
              </>
            )}
            {design.shape === "polygon" && (
              <Slider label="Sides" value={design.polygonSides} min={3} max={12} step={1} unit="" onChange={(v) => set("polygonSides", v)} />
            )}
            <Slider label="Size" value={design.size} min={12} max={60} step={0.5} onChange={(v) => set("size", v)} />
            <Slider label="Thickness" value={design.thickness} min={1} max={6} onChange={(v) => set("thickness", v)} />
            <Slider label="Edge bevel" value={design.bevel} min={0} max={1.5} onChange={(v) => set("bevel", v)} />
          </Section>

          <Section title="Border">
            <Toggle label="Raised rim" checked={design.rim} onChange={(v) => set("rim", v)} />
            {design.rim && (
              <>
                <Slider label="Rim width" value={design.rimWidth} min={0.5} max={4} onChange={(v) => set("rimWidth", v)} />
                <Slider label="Rim height" value={design.rimHeight} min={0.2} max={2} onChange={(v) => set("rimHeight", v)} />
              </>
            )}
          </Section>

          <Section title="Text">
            <textarea
              rows={2}
              value={design.text}
              placeholder="Front text (Enter for a new line)"
              maxLength={40}
              onChange={(e) => set("text", e.target.value)}
            />
            <Segmented
              value={design.textMode}
              options={[
                { key: "raised", label: "Raised" },
                { key: "engraved", label: "Engraved" },
                { key: "cutout", label: "Cut-out" },
              ]}
              onChange={(v) => set("textMode", v)}
            />
            <Segmented
              value={design.font}
              options={[
                { key: "helvetiker", label: "Sans" },
                { key: "optimer", label: "Classic" },
                { key: "gentilis", label: "Serif" },
              ]}
              onChange={(v) => set("font", v)}
            />
            <Slider label="Letter height" value={design.textSize} min={2} max={14} onChange={(v) => set("textSize", v)} />
            <Slider label="Depth" value={design.textDepth} min={0.2} max={2} onChange={(v) => set("textDepth", v)} />
            <Slider label="Vertical position" value={design.textOffsetY} min={-20} max={20} step={0.5} onChange={(v) => set("textOffsetY", v)} />
            <textarea
              rows={2}
              value={design.backText}
              placeholder="Back engraving (optional)"
              maxLength={40}
              onChange={(e) => set("backText", e.target.value)}
            />
          </Section>

          <Section title="Bail">
            <Segmented
              value={design.bail}
              options={[
                { key: "loop", label: "Jump ring" },
                { key: "bail", label: "Side bail" },
                { key: "hole", label: "Hole" },
                { key: "none", label: "None" },
              ]}
              onChange={(v) => set("bail", v)}
            />
            {(design.bail === "loop" || design.bail === "bail") && (
              <>
                <Slider label="Ring opening" value={design.bailRadius} min={1} max={6} onChange={(v) => set("bailRadius", v)} />
                <Slider label="Wire thickness" value={design.bailWire} min={0.6} max={2.5} onChange={(v) => set("bailWire", v)} />
              </>
            )}
            {design.bail === "hole" && (
              <Slider label="Hole radius" value={design.holeRadius} min={0.6} max={4} onChange={(v) => set("holeRadius", v)} />
            )}
          </Section>

          <Section title="Gemstone">
            <Segmented
              value={design.gem}
              options={[
                { key: "none", label: "None" },
                { key: "top", label: "Top" },
                { key: "center", label: "Center" },
                { key: "bottom", label: "Bottom" },
              ]}
              onChange={(v) => set("gem", v)}
            />
            {design.gem !== "none" && (
              <>
                <Slider label="Stone size" value={design.gemSize} min={2} max={12} step={0.5} onChange={(v) => set("gemSize", v)} />
                <div className="swatches">
                  {[
                    ["#e0115f", "Ruby"],
                    ["#0f52ba", "Sapphire"],
                    ["#50c878", "Emerald"],
                    ["#9966cc", "Amethyst"],
                    ["#ffc87c", "Topaz"],
                    ["#e8f4ff", "Diamond"],
                  ].map(([color, name]) => (
                    <button
                      key={color}
                      type="button"
                      title={name}
                      aria-label={name}
                      className={design.gemColor === color ? "swatch active" : "swatch"}
                      style={{ background: color }}
                      onClick={() => set("gemColor", color)}
                    />
                  ))}
                  <input type="color" value={design.gemColor} aria-label="Custom stone colour" onChange={(e) => set("gemColor", e.target.value)} />
                </div>
              </>
            )}
          </Section>

          <Section title="Material">
            <div className="materials">
              {(Object.keys(MATERIALS) as MaterialKey[]).map((key) => {
                const m = MATERIALS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={design.material === key ? "active" : ""}
                    onClick={() => set("material", key)}
                  >
                    <span
                      className="chip"
                      style={{ background: m.customColor ? design.customColor : m.color }}
                    />
                    {m.label}
                  </button>
                );
              })}
            </div>
            {material.customColor && (
              <label className="color-row">
                Colour
                <input type="color" value={design.customColor} onChange={(e) => set("customColor", e.target.value)} />
              </label>
            )}
          </Section>

          <Section title="Export">
            <div className="exports">
              <button type="button" className="primary" onClick={() => download(viewerRef.current!.exportSTL(), `pendant-${filename}.stl`)}>
                Download STL
              </button>
              <button type="button" disabled={busy} onClick={exportGLB}>
                {busy ? "Exporting…" : "Download GLB"}
              </button>
              <button type="button" onClick={() => download(viewerRef.current!.screenshot(), `pendant-${filename}.png`)}>
                Save image
              </button>
              <button type="button" onClick={share}>
                {copied ? "Link copied!" : "Copy share link"}
              </button>
            </div>
            <p className="note">STL is in millimetres and lies flat, ready for a slicer or casting service.</p>
          </Section>
        </aside>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

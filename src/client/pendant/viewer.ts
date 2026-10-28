import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

import { MATERIALS, type PendantDesign } from "./design";
import { buildPendant, meshVolume } from "./geometry";

export interface BuildStats {
  width: number;
  height: number;
  depth: number;
  // mm³
  volume: number;
  // grams
  weight: number;
  warnings: string[];
}

// Owns the three.js renderer, scene and pendant meshes.
export class PendantViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 2000);
  private controls: OrbitControls;
  private pendant = new THREE.Group();
  private metalMaterial = new THREE.MeshPhysicalMaterial({ clearcoat: 0.3, clearcoatRoughness: 0.2 });
  private gemMaterial = new THREE.MeshPhysicalMaterial({
    metalness: 0,
    roughness: 0.02,
    transmission: 0.85,
    thickness: 2,
    ior: 2.4,
    flatShading: true,
    specularIntensity: 1,
  });
  private resizeObserver: ResizeObserver;
  private animation = 0;
  private lastSize = 0;
  autoRotate = true;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Low, raking key light so lettering casts visible shading
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-60, 45, 35);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.15));

    this.scene.add(this.pendant);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 15;
    this.controls.maxDistance = 400;
    // Stop the turntable while the user is dragging
    this.controls.addEventListener("start", () => (this.autoRotate = false));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    const tick = () => {
      this.animation = requestAnimationFrame(tick);
      if (this.autoRotate) this.pendant.rotation.y += 0.008;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(design: PendantDesign): BuildStats {
    const parts = buildPendant(design);

    for (const child of [...this.pendant.children]) {
      (child as THREE.Mesh).geometry.dispose();
      this.pendant.remove(child);
    }
    for (const g of parts.metal) this.pendant.add(new THREE.Mesh(g, this.metalMaterial));
    if (parts.gem) this.pendant.add(new THREE.Mesh(parts.gem, this.gemMaterial));

    const mat = MATERIALS[design.material];
    this.metalMaterial.color.set(mat.customColor ? design.customColor : mat.color);
    this.metalMaterial.metalness = mat.metalness;
    this.metalMaterial.roughness = mat.roughness;
    this.metalMaterial.clearcoat = design.material === "resin" ? 1 : mat.metalness ? 0.3 : 0;
    this.gemMaterial.color.set(design.gemColor);
    this.gemMaterial.attenuationColor.set(design.gemColor);

    // Measure before the turntable rotation is applied
    const rotation = this.pendant.rotation.y;
    this.pendant.rotation.y = 0;
    this.pendant.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.pendant);
    this.pendant.rotation.y = rotation;
    const dims = box.getSize(new THREE.Vector3());

    // Reframe the camera only when the pendant size changes noticeably
    const span = Math.max(dims.x, dims.y);
    if (Math.abs(span - this.lastSize) > span * 0.25) this.frame(dims);

    const volume = parts.metal.reduce((sum, g) => sum + meshVolume(g), 0);
    return {
      width: dims.x,
      height: dims.y,
      depth: dims.z,
      volume,
      weight: (volume / 1000) * mat.density,
      warnings: parts.warnings,
    };
  }

  resetView() {
    this.pendant.rotation.y = 0;
    this.pendant.updateMatrixWorld(true);
    this.frame(new THREE.Box3().setFromObject(this.pendant).getSize(new THREE.Vector3()));
  }

  // Back the camera off until the pendant fits both horizontally and vertically.
  private frame(dims: THREE.Vector3) {
    this.lastSize = Math.max(dims.x, dims.y);
    const fit = Math.max(dims.y, dims.x / this.camera.aspect, 1);
    const distance = (fit * 1.45) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    // A slight three-quarter angle shows off raised and engraved detail
    this.camera.position.set(distance * 0.3, distance * 0.2, distance * 0.93);
    this.controls.target.set(0, 0, 0);
  }

  // Export with the pendant facing +Z and lying flat, which is how slicers
  // expect a print to sit on the bed. Units are millimetres.
  exportSTL(): Blob {
    const flat = this.exportGroup(1);
    const data = new STLExporter().parse(flat, { binary: true }) as DataView;
    return new Blob([data.buffer as ArrayBuffer], { type: "model/stl" });
  }

  // glTF is in metres, so scale down to keep the pendant real-size in AR.
  async exportGLB(): Promise<Blob> {
    const group = this.exportGroup(0.001);
    const result = await new GLTFExporter().parseAsync(group, { binary: true });
    return new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
  }

  screenshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL("image/png");
  }

  private exportGroup(scale: number): THREE.Group {
    const group = new THREE.Group();
    for (const child of this.pendant.children) {
      const mesh = child as THREE.Mesh;
      group.add(new THREE.Mesh(mesh.geometry, mesh.material));
    }
    group.scale.setScalar(scale);
    group.updateMatrixWorld(true);
    return group;
  }

  dispose() {
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    for (const child of this.pendant.children) (child as THREE.Mesh).geometry.dispose();
    this.metalMaterial.dispose();
    this.gemMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

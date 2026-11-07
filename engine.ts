import * as THREE from "three";
import nebulaUrl from "../assets/nebula.jpg";

/* ------------------------------------------------------------------ */
/*  ORBITAL SALVAGE — engine                                           */
/*  Raw three.js, pooled objects, zero per-frame allocation.           */
/* ------------------------------------------------------------------ */

export type Mode = "attract" | "playing" | "paused" | "gameover";

export interface Telemetry {
  score: number;
  chain: number;
  mult: number;
  shields: number;
  distance: number;
  speed: number;
  phase: number; // 0..1 cooldown readiness
  phaseActive: boolean;
  bestChain: number;
  cores: number;
  progress: number; // 0..1 speed ramp
  combo: number; // 0..1 remaining chain window
}

export interface GameEvent {
  id: number;
  kind: "pickup" | "hit" | "phase" | "bonus";
  text: string;
  sx: number; // 0..1 screen
  sy: number;
}

const SHIP_X = 11.2;
const SHIP_YB = -5.6;
const SHIP_YT = 8.4;

const N_DEBRIS = 72;
const N_CORE = 26;
const N_WALL = 3;
const N_RING = 26;
const N_DUST = 900;

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.18, "rgba(255,220,170,0.72)");
  grd.addColorStop(0.48, "rgba(255,170,60,0.22)");
  grd.addColorStop(1, "rgba(255,150,40,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Debris {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  sx: number; sy: number; sz: number;
  ax: number; ay: number; az: number;
}
interface Core {
  x: number; y: number; z: number; t: number; alive: boolean;
}
interface Wall {
  z: number; gapX: number; gapY: number; gapW: number; gapH: number;
  group: THREE.Group;
  edges: THREE.MeshStandardMaterial;
  face: THREE.MeshStandardMaterial;
}

export class Game {
  readonly telemetry: Telemetry = {
    score: 0, chain: 0, mult: 1, shields: 3, distance: 0,
    speed: 42, phase: 1, phaseActive: false, bestChain: 0, cores: 0, progress: 0, combo: 0,
  };
  mode: Mode = "attract";

  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private ro?: ResizeObserver;

  private onEvent: (e: GameEvent) => void;
  private onGameOver: (t: Telemetry) => void;
  private onMode: (m: Mode) => void;

  /* world objects */
  private debris: Debris[] = [];
  private cores: Core[] = [];
  private walls: Wall[] = [];
  private debrisMesh!: THREE.InstancedMesh;
  private coreMesh!: THREE.InstancedMesh;
  private glowMesh!: THREE.InstancedMesh;
  private ringMesh!: THREE.InstancedMesh;
  private ringZ!: Float32Array;
  private dust!: THREE.Points;
  private ship = new THREE.Group();
  private engineFlame!: THREE.Mesh;
  private star!: THREE.Mesh;
  private starGlow!: THREE.Sprite;
  private accretion!: THREE.Mesh;

  /* state */
  private worldZ = 0;
  private targetX = 0;
  private targetY = 0;
  private shipX = 0;
  private shipY = 0;
  private velX = 0;
  private velY = 0;
  private shake = 0;
  private dashT = 0;
  private dashCd = 0;
  private invuln = 0;
  private comboT = 0;
  private elapsed = 0;
  private flash = 0;
  private fov = 72;
  private patternT = 0;
  private evtId = 1;
  private reduced = false;

  /* input */
  private keys: Record<string, boolean> = {};
  private dragging = false;
  private dragMoved = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragBaseX = 0;
  private dragBaseY = 0;
  private dragStartT = 0;

  /* scratch */
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();

  constructor(
    container: HTMLElement,
    opts: {
      onEvent: (e: GameEvent) => void;
      onGameOver: (t: Telemetry) => void;
      onMode: (m: Mode) => void;
    }
  ) {
    this.container = container;
    this.onEvent = opts.onEvent;
    this.onGameOver = opts.onGameOver;
    this.onMode = opts.onMode;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(72, w / h, 0.1, 900);
    this.camera.position.set(0, 1.6, 13);

    this.scene.fog = new THREE.FogExp2(0x070b16, 0.0034);
    this.scene.background = new THREE.Color(0x05070e);

    this.buildScene();
    this.bindInput();
    this.resize();

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);

    this.clock.start();
    this.loop();
  }

  /* ---------------------------------------------------------------- */
  /*  SCENE CONSTRUCTION                                               */
  /* ---------------------------------------------------------------- */
  private buildScene() {
    const texLoader = new THREE.TextureLoader();
    texLoader.load(
      nebulaUrl,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        this.scene.background = t;
      },
      undefined,
      () => {
        /* keep solid deep-vacuum colour */
      }
    );

    /* lights: warm key, cool fill, cyan rim */
    const key = new THREE.DirectionalLight(0xffc27a, 2.1);
    key.position.set(-8, 10, 6);
    const fill = new THREE.DirectionalLight(0x2f5c9e, 1.15);
    fill.position.set(9, -6, 4);
    const rim = new THREE.DirectionalLight(0x35e0d8, 1.05);
    rim.position.set(2, 3, -18);
    const amb = new THREE.AmbientLight(0x223047, 1.1);
    this.scene.add(key, fill, rim, amb);

    /* the collapsed star: the destination, always ahead */
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffcf86, fog: false });
    this.star = new THREE.Mesh(new THREE.SphereGeometry(15, 32, 24), starMat);
    this.star.position.set(0, 2, -430);
    this.scene.add(this.star);

    const gt = glowTexture();
    const glowMat = new THREE.SpriteMaterial({
      map: gt, color: 0xffb43a, blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, fog: false, opacity: 0.95,
    });
    this.starGlow = new THREE.Sprite(glowMat);
    this.starGlow.scale.setScalar(230);
    this.starGlow.position.copy(this.star.position);
    this.scene.add(this.starGlow);

    const accMat = new THREE.MeshBasicMaterial({
      color: 0xffa23c, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, depthWrite: false,
    });
    this.accretion = new THREE.Mesh(new THREE.RingGeometry(22, 84, 96, 1), accMat);
    this.accretion.position.copy(this.star.position);
    this.accretion.rotation.set(Math.PI * 0.42, 0, 0.22);
    this.scene.add(this.accretion);

    /* tunnel ribs — the speed cue */
    const ringGeo = new THREE.TorusGeometry(16.5, 0.16, 5, 72);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x2a3038, roughness: 0.62, metalness: 0.85,
      emissive: 0xff9a2e, emissiveIntensity: 0.32,
    });
    this.ringMesh = new THREE.InstancedMesh(ringGeo, ringMat, N_RING);
    this.ringMesh.frustumCulled = false;
    this.ringZ = new Float32Array(N_RING);
    for (let i = 0; i < N_RING; i++) {
      this.ringZ[i] = -i * 26;
      this.dummy.position.set(0, 1.4, -i * 26);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.ringMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.scene.add(this.ringMesh);

    /* debris field */
    const dGeo = new THREE.IcosahedronGeometry(1, 1);
    const dMat = new THREE.MeshStandardMaterial({
      color: 0x4a5058, roughness: 0.78, metalness: 0.62, flatShading: true,
    });
    this.debrisMesh = new THREE.InstancedMesh(dGeo, dMat, N_DEBRIS);
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < N_DEBRIS; i++) {
      const d: Debris = {
        x: this.rand(-15, 15), y: this.rand(-9, 11), z: -60 - Math.random() * 320,
        rx: Math.random() * 6.28, ry: Math.random() * 6.28, rz: Math.random() * 6.28,
        sx: this.rand(0.7, 1.5), sy: this.rand(0.7, 1.5), sz: this.rand(0.7, 1.5),
        ax: this.rand(-0.9, 0.9), ay: this.rand(-0.9, 0.9), az: this.rand(-0.9, 0.9),
      };
      const s = this.rand(0.75, 3.1);
      d.sx *= s; d.sy *= s; d.sz *= s;
      this.debris.push(d);
      const c = 0.42 + Math.random() * 0.32;
      this.debrisMesh.setColorAt(i, this.tmpColor.setRGB(c, c * 1.02, c * 1.12));
    }
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.debrisMesh);

    /* isotope cores */
    const cGeo = new THREE.OctahedronGeometry(0.62, 0);
    const cMat = new THREE.MeshStandardMaterial({
      color: 0x2a1602, emissive: 0xffb43a, emissiveIntensity: 2.6,
      roughness: 0.28, metalness: 0.35, flatShading: true,
    });
    this.coreMesh = new THREE.InstancedMesh(cGeo, cMat, N_CORE);
    this.coreMesh.frustumCulled = false;
    this.coreMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const gGeo = new THREE.PlaneGeometry(4.4, 4.4);
    const gMat = new THREE.MeshBasicMaterial({
      map: gt, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.62, fog: true,
    });
    this.glowMesh = new THREE.InstancedMesh(gGeo, gMat, N_CORE);
    this.glowMesh.frustumCulled = false;
    this.glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < N_CORE; i++) {
      const c: Core = {
        x: this.rand(-10, 10), y: this.rand(-5, 8), z: -80 - Math.random() * 380,
        t: Math.random() * 6.28, alive: true,
      };
      this.cores.push(c);
    }
    this.scene.add(this.coreMesh, this.glowMesh);

    /* flare walls */
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < N_WALL; i++) {
      const group = new THREE.Group();
      const face = new THREE.MeshStandardMaterial({
        color: 0x161b24, roughness: 0.5, metalness: 0.9,
        emissive: 0xff5a24, emissiveIntensity: 0.22,
      });
      const edges = new THREE.MeshStandardMaterial({
        color: 0x2a1206, emissive: 0xffa23c, emissiveIntensity: 2.4,
        roughness: 0.35, metalness: 0.4,
      });
      const parts: THREE.Mesh[] = [];
      for (let k = 0; k < 8; k++) {
        const m = new THREE.Mesh(box, k < 4 ? face : edges);
        group.add(m);
        parts.push(m);
      }
      group.position.z = -260 - i * 190;
      this.scene.add(group);
      this.walls.push({
        z: group.position.z, gapX: 0, gapY: 1, gapW: 12, gapH: 13,
        group, edges, face,
      });
      this.layoutWall(this.walls[i]);
    }

    /* speed dust */
    const pos = new Float32Array(N_DUST * 3);
    for (let i = 0; i < N_DUST; i++) {
      pos[i * 3] = this.rand(-70, 70);
      pos[i * 3 + 1] = this.rand(-45, 55);
      pos[i * 3 + 2] = -Math.random() * 620;
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      dg,
      new THREE.PointsMaterial({
        color: 0xbfd4ff, size: 0.42, sizeAttenuation: true,
        transparent: true, opacity: 0.62, depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    /* the skiff */
    const hull = new THREE.MeshStandardMaterial({
      color: 0x2b3138, roughness: 0.42, metalness: 0.92, flatShading: true,
    });
    const hullDark = new THREE.MeshStandardMaterial({
      color: 0x14181e, roughness: 0.55, metalness: 0.85, flatShading: true,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: 0x3a2a10, emissive: 0xffb43a, emissiveIntensity: 1.5,
      roughness: 0.4, metalness: 0.5,
    });

    const body = new THREE.Mesh(new THREE.ConeGeometry(1.15, 5.2, 6), hull);
    body.rotation.x = -Math.PI / 2;
    body.position.z = -0.6;
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 4.4), hullDark);
    spine.position.set(0, 0.52, 0.5);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.52, 12, 8), trim);
    canopy.position.set(0, 0.62, -1.35);
    canopy.scale.set(1, 0.62, 1.5);

    const wingGeo = new THREE.BoxGeometry(3.9, 0.16, 1.75);
    const wl = new THREE.Mesh(wingGeo, hull);
    wl.position.set(-2.15, -0.1, 1.15);
    wl.rotation.set(0, 0.34, -0.16);
    const wr = new THREE.Mesh(wingGeo, hull);
    wr.position.set(2.15, -0.1, 1.15);
    wr.rotation.set(0, -0.34, 0.16);

    const finGeo = new THREE.BoxGeometry(0.14, 1.5, 1.5);
    const fl = new THREE.Mesh(finGeo, hullDark);
    fl.position.set(-1.35, 0.68, 1.9);
    fl.rotation.z = 0.42;
    const fr = new THREE.Mesh(finGeo, hullDark);
    fr.position.set(1.35, 0.68, 1.9);
    fr.rotation.z = -0.42;

    const stripGeo = new THREE.BoxGeometry(2.6, 0.06, 0.1);
    const sl = new THREE.Mesh(stripGeo, trim);
    sl.position.set(-2.2, 0.04, 1.55);
    sl.rotation.set(0, 0.34, -0.16);
    const sr = new THREE.Mesh(stripGeo, trim);
    sr.position.set(2.2, 0.04, 1.55);
    sr.rotation.set(0, -0.34, 0.16);

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.78, 4.4, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x35e0d8, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    flame.rotation.x = Math.PI / 2;
    flame.position.z = 3.6;
    this.engineFlame = flame;

    const nozzleGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: gt, color: 0x8ffff2, blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true, opacity: 0.85,
      })
    );
    nozzleGlow.scale.setScalar(5.2);
    nozzleGlow.position.z = 3.1;

    this.ship.add(body, spine, canopy, wl, wr, fl, fr, sl, sr, flame, nozzleGlow);
    this.ship.position.set(0, 1.5, 0);
    this.scene.add(this.ship);
  }

  private layoutWall(w: Wall) {
    const gapW = w.gapW;
    const gapH = w.gapH;
    const cx = w.gapX;
    const cy = w.gapY;
    const left = cx - gapW / 2;
    const right = cx + gapW / 2;
    const bottom = cy - gapH / 2;
    const top = cy + gapH / 2;
    const spanX = 34;
    const spanY = 26;

    const parts = w.group.children as THREE.Mesh[];
    const set = (
      m: THREE.Mesh, x: number, y: number, sw: number, sh: number
    ) => {
      m.position.set(x, y, 0);
      m.scale.set(sw, sh, 1.4);
    };
    // 4 face panels: left, right, top, bottom of the gap
    set(parts[0], (left + -spanX) / 2, (top + spanY) / 2, left + spanX, spanY - top);
    set(parts[1], (right + spanX) / 2, (top + spanY) / 2, spanX - right, spanY - top);
    set(parts[2], (left + (-spanX)) / 2, (bottom + -spanY) / 2, left + spanX, bottom + spanY);
    set(parts[3], (right + spanX) / 2, (bottom + -spanY) / 2, spanX - right, bottom + spanY);
    // 4 edge bars along the gap
    set(parts[4], cx, top + 0.22, gapW + 1.2, 0.42);
    set(parts[5], cx, bottom - 0.22, gapW + 1.2, 0.42);
    set(parts[6], left - 0.22, cy, 0.42, gapH + 1.2);
    set(parts[7], right + 0.22, cy, 0.42, gapH + 1.2);
  }

  private rand(a: number, b: number) {
    return a + Math.random() * (b - a);
  }

  /* ---------------------------------------------------------------- */
  /*  INPUT                                                            */
  /* ---------------------------------------------------------------- */
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
    if (this.keys[k]) return;
    this.keys[k] = true;
    if (k === " ") this.dash();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.key.toLowerCase()] = false;
  };
  private onBlur = () => {
    this.keys = {};
    if (this.mode === "playing") this.pause();
  };
  private onVisibility = () => {
    if (document.hidden && this.mode === "playing") this.pause();
  };

  private onPointerDown = (e: PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.dragging = true;
    this.dragMoved = 0;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragBaseX = this.targetX;
    this.dragBaseY = this.targetY;
    this.dragStartT = performance.now();
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    this.dragMoved = Math.max(this.dragMoved, Math.hypot(dx, dy));
    const rect = this.container.getBoundingClientRect();
    const kx = (SHIP_X * 2.15) / Math.max(rect.width, 1);
    const ky = (14.5) / Math.max(rect.height, 1);
    this.targetX = this.clamp(this.dragBaseX + dx * kx * 1.15, -SHIP_X, SHIP_X);
    this.targetY = this.clamp(this.dragBaseY - dy * ky * 1.15, SHIP_YB, SHIP_YT);
  };
  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    const dt = performance.now() - this.dragStartT;
    if (this.dragMoved < 12 && dt < 320) {
      if (this.mode === "playing") this.dash();
    }
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
  };

  private bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibility);
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  /* ---------------------------------------------------------------- */
  /*  PUBLIC API                                                       */
  /* ---------------------------------------------------------------- */
  startGame() {
    this.resetRun();
    this.setMode("playing");
  }
  restart() {
    this.startGame();
  }
  pause() {
    if (this.mode !== "playing") return;
    this.setMode("paused");
  }
  resume() {
    if (this.mode !== "paused") return;
    this.clock.getDelta();
    this.setMode("playing");
  }
  toAttract() {
    this.resetRun();
    this.setMode("attract");
  }
  private setMode(m: Mode) {
    this.mode = m;
    this.onMode(m);
  }

  private resetRun() {
    this.telemetry.score = 0;
    this.telemetry.chain = 0;
    this.telemetry.mult = 1;
    this.telemetry.shields = 3;
    this.telemetry.distance = 0;
    this.telemetry.speed = 42;
    this.telemetry.phase = 1;
    this.telemetry.phaseActive = false;
    this.telemetry.bestChain = 0;
    this.telemetry.cores = 0;
    this.telemetry.progress = 0;
    this.telemetry.combo = 0;
    this.worldZ = 0;
    this.elapsed = 0;
    this.shake = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.invuln = 0;
    this.comboT = 0;
    this.flash = 0;
    this.fov = 72;
    this.targetX = 0;
    this.targetY = 1.5;
    this.shipX = 0;
    this.shipY = 1.5;
    this.velX = this.velY = 0;
    for (let i = 0; i < this.debris.length; i++) {
      const d = this.debris[i];
      d.z = -70 - Math.random() * 330;
    }
    for (let i = 0; i < this.cores.length; i++) {
      const c = this.cores[i];
      c.z = -90 - Math.random() * 400;
      c.alive = true;
    }
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      w.z = -300 - i * 200;
      w.group.position.z = w.z;
      this.rollWall(w);
    }
  }

  private rollWall(w: Wall) {
    const vertical = Math.random() > 0.5;
    if (vertical) {
      w.gapW = this.rand(7.2, 10.5);
      w.gapH = 26;
      w.gapX = this.rand(-9, 9);
      w.gapY = 1.4;
    } else {
      w.gapW = 34;
      w.gapH = this.rand(6.6, 9.6);
      w.gapX = 0;
      w.gapY = this.rand(-3.2, 6.6);
    }
    this.layoutWall(w);
  }

  private dash() {
    if (this.mode !== "playing") return;
    if (this.dashCd > 0) return;
    this.dashT = 0.34;
    this.dashCd = 1.25;
    this.invuln = Math.max(this.invuln, 0.42);
    this.shake = Math.min(1.25, this.shake + 0.42);
    this.pushEvent("phase", "PHASE", this.shipX, this.shipY);
  }

  private pushEvent(kind: GameEvent["kind"], text: string, wx: number, wy: number) {
    const v = new THREE.Vector3(wx, wy, -6).project(this.camera);
    this.onEvent({
      id: this.evtId++,
      kind,
      text,
      sx: this.clamp((v.x * 0.5 + 0.5) * 100, 6, 94),
      sy: this.clamp((-v.y * 0.5 + 0.5) * 100, 8, 92),
    });
  }

  private clamp(v: number, a: number, b: number) {
    return v < a ? a : v > b ? b : v;
  }

  /* ---------------------------------------------------------------- */
  /*  LOOP                                                             */
  /* ---------------------------------------------------------------- */
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 1 / 30);

    if (this.mode === "paused") {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const playing = this.mode === "playing";
    const attract = this.mode === "attract";

    /* ---- speed model ---- */
    if (playing) this.elapsed += dt;
    const ramp = playing ? Math.min(1, this.elapsed / 150) : 0.12;
    const baseSpeed = 42 + ramp * 68;
    const timeScale = this.dashT > 0 ? 0.72 : 1;
    const step = dt * timeScale;
    const dashBoost = this.dashT > 0 ? 1.55 : 1;
    const dead = this.mode === "gameover" ? 0.24 : 1;
    const speed = (attract ? 26 : baseSpeed) * dashBoost * dead;
    const move = speed * step;

    if (playing) {
      this.worldZ += move;
      this.telemetry.distance += move * 0.01;
      this.telemetry.speed = speed * (this.dashT > 0 ? 1 : 1);
      this.telemetry.progress = ramp;
      this.telemetry.score += move * 1.6 * this.telemetry.mult;

      if (this.comboT > 0) {
        this.comboT -= dt;
        if (this.comboT <= 0) {
          this.comboT = 0;
          this.telemetry.chain = 0;
          this.telemetry.mult = 1;
        }
      }
    }

    /* ---- steering ---- */
    const k = this.keys;
    if (playing && !this.dragging) {
      const acc = 78;
      if (k["arrowleft"] || k["a"]) this.targetX -= acc * dt;
      if (k["arrowright"] || k["d"]) this.targetX += acc * dt;
      if (k["arrowup"] || k["w"]) this.targetY += acc * dt * 0.72;
      if (k["arrowdown"] || k["s"]) this.targetY -= acc * dt * 0.72;
      this.targetX = this.clamp(this.targetX, -SHIP_X, SHIP_X);
      this.targetY = this.clamp(this.targetY, SHIP_YB, SHIP_YT);
    }
    if (attract) {
      const t = this.clock.elapsedTime;
      this.targetX = Math.sin(t * 0.36) * 6.2;
      this.targetY = 1.6 + Math.sin(t * 0.52 + 1.2) * 2.1;
    }
    const prevX = this.shipX;
    const prevY = this.shipY;
    const lerp = 1 - Math.pow(0.0016, dt);
    this.shipX += (this.targetX - this.shipX) * lerp;
    this.shipY += (this.targetY - this.shipY) * lerp;
    this.velX = (this.shipX - prevX) / Math.max(dt, 0.0001);
    this.velY = (this.shipY - prevY) / Math.max(dt, 0.0001);

    this.ship.position.x = this.shipX;
    this.ship.position.y = this.shipY;
    this.ship.rotation.z = this.clamp(-this.velX * 0.0165, -0.85, 0.85);
    this.ship.rotation.y = this.clamp(-this.velX * 0.0072, -0.5, 0.5);
    this.ship.rotation.x = this.clamp(this.velY * 0.0092, -0.5, 0.5);

    /* ---- timers ---- */
    if (this.dashT > 0) this.dashT = Math.max(0, this.dashT - dt);
    if (this.dashCd > 0) this.dashCd = Math.max(0, this.dashCd - dt);
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    this.telemetry.phase = 1 - this.clamp(this.dashCd / 1.25, 0, 1);
    this.telemetry.phaseActive = this.dashT > 0;
    this.telemetry.combo = this.clamp(this.comboT / 4.2, 0, 1);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.8);

    /* ---- engine flame + ship material pulse ---- */
    const flameScale = 1 + Math.sin(this.clock.elapsedTime * 26) * 0.08 + (this.dashT > 0 ? 1.15 : 0);
    this.engineFlame.scale.set(1, flameScale, 1);
    (this.engineFlame.material as THREE.MeshBasicMaterial).opacity =
      this.dashT > 0 ? 0.92 : 0.42 + Math.sin(this.clock.elapsedTime * 18) * 0.07;

    this.ship.visible = !(playing && this.invuln > 0 && Math.floor(this.invuln * 18) % 2 === 0);

    /* ---- rings ---- */
    const ringCount = this.ringMesh.count;
    for (let i = 0; i < ringCount; i++) {
      this.ringZ[i] += move;
      if (this.ringZ[i] > 22) this.ringZ[i] -= ringCount * 26;
      const nz = this.ringZ[i];
      this.dummy.position.set(0, 1.4, nz);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.ringMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.ringMesh.instanceMatrix.needsUpdate = true;

    /* ---- dust ---- */
    const p = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const arr = p.array as Float32Array;
    const dustMove = move * 1.35;
    for (let i = 0; i < N_DUST; i++) {
      let z = arr[i * 3 + 2] + dustMove;
      if (z > 20) {
        z -= 620;
        arr[i * 3] = this.rand(-70, 70);
        arr[i * 3 + 1] = this.rand(-45, 55);
      }
      arr[i * 3 + 2] = z;
    }
    p.needsUpdate = true;

    /* ---- debris ---- */
    for (let i = 0; i < N_DEBRIS; i++) {
      const d = this.debris[i];
      d.z += move;
      d.rx += d.ax * step;
      d.ry += d.ay * step;
      d.rz += d.az * step;
      if (d.z > 24) {
        d.z -= 380 + Math.random() * 130;
        d.x = this.rand(-15, 15);
        d.y = this.rand(-9, 11);
      }
      this.dummy.position.set(d.x, d.y, d.z);
      this.dummy.rotation.set(d.rx, d.ry, d.rz);
      this.dummy.scale.set(d.sx, d.sy, d.sz);
      this.dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, this.dummy.matrix);

      if (playing && (this.dashT > 0 || this.invuln <= 0) && d.z > -3.6 && d.z < 3.6) {
        const dx = d.x - this.shipX;
        const dy = d.y - this.shipY;
        const r = (d.sx + d.sy) * 0.5 * 1.05 + 1.55;
        if (dx * dx + dy * dy < r * r) {
          if (this.dashT > 0) {
            d.z = 30;
            this.addScore(180);
            this.pushEvent("bonus", "+180 SHATTER", d.x, d.y);
          } else {
            this.damage(d.x, d.y);
            d.z = 30;
          }
        }
      }
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;

    /* ---- cores ---- */
    this.patternT += step * 0.55;
    for (let i = 0; i < N_CORE; i++) {
      const c = this.cores[i];
      c.z += move;
      c.t += step * 1.6;
      if (c.z > 22) {
        c.z -= 460 + Math.random() * 150;
        this.patternT += 0.42;
        c.x = Math.sin(this.patternT * 1.9) * 8.6;
        c.y = 1.6 + Math.sin(this.patternT * 1.31 + 1.1) * 4.4;
        c.x = this.clamp(c.x, -SHIP_X + 1, SHIP_X - 1);
        c.y = this.clamp(c.y, SHIP_YB + 1, SHIP_YT - 1);
      }
      this.dummy.position.set(c.x, c.y, c.z);
      this.dummy.rotation.set(c.t * 0.6, c.t, 0);
      this.dummy.scale.setScalar(1 + Math.sin(c.t * 2.2) * 0.12);
      this.dummy.updateMatrix();
      this.coreMesh.setMatrixAt(i, this.dummy.matrix);

      this.dummy.position.set(c.x, c.y, c.z);
      this.dummy.rotation.set(0, 0, 0);
      const gs = 1 + Math.sin(c.t * 1.7) * 0.14;
      this.dummy.scale.set(gs, gs, gs);
      this.dummy.quaternion.copy(this.camera.quaternion);
      this.dummy.updateMatrix();
      this.glowMesh.setMatrixAt(i, this.dummy.matrix);

      if (playing && c.z > -3.2 && c.z < 3.4) {
        const dx = c.x - this.shipX;
        const dy = c.y - this.shipY;
        if (dx * dx + dy * dy < 4.6) {
          c.z = 26;
          this.collect(c.x, c.y);
        }
      }
    }
    this.coreMesh.instanceMatrix.needsUpdate = true;
    this.glowMesh.instanceMatrix.needsUpdate = true;

    /* ---- flare walls ---- */
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      const prevZ = w.z;
      w.z += move;
      if (w.z > 30) {
        w.z -= 620 + Math.random() * 180;
        this.rollWall(w);
      }
      w.group.position.z = w.z;

      const near = this.clamp((w.z + 300) / 300, 0, 1);
      w.face.emissiveIntensity = 0.12 + near * 0.72;
      w.edges.emissiveIntensity = 1.1 + near * 3.2;

      if (playing && prevZ < 0 && w.z >= 0) {
        const inX = Math.abs(this.shipX - w.gapX) < w.gapW / 2 - 1.1;
        const inY = Math.abs(this.shipY - w.gapY) < w.gapH / 2 - 1.1;
        if (!(inX && inY)) {
          if (this.dashT > 0) {
            this.addScore(320);
            this.pushEvent("bonus", "+320 PHASED", this.shipX, this.shipY);
          } else {
            this.damage(this.shipX, this.shipY);
          }
        } else {
          this.addScore(60);
        }
      }
    }

    /* ---- star / accretion drift ---- */
    this.accretion.rotation.z += step * 0.028;
    this.starGlow.scale.setScalar(230 + Math.sin(this.clock.elapsedTime * 1.1) * 12 + this.flash * 90);

    /* ---- camera ---- */
    const targetFov = this.dashT > 0 ? 97 : 72;
    this.fov += (targetFov - this.fov) * (1 - Math.pow(0.002, dt));
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.shake = Math.max(0, this.shake - dt * 1.75);
    const sh = this.reduced ? this.shake * 0.18 : this.shake;
    const sx = (Math.random() - 0.5) * sh * 1.55;
    const sy = (Math.random() - 0.5) * sh * 1.55;
    const sz = (Math.random() - 0.5) * sh * 1.1;

    const camLerp = 1 - Math.pow(0.0035, dt);
    this.camera.position.x += (this.shipX * 0.44 + sx - this.camera.position.x) * camLerp;
    this.camera.position.y += (this.shipY * 0.34 + 1.75 + sy - this.camera.position.y) * camLerp;
    this.camera.position.z = 13 + sz + (this.dashT > 0 ? 1.5 : 0);
    this.camera.lookAt(this.shipX * 0.72, this.shipY * 0.6 + 0.35, -46);
    this.camera.rotateZ(this.ship.rotation.z * 0.17);

    this.renderer.render(this.scene, this.camera);
  };

  private addScore(n: number) {
    this.telemetry.score += n;
  }

  private collect(x: number, y: number) {
    this.telemetry.cores++;
    this.telemetry.chain++;
    this.telemetry.bestChain = Math.max(this.telemetry.bestChain, this.telemetry.chain);
    this.telemetry.mult = Math.min(8, 1 + Math.floor(this.telemetry.chain / 3));
    this.comboT = 4.2;
    const pts = 100 * this.telemetry.mult;
    this.addScore(pts);
    this.pushEvent("pickup", `+${pts}`, x, y);
  }

  private damage(x: number, y: number) {
    if (this.invuln > 0) return;
    this.invuln = 1.5;
    this.shake = 1.25;
    this.flash = 1;
    this.telemetry.shields--;
    this.telemetry.chain = 0;
    this.telemetry.mult = 1;
    this.comboT = 0;
    this.pushEvent("hit", "HULL BREACH", x, y);
    if (this.telemetry.shields <= 0) {
      this.telemetry.shields = 0;
      this.setMode("gameover");
      this.onGameOver({ ...this.telemetry });
    }
  }

  /* ---------------------------------------------------------------- */
  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 820 ? 1.7 : 2));
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.ro?.disconnect();
    this.scene.traverse((o) => {
      const any = o as unknown as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      any.geometry?.dispose?.();
      const m = any.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose?.();
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

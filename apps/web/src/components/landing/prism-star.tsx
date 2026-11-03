"use client";

import * as React from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Landing scene: the Asterra star as an iridescent extruded solid, liquidity streams spiralling into it from every
 * direction (many venues, one route) and a ring of DLMM-style bins orbiting it. Pointer tilts the star, a click on
 * empty page space pulses the streams. Renders only while visible; with reduced motion it draws one still frame.
 *
 * The canvas sits fixed behind the whole landing page and the star travels with the scroll: every element with
 * `data-star="x y scale opacity"` (x, y in -1..1 of the viewport) is a waypoint, `data-star-m` overrides it on
 * portrait screens. The star holds each section's pose and glides to the next one while that section rises through
 * the lower half of the viewport.
 */

type Pose = [x: number, y: number, s: number, o: number];
const HOLD: Pose = [0.45, 0, 1, 1];

function parsePose(v: string | undefined): Pose | null {
  const n = v?.trim().split(/\s+/).map(Number);
  return n && n.length === 4 && n.every(Number.isFinite) ? (n as Pose) : null;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

const PRISM = ["#dfff1f", "#19e6ff", "#2b4bff", "#8b3cff"];

function starShape(r: number, pinch: number) {
  const tips = [
    [0, r * 1.06],
    [r * 1.02, 0],
    [0, -r * 1.06],
    [-r, 0],
  ] as const;
  const s = new THREE.Shape();
  s.moveTo(tips[0][0], tips[0][1]);
  for (let i = 0; i < 4; i++) {
    const a = tips[i]!;
    const b = tips[(i + 1) % 4]!;
    // the control point sits near the centre, which bends each side inward like the logo's concave edges
    s.quadraticCurveTo((a[0] + b[0]) * pinch, (a[1] + b[1]) * pinch, b[0], b[1]);
  }
  return s;
}

function prismTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const lin = g.createLinearGradient(0, 0, 512, 512);
  PRISM.forEach((col, i) => lin.addColorStop(i / (PRISM.length - 1), col));
  g.fillStyle = lin;
  g.fillRect(0, 0, 512, 512);
  // the two sweeping bands of the mark, lower right
  g.lineCap = "round";
  for (const [w, col, off] of [
    [46, "#0b2bff", 0],
    [40, "#7a1cff", 70],
  ] as const) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(230 + off, 520);
    g.quadraticCurveTo(300 + off, 300 + off * 0.3, 520, 250 + off * 0.6);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const STREAM_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  uniform float uSize;
  attribute float aAngle;
  attribute float aPhase;
  attribute float aSpeed;
  attribute float aJitter;
  varying float vT;
  varying float vHue;
  void main() {
    float t = fract(aPhase + uTime * aSpeed * (1.0 + uPulse * 2.5));
    float radius = 0.35 + 4.6 * pow(1.0 - t, 1.35);
    float ang = aAngle + t * 2.1 + aJitter * 0.35;
    vec3 p = vec3(cos(ang) * radius, sin(ang) * radius * 0.62, sin(ang * 2.0 + aJitter * 6.0) * 0.55 * (1.0 - t));
    vT = t;
    vHue = fract(aAngle / 6.2831853 + 0.08);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.6 + aJitter) * (1.0 / -mv.z) * (0.4 + t);
    gl_Position = projectionMatrix * mv;
  }
`;

const STREAM_FRAG = /* glsl */ `
  uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
  uniform float uAlpha;
  varying float vT;
  varying float vHue;
  vec3 prism(float h) {
    if (h < 0.333) return mix(uC0, uC1, h * 3.0);
    if (h < 0.666) return mix(uC1, uC2, (h - 0.333) * 3.0);
    return mix(uC2, uC3, (h - 0.666) * 3.0);
  }
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = dot(d, d);
    if (r > 0.25) discard;
    float fade = smoothstep(0.0, 0.12, vT) * (1.0 - smoothstep(0.86, 1.0, vT));
    gl_FragColor = vec4(prism(vHue), (1.0 - r * 4.0) * fade * uAlpha);
  }
`;

export function PrismStar({ dark, className }: { dark: boolean; className?: string }) {
  const host = React.useRef<HTMLDivElement>(null);
  const darkRef = React.useRef(dark);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    darkRef.current = dark;
  }, [dark]);

  React.useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      // WebGL unavailable: swap in the static mark on the next frame
      const id = requestAnimationFrame(() => setFailed(true));
      return () => cancelAnimationFrame(id);
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cleanupExtra = () => {};
    const small = window.innerWidth < 768;
    // the canvas covers the viewport, so cap the pixel ratio harder than a hero-sized canvas would need
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.25 : 1.5));
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    camera.position.set(0, 0, 8.4);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;

    // ---- star
    const geo = new THREE.ExtrudeGeometry(starShape(1.45, 0.1), {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.05,
      bevelSegments: 8,
      curveSegments: 64,
    });
    geo.center();
    const pos = geo.attributes.position!;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) + 1.5) / 3;
      uv[i * 2 + 1] = 1 - (pos.getY(i) + 1.55) / 3.1;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const tex = prismTexture();
    const starMat = new THREE.MeshPhysicalMaterial({
      map: tex,
      emissive: new THREE.Color("#ffffff"),
      emissiveMap: tex,
      emissiveIntensity: 0.22,
      roughness: 0.18,
      metalness: 0.15,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      iridescence: 0.75,
      iridescenceIOR: 1.45,
      sheen: 0.4,
      sheenColor: new THREE.Color("#8b3cff"),
    });
    const star = new THREE.Mesh(geo, starMat);
    const rig = new THREE.Group();
    rig.add(star);
    // everything that travels with the scroll
    const root = new THREE.Group();
    scene.add(root);
    root.add(rig);
    const key = new THREE.DirectionalLight("#ffffff", 1.6);
    key.position.set(3, 4, 5);
    scene.add(key);

    // ---- DLMM bin ring: bar heights follow a curve-shaped distribution around the active bin
    const BINS = 72;
    const binGeo = new THREE.BoxGeometry(0.05, 1, 0.05);
    const binMat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4, transparent: true, opacity: 0.9 });
    const bins = new THREE.InstancedMesh(binGeo, binMat, BINS);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    const prismCols = PRISM.map((c) => new THREE.Color(c));
    for (let i = 0; i < BINS; i++) {
      const a = (i / BINS) * Math.PI * 2;
      const d = Math.min(i, BINS - i);
      const h = 0.08 + 0.55 * Math.exp(-(d * d) / 120);
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2);
      m.compose(new THREE.Vector3(Math.cos(a) * 2.45, Math.sin(a) * 2.45, 0), q, new THREE.Vector3(1, h, 1));
      bins.setMatrixAt(i, m);
      const f = (i / BINS) * 3;
      col.copy(prismCols[Math.floor(f)]!).lerp(prismCols[Math.min(3, Math.floor(f) + 1)]!, f % 1);
      bins.setColorAt(i, col);
    }
    const ring = new THREE.Group();
    ring.add(bins);
    ring.rotation.x = -1.12;
    root.add(ring);

    // ---- liquidity streams
    const N = small ? 1400 : 2600;
    const sGeo = new THREE.BufferGeometry();
    const aAngle = new Float32Array(N);
    const aPhase = new Float32Array(N);
    const aSpeed = new Float32Array(N);
    const aJitter = new Float32Array(N);
    const STREAMS = 9;
    for (let i = 0; i < N; i++) {
      const s = i % STREAMS;
      aAngle[i] = (s / STREAMS) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      aPhase[i] = Math.random();
      aSpeed[i] = 0.035 + Math.random() * 0.05;
      aJitter[i] = Math.random();
    }
    sGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    sGeo.setAttribute("aAngle", new THREE.BufferAttribute(aAngle, 1));
    sGeo.setAttribute("aPhase", new THREE.BufferAttribute(aPhase, 1));
    sGeo.setAttribute("aSpeed", new THREE.BufferAttribute(aSpeed, 1));
    sGeo.setAttribute("aJitter", new THREE.BufferAttribute(aJitter, 1));
    const uniforms = {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uSize: { value: 46 * renderer.getPixelRatio() },
      uAlpha: { value: 1 },
      uC0: { value: prismCols[0]!.clone() },
      uC1: { value: prismCols[1]!.clone() },
      uC2: { value: prismCols[2]!.clone() },
      uC3: { value: prismCols[3]!.clone() },
    };
    const sMat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: STREAM_VERT,
      fragmentShader: STREAM_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const streams = new THREE.Points(sGeo, sMat);
    streams.frustumCulled = false;
    root.add(streams);

    let themeDark: boolean | null = null;
    const applyTheme = () => {
      if (themeDark === darkRef.current) return;
      themeDark = darkRef.current;
      sMat.blending = themeDark ? THREE.AdditiveBlending : THREE.NormalBlending;
      uniforms.uAlpha.value = themeDark ? 0.9 : 0.75;
      // light pages need deeper stops: the neon lime disappears on white
      uniforms.uC0.value.set(themeDark ? PRISM[0]! : "#7fa000");
      uniforms.uC1.value.set(themeDark ? PRISM[1]! : "#0096be");
      starMat.emissiveIntensity = themeDark ? 0.22 : 0.12;
      renderer.toneMappingExposure = themeDark ? 1.05 : 0.95;
      sMat.needsUpdate = true;
    };

    // ---- interaction
    const target = { x: 0, y: 0 };
    let pulse = 0;
    // the canvas sits under the page, so listen on the window
    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
    };
    const onClick = (e: MouseEvent) => {
      // clicks on controls are for the controls; a click on empty space pulses the star
      if (!(e.target as Element | null)?.closest?.("a,button,input,select,textarea,label,[role=button],[role=slider],[data-radix-popper-content-wrapper]")) pulse = 1;
    };
    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("click", onClick);

    // ---- scroll waypoints
    let portrait = false;
    let marks: { top: number; pose: Pose }[] = [];
    const measure = () => {
      marks = [...document.querySelectorAll<HTMLElement>("[data-star]")]
        .map((n) => {
          const desk = parsePose(n.dataset.star);
          if (!desk) return null;
          // portrait default: copy spans the full width, so the star peeks in smaller and dimmer behind it
          const pose = portrait ? (parsePose(n.dataset.starM) ?? ([desk[0] * 0.9, desk[1], desk[2] * 0.6, desk[3] * 0.4] as Pose)) : desk;
          return { top: n.getBoundingClientRect().top + window.scrollY, pose };
        })
        .filter((m): m is { top: number; pose: Pose } => m !== null)
        .sort((a, b) => a.top - b.top);
    };
    const want = (): Pose => {
      if (!marks.length) return HOLD;
      const h = window.innerHeight;
      const probe = window.scrollY + h * 0.5;
      let i = 0;
      while (i < marks.length - 1 && probe >= marks[i + 1]!.top) i++;
      const a = marks[i]!;
      const b = marks[i + 1];
      if (!b) return a.pose;
      // hold this section's pose; glide to the next while its top rises from 95% to 50% of the viewport
      const t = smooth(Math.min(1, Math.max(0, (probe - (b.top - h * 0.45)) / (h * 0.45))));
      return a.pose.map((v, k) => v + (b.pose[k]! - v) * t) as Pose;
    };
    const pose: Pose = [...HOLD];
    let poseReady = false;
    let shownOpacity = -1;

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      portrait = w / h < 0.9;
      // keep the whole star and ring in frame on narrow screens
      camera.position.z = portrait ? 11.2 : 9.6;
      camera.updateProjectionMatrix();
      measure();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    // sections grow as data loads, which moves every waypoint below them
    ro.observe(document.body);
    resize();

    let visible = true;
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !reduced) loop();
    });
    io.observe(el);

    let raf = 0;
    let last = performance.now();
    let time = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      applyTheme();
      pulse = Math.max(0, pulse - dt * 1.4);
      uniforms.uTime.value = time;
      uniforms.uPulse.value = pulse;
      const goal = want();
      const k = poseReady && !reduced ? Math.min(1, dt * 4.5) : 1;
      poseReady = true;
      for (let j = 0; j < 4; j++) pose[j] = pose[j]! + (goal[j]! - pose[j]!) * k;
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
      root.position.set(pose[0] * halfH * camera.aspect, pose[1] * halfH, 0);
      root.scale.setScalar(pose[2]);
      if (Math.abs(pose[3] - shownOpacity) > 0.004) {
        shownOpacity = pose[3];
        renderer.domElement.style.opacity = pose[3].toFixed(3);
      }
      rig.rotation.y += (target.x * 0.55 + Math.sin(time * 0.4) * 0.25 - rig.rotation.y) * 0.06;
      rig.rotation.x += (target.y * 0.35 - rig.rotation.x) * 0.06;
      star.rotation.z = Math.sin(time * 0.3) * 0.05;
      star.scale.setScalar(1 + pulse * 0.06);
      ring.rotation.z = time * 0.12;
      streams.rotation.z = time * 0.03;
      renderer.render(scene, camera);
    };
    // adaptive quality: sustained slow frames (software WebGL, a weak GPU) drop the resolution step by step, and at
    // the floor the scene draws every other frame, so scrolling and input stay responsive
    let slow = 0;
    let skip = false;
    const MIN_RATIO = 0.5;
    const degrade = (ms: number) => {
      if (ms <= 40) return void (slow = Math.max(0, slow - 1));
      slow += ms > 100 ? 3 : 1; // very slow frames step down sooner
      if (slow < 12) return;
      slow = 0;
      const ratio = renderer.getPixelRatio();
      if (ratio > MIN_RATIO) {
        renderer.setPixelRatio(Math.max(MIN_RATIO, ratio * 0.7));
        uniforms.uSize.value = 46 * renderer.getPixelRatio();
        resize();
      } else skip = true;
    };
    const loop = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      let prev = last;
      let odd = false;
      const tick = (now: number) => {
        if (!visible || document.hidden) return;
        degrade(now - prev);
        prev = now;
        odd = !odd;
        if (!skip || odd) frame(now);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const onVis = () => {
      if (!document.hidden && visible && !reduced) loop();
    };
    document.addEventListener("visibilitychange", onVis);

    if (reduced) {
      time = 4;
      frame(performance.now());
      // still frame: redraw when the theme flips or the scroll moves the star to another section
      const redraw = () => frame(performance.now());
      const id = window.setInterval(() => themeDark !== darkRef.current && redraw(), 300);
      window.addEventListener("scroll", redraw, { passive: true });
      cleanupExtra = () => (window.clearInterval(id), window.removeEventListener("scroll", redraw));
    } else loop();

    return () => {
      cancelAnimationFrame(raf);
      cleanupExtra();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("click", onClick);
      ro.disconnect();
      io.disconnect();
      geo.dispose();
      tex.dispose();
      starMat.dispose();
      binGeo.dispose();
      binMat.dispose();
      bins.dispose();
      sGeo.dispose();
      sMat.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  if (failed) {
    // eslint-disable-next-line @next/next/no-img-element -- static fallback when WebGL is unavailable
    return <img src="/brand/asterra-mark-512.png" alt="" className={className} style={{ objectFit: "contain" }} />;
  }
  return <div ref={host} className={className} aria-hidden />;
}

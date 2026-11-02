"use client";

import * as React from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Hero scene: the Asterra star as an iridescent extruded solid, liquidity streams spiralling into it from every
 * direction (many venues, one route) and a ring of DLMM-style bins orbiting it. Pointer tilts the star, a click
 * pulses the streams. Renders only while visible; with reduced motion it draws one still frame.
 */

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 1.75));
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
    scene.add(rig);
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
    scene.add(ring);

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
    scene.add(streams);

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
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => {
      target.x = 0;
      target.y = 0;
    };
    const onClick = () => {
      pulse = 1;
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("click", onClick);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // keep the whole star and ring in frame on narrow screens
      camera.position.z = w / h < 0.9 ? 11.2 : 9.6;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
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
      rig.rotation.y += (target.x * 0.55 + Math.sin(time * 0.4) * 0.25 - rig.rotation.y) * 0.06;
      rig.rotation.x += (target.y * 0.35 - rig.rotation.x) * 0.06;
      star.rotation.z = Math.sin(time * 0.3) * 0.05;
      star.scale.setScalar(1 + pulse * 0.06);
      ring.rotation.z = time * 0.12;
      streams.rotation.z = time * 0.03;
      renderer.render(scene, camera);
    };
    const loop = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      const tick = (now: number) => {
        if (!visible || document.hidden) return;
        frame(now);
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
      // re-render the still frame when the theme flips
      const id = window.setInterval(() => themeDark !== darkRef.current && frame(performance.now()), 300);
      cleanupExtra = () => window.clearInterval(id);
    } else loop();

    return () => {
      cancelAnimationFrame(raf);
      cleanupExtra();
      document.removeEventListener("visibilitychange", onVis);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("click", onClick);
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

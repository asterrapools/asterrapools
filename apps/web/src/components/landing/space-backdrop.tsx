"use client";

import * as React from "react";
import * as THREE from "three";
import { hardwareRenderer } from "./prism-star";

/**
 * Deep space behind the landing: a star field on its own canvas (the star scene fades per section, the sky must not).
 * Stars twinkle, the sky turns slowly and with the scroll, the camera leans toward the pointer so near stars slide
 * further than far ones, and stars around the cursor are pushed aside and flare. The light theme draws them as deep
 * prism dots. Reduced motion: one still frame. No hardware WebGL: nothing (the nebula behind it still shows).
 */

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform vec2 uPointer;
  uniform float uPointerOn;
  uniform float uAspect;
  attribute float aSeed;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vFlare;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // behind the camera: drop it
    if (mv.z > -0.5) { gl_PointSize = 0.0; return; }
    vec2 ndc = gl_Position.xy / gl_Position.w;
    vec2 d = (ndc - uPointer) * vec2(uAspect, 1.0);
    float dist = length(d);
    float near = (1.0 - smoothstep(0.0, 0.42, dist)) * uPointerOn;
    // part the stars around the cursor, a little more for the near (big) ones
    vec2 push = d / max(dist, 1e-3) * near * near * (0.07 + 0.05 * aSeed);
    gl_Position.xy += push / vec2(uAspect, 1.0) * gl_Position.w;
    vFlare = near;
    vColor = aColor;
    vAlpha = 0.8 + 0.2 * sin(uTime * (0.5 + aSeed * 2.4) + aSeed * 61.0);
    gl_PointSize = uSize * (0.5 + 1.2 * aSeed * aSeed * aSeed) * (1.0 + near * 0.5) / -mv.z;
  }
`;

const FRAG = /* glsl */ `
  uniform float uAlpha;
  uniform float uHalo;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vFlare;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    // bright core with a soft halo
    float a = exp(-r * r * 7.0) + uHalo * (1.0 - r);
    gl_FragColor = vec4(vColor * (1.0 + vFlare * 0.5), a * mix(vAlpha, 1.0, vFlare) * uAlpha);
  }
`;

// about half plain white stars, the rest in the prism stops (same index in both themes)
// light theme: no halo (a grey disc on white reads as a smudge), crisp ink dots instead
const DARK = { colors: ["#eef2ff", "#eef2ff", "#eef2ff", "#eef2ff", "#eef2ff", "#dfff1f", "#19e6ff", "#6f86ff", "#a77bff"], alpha: 0.95, halo: 0.2 };
const LIGHT = { colors: ["#3c4670", "#3c4670", "#3c4670", "#3c4670", "#3c4670", "#6f8c00", "#0089ad", "#2b4bff", "#6a2be6"], alpha: 0.55, halo: 0 };

export function SpaceBackdrop({ dark, className }: { dark: boolean; className?: string }) {
  const host = React.useRef<HTMLDivElement>(null);
  const darkRef = React.useRef(dark);
  React.useEffect(() => {
    darkRef.current = dark;
  }, [dark]);

  React.useEffect(() => {
    const el = host.current;
    const renderer = el && hardwareRenderer(false);
    if (!el || !renderer) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    el.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "width:100%;height:100%;display:block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 60);

    // a shell of stars around the camera, so the sky is full whichever way it turns
    const N = window.innerWidth < 768 ? 2600 : 6000;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    const col = new Float32Array(N * 3);
    const pick = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const r = 6 + 22 * Math.pow(Math.random(), 0.7);
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
      seed[i] = Math.random();
      pick[i] = Math.floor(Math.random() * DARK.colors.length);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    const colAttr = new THREE.BufferAttribute(col, 3);
    geo.setAttribute("aColor", colAttr);
    const uniforms = {
      uTime: { value: 0 },
      uSize: { value: 0 },
      uPointer: { value: new THREE.Vector2(0, 0) },
      uPointerOn: { value: 0 },
      uAspect: { value: 1 },
      uAlpha: { value: 1 },
      uHalo: { value: 0.2 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false });
    const stars = new THREE.Points(geo, mat);
    stars.frustumCulled = false;
    scene.add(stars);

    let themeDark: boolean | null = null;
    const applyTheme = () => {
      if (themeDark === darkRef.current) return;
      themeDark = darkRef.current;
      const t = themeDark ? DARK : LIGHT;
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        c.set(t.colors[pick[i]!]!);
        col.set([c.r, c.g, c.b], i * 3);
      }
      colAttr.needsUpdate = true;
      // glowing on black, plain ink on white
      mat.blending = themeDark ? THREE.AdditiveBlending : THREE.NormalBlending;
      uniforms.uAlpha.value = t.alpha;
      uniforms.uHalo.value = t.halo;
      mat.needsUpdate = true;
    };

    // the canvas sits under the page, so listen on the window
    const pointer = { x: 0, y: 0, sx: 0, sy: 0, on: 0, onTarget: 0 };
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
      // touch has no hover: parallax only, no parting around a finger
      pointer.onTarget = e.pointerType === "mouse" ? 1 : 0;
    };
    const onLeave = () => (pointer.onTarget = 0);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      uniforms.uAspect.value = w / h;
      // star size follows the viewport height, so the sky looks the same on every screen
      uniforms.uSize.value = h * 0.15 * renderer.getPixelRatio();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let time = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      applyTheme();
      const k = reduced ? 1 : Math.min(1, dt * 3);
      pointer.sx += (pointer.x - pointer.sx) * k;
      pointer.sy += (pointer.y - pointer.sy) * k;
      pointer.on += (pointer.onTarget - pointer.on) * k;
      uniforms.uTime.value = time;
      uniforms.uPointer.value.set(pointer.x, pointer.y);
      uniforms.uPointerOn.value = pointer.on;
      // lean toward the pointer: a shift of the camera, so near stars travel further than far ones (depth)
      camera.position.set(pointer.sx * 0.9, pointer.sy * 0.6, 0);
      stars.rotation.y = time * 0.012 + pointer.sx * 0.05;
      stars.rotation.x = window.scrollY * 0.00012 - pointer.sy * 0.03;
      renderer.render(scene, camera);
    };

    let raf = 0;
    const loop = (now: number) => {
      if (document.hidden) return;
      frame(now);
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      if (document.hidden || reduced) return;
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVis);
    let cleanupExtra = () => {};
    if (reduced) {
      time = 4;
      frame(performance.now());
      // still frame: redraw on theme flips, scroll and resize
      const redraw = () => frame(performance.now());
      const id = window.setInterval(() => themeDark !== darkRef.current && redraw(), 300);
      window.addEventListener("scroll", redraw, { passive: true });
      window.addEventListener("resize", redraw);
      cleanupExtra = () => (window.clearInterval(id), window.removeEventListener("scroll", redraw), window.removeEventListener("resize", redraw));
    } else raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      cleanupExtra();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className={className} aria-hidden />;
}
